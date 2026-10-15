-- All fixture changes are run inside BEGIN / ROLLBACK, without external sends.
insert into auth.users(id,email,aud,role,created_at,updated_at) values
 ('e1111111-1111-4111-8111-111111111111','access-manager@example.invalid','authenticated','authenticated',now(),now()),
 ('e2222222-2222-4222-8222-222222222222','access-member@example.invalid','authenticated','authenticated',now(),now()),
 ('e3333333-3333-4333-8333-333333333333','access-other@example.invalid','authenticated','authenticated',now(),now());
insert into public.anota_access_accounts(user_id,exempt) values('e1111111-1111-4111-8111-111111111111',true);
update public.anota_pix_settings set pix_key='fixture@example.invalid',receiver='Recebedor teste',enforce_access=true;
insert into public.anota_whatsapp_bots(user_id,phone,allowed_phones,enabled,status,hook_cipher) values('e1111111-1111-4111-8111-111111111111','5511999999989',array['5511996666688'],true,'PRONTO','fixture');
do $$declare actor uuid:='e1111111-1111-4111-8111-111111111111';u uuid:='e2222222-2222-4222-8222-222222222222';other uuid:='e3333333-3333-4333-8333-333333333333';i public.anota_whatsapp_invitations;rev timestamptz;req uuid:=gen_random_uuid();link public.anota_whatsapp_access_links;candidate jsonb;payment public.anota_pix_payments;
begin
 select updated_at into rev from public.anota_whatsapp_bots where user_id=actor;
 candidate:=jsonb_build_object('id',gen_random_uuid(),'token_hash',repeat('f',64),'token_cipher',repeat('x',40),'subscriber_name','Pessoa Teste','plan_code','BASICO');
 i:=public.anota_create_invitation(actor,'5511996666681',rev,candidate);
 select updated_at into rev from public.anota_whatsapp_bots where user_id=actor;
 update public.anota_whatsapp_invitations set send_status='INCERTO' where id=i.id;
 begin perform public.anota_retry_access_link(actor,i.phone,req,rev,false,candidate);raise exception 'UNCERTAIN_AUTO_RETRIED';exception when others then if sqlerrm<>'ANOTA_SEND_UNCERTAIN' then raise;end if;end;
 begin perform public.anota_retry_access_link(other,i.phone,req,rev,true,candidate);raise exception 'OTHER_OWNER_RETRIED';exception when others then if sqlerrm<>'ANOTA_FORBIDDEN' then raise;end if;end;
 link:=public.anota_retry_access_link(actor,i.phone,req,rev,true,candidate);
 if link.status<>'NAO_ENVIADO' then raise exception 'RETRY_NOT_QUEUED';end if;
 link:=public.anota_retry_access_link(actor,i.phone,req,rev,true,candidate);
 if (select count(*) from public.anota_whatsapp_access_links where id=req)<>1 then raise exception 'DUPLICATE_RETRY';end if;
 begin perform public.anota_retry_access_link(actor,i.phone,gen_random_uuid(),rev,true,candidate);raise exception 'PENDING_DUPLICATED';exception when others then if sqlerrm<>'ANOTA_SEND_UNCERTAIN' then raise;end if;end;
 -- A pending registration is revoked, and queued sends are cancelled.
 perform public.anota_set_subscriber_active(actor,i.phone,false,(select updated_at from public.anota_whatsapp_invitations where id=i.id));
 if (select active from public.anota_whatsapp_invitations where id=i.id)<>0 or (select status from public.anota_whatsapp_access_links where id=req)<>'CANCELADO' then raise exception 'PENDING_NOT_REVOKED';end if;
 begin perform public.anota_retry_access_link(actor,i.phone,gen_random_uuid(),rev,true,candidate);raise exception 'DISABLED_LINK_QUEUED';exception when others then if sqlerrm<>'ANOTA_INVITATION_UNAVAILABLE' then raise;end if;end;
 perform public.anota_set_subscriber_active(actor,i.phone,true,(select updated_at from public.anota_whatsapp_invitations where id=i.id));
 -- Expired invites renew their token without changing the chosen plan.
 update public.anota_whatsapp_invitations set expires_at=1,send_status='ACEITO',plan_code='ILIMITADO' where id=i.id;
 candidate:=candidate||jsonb_build_object('token_hash',repeat('a',64),'plan_code','ILIMITADO');
 select updated_at into rev from public.anota_whatsapp_bots where user_id=actor;
 link:=public.anota_retry_access_link(actor,i.phone,gen_random_uuid(),rev,false,candidate);
 if link.status<>'AUTOMATICO' or (select plan_code from public.anota_whatsapp_invitations where id=i.id)<>'ILIMITADO' or (select expires_at from public.anota_whatsapp_invitations where id=i.id)<=floor(extract(epoch from clock_timestamp())*1000) then raise exception 'EXPIRED_INVITE_RENEWAL_FAILED';end if;
 -- Represent an already registered couple; no real account data is used.
 update public.anota_whatsapp_invitations set user_id=u,send_status='ACEITO' where id=i.id;
 insert into public.anota_whatsapp_bots(user_id,shared_owner_id,phone,allowed_phones,enabled,status,hook_cipher) values(u,actor,'5511999999989',array[i.phone,'5511996666682'],true,'PRONTO','fixture');
 insert into public.anota_household_phones(user_id,phone) values(u,i.phone),(u,'5511996666682');
 update public.anota_whatsapp_bots set allowed_phones=array_append(allowed_phones,'5511996666682') where user_id=actor;
 insert into public.anota_subscriptions(user_id,status,plan,monthly_cents,renewal_date) values(u,'TESTE','Básico',4990,current_date+30);
 if not public.anota_access_allowed(u) or public.anota_personal_recipient(actor,'5511996666682') is distinct from u then raise exception 'FIXTURE_ACCESS_NOT_READY';end if;
 begin perform public.anota_set_subscriber_active(other,i.phone,false,(select updated_at from public.anota_whatsapp_invitations where id=i.id));raise exception 'OTHER_OWNER_DISABLED';exception when others then if sqlerrm<>'ANOTA_FORBIDDEN' then raise;end if;end;
 perform public.anota_set_subscriber_active(actor,i.phone,false,(select updated_at from public.anota_whatsapp_invitations where id=i.id));
 if public.anota_access_allowed(u) or public.anota_personal_recipient(actor,i.phone) is not null or public.anota_personal_recipient(actor,'5511996666682') is not null then raise exception 'DISABLED_ACCOUNT_ACCESSIBLE';end if;
 if (select status from public.anota_subscriptions where user_id=u)<>'CANCELADA' then raise exception 'SUBSCRIPTION_NOT_CANCELLED';end if;
 if not public.anota_access_allowed(actor) then raise exception 'MANAGER_BLOCKED';end if;
 -- Even a later payment does not silently bypass administrative removal.
 payment:=public.anota_request_pix(u,gen_random_uuid(),'Pix de fixture','BASICO');perform public.anota_review_pix(actor,payment.id,true);
 if public.anota_access_allowed(u) then raise exception 'PIX_BYPASSED_ADMIN_BLOCK';end if;
 perform public.anota_set_subscriber_active(actor,i.phone,true,(select updated_at from public.anota_whatsapp_invitations where id=i.id));
 if not public.anota_access_allowed(u) or public.anota_personal_recipient(actor,'5511996666682') is distinct from u then raise exception 'RESTORE_FAILED';end if;
 if (select count(*) from public.anota_household_phones where user_id=u)<>2 then raise exception 'HOUSEHOLD_HISTORY_LOST';end if;
 if has_function_privilege('authenticated','public.anota_set_subscriber_active(uuid,text,boolean,timestamptz)','execute') or has_function_privilege('anon','public.anota_retry_access_link(uuid,text,uuid,timestamptz,boolean,jsonb)','execute') then raise exception 'CONTROLS_EXPOSED';end if;
end $$;
