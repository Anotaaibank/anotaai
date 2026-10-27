-- Runs only through the disposable runner, inside BEGIN / ROLLBACK.
insert into auth.users(id,email,aud,role) values
 ('e1111111-1111-4111-8111-111111111111','qa-owner@example.invalid','authenticated','authenticated'),
 ('e2222222-2222-4222-8222-222222222222','qa-other@example.invalid','authenticated','authenticated');
insert into public.anota_access_accounts(user_id,exempt) values
 ('e1111111-1111-4111-8111-111111111111',true),('e2222222-2222-4222-8222-222222222222',true);
set local role authenticated;
select set_config('request.jwt.claim.sub','e1111111-1111-4111-8111-111111111111',true);
select public.anota_save_expense(jsonb_build_object(
 'id','e3333333-3333-4333-8333-333333333333','kind','PESSOAL','scope','PESSOAL',
 'entry_date',(now() at time zone 'America/Sao_Paulo')::date,'description','Despesa QA sintética',
 'category','Supermercado','status','REALIZADO','amount_cents',2500,'details','{}'::jsonb),null,'MANUAL');
do $$begin
 if (select count(*) from public.anota_expenses)<>1 then raise exception 'OWNER_CANNOT_READ';end if;
 if has_table_privilege(current_user,'public.anota_expenses','insert') then raise exception 'DIRECT_WRITE_GRANTED';end if;
 if has_function_privilege(current_user,'public.anota_claim_message()','execute') then raise exception 'WORKER_RPC_PUBLIC';end if;
end $$;
select set_config('request.jwt.claim.sub','e2222222-2222-4222-8222-222222222222',true);
do $$begin
 if exists(select 1 from public.anota_expenses) then raise exception 'CROSS_OWNER_READ';end if;
 begin
  perform public.anota_archive_expense('e3333333-3333-4333-8333-333333333333',now(),false);
  raise exception 'CROSS_OWNER_WRITE';
 exception when others then
  if sqlerrm not in ('ANOTA_FORBIDDEN','ANOTA_CHANGED','ANOTA_NOT_FOUND') then raise;end if;
 end;
end $$;
reset role;
set local role anon;
do $$begin
 if has_table_privilege(current_user,'public.anota_expenses','select') then raise exception 'ANON_TABLE_ACCESS';end if;
 if has_function_privilege(current_user,'public.anota_apply_finance(jsonb,text)','execute') then raise exception 'ANON_FINANCE_RPC';end if;
end $$;
reset role;
