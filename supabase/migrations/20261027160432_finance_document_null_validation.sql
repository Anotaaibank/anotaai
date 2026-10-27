-- Reject absent/JSON-null required fields in the deployed composite validator.
-- Additive migration: keep BILL_RULE and append-only BALANCE_ADJUSTMENT semantics.
-- The baseline keeps its original branch marker for historical migration replay.
-- No data rewrite, grants expansion, writer replacement or remote application.
create or replace function anota_private.validate_finance_document(p jsonb) returns void language plpgsql security invoker set search_path='' as $$
declare k text;field text;v jsonb;d jsonb;n numeric;today date:=(clock_timestamp() at time zone 'America/Sao_Paulo')::date;
begin
 -- Reject SQL NULL/JSON null and wrong types before casts. A nullable comparison
 -- in an IF is not a rejection: all required fields must be checked explicitly.
 if jsonb_typeof(p) is distinct from 'object' then raise exception 'ANOTA_FORBIDDEN';end if;
 if p-array['id','kind','description','date','amount_cents','status','active','details']<>'{}'::jsonb or not(p ?& array['id','kind','description','date','amount_cents','status','active','details']) then raise exception 'ANOTA_FORBIDDEN';end if;
 foreach field in array array['id','kind','description','date','status'] loop
  if jsonb_typeof(p->field) is distinct from 'string' then raise exception 'ANOTA_FORBIDDEN';end if;
 end loop;
 if jsonb_typeof(p->'active') is distinct from 'boolean' or jsonb_typeof(p->'amount_cents') is distinct from 'number' or jsonb_typeof(p->'details') is distinct from 'object' then raise exception 'ANOTA_FORBIDDEN';end if;
 perform (p->>'id')::uuid;
 if (p->>'amount_cents')::numeric<>trunc((p->>'amount_cents')::numeric) or (p->>'amount_cents')::numeric not between 0 and 1000000000 or p->>'status' not in ('PREVISTO','REALIZADO') or length(p->>'description') not between 2 and 160 or (p->>'date')::date not between '2000-01-01' and '2100-12-31' then raise exception 'ANOTA_FORBIDDEN';end if;
 k:=p->>'kind';d:=p->'details';
 if k in ('INCOME','TRANSFER') and (p->>'amount_cents')::bigint<1 then raise exception 'ANOTA_FORBIDDEN';end if;
 if k in ('INCOME','RESERVE','TRANSFER','PROFILE') and p->>'status'='REALIZADO' and (p->>'date')::date>today then raise exception 'ANOTA_FUTURE_PAID';end if;
 if k='PROFILE' then
  if d-array['has_extra_income','salary_cents','salary_day','opening_balance_cents','opening_date','overdraft_limit_cents','overdraft_monthly_rate','safety_buffer_cents']<>'{}'::jsonb or not(d ?& array['salary_cents','salary_day','opening_balance_cents','opening_date','overdraft_limit_cents','overdraft_monthly_rate','safety_buffer_cents']) then raise exception 'ANOTA_FORBIDDEN';end if;
  for field,v in select * from jsonb_each(d) loop
   if field in ('salary_cents','opening_balance_cents','overdraft_limit_cents','safety_buffer_cents','salary_day') then
    if jsonb_typeof(v) is distinct from 'number' then raise exception 'ANOTA_FORBIDDEN';end if;n:=v::text::numeric;
    if n<>trunc(n) or abs(n)>1000000000 or (field<>'opening_balance_cents' and n<0) or (field='salary_day' and n not between 1 and 31) then raise exception 'ANOTA_FORBIDDEN';end if;
   end if;
  end loop;
  if (d ? 'has_extra_income' and jsonb_typeof(d->'has_extra_income') is distinct from 'boolean') or jsonb_typeof(d->'overdraft_monthly_rate') is distinct from 'number' or jsonb_typeof(d->'opening_date') is distinct from 'string' then raise exception 'ANOTA_FORBIDDEN';end if;
  if (d->>'overdraft_monthly_rate')::numeric not between 0 and 100 or (d->>'opening_date')::date not between '2000-01-01' and today or not(p->>'active')::boolean then raise exception 'ANOTA_FORBIDDEN';end if;
 elsif k='INCOME' then
  if d-array['salary','activity']<>'{}'::jsonb or jsonb_typeof(d->'salary') is distinct from 'boolean' or (d ? 'activity' and jsonb_typeof(d->'activity') is distinct from 'string') then raise exception 'ANOTA_FORBIDDEN';end if;
  if d ? 'activity' and (length(trim(d->>'activity')) not between 2 and 80 or (d->>'salary')::boolean) then raise exception 'ANOTA_FORBIDDEN';end if;
 elsif k='RESERVE' then
  if d-array['rate_percent','rate_period']<>'{}'::jsonb or jsonb_typeof(d->'rate_percent') is distinct from 'number' or jsonb_typeof(d->'rate_period') is distinct from 'string' then raise exception 'ANOTA_FORBIDDEN';end if;
  if (d->>'rate_percent')::numeric not between 0 and 100 or d->>'rate_period' not in ('MENSAL','ANUAL') then raise exception 'ANOTA_FORBIDDEN';end if;
 elsif k='TRANSFER' then
  if d-array['reserve_id','direction']<>'{}'::jsonb or jsonb_typeof(d->'reserve_id') is distinct from 'string' or jsonb_typeof(d->'direction') is distinct from 'string' then raise exception 'ANOTA_FORBIDDEN';end if;
  if d->>'direction' not in ('APORTE','RESGATE') then raise exception 'ANOTA_FORBIDDEN';end if;perform (d->>'reserve_id')::uuid;
 elsif k='APPOINTMENT' then
  if d-array['time','location','done']<>'{}'::jsonb or jsonb_typeof(d->'done') is distinct from 'boolean' or (d ? 'time' and jsonb_typeof(d->'time') is distinct from 'string') or (d ? 'location' and jsonb_typeof(d->'location') is distinct from 'string') then raise exception 'ANOTA_FORBIDDEN';end if;
  if length(d->>'location')>160 or (d->>'time'<>'' and d->>'time'!~'^([01][0-9]|2[0-3]):[0-5][0-9]$') then raise exception 'ANOTA_FORBIDDEN';end if;
 elsif k='BILL_RULE' then
  if d-array['day','category','payment_method']<>'{}'::jsonb or jsonb_typeof(d->'day') is distinct from 'number' or jsonb_typeof(d->'category') is distinct from 'string' or jsonb_typeof(d->'payment_method') is distinct from 'string' then raise exception 'ANOTA_FORBIDDEN';end if;
  if (d->>'day')::numeric<>trunc((d->>'day')::numeric) or (d->>'day')::numeric not between 1 and 31 or length(d->>'category') not between 2 and 80 or d->>'payment_method' not in ('PIX','DINHEIRO','CARTAO','BOLETO','TRANSFERENCIA','OUTRO') or p->>'status'<>'PREVISTO' or (p->>'amount_cents')::bigint<1 then raise exception 'ANOTA_FORBIDDEN';end if;
 elsif k='BALANCE_ADJUSTMENT' then
  if p->>'status'<>'REALIZADO' or p->'active'<>'true'::jsonb or (p->>'date')::date<>today then raise exception 'ANOTA_FORBIDDEN';end if;
  if d-array['previous_balance_cents','target_balance_cents','delta_cents','basis_hash']<>'{}'::jsonb or not(d ?& array['previous_balance_cents','target_balance_cents','delta_cents','basis_hash']) or jsonb_typeof(d->'basis_hash') is distinct from 'string' then raise exception 'ANOTA_FORBIDDEN';end if;
  if d->>'basis_hash'!~'^[a-f0-9]{32}$' then raise exception 'ANOTA_FORBIDDEN';end if;
  for field,v in select * from jsonb_each(d) where key<>'basis_hash' loop
   if jsonb_typeof(v) is distinct from 'number' then raise exception 'ANOTA_FORBIDDEN';end if;n:=v::text::numeric;
   if n<>trunc(n) or abs(n)>1000000000 then raise exception 'ANOTA_FORBIDDEN';end if;
  end loop;
  if (d->>'delta_cents')::bigint<>(d->>'target_balance_cents')::bigint-(d->>'previous_balance_cents')::bigint or (p->>'amount_cents')::numeric<>abs((d->>'delta_cents')::bigint) then raise exception 'ANOTA_FORBIDDEN';end if;
 else raise exception 'ANOTA_FORBIDDEN';end if;
end $$;
revoke all on function anota_private.validate_finance_document(jsonb) from public,anon,authenticated,service_role;
