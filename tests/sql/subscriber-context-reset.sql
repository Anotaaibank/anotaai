-- Synthetic accounts only, run inside BEGIN/ROLLBACK after the migration.
insert into auth.users(id,email,aud,role,created_at,updated_at) values
 ('b1111111-1111-4111-8111-111111111111','context-manager@example.invalid','authenticated','authenticated',now(),now()),
 ('b2222222-2222-4222-8222-222222222222','context-member@example.invalid','authenticated','authenticated',now(),now()),
 ('b3333333-3333-4333-8333-333333333333','context-other@example.invalid','authenticated','authenticated',now(),now());
insert into public.anota_access_accounts(user_id,exempt) values('b1111111-1111-4111-8111-111111111111',true);
insert into public.anota_whatsapp_bots(user_id,phone,allowed_phones,enabled,status,hook_cipher) values
 ('b1111111-1111-4111-8111-111111111111','5511999999979',array['5511996666671','5511996666672'],true,'PRONTO','fixture');
insert into public.anota_whatsapp_invitations(id,owner_id,phone,user_id,token_hash,token_cipher,expires_at,send_status,active,subscriber_name,created_at,updated_at)
 values('b4444444-4444-4444-8444-444444444444','b1111111-1111-4111-8111-111111111111','5511996666671','b2222222-2222-4222-8222-222222222222',repeat('b',64),'',9999999999999,'ACEITO',1,'Pessoa Sintética',now(),now());
insert into public.anota_whatsapp_inbox(id,user_id,provider_id,sender,type,status,reply,reply_status,lease,claimed_at,finance_confirmation,confirmation_code,confirmation_used) values
 ('b5555555-5555-4555-8555-555555555555','b2222222-2222-4222-8222-222222222222','reset-fixture-a','5511996666671','text','PROCESSANDO','Antiga','NAO_ENVIADO',gen_random_uuid(),now(),'invalid-fixture','FIXTURE',false),
 ('b6666666-6666-4666-8666-666666666666','b2222222-2222-4222-8222-222222222222','reset-fixture-b','5511996666672','text','ESCLARECER','Outro número','ACEITO',null,null,'other-fixture','OTHER',false),
 ('b7777777-7777-4777-8777-777777777777','b2222222-2222-4222-8222-222222222222','anotei-reminder:v1:reset-fixture','5511996666671','text','RESOLVIDO','Lembrete','NAO_ENVIADO',null,null,'','',true);
do $$declare actor uuid:='b1111111-1111-4111-8111-111111111111';member uuid:='b2222222-2222-4222-8222-222222222222';rev timestamptz;req uuid:=gen_random_uuid();r jsonb;old_count bigint;
begin
 if has_function_privilege('anon','public.anota_reset_whatsapp_context(uuid,text,timestamptz,uuid)','EXECUTE') or has_function_privilege('authenticated','public.anota_reset_whatsapp_context(uuid,text,timestamptz,uuid)','EXECUTE') then raise exception 'RESET_EXPOSED';end if;
 select updated_at into rev from public.anota_whatsapp_invitations where id='b4444444-4444-4444-8444-444444444444';
 select count(*) into old_count from public.anota_whatsapp_inbox where user_id=member;
 begin perform public.anota_reset_whatsapp_context(member,'5511996666671',rev,req);raise exception 'NON_MANAGER_ACCEPTED';exception when others then if sqlerrm<>'ANOTA_FORBIDDEN' then raise;end if;end;
 begin perform public.anota_reset_whatsapp_context(actor,'5511996666679',rev,req);raise exception 'OTHER_CONTACT_ACCEPTED';exception when others then if sqlerrm<>'ANOTA_FORBIDDEN' then raise;end if;end;
 begin perform public.anota_reset_whatsapp_context(actor,'5511996666671',rev-interval '1 second',req);raise exception 'STALE_VERSION_ACCEPTED';exception when others then if sqlerrm<>'ANOTA_CHANGED' then raise;end if;end;
 r:=public.anota_reset_whatsapp_context(actor,'5511996666671',rev,req);
 if (r->>'affected_messages')::integer<>1 then raise exception 'WRONG_RESET_COUNT';end if;
 if exists(select 1 from public.anota_whatsapp_inbox where id='b5555555-5555-4555-8555-555555555555' and (context_reset_at is null or lease is not null or status<>'RESOLVIDO' or reply_status<>'CANCELADO' or finance_confirmation<>'' or not confirmation_used)) then raise exception 'PENDING_SURVIVED_RESET';end if;
 if exists(select 1 from public.anota_whatsapp_inbox where id in ('b6666666-6666-4666-8666-666666666666','b7777777-7777-4777-8777-777777777777') and context_reset_at is not null) then raise exception 'OTHER_SENDER_OR_REMINDER_CLEARED';end if;
 if (select count(*) from public.anota_whatsapp_inbox where user_id=member)<>old_count then raise exception 'DEDUPE_ROWS_DELETED';end if;
 if public.anota_reset_whatsapp_context(actor,'5511996666671',rev,req)<>r then raise exception 'RESET_REPLAY_CHANGED_RESULT';end if;
 begin perform public.anota_reset_whatsapp_context(actor,'5511996666671',rev,gen_random_uuid());raise exception 'STALE_RESET_REPEATED';exception when others then if sqlerrm<>'ANOTA_CHANGED' then raise;end if;end;
 if not exists(select 1 from public.anota_whatsapp_invitations where user_id=member and active=1) or not exists(select 1 from auth.users where id=member) then raise exception 'ACCOUNT_CHANGED';end if;
end $$;
select 'subscriber_context_reset_ok' as result;
