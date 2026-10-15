-- These fixtures run within BEGIN/ROLLBACK. No WhatsApp messages or accounts persist.
insert into auth.users(id,email,aud,role,created_at,updated_at) values
 ('f1111111-1111-4111-8111-111111111111','link-owner@example.invalid','authenticated','authenticated',now(),now()),
 ('f2222222-2222-4222-8222-222222222222','link-existing@example.invalid','authenticated','authenticated',now(),now()),
 ('f3333333-3333-4333-8333-333333333333','link-other@example.invalid','authenticated','authenticated',now(),now()),
 ('f4444444-4444-4444-8444-444444444444','link-new@example.invalid','authenticated','authenticated',now(),now());
insert into public.anota_access_accounts(user_id,exempt) values('f1111111-1111-4111-8111-111111111111',true);
update public.anota_pix_settings set enforce_access=true;
insert into public.anota_whatsapp_bots(user_id,phone,allowed_phones,enabled,status,hook_cipher) values('f1111111-1111-4111-8111-111111111111','5511988888898',array['5511988888891'],true,'PRONTO','fixture');
insert into public.anota_subscriptions(user_id,status,plan,monthly_cents,renewal_date) values('f2222222-2222-4222-8222-222222222222','TESTE','Básico',4990,current_date+30);
set local role service_role;
do $$declare actor uuid:='f1111111-1111-4111-8111-111111111111';u uuid:='f2222222-2222-4222-8222-222222222222';other uuid:='f3333333-3333-4333-8333-333333333333';fresh uuid:='f4444444-4444-4444-8444-444444444444';i public.anota_whatsapp_invitations;revision timestamptz;before_sub jsonb;plan jsonb;details jsonb;doc jsonb;
begin
 select updated_at into revision from public.anota_whatsapp_bots where user_id=actor;
 i:=public.anota_create_invitation(actor,'5511988888891',revision,jsonb_build_object('id',gen_random_uuid(),'token_hash',repeat('c',64),'token_cipher',repeat('x',40),'subscriber_name','Gestor Teste','plan_code','ILIMITADO'));
 if public.anota_personal_recipient(actor,i.phone) is not null then raise exception 'PENDING_INVITATION_LEAKED';end if;
 perform public.anota_link_existing_account(actor,i.phone,actor,i.updated_at,repeat('h',40));
 if public.anota_personal_recipient(actor,i.phone) is distinct from actor then raise exception 'OWNER_NOT_ROUTED';end if;
 if not public.anota_link_existing_account(actor,i.phone,actor,i.updated_at,repeat('h',40)) then raise exception 'REPLAY_FAILED';end if;
 select updated_at into revision from public.anota_whatsapp_bots where user_id=actor;
 i:=public.anota_create_invitation(actor,'5511988888892',revision,jsonb_build_object('id',gen_random_uuid(),'token_hash',repeat('d',64),'token_cipher',repeat('x',40),'subscriber_name','Cadastro Teste','plan_code','ILIMITADO'));
 select to_jsonb(s) into before_sub from public.anota_subscriptions s where user_id=u;
 begin perform public.anota_link_existing_account(other,i.phone,u,i.updated_at,repeat('h',40));raise exception 'UNAUTHORIZED_LINK';exception when others then if sqlerrm<>'ANOTA_FORBIDDEN' then raise;end if;end;
 begin perform public.anota_link_existing_account(actor,i.phone,u,null,repeat('h',40));raise exception 'MISSING_REVISION';exception when others then if sqlerrm<>'ANOTA_CHANGED' then raise;end if;end;
 perform public.anota_link_existing_account(actor,i.phone,u,i.updated_at,repeat('h',40));
 if public.anota_personal_recipient(actor,i.phone) is distinct from u then raise exception 'CUSTOMER_NOT_ROUTED';end if;
 if (select to_jsonb(s) from public.anota_subscriptions s where user_id=u)<>before_sub then raise exception 'SUBSCRIPTION_CHANGED';end if;
 if exists(select 1 from public.anota_finance_documents where user_id=u) then raise exception 'FINANCES_CREATED';end if;
 begin perform public.anota_link_existing_account(actor,i.phone,other,i.updated_at,repeat('h',40));raise exception 'REASSIGNMENT_ALLOWED';exception when others then if sqlerrm not in ('ANOTA_CHANGED','ANOTA_PHONE_ASSIGNED') then raise;end if;end;
 -- A real registration transaction must save salary, payday and opening balance to its own account.
 select updated_at into revision from public.anota_whatsapp_bots where user_id=actor;
 i:=public.anota_create_invitation(actor,'5511988888893',revision,jsonb_build_object('id',gen_random_uuid(),'token_hash',repeat('e',64),'token_cipher',repeat('x',40),'subscriber_name','Novo Cadastro','plan_code','BASICO'));
 details:=jsonb_build_object('full_name','Cadastro Teste','cpf','52998224725','postal_code','01001000','street','Rua Teste','address_number','1','complement','','neighborhood','Centro','city','São Paulo','state','SP');
 doc:=jsonb_build_object('id',gen_random_uuid(),'kind','PROFILE','description','Minha renda e meu saldo','date',current_date::text,'amount_cents',0,'status','REALIZADO','active',true,'details',jsonb_build_object('salary_cents',650000,'salary_day',12,'opening_balance_cents',230000,'opening_date',current_date::text,'overdraft_limit_cents',0,'overdraft_monthly_rate',0,'safety_buffer_cents',0,'has_extra_income',false));
 plan:=jsonb_build_object('id',gen_random_uuid(),'expenses','[]'::jsonb,'documents',jsonb_build_array(jsonb_build_object('document',doc,'expected',null)),'checks','[]'::jsonb,'title','Cadastro de renda','lines','[]'::jsonb);
 perform public.anota_register_customer(i.token_hash,fresh,repeat('h',40),plan,details);
 if not exists(select 1 from public.anota_finance_documents where user_id=fresh and data->'details'->>'salary_cents'='650000' and data->'details'->>'salary_day'='12' and data->'details'->>'opening_balance_cents'='230000') then raise exception 'ONBOARDING_PROFILE_NOT_SAVED';end if;
 if exists(select 1 from public.anota_finance_documents where user_id in (actor,u,other)) then raise exception 'CROSS_ACCOUNT_PROFILE';end if;
 if has_function_privilege('authenticated','public.anota_link_existing_account(uuid,text,uuid,timestamptz,text)','execute') or has_function_privilege('anon','public.anota_link_existing_account(uuid,text,uuid,timestamptz,text)','execute') then raise exception 'LINK_RPC_EXPOSED';end if;
end $$;
reset role;

