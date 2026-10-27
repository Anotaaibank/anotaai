-- SYNTHETIC ONLY: execute in a disposable Supabase/Postgres database, never production.
-- Requires the complete baseline, migrations and service_role fixture grants.
begin;
insert into auth.users(id,email,aud,role,created_at,updated_at)
values('ca510000-1111-4111-8111-111111111111','reply-cas@example.invalid','authenticated','authenticated',now(),now());
set local role service_role;
do $$
declare owner_id uuid:='ca510000-1111-4111-8111-111111111111';
 message_id uuid:=gen_random_uuid();a uuid:=gen_random_uuid();b uuid:=gen_random_uuid();v bigint;changed integer;
begin
 insert into public.anota_whatsapp_inbox(id,user_id,provider_id,sender,type,status,reply,lease)
 values(message_id,owner_id,'synthetic-cas','5511999999999','text','RESOLVIDO','Resposta A',a);
 select reply_version into v from public.anota_whatsapp_inbox where id=message_id;
 if v<>0 then raise exception 'CAS_INITIAL_VERSION';end if;
 if public.anota_reply_claim(message_id) then raise exception 'CAS_LEGACY_ID_ONLY';end if;
 update public.anota_whatsapp_inbox set lease=b,reply='Resposta B' where id=message_id;
 if public.anota_reply_claim(message_id,owner_id,'5511999999999',a,v) then raise exception 'CAS_OLD_LEASE';end if;
 if public.anota_reply_claim(message_id,owner_id,'5511999999999',b,v) then raise exception 'CAS_OLD_VERSION';end if;
 select reply_version into v from public.anota_whatsapp_inbox where id=message_id;
 if v<>1 then raise exception 'CAS_BUMP_REPLY';end if;
 if public.anota_reply_claim(message_id,gen_random_uuid(),'5511999999999',b,v) then raise exception 'CAS_OTHER_OWNER';end if;
 if public.anota_reply_claim(message_id,owner_id,'5511888888888',b,v) then raise exception 'CAS_OTHER_SENDER';end if;
 if not public.anota_reply_claim(message_id,owner_id,'5511999999999',b,v) then raise exception 'CAS_VALID_CLAIM';end if;
 if public.anota_reply_claim(message_id,owner_id,'5511999999999',b,v) then raise exception 'CAS_DOUBLE_CLAIM';end if;
 if(select reply_version from public.anota_whatsapp_inbox where id=message_id)<>v then raise exception 'CAS_DELIVERY_NOT_PAYLOAD';end if;
 update public.anota_whatsapp_inbox set reply_status='NAO_ENVIADO',confirmation_code='new-confirmation' where id=message_id;
 if public.anota_reply_claim(message_id,owner_id,'5511999999999',b,v) then raise exception 'CAS_CONFIRMATION_VERSION';end if;
 update public.anota_whatsapp_inbox set reply='stale patch' where id=message_id and user_id=owner_id and sender='5511999999999' and lease=b and reply_version=v;
 get diagnostics changed=row_count;
 if changed<>0 then raise exception 'CAS_PATCH_OLD_VERSION';end if;
 select reply_version into v from public.anota_whatsapp_inbox where id=message_id;
 update public.anota_whatsapp_inbox set reply_version=0 where id=message_id;
 if(select reply_version from public.anota_whatsapp_inbox where id=message_id)<>v then raise exception 'CAS_REVISION_FORGED';end if;
 update public.anota_whatsapp_inbox set confirmation_used=true where id=message_id;
 if(select reply_version from public.anota_whatsapp_inbox where id=message_id)<>v+1 then raise exception 'CAS_CONFIRMATION_USED';end if;
 update public.anota_whatsapp_inbox set lease=null,reply='Lembrete atual' where id=message_id;
 select reply_version into v from public.anota_whatsapp_inbox where id=message_id;
 if public.anota_reply_claim(message_id,owner_id,'5511999999999',b,v) then raise exception 'CAS_NULL_LEASE_MISMATCH';end if;
 if not public.anota_reply_claim(message_id,owner_id,'5511999999999',null,v) then raise exception 'CAS_NULL_LEASE_VALID';end if;
 update public.anota_whatsapp_inbox set status='PROCESSANDO',reply_status='NAO_ENVIADO' where id=message_id;
 select reply_version into v from public.anota_whatsapp_inbox where id=message_id;
 if public.anota_reply_claim(message_id,owner_id,'5511999999999',null,v) then raise exception 'CAS_PROCESSING_NOT_REPLY';end if;
 update public.anota_whatsapp_inbox set status='RESOLVIDO',reply='' where id=message_id;
 select reply_version into v from public.anota_whatsapp_inbox where id=message_id;
 if public.anota_reply_claim(message_id,owner_id,'5511999999999',null,v) then raise exception 'CAS_EMPTY_REPLY';end if;
 if has_function_privilege('anon','public.anota_reply_claim(uuid,uuid,text,uuid,bigint)','EXECUTE') or has_function_privilege('authenticated','public.anota_reply_claim(uuid,uuid,text,uuid,bigint)','EXECUTE') then raise exception 'CAS_PUBLIC_EXECUTE';end if;
end $$;
rollback;
