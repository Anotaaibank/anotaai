insert into auth.users(id,email,aud,role,created_at,updated_at) values
 ('a6111111-1111-4111-8111-111111111111','communications-manager@example.invalid','authenticated','authenticated',now(),now()),
 ('a6222222-2222-4222-8222-222222222222','communications-one@example.invalid','authenticated','authenticated',now(),now()),
 ('a6333333-3333-4333-8333-333333333333','communications-two@example.invalid','authenticated','authenticated',now(),now()),
 ('a6444444-4444-4444-8444-444444444444','communications-other-owner@example.invalid','authenticated','authenticated',now(),now());
insert into public.anota_access_accounts(user_id,exempt) values('a6111111-1111-4111-8111-111111111111',true),('a6444444-4444-4444-8444-444444444444',true);
insert into public.anota_whatsapp_bots(user_id,phone,allowed_phones,enabled,status,hook_cipher) values('a6111111-1111-4111-8111-111111111111','5511999999989',array['5511996666601','5511996666602'],true,'PRONTO','fixture');
insert into public.anota_whatsapp_invitations(id,owner_id,phone,user_id,token_hash,token_cipher,expires_at,send_status,active,subscriber_name,created_at,updated_at) values
 ('a6555555-5555-4555-8555-555555555555','a6111111-1111-4111-8111-111111111111','5511996666601','a6222222-2222-4222-8222-222222222222',repeat('1',64),repeat('x',40),9999999999999,'ACEITO',1,'Pessoa Um',clock_timestamp(),clock_timestamp()),
 ('a6666666-6666-4666-8666-666666666666','a6111111-1111-4111-8111-111111111111','5511996666602','a6333333-3333-4333-8333-333333333333',repeat('2',64),repeat('x',40),9999999999999,'ACEITO',1,'Pessoa Dois',clock_timestamp(),clock_timestamp());
do $$declare actor uuid:='a6111111-1111-4111-8111-111111111111';other uuid:='a6444444-4444-4444-8444-444444444444';ids uuid[]:=array['a6555555-5555-4555-8555-555555555555','a6666666-6666-4666-8666-666666666666']::uuid[];job uuid:=gen_random_uuid();job2 uuid:=gen_random_uuid();claim jsonb;recipient uuid;
begin
 perform public.anota_prepare_communication(actor,job,'Mensagem fictícia',ids);
 perform public.anota_prepare_communication(actor,job,'Mensagem fictícia',ids);
 if (select count(*) from public.anota_communication_recipients where communication_id=job)<>2 then raise exception 'DUPLICATE_DRAFT';end if;
 if public.anota_claim_communication(actor) is not null then raise exception 'UNCONFIRMED_SENT';end if;
 begin perform public.anota_prepare_communication(actor,job,'Outra mensagem',ids);raise exception 'CONTENT_MUTATED';exception when others then if sqlerrm<>'ANOTA_FORBIDDEN' then raise;end if;end;
 begin perform public.anota_prepare_communication(other,gen_random_uuid(),'Outro gestor',ids);raise exception 'OTHER_CONTACTS_ACCEPTED';exception when others then if sqlerrm<>'ANOTA_COMMUNICATION_CONTACT' then raise;end if;end;
 begin perform public.anota_confirm_communication(other,job);raise exception 'OTHER_OWNER_CONFIRMED';exception when others then if sqlerrm<>'ANOTA_FORBIDDEN' then raise;end if;end;
 perform public.anota_confirm_communication(actor,job);perform public.anota_confirm_communication(actor,job);
 claim:=public.anota_claim_communication(actor);if claim is null or claim->>'message'<>'Mensagem fictícia' then raise exception 'CONFIRMED_NOT_CLAIMED';end if;
 recipient:=(claim->>'id')::uuid;
 if not public.anota_check_communication(actor,recipient,(claim->>'lease')::uuid) or public.anota_check_communication(other,recipient,(claim->>'lease')::uuid) then raise exception 'LEASE_OWNER_FAILED';end if;
 if public.anota_claim_communication(actor) is not null then raise exception 'OVERLAPPING_SEND';end if;
 update public.anota_communication_recipients set claimed_at=clock_timestamp()-interval '6 minutes' where id=recipient;
 perform public.anota_claim_communication(actor);
 if (select status from public.anota_communication_recipients where id=recipient)<>'INCERTO' then raise exception 'CRASH_RETRIED';end if;
 -- Cancelling makes any still-claimed send ineligible and cancels queued rows.
 perform public.anota_confirm_communication(actor,job,true);
 if exists(select 1 from public.anota_communication_recipients where communication_id=job and status='FILA') then raise exception 'CANCELLED_QUEUE_ACTIVE';end if;
 if public.anota_check_communication(actor,recipient,(claim->>'lease')::uuid) then raise exception 'CANCELLED_STILL_AUTHORIZED';end if;
 perform public.anota_prepare_communication(actor,job2,'Outro aviso',ids);
 update public.anota_whatsapp_invitations set active=0 where id=ids[2];
 begin perform public.anota_confirm_communication(actor,job2);raise exception 'REMOVED_CONTACT_CONFIRMED';exception when others then if sqlerrm<>'ANOTA_COMMUNICATION_CONTACT' then raise;end if;end;
 update public.anota_whatsapp_invitations set active=1 where id=ids[2];
 update public.anota_communications set expires_at=clock_timestamp()-interval '1 second' where id=job2;
 begin perform public.anota_confirm_communication(actor,job2);raise exception 'EXPIRED_CONFIRMED';exception when others then if sqlerrm<>'ANOTA_COMMUNICATION_EXPIRED' then raise;end if;end;
 if jsonb_array_length(public.anota_communication_history(other))<>0 then raise exception 'HISTORY_LEAK';end if;
 if has_table_privilege('authenticated','public.anota_communications','select') or has_function_privilege('anon','public.anota_claim_communication(uuid)','execute') or has_function_privilege('authenticated','public.anota_confirm_communication(uuid,uuid,boolean)','execute') then raise exception 'PUBLIC_CONTROLS';end if;
end $$;
