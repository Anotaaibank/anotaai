-- Reversible administrative removal. Existing sessions and WhatsApp routing use this gate.
alter table public.anota_access_accounts add column disabled_at timestamptz;
create or replace function anota_private.access_allowed(p_user uuid) returns boolean language sql stable security definer set search_path='' as $$
 select coalesce((select exempt from public.anota_access_accounts where user_id=p_user),false)
 or (not exists(select 1 from public.anota_access_accounts where user_id=p_user and disabled_at is not null) and (
 not coalesce((select enforce_access from public.anota_pix_settings where id),false)
 or exists(select 1 from public.anota_subscriptions s left join public.anota_commercial_profiles p on p.user_id=s.user_id where s.user_id=p_user and s.status in ('ATIVA','TESTE') and s.renewal_date>=(now() at time zone 'America/Sao_Paulo')::date and (s.status='TESTE' or p.payment_method<>'PIX' or exists(select 1 from public.anota_pix_payments a where a.user_id=p_user and a.status='APROVADO' and a.access_until=s.renewal_date)))));
$$;

create function public.anota_set_subscriber_active(p_actor uuid,p_phone text,p_active boolean,p_expected timestamptz) returns boolean language plpgsql security invoker set search_path='' as $$
declare master public.anota_whatsapp_bots; invite public.anota_whatsapp_invitations; prior public.anota_subscriptions; numbers text[]; revision timestamptz:=clock_timestamp();
begin
 if p_active is null or not exists(select 1 from public.anota_access_accounts where user_id=p_actor and exempt) then raise exception 'ANOTA_FORBIDDEN';end if;
 perform pg_advisory_xact_lock(hashtextextended('anotei-phone:'||p_phone,0));
 select * into master from public.anota_whatsapp_bots where user_id=p_actor for update;
 select * into invite from public.anota_whatsapp_invitations where owner_id=p_actor and phone=p_phone for update;
 if master.user_id is null or master.shared_owner_id is not null or invite.id is null or invite.user_id=p_actor or exists(select 1 from public.anota_access_accounts where user_id=invite.user_id and exempt) then raise exception 'ANOTA_FORBIDDEN';end if;
 if p_expected is null or invite.updated_at<>p_expected then raise exception 'ANOTA_CHANGED';end if;
 if invite.user_id is not null then
  perform pg_advisory_xact_lock(hashtextextended('anotei-subscription:'||invite.user_id::text,0));
  insert into public.anota_access_accounts(user_id,disabled_at) values(invite.user_id,case when p_active then null else revision end) on conflict(user_id) do update set disabled_at=excluded.disabled_at;
  update public.anota_whatsapp_bots set enabled=p_active,updated_at=revision where user_id=invite.user_id and shared_owner_id=p_actor;
  if not p_active then
   select * into prior from public.anota_subscriptions where user_id=invite.user_id for update;
   update public.anota_subscriptions set status='CANCELADA',updated_at=revision where user_id=invite.user_id;
   if prior.user_id is not null then insert into public.anota_subscription_events(user_id,actor_id,before_subscription,after_subscription) select invite.user_id,p_actor,to_jsonb(prior),to_jsonb(s) from public.anota_subscriptions s where user_id=invite.user_id;end if;
  end if;
 end if;
 if p_active then
  select array(select distinct n from unnest(master.allowed_phones||array[p_phone]||array(select phone from public.anota_household_phones where user_id=invite.user_id)) n order by n) into numbers;
  update public.anota_whatsapp_bots set allowed_phones=numbers,updated_at=revision where user_id=p_actor;
 else
  update public.anota_whatsapp_access_links set status='CANCELADO',updated_at=revision where owner_id=p_actor and invitation_id=invite.id and status in ('NAO_ENVIADO','ENVIANDO','INCERTO','AUTOMATICO');
 end if;
 update public.anota_whatsapp_invitations set active=case when p_active then 1 else 0 end,updated_at=revision where id=invite.id;
 insert into public.anota_audit_logs(id,user_id,entity_id,action,details) values(gen_random_uuid(),p_actor,invite.id,case when p_active then 'ASSINANTE_REATIVADO' else 'ASSINANTE_DESATIVADO' end,jsonb_build_object('registered',invite.user_id is not null));
 return true;
end $$;
revoke all on function public.anota_set_subscriber_active(uuid,text,boolean,timestamptz) from public,anon,authenticated;
grant execute on function public.anota_set_subscriber_active(uuid,text,boolean,timestamptz) to service_role;

-- An uncertain send can only be retried after an explicit, recipient-specific acknowledgement.
-- Keep the same request UUID on network retries; never retry an in-flight send automatically.
create function public.anota_retry_access_link(p_owner uuid,p_phone text,p_request uuid,p_expected timestamptz,p_not_received boolean,p_candidate jsonb) returns public.anota_whatsapp_access_links language plpgsql security invoker set search_path='' as $$
declare master public.anota_whatsapp_bots; invite public.anota_whatsapp_invitations; prior public.anota_whatsapp_access_links; result public.anota_whatsapp_access_links;
begin
 if not exists(select 1 from public.anota_access_accounts where user_id=p_owner and exempt) then raise exception 'ANOTA_FORBIDDEN';end if;
 perform pg_advisory_xact_lock(hashtextextended('anotei-phone:'||p_phone,0));
 select * into master from public.anota_whatsapp_bots where user_id=p_owner for update;
 if master.user_id is null or master.shared_owner_id is not null or not master.enabled or master.status<>'PRONTO' or not(p_phone=any(master.allowed_phones)) then raise exception 'ANOTA_FORBIDDEN';end if;
 select * into prior from public.anota_whatsapp_access_links where id=p_request;
 if found then if prior.owner_id<>p_owner or prior.phone<>p_phone then raise exception 'ANOTA_FORBIDDEN';end if;return prior;end if;
 if p_expected is null or master.updated_at<>p_expected then raise exception 'ANOTA_CHANGED';end if;
 select * into invite from public.anota_whatsapp_invitations where owner_id=p_owner and phone=p_phone and active=1 for update;
 if invite.id is null or exists(select 1 from public.anota_access_accounts where user_id=invite.user_id and disabled_at is not null) then raise exception 'ANOTA_INVITATION_UNAVAILABLE';end if;
 if invite.send_status='ENVIANDO' or exists(select 1 from public.anota_whatsapp_access_links where owner_id=p_owner and phone=p_phone and status in ('NAO_ENVIADO','ENVIANDO')) then raise exception 'ANOTA_SEND_UNCERTAIN';end if;
 if invite.send_status='INCERTO' or exists(select 1 from public.anota_whatsapp_access_links where owner_id=p_owner and phone=p_phone and status='INCERTO') then
  if p_not_received is distinct from true then raise exception 'ANOTA_SEND_UNCERTAIN';end if;
  update public.anota_whatsapp_access_links set status='CANCELADO',updated_at=clock_timestamp() where owner_id=p_owner and phone=p_phone and status='INCERTO';
  update public.anota_whatsapp_invitations set send_status='FALHOU',updated_at=clock_timestamp() where id=invite.id and send_status='INCERTO';
 end if;
 if invite.user_id is null and invite.expires_at<=floor(extract(epoch from clock_timestamp())*1000) then
  perform public.anota_create_invitation(p_owner,p_phone,master.updated_at,p_candidate);
  select * into master from public.anota_whatsapp_bots where user_id=p_owner;
 end if;
 result:=public.anota_queue_access_link(p_owner,p_phone,p_request,master.updated_at);
 insert into public.anota_audit_logs(id,user_id,entity_id,action,details) values(p_request,p_owner,invite.id,'LINK_REENVIO_SOLICITADO',jsonb_build_object('not_received',p_not_received));
 return result;
end $$;
revoke all on function public.anota_retry_access_link(uuid,text,uuid,timestamptz,boolean,jsonb) from public,anon,authenticated;
grant execute on function public.anota_retry_access_link(uuid,text,uuid,timestamptz,boolean,jsonb) to service_role;
