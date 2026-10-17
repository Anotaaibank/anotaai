-- Additive, append-only balance reconciliation. Existing receipts and history remain intact.
alter table public.anota_finance_documents drop constraint finance_object;
alter table public.anota_finance_documents add constraint finance_object check(jsonb_typeof(data)='object' and data->>'kind' in ('PROFILE','INCOME','RESERVE','TRANSFER','APPOINTMENT','BILL_RULE','BALANCE_ADJUSTMENT'));

-- Preserve the deployed validators/writers rather than reintroducing an old definition.
do $$declare definition text;begin
 if to_regprocedure('anota_private.validate_finance_document_before_balance(jsonb)') is null then
  definition:=pg_get_functiondef('anota_private.validate_finance_document(jsonb)'::regprocedure);
  execute replace(definition,'anota_private.validate_finance_document(', 'anota_private.validate_finance_document_before_balance(');
 end if;
 if to_regprocedure('anota_private.apply_finance_before_balance(uuid,jsonb,text)') is null then
  definition:=pg_get_functiondef('anota_private.apply_finance(uuid,jsonb,text)'::regprocedure);
  execute replace(definition,'anota_private.apply_finance(', 'anota_private.apply_finance_before_balance(');
 end if;
end $$;
revoke all on function anota_private.validate_finance_document_before_balance(jsonb),anota_private.apply_finance_before_balance(uuid,jsonb,text) from public,anon,authenticated,service_role;

create or replace function anota_private.validate_finance_document(p jsonb) returns void language plpgsql security invoker set search_path='' as $$
declare d jsonb;v jsonb;previous bigint;target bigint;delta bigint;today date:=(clock_timestamp() at time zone 'America/Sao_Paulo')::date;
begin
 if p->>'kind' is distinct from 'BALANCE_ADJUSTMENT' then perform anota_private.validate_finance_document_before_balance(p);return;end if;
 if jsonb_typeof(p)<>'object' or p-array['id','kind','description','date','amount_cents','status','active','details']<>'{}'::jsonb or not(p ?& array['id','kind','description','date','amount_cents','status','active','details']) then raise exception 'ANOTA_FORBIDDEN';end if;
 perform (p->>'id')::uuid;
 if jsonb_typeof(p->'description') is distinct from 'string' or length(p->>'description') not between 2 and 160 or p->>'status' is distinct from 'REALIZADO' or p->'active' is distinct from 'true'::jsonb or jsonb_typeof(p->'date') is distinct from 'string' or (p->>'date')::date is distinct from today or jsonb_typeof(p->'amount_cents') is distinct from 'number' or jsonb_typeof(p->'details') is distinct from 'object' then raise exception 'ANOTA_FORBIDDEN';end if;
 d:=p->'details';
 if d-array['previous_balance_cents','target_balance_cents','delta_cents','basis_hash']<>'{}'::jsonb or not(d ?& array['previous_balance_cents','target_balance_cents','delta_cents','basis_hash']) or jsonb_typeof(d->'basis_hash')<>'string' or d->>'basis_hash'!~'^[a-f0-9]{32}$' then raise exception 'ANOTA_FORBIDDEN';end if;
 for v in select value from jsonb_each(d) where key<>'basis_hash' loop
  if jsonb_typeof(v)<>'number' or v::text::numeric<>trunc(v::text::numeric) or abs(v::text::numeric)>1000000000 then raise exception 'ANOTA_FORBIDDEN';end if;
 end loop;
 previous:=(d->>'previous_balance_cents')::bigint;target:=(d->>'target_balance_cents')::bigint;delta:=(d->>'delta_cents')::bigint;
 if delta<>target-previous or (p->>'amount_cents')::numeric<>abs(delta) then raise exception 'ANOTA_FORBIDDEN';end if;
end $$;
revoke all on function anota_private.validate_finance_document(jsonb) from public,anon,authenticated,service_role;

create or replace function anota_private.balance_context(p_user uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare profile jsonb;balance bigint;basis text;today text:=to_char(clock_timestamp() at time zone 'America/Sao_Paulo','YYYY-MM-DD');
begin
 select data into profile from public.anota_finance_documents where user_id=p_user and data->>'kind'='PROFILE' and data->'active'='true'::jsonb;
 if profile is null then raise exception 'ANOTA_BALANCE_SETUP';end if;
 select (profile->'details'->>'opening_balance_cents')::bigint
  +coalesce((select sum(case when data->>'kind'='INCOME' then (data->>'amount_cents')::bigint when data->>'kind'='BALANCE_ADJUSTMENT' then (data->'details'->>'delta_cents')::bigint when data->'details'->>'direction'='RESGATE' then (data->>'amount_cents')::bigint else -(data->>'amount_cents')::bigint end) from public.anota_finance_documents where user_id=p_user and data->'active'='true'::jsonb and data->>'status'='REALIZADO' and data->>'kind' in ('INCOME','TRANSFER','BALANCE_ADJUSTMENT') and data->>'date'>=profile->'details'->>'opening_date' and data->>'date'<=today),0)
  -coalesce((select sum(amount_cents) from public.anota_expenses where user_id=p_user and active and status='REALIZADO' and entry_date>=(profile->'details'->>'opening_date')::date and entry_date<=today::date),0) into balance;
 select md5(coalesce(string_agg(value,'|' order by value),'')) into basis from (
  select 'D:'||id::text||':'||floor(extract(epoch from updated_at)*1000)::bigint::text as value from public.anota_finance_documents where user_id=p_user and data->>'kind' in ('PROFILE','INCOME','TRANSFER','BALANCE_ADJUSTMENT')
  union all select 'E:'||id::text||':'||floor(extract(epoch from updated_at)*1000)::bigint::text from public.anota_expenses where user_id=p_user
 ) items;
 return jsonb_build_object('balance_cents',balance,'basis_hash',basis);
end $$;
revoke all on function anota_private.balance_context(uuid) from public,anon,authenticated,service_role;

-- Every expense/document writer shares the per-owner lock, including legacy screen APIs.
-- Acquire the owner lock BEFORE any legacy row/per-expense lock. Preserve the
-- deployed bodies, signatures, grants and authentication/subscription checks.
do $$declare definition text;begin
 definition:=pg_get_functiondef('anota_private.write_expense(uuid,jsonb,timestamptz,text)'::regprocedure);
 execute regexp_replace(definition,'\mbegin\M',E'begin\n perform pg_advisory_xact_lock(hashtextextended(''finance:''||p_user::text,0));','i');
 definition:=pg_get_functiondef('public.anota_archive_expense(uuid,timestamptz,boolean)'::regprocedure);
 execute regexp_replace(definition,'\mbegin\M',E'begin\n perform pg_advisory_xact_lock(hashtextextended(''finance:''||auth.uid()::text,0));','i');
end $$;

create or replace function anota_private.lock_cash_owner() returns trigger language plpgsql security invoker set search_path='' as $$
declare owner_id uuid;begin
 if tg_op='UPDATE' and old.user_id<>new.user_id then raise exception 'ANOTA_FORBIDDEN';end if;
 owner_id:=case when tg_op='DELETE' then old.user_id else new.user_id end;
 perform pg_advisory_xact_lock(hashtextextended('finance:'||owner_id::text,0));
 if tg_op='DELETE' then return old;end if;return new;
end $$;
revoke all on function anota_private.lock_cash_owner() from public,anon,authenticated,service_role;
create trigger anota_cash_owner_lock before insert or update or delete on public.anota_expenses for each row execute function anota_private.lock_cash_owner();
create trigger anota_cash_owner_lock before insert or update or delete on public.anota_finance_documents for each row execute function anota_private.lock_cash_owner();

create or replace function anota_private.apply_finance(p_user uuid,p_plan jsonb,p_origin text) returns jsonb language plpgsql security definer set search_path='' as $$
declare item jsonb;doc jsonb;context jsonb;adjustments integer;begin
 if p_user is null then raise exception 'ANOTA_FORBIDDEN';end if;
 perform pg_advisory_xact_lock(hashtextextended('finance:'||p_user::text,0));
 -- Let the original writer verify the operation id, owner and identical content before replaying.
 if exists(select 1 from public.anota_finance_operations where id=(p_plan->>'id')::uuid) then return anota_private.apply_finance_before_balance(p_user,p_plan,p_origin);end if;
 for item in select value from jsonb_array_elements(p_plan->'documents') loop
  if exists(select 1 from public.anota_finance_documents where id=(item->'document'->>'id')::uuid and data->>'kind'='BALANCE_ADJUSTMENT') then raise exception 'ANOTA_BALANCE_IMMUTABLE';end if;
 end loop;
 select count(*) into adjustments from jsonb_array_elements(p_plan->'documents') where value->'document'->>'kind'='BALANCE_ADJUSTMENT';
 if adjustments>0 then
  if adjustments<>1 or jsonb_array_length(p_plan->'documents')<>1 or jsonb_array_length(p_plan->'expenses')<>0 or jsonb_array_length(p_plan->'checks')<>0 then raise exception 'ANOTA_FORBIDDEN';end if;
  item:=p_plan->'documents'->0;doc:=item->'document';
  perform anota_private.validate_finance_document(doc);
  if item->>'expected' is not null then raise exception 'ANOTA_BALANCE_IMMUTABLE';end if;
  context:=anota_private.balance_context(p_user);
  if context->>'basis_hash'<>doc->'details'->>'basis_hash' or (context->>'balance_cents')::bigint<>(doc->'details'->>'previous_balance_cents')::bigint then raise exception 'ANOTA_BALANCE_CHANGED';end if;
 end if;
 return anota_private.apply_finance_before_balance(p_user,p_plan,p_origin);
end $$;
revoke all on function anota_private.apply_finance(uuid,jsonb,text) from public,anon,authenticated,service_role;
