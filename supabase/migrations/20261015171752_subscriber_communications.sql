create table public.anota_communications(
 id uuid primary key,owner_id uuid not null references auth.users(id),message text not null check(length(trim(message)) between 1 and 2000),
 created_at timestamptz not null default clock_timestamp(),expires_at timestamptz not null default clock_timestamp()+interval '15 minutes',confirmed_at timestamptz,cancelled_at timestamptz
);
create index anota_communications_owner on public.anota_communications(owner_id,created_at desc);
create table public.anota_communication_recipients(
 id uuid primary key default gen_random_uuid(),communication_id uuid not null references public.anota_communications(id),invitation_id uuid not null references public.anota_whatsapp_invitations(id),
 name text not null,phone text not null,status text not null default 'RASCUNHO' check(status in ('RASCUNHO','FILA','ENVIANDO','ACEITO','FALHOU','INCERTO','CANCELADO')),
 lease uuid,claimed_at timestamptz,updated_at timestamptz not null default clock_timestamp(),unique(communication_id,invitation_id),unique(communication_id,phone)
);
create index anota_communication_job on public.anota_communication_recipients(communication_id,status);
create index anota_communication_invitation on public.anota_communication_recipients(invitation_id);
create index anota_communication_queue on public.anota_communication_recipients(status,updated_at) where status in ('FILA','ENVIANDO');
alter table public.anota_communications enable row level security;
alter table public.anota_communication_recipients enable row level security;
revoke all on public.anota_communications,public.anota_communication_recipients from public,anon,authenticated;
grant all on public.anota_communications,public.anota_communication_recipients to service_role;

create function anota_private.communication_allowed(p_owner uuid,p_invitation uuid) returns boolean language sql stable security invoker set search_path='' as $$
 select exists(select 1 from public.anota_whatsapp_invitations i join public.anota_whatsapp_bots b on b.user_id=i.owner_id
 where i.id=p_invitation and i.owner_id=p_owner and i.active=1 and i.user_id is not null and i.user_id<>p_owner and i.phone=any(b.allowed_phones)
 and b.enabled and b.status='PRONTO' and b.shared_owner_id is null
 and exists(select 1 from public.anota_access_accounts a where a.user_id=p_owner and a.exempt)
 and not exists(select 1 from public.anota_access_accounts a where a.user_id=i.user_id and a.disabled_at is not null));
$$;
revoke all on function anota_private.communication_allowed(uuid,uuid) from public,anon,authenticated;
grant execute on function anota_private.communication_allowed(uuid,uuid) to service_role;

create function public.anota_prepare_communication(p_owner uuid,p_id uuid,p_message text,p_invitations uuid[]) returns uuid language plpgsql security invoker set search_path='' as $$
declare prior public.anota_communications;invite uuid;
begin
 if not exists(select 1 from public.anota_access_accounts where user_id=p_owner and exempt) then raise exception 'ANOTA_FORBIDDEN';end if;
 if p_id is null or p_message is null or length(trim(p_message)) not between 1 and 2000 or cardinality(p_invitations) is null or cardinality(p_invitations) not between 1 and 10000 or cardinality(p_invitations)<>(select count(distinct n) from unnest(p_invitations) n) then raise exception 'ANOTA_FORBIDDEN';end if;
 perform pg_advisory_xact_lock(hashtextextended('anotei-communication:'||p_id::text,0));
 select * into prior from public.anota_communications where id=p_id;
 if found then
  if prior.owner_id<>p_owner or prior.message<>trim(p_message) or (select array_agg(invitation_id order by invitation_id) from public.anota_communication_recipients where communication_id=p_id) is distinct from (select array_agg(n order by n) from unnest(p_invitations) n) then raise exception 'ANOTA_FORBIDDEN';end if;return p_id;
 end if;
 foreach invite in array p_invitations loop if not anota_private.communication_allowed(p_owner,invite) then raise exception 'ANOTA_COMMUNICATION_CONTACT';end if;end loop;
 insert into public.anota_communications(id,owner_id,message) values(p_id,p_owner,trim(p_message));
 insert into public.anota_communication_recipients(communication_id,invitation_id,name,phone) select p_id,id,coalesce(nullif(subscriber_name,''),'Assinante'),phone from public.anota_whatsapp_invitations where id=any(p_invitations) and owner_id=p_owner;
 return p_id;
end $$;
create function public.anota_confirm_communication(p_owner uuid,p_id uuid,p_cancel boolean default false) returns boolean language plpgsql security invoker set search_path='' as $$
declare job public.anota_communications;
begin
 if not exists(select 1 from public.anota_access_accounts where user_id=p_owner and exempt) or p_cancel is null then raise exception 'ANOTA_FORBIDDEN';end if;
 select * into job from public.anota_communications where id=p_id and owner_id=p_owner for update;
 if not found then raise exception 'ANOTA_FORBIDDEN';end if;
 if p_cancel then
  update public.anota_communications set cancelled_at=coalesce(cancelled_at,clock_timestamp()) where id=p_id;
  update public.anota_communication_recipients set status='CANCELADO',updated_at=clock_timestamp() where communication_id=p_id and status in ('RASCUNHO','FILA');return true;
 end if;
 if job.cancelled_at is not null then raise exception 'ANOTA_COMMUNICATION_EXPIRED';end if;
 if job.confirmed_at is not null then return true;end if;
 if job.expires_at<clock_timestamp() then raise exception 'ANOTA_COMMUNICATION_EXPIRED';end if;
 if exists(select 1 from public.anota_communication_recipients where communication_id=p_id and not anota_private.communication_allowed(p_owner,invitation_id)) then raise exception 'ANOTA_COMMUNICATION_CONTACT';end if;
 update public.anota_communications set confirmed_at=clock_timestamp() where id=p_id;
 update public.anota_communication_recipients set status='FILA',updated_at=clock_timestamp() where communication_id=p_id and status='RASCUNHO';
 insert into public.anota_audit_logs(id,user_id,entity_id,action,details) values(gen_random_uuid(),p_owner,p_id,'COMUNICADO_CONFIRMADO',jsonb_build_object('recipients',(select count(*) from public.anota_communication_recipients where communication_id=p_id)));
 return true;
end $$;

create function public.anota_claim_communication(p_owner uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare recipient public.anota_communication_recipients;job public.anota_communications;lease_id uuid:=gen_random_uuid();
begin
 if not pg_try_advisory_xact_lock(hashtextextended('anotei-communication-channel:'||p_owner::text,0)) then return null;end if;
 -- A worker crash after claiming never causes an automatic duplicate.
 update public.anota_communication_recipients r set status='INCERTO',updated_at=clock_timestamp() from public.anota_communications c where c.id=r.communication_id and c.owner_id=p_owner and r.status='ENVIANDO' and r.claimed_at<clock_timestamp()-interval '5 minutes';
 if exists(select 1 from public.anota_communication_recipients r join public.anota_communications c on c.id=r.communication_id where c.owner_id=p_owner and (r.status='ENVIANDO' or r.claimed_at>clock_timestamp()-interval '3 seconds')) then return null;end if;
 update public.anota_communication_recipients r set status='CANCELADO',updated_at=clock_timestamp() from public.anota_communications c where c.id=r.communication_id and c.owner_id=p_owner and r.status='FILA' and (c.cancelled_at is not null or not anota_private.communication_allowed(p_owner,r.invitation_id));
 select r.* into recipient from public.anota_communication_recipients r join public.anota_communications c on c.id=r.communication_id where c.owner_id=p_owner and r.status='FILA' and c.confirmed_at is not null and c.cancelled_at is null order by c.created_at,r.id limit 1 for update of r skip locked;
 if not found then return null;end if;
 select * into job from public.anota_communications where id=recipient.communication_id;
 update public.anota_communication_recipients set status='ENVIANDO',lease=lease_id,claimed_at=clock_timestamp(),updated_at=clock_timestamp() where id=recipient.id;
 return jsonb_build_object('id',recipient.id,'owner_id',p_owner,'invitation_id',recipient.invitation_id,'phone',recipient.phone,'message',job.message,'lease',lease_id);
end $$;
create function public.anota_check_communication(p_owner uuid,p_recipient uuid,p_lease uuid) returns boolean language sql stable security invoker set search_path='' as $$
 select exists(select 1 from public.anota_communication_recipients r join public.anota_communications c on c.id=r.communication_id join public.anota_whatsapp_invitations i on i.id=r.invitation_id where r.id=p_recipient and r.status='ENVIANDO' and r.lease=p_lease and c.owner_id=p_owner and c.cancelled_at is null and i.phone=r.phone and anota_private.communication_allowed(p_owner,r.invitation_id));
$$;
revoke all on function public.anota_prepare_communication(uuid,uuid,text,uuid[]),public.anota_confirm_communication(uuid,uuid,boolean),public.anota_claim_communication(uuid),public.anota_check_communication(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.anota_prepare_communication(uuid,uuid,text,uuid[]),public.anota_confirm_communication(uuid,uuid,boolean),public.anota_claim_communication(uuid),public.anota_check_communication(uuid,uuid,uuid) to service_role;

create function public.anota_communication_history(p_owner uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_agg(to_jsonb(c)||jsonb_build_object('counts',(select coalesce(jsonb_object_agg(s.status,s.n),'{}'::jsonb) from (select r.status,count(*) n from public.anota_communication_recipients r where r.communication_id=c.id group by r.status) s)) order by c.created_at desc),'[]'::jsonb)
 from (select * from public.anota_communications where owner_id=p_owner and exists(select 1 from public.anota_access_accounts where user_id=p_owner and exempt) order by created_at desc limit 20) c;
$$;
revoke all on function public.anota_communication_history(uuid) from public,anon,authenticated;
grant execute on function public.anota_communication_history(uuid) to service_role;

create function public.anota_communication_owners() returns uuid[] language sql stable security invoker set search_path='' as $$
 select coalesce(array_agg(distinct c.owner_id),'{}'::uuid[]) from public.anota_communications c join public.anota_communication_recipients r on r.communication_id=c.id where c.confirmed_at is not null and (r.status='ENVIANDO' or (r.status='FILA' and c.cancelled_at is null));
$$;
revoke all on function public.anota_communication_owners() from public,anon,authenticated;
grant execute on function public.anota_communication_owners() to service_role;
