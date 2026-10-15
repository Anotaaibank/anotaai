-- Link a verified, existing Anotei login without recreating its finances or subscription.
create function public.anota_link_existing_account(p_actor uuid,p_phone text,p_user uuid,p_expected timestamptz,p_hook text) returns boolean
language plpgsql security invoker set search_path='' as $$
declare master public.anota_whatsapp_bots; invite public.anota_whatsapp_invitations; member public.anota_whatsapp_bots;
begin
 if not exists(select 1 from public.anota_access_accounts where user_id=p_actor and exempt and disabled_at is null) or p_phone!~'^55[0-9]{10,11}$' or p_user is null or length(p_hook)<32 then raise exception 'ANOTA_FORBIDDEN';end if;
 perform pg_advisory_xact_lock(hashtextextended('anotei-phone:'||p_phone,0));
 perform pg_advisory_xact_lock(hashtextextended('anotei-existing-account:'||p_user::text,0));
 select * into master from public.anota_whatsapp_bots where user_id=p_actor for update;
 select * into invite from public.anota_whatsapp_invitations where owner_id=p_actor and phone=p_phone for update;
 if master.user_id is null or master.shared_owner_id is not null or not master.enabled or master.status<>'PRONTO' or not(p_phone=any(master.allowed_phones)) or invite.id is null or invite.active<>1 then raise exception 'ANOTA_FORBIDDEN';end if;
 if invite.user_id=p_user then return true;end if;
 if p_expected is null or invite.updated_at<>p_expected then raise exception 'ANOTA_CHANGED';end if;
 if invite.send_status='ENVIANDO' or exists(select 1 from public.anota_whatsapp_access_links where invitation_id=invite.id and status='ENVIANDO') then raise exception 'ANOTA_SEND_UNCERTAIN';end if;
 if invite.user_id is not null or exists(select 1 from public.anota_household_phones where phone=p_phone and user_id<>p_user) or exists(select 1 from public.anota_access_accounts where user_id=p_user and disabled_at is not null) then raise exception 'ANOTA_PHONE_ASSIGNED';end if;
 if p_user<>p_actor then
  if exists(select 1 from public.anota_access_accounts where user_id=p_user and exempt) or exists(select 1 from public.anota_whatsapp_invitations where user_id=p_user and id<>invite.id) then raise exception 'ANOTA_PHONE_ASSIGNED';end if;
  select * into member from public.anota_whatsapp_bots where user_id=p_user for update;
  if member.user_id is not null then
   if member.shared_owner_id is distinct from p_actor or not member.enabled or cardinality(array(select distinct n from unnest(array_append(member.allowed_phones,p_phone)) n))>2 then raise exception 'ANOTA_PHONE_ASSIGNED';end if;
   update public.anota_whatsapp_bots set allowed_phones=array(select distinct n from unnest(array_append(member.allowed_phones,p_phone)) n),updated_at=clock_timestamp() where user_id=p_user;
  else
   insert into public.anota_whatsapp_bots(user_id,phone,allowed_phones,enabled,status,hook_cipher,shared_owner_id) values(p_user,master.phone,array[p_phone],true,'PRONTO',p_hook,p_actor);
  end if;
  insert into public.anota_household_phones(user_id,phone) values(p_user,p_phone) on conflict do nothing;
 end if;
 update public.anota_whatsapp_invitations set user_id=p_user,token_cipher='',updated_at=clock_timestamp() where id=invite.id;
 update public.anota_whatsapp_access_links set status='CANCELADO',updated_at=clock_timestamp() where invitation_id=invite.id and status in ('NAO_ENVIADO','AUTOMATICO');
 insert into public.anota_audit_logs(user_id,entity_id,action,details) values(p_actor,invite.id,'CONTA_EXISTENTE_VINCULADA',jsonb_build_object('account',p_user));
 return true;
end $$;
revoke all on function public.anota_link_existing_account(uuid,text,uuid,timestamptz,text) from public,anon,authenticated;
grant execute on function public.anota_link_existing_account(uuid,text,uuid,timestamptz,text) to service_role;

-- A manager's own phone may have an invitation but still belongs to the master account.
do $$declare definition text;begin
 definition:=pg_get_functiondef('public.anota_personal_recipient(uuid,text)'::regprocedure);
 if position('select user_id into target' in definition)=0 then raise exception 'RECIPIENT_FUNCTION_UNEXPECTED';end if;
 definition:=replace(definition,'select user_id into target',
 'if exists(select 1 from public.anota_whatsapp_invitations where owner_id=p_owner and phone=p_phone and user_id=p_owner and active=1) then return case when anota_private.access_allowed(p_owner) then p_owner else null end;end if; select user_id into target');
 execute definition;
end $$;
