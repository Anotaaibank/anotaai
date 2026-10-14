-- Independent Anotei only. Apply after the five base migrations.
alter table public.anota_whatsapp_bots add column shared_owner_id uuid references public.anota_whatsapp_bots(user_id);
alter table public.anota_whatsapp_bots add constraint anota_shared_bot_shape check(shared_owner_id is null or (shared_owner_id<>user_id and cardinality(allowed_phones)=1 and instance_id is null and token_cipher is null));
create index anota_bots_shared_owner on public.anota_whatsapp_bots(shared_owner_id);
create table public.anota_whatsapp_invitations(
 id uuid primary key,owner_id uuid not null references auth.users(id),phone text not null unique check(phone ~ '^55[0-9]{10,11}$'),
 user_id uuid unique references auth.users(id),token_hash text not null unique,token_cipher text not null,
 expires_at bigint not null,send_status text not null check(send_status in ('NAO_ENVIADO','ENVIANDO','ACEITO','INCERTO','FALHOU')),
 active smallint not null default 1 check(active in (0,1)),created_at timestamptz not null,updated_at timestamptz not null,
 unique(owner_id,phone)
);
create index anota_invitations_owner on public.anota_whatsapp_invitations(owner_id,created_at);
create index anota_invitations_queue on public.anota_whatsapp_invitations(send_status,expires_at) where active=1 and user_id is null;
create table public.anota_whatsapp_access_links(
 id uuid primary key,owner_id uuid not null references auth.users(id),phone text not null,
 invitation_id uuid not null references public.anota_whatsapp_invitations(id),
 status text not null check(status in ('NAO_ENVIADO','ENVIANDO','ACEITO','FALHOU','INCERTO','CANCELADO','AUTOMATICO')),
 created_at timestamptz not null,updated_at timestamptz not null
);
create index anota_access_owner on public.anota_whatsapp_access_links(owner_id,created_at desc);
create index anota_access_invitation on public.anota_whatsapp_access_links(invitation_id);
create index anota_access_queue on public.anota_whatsapp_access_links(status,created_at);
alter table public.anota_whatsapp_invitations enable row level security;
alter table public.anota_whatsapp_access_links enable row level security;
revoke all on public.anota_whatsapp_invitations,public.anota_whatsapp_access_links from public,anon,authenticated;
grant all on public.anota_whatsapp_invitations,public.anota_whatsapp_access_links to service_role;

create function public.anota_personal_recipient(p_owner uuid,p_phone text) returns uuid language plpgsql security invoker set search_path='' as $$
declare master public.anota_whatsapp_bots; invite public.anota_whatsapp_invitations; member public.anota_whatsapp_bots;
begin
 select * into master from public.anota_whatsapp_bots where user_id=p_owner;
 if master.user_id is null or not master.enabled or master.status<>'PRONTO' or master.shared_owner_id is not null or not(p_phone=any(master.allowed_phones)) then return null;end if;
 select * into invite from public.anota_whatsapp_invitations where owner_id=p_owner and phone=p_phone;
 if not found then return p_owner;end if;
 if invite.active<>1 or invite.user_id is null then return null;end if;
 select * into member from public.anota_whatsapp_bots where user_id=invite.user_id;
 if member.enabled and member.status='PRONTO' and member.shared_owner_id=p_owner and cardinality(member.allowed_phones)=1 and member.allowed_phones[1]=p_phone then return member.user_id;end if;
 return null;
end $$;
revoke all on function public.anota_personal_recipient(uuid,text) from public,anon,authenticated;
grant execute on function public.anota_personal_recipient(uuid,text) to service_role;

create function public.anota_create_invitation(p_owner uuid,p_phone text,p_expected timestamptz,p_candidate jsonb) returns public.anota_whatsapp_invitations language plpgsql security invoker set search_path='' as $$
declare master public.anota_whatsapp_bots; prior public.anota_whatsapp_invitations; result public.anota_whatsapp_invitations; revision timestamptz; current_ms bigint:=floor(extract(epoch from clock_timestamp())*1000);
begin
 perform pg_advisory_xact_lock(hashtextextended('anotei-phone:'||p_phone,0));
 select * into master from public.anota_whatsapp_bots where user_id=p_owner for update;
 if master.user_id is null or master.shared_owner_id is not null or not master.enabled or master.status<>'PRONTO' or p_phone=master.phone or p_phone!~'^55[0-9]{10,11}$' then raise exception 'ANOTA_FORBIDDEN';end if;
 if master.updated_at<>p_expected then raise exception 'ANOTA_CHANGED';end if;
 select * into prior from public.anota_whatsapp_invitations where phone=p_phone for update;
 if found and prior.owner_id<>p_owner then raise exception 'ANOTA_FORBIDDEN';end if;
 if prior.user_id is null and prior.send_status in ('INCERTO','ENVIANDO') then raise exception 'ANOTA_SEND_UNCERTAIN';end if;
 if prior.user_id is null and prior.active=1 and prior.expires_at>current_ms and p_phone=any(master.allowed_phones) then
  update public.anota_whatsapp_invitations set send_status=case when send_status='FALHOU' then 'NAO_ENVIADO' else send_status end where id=prior.id returning * into result;return result;
 end if;
 if not(p_phone=any(master.allowed_phones)) then master.allowed_phones:=array_append(master.allowed_phones,p_phone);end if;
 if cardinality(master.allowed_phones)>100 then raise exception 'ANOTA_FORBIDDEN';end if;
 revision:=greatest(clock_timestamp(),master.updated_at+interval '1 millisecond');
 update public.anota_whatsapp_bots set allowed_phones=master.allowed_phones,updated_at=revision where user_id=p_owner;
 if prior.user_id is not null then update public.anota_whatsapp_invitations set active=1,updated_at=revision where id=prior.id returning * into result;return result;end if;
 if length(p_candidate->>'token_hash')<>64 or length(p_candidate->>'token_cipher')<20 then raise exception 'ANOTA_FORBIDDEN';end if;
 insert into public.anota_whatsapp_invitations(id,owner_id,phone,user_id,token_hash,token_cipher,expires_at,send_status,active,created_at,updated_at)
 values(coalesce(prior.id,(p_candidate->>'id')::uuid),p_owner,p_phone,null,p_candidate->>'token_hash',p_candidate->>'token_cipher',current_ms+604800000,'NAO_ENVIADO',1,coalesce(prior.created_at,revision),revision)
 on conflict(id) do update set token_hash=excluded.token_hash,token_cipher=excluded.token_cipher,expires_at=excluded.expires_at,send_status='NAO_ENVIADO',active=1,updated_at=excluded.updated_at returning * into result;
 return result;
end $$;
revoke all on function public.anota_create_invitation(uuid,text,timestamptz,jsonb) from public,anon,authenticated;
grant execute on function public.anota_create_invitation(uuid,text,timestamptz,jsonb) to service_role;

create function public.anota_register_invitation(p_hash text,p_user uuid,p_hook text,p_plan jsonb) returns text language plpgsql security definer set search_path='' as $$
declare invite public.anota_whatsapp_invitations; master public.anota_whatsapp_bots;
begin
 select * into invite from public.anota_whatsapp_invitations where token_hash=p_hash;
 if not found or invite.active<>1 or invite.user_id is not null or invite.expires_at<=floor(extract(epoch from clock_timestamp())*1000) or invite.owner_id=p_user then raise exception 'ANOTA_INVITATION_UNAVAILABLE';end if;
 select * into master from public.anota_whatsapp_bots where user_id=invite.owner_id for update;
 select * into invite from public.anota_whatsapp_invitations where token_hash=p_hash for update;
 if not found or invite.active<>1 or invite.user_id is not null or invite.expires_at<=floor(extract(epoch from clock_timestamp())*1000) then raise exception 'ANOTA_INVITATION_UNAVAILABLE';end if;
 if master.shared_owner_id is not null or not master.enabled or master.status<>'PRONTO' or not(invite.phone=any(master.allowed_phones)) then raise exception 'ANOTA_FORBIDDEN';end if;
 if exists(select 1 from public.anota_whatsapp_bots where user_id=p_user) or exists(select 1 from public.anota_finance_documents where user_id=p_user) then raise exception 'ANOTA_INVITATION_UNAVAILABLE';end if;
 perform anota_private.apply_finance(p_user,p_plan,'MANUAL');
 insert into public.anota_whatsapp_bots(user_id,phone,allowed_phones,enabled,status,hook_cipher,shared_owner_id) values(p_user,master.phone,array[invite.phone],true,'PRONTO',p_hook,invite.owner_id);
 update public.anota_whatsapp_invitations set user_id=p_user,token_cipher='',updated_at=clock_timestamp() where id=invite.id;
 return invite.phone;
end $$;
revoke all on function public.anota_register_invitation(text,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.anota_register_invitation(text,uuid,text,jsonb) to service_role;

create function public.anota_queue_access_link(p_owner uuid,p_phone text,p_request uuid,p_expected timestamptz) returns public.anota_whatsapp_access_links language plpgsql security invoker set search_path='' as $$
declare master public.anota_whatsapp_bots; invite public.anota_whatsapp_invitations; prior public.anota_whatsapp_access_links; result public.anota_whatsapp_access_links; send_state text;
begin
 select * into master from public.anota_whatsapp_bots where user_id=p_owner for update;
 if master.user_id is null or master.shared_owner_id is not null or not master.enabled or master.status<>'PRONTO' or not(p_phone=any(master.allowed_phones)) then raise exception 'ANOTA_FORBIDDEN';end if;
 select * into prior from public.anota_whatsapp_access_links where id=p_request;
 if found then if prior.owner_id<>p_owner or prior.phone<>p_phone then raise exception 'ANOTA_FORBIDDEN';end if;return prior;end if;
 if master.updated_at<>p_expected then raise exception 'ANOTA_CHANGED';end if;
 select * into invite from public.anota_whatsapp_invitations where owner_id=p_owner and phone=p_phone and active=1;
 if not found then raise exception 'ANOTA_INVITATION_UNAVAILABLE';end if;
 if exists(select 1 from public.anota_whatsapp_access_links where owner_id=p_owner and phone=p_phone and status in ('NAO_ENVIADO','ENVIANDO','INCERTO')) or (invite.user_id is null and invite.send_status in ('ENVIANDO','INCERTO')) then raise exception 'ANOTA_SEND_UNCERTAIN';end if;
 if invite.user_id is null and invite.expires_at<=floor(extract(epoch from clock_timestamp())*1000) then raise exception 'ANOTA_INVITATION_UNAVAILABLE';end if;
 send_state:=case when invite.user_id is null and invite.send_status='NAO_ENVIADO' then 'AUTOMATICO' else 'NAO_ENVIADO' end;
 insert into public.anota_whatsapp_access_links values(p_request,p_owner,p_phone,invite.id,send_state,clock_timestamp(),clock_timestamp()) returning * into result;return result;
end $$;
revoke all on function public.anota_queue_access_link(uuid,text,uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.anota_queue_access_link(uuid,text,uuid,timestamptz) to service_role;

create or replace function public.anota_apply_finance_whatsapp(p_user uuid,p_plan jsonb,p_message uuid,p_lease uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform i.id from public.anota_whatsapp_inbox i join public.anota_whatsapp_bots b on b.user_id=i.user_id join public.anota_whatsapp_bots master on master.user_id=coalesce(b.shared_owner_id,b.user_id)
 where i.id=p_message and i.user_id=p_user and i.lease=p_lease and i.status='PROCESSANDO' and public.anota_personal_recipient(master.user_id,i.sender)=p_user for update of i,b,master;
 if not found then raise exception 'ANOTA_FORBIDDEN';end if;
 return anota_private.apply_finance(p_user,p_plan,'WHATSAPP');
end $$;
revoke all on function public.anota_apply_finance_whatsapp(uuid,jsonb,uuid,uuid) from public,anon,authenticated;
grant execute on function public.anota_apply_finance_whatsapp(uuid,jsonb,uuid,uuid) to service_role;

create or replace function public.anota_record_whatsapp(p_user uuid,p_message uuid,p_payload jsonb) returns public.anota_expenses language plpgsql security definer set search_path='' as $$
begin
 perform i.id from public.anota_whatsapp_inbox i join public.anota_whatsapp_bots b on b.user_id=i.user_id join public.anota_whatsapp_bots master on master.user_id=coalesce(b.shared_owner_id,b.user_id)
 where i.id=p_message and i.user_id=p_user and i.status='PROCESSANDO' and public.anota_personal_recipient(master.user_id,i.sender)=p_user for update of i,b,master;
 if not found or (p_payload->>'id')::uuid<>p_message then raise exception 'ANOTA_FORBIDDEN';end if;
 return anota_private.write_expense(p_user,p_payload,null,'WHATSAPP');
end $$;
revoke all on function public.anota_record_whatsapp(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.anota_record_whatsapp(uuid,uuid,jsonb) to service_role;
