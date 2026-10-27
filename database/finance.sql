-- Prepared for a separate Anota Aí Supabase database. Run after schema.sql.
-- Local SQLite is the active store; this file has not been applied to Postgres.
create table public.anota_finance_documents (
 id uuid primary key,user_id uuid not null references auth.users(id),data jsonb not null,
 updated_at timestamptz not null,
 constraint finance_object check(jsonb_typeof(data)='object' and data->>'kind' in ('PROFILE','INCOME','RESERVE','TRANSFER','APPOINTMENT'))
);
create index anota_finance_owner on public.anota_finance_documents(user_id);
alter table public.anota_finance_documents enable row level security;
create policy finance_read_own on public.anota_finance_documents for select to authenticated using((select auth.uid())=user_id);
grant select on public.anota_finance_documents to authenticated;
revoke insert,update,delete on public.anota_finance_documents from anon,authenticated;
create table public.anota_finance_operations(id uuid primary key,user_id uuid not null references auth.users(id),plan jsonb not null,result jsonb not null,created_at timestamptz not null default now());
alter table public.anota_finance_operations enable row level security;
revoke all on public.anota_finance_operations from anon,authenticated;
grant all on public.anota_finance_documents,public.anota_finance_operations to service_role;
alter table public.anota_whatsapp_inbox add column finance_confirmation text,add column confirmation_code text,add column confirmation_used boolean not null default false;

create function anota_private.validate_finance_document(p jsonb) returns void language plpgsql security invoker set search_path='' as $$
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
 else raise exception 'ANOTA_FORBIDDEN';end if;
end $$;
revoke all on function anota_private.validate_finance_document(jsonb) from public,anon,authenticated;

create function anota_private.apply_finance(p_user uuid,p_plan jsonb,p_origin text) returns jsonb language plpgsql security definer set search_path='' as $$
declare item jsonb;doc jsonb;old public.anota_finance_documents;receipt public.anota_finance_operations;entry public.anota_expenses;reserve jsonb;due text;available bigint;revision timestamptz;result jsonb;id uuid;
begin
 if p_user is null or p_origin not in ('MANUAL','VOICE','WHATSAPP') or jsonb_typeof(p_plan)<>'object' or p_plan-array['id','expenses','documents','checks','title','lines']<>'{}'::jsonb or jsonb_typeof(p_plan->'expenses')<>'array' or jsonb_typeof(p_plan->'documents')<>'array' or jsonb_typeof(p_plan->'checks')<>'array' or jsonb_array_length(p_plan->'expenses')>60 or jsonb_array_length(p_plan->'documents')>5 or jsonb_array_length(p_plan->'checks')>5 then raise exception 'ANOTA_FORBIDDEN';end if;
 id:=(p_plan->>'id')::uuid;
 perform pg_advisory_xact_lock(hashtextextended('finance:'||p_user::text,0));
 select * into receipt from public.anota_finance_operations where anota_finance_operations.id=id;
 if found then if receipt.user_id<>p_user or receipt.plan<>p_plan then raise exception 'ANOTA_CHANGED';end if;return receipt.result||jsonb_build_object('replayed',true);end if;
 for item in select * from jsonb_array_elements(p_plan->'checks') loop
  if not exists(select 1 from public.anota_finance_documents where anota_finance_documents.id=(item->>'id')::uuid and user_id=p_user and updated_at=(item->>'updated_at')::timestamptz) then raise exception 'ANOTA_CHANGED';end if;
 end loop;
 for item in select * from jsonb_array_elements(p_plan->'documents') loop
  doc:=item->'document';perform anota_private.validate_finance_document(doc);
  select * into old from public.anota_finance_documents where anota_finance_documents.id=(doc->>'id')::uuid for update;
  if found and old.user_id<>p_user then raise exception 'ANOTA_FORBIDDEN';end if;
  if (item->>'expected' is null and old.id is not null) or (item->>'expected' is not null and (old.id is null or old.updated_at<>(item->>'expected')::timestamptz)) then raise exception 'ANOTA_CHANGED';end if;
  if old.id is not null and old.data->>'kind'<>doc->>'kind' then raise exception 'ANOTA_FORBIDDEN';end if;
  if doc->>'kind'='PROFILE' and exists(select 1 from public.anota_finance_documents where user_id=p_user and data->>'kind'='PROFILE' and anota_finance_documents.id<>(doc->>'id')::uuid) then raise exception 'ANOTA_FORBIDDEN';end if;
  revision:=date_trunc('milliseconds',greatest(clock_timestamp(),coalesce(old.updated_at+interval '1 millisecond',clock_timestamp())));
  doc:=doc||jsonb_build_object('updated_at',to_char(revision at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
  insert into public.anota_finance_documents values((doc->>'id')::uuid,p_user,doc,revision) on conflict on constraint anota_finance_documents_pkey do update set data=excluded.data,updated_at=excluded.updated_at;
  insert into public.anota_audit_logs(user_id,entity_id,action,details) values(p_user,(doc->>'id')::uuid,'FINANCAS_'||(doc->>'kind'),jsonb_build_object('origin',p_origin));
  old:=null;
 end loop;
 -- Reject orphan transfers and all historical overdrawing of reserves.
 if exists(select 1 from public.anota_finance_documents t where t.user_id=p_user and t.data->>'kind'='TRANSFER' and (t.data->>'active')::boolean and not exists(select 1 from public.anota_finance_documents r where r.user_id=p_user and r.id=(t.data->'details'->>'reserve_id')::uuid and r.data->>'kind'='RESERVE' and (r.data->>'active')::boolean and r.data->>'date'<=t.data->>'date')) then raise exception 'ANOTA_CHANGED';end if;
 for reserve in select data from public.anota_finance_documents where user_id=p_user and data->>'kind'='RESERVE' and (data->>'active')::boolean loop
  for due in select data->>'date' from public.anota_finance_documents where user_id=p_user and data->>'kind'='TRANSFER' and (data->>'active')::boolean and data->'details'->>'reserve_id'=reserve->>'id' loop
   select (reserve->>'amount_cents')::bigint+coalesce(sum(case when data->'details'->>'direction'='APORTE' then (data->>'amount_cents')::bigint else -(data->>'amount_cents')::bigint end),0) into available from public.anota_finance_documents where user_id=p_user and data->>'kind'='TRANSFER' and (data->>'active')::boolean and data->'details'->>'reserve_id'=reserve->>'id' and data->>'date'<=due;
   if available<0 then raise exception 'ANOTA_CHANGED';end if;
  end loop;
 end loop;
 for item in select * from jsonb_array_elements(p_plan->'expenses') loop
  if item ? 'active' then
   if jsonb_typeof(item->'active')<>'boolean' then raise exception 'ANOTA_FORBIDDEN';end if;
   update public.anota_expenses set active=(item->>'active')::boolean,updated_at=clock_timestamp() where anota_expenses.id=(item->'payload'->>'id')::uuid and user_id=p_user and updated_at=(item->>'expected')::timestamptz returning * into entry;
   if not found then raise exception 'ANOTA_CHANGED';end if;
   insert into public.anota_audit_logs(user_id,entity_id,action,details) values(p_user,entry.id,case when entry.active then 'DESPESA_RESTAURADA' else 'DESPESA_ARQUIVADA' end,jsonb_build_object('origin',p_origin));
  else perform anota_private.write_expense(p_user,item->'payload',(item->>'expected')::timestamptz,p_origin);end if;
 end loop;
 result:=jsonb_build_object('ok',true,'saved',true,'title',p_plan->>'title','operation_id',id,'expense_ids',(select coalesce(jsonb_agg(v->'payload'->>'id'),'[]'::jsonb) from jsonb_array_elements(p_plan->'expenses') v));
 insert into public.anota_finance_operations(id,user_id,plan,result) values(id,p_user,p_plan,result);return result;
end $$;
revoke all on function anota_private.apply_finance(uuid,jsonb,text) from public,anon,authenticated;
create function public.anota_apply_finance(p_plan jsonb,p_origin text default 'MANUAL') returns jsonb language plpgsql security definer set search_path='' as $$
begin if auth.uid() is null or p_origin not in ('MANUAL','VOICE') then raise exception 'ANOTA_FORBIDDEN';end if;return anota_private.apply_finance(auth.uid(),p_plan,p_origin);end $$;
revoke all on function public.anota_apply_finance(jsonb,text) from public,anon;
grant execute on function public.anota_apply_finance(jsonb,text) to authenticated;
create function public.anota_apply_finance_whatsapp(p_user uuid,p_plan jsonb,p_message uuid,p_lease uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform i.id from public.anota_whatsapp_inbox i join public.anota_whatsapp_bots b on b.user_id=i.user_id where i.id=p_message and i.user_id=p_user and i.lease=p_lease and i.status='PROCESSANDO' and b.enabled and b.status='PRONTO' and i.sender=any(b.allowed_phones) for update of i,b;
 if not found then raise exception 'ANOTA_FORBIDDEN';end if;
 return anota_private.apply_finance(p_user,p_plan,'WHATSAPP');
end $$;
revoke all on function public.anota_apply_finance_whatsapp(uuid,jsonb,uuid,uuid) from public,anon,authenticated;
grant execute on function public.anota_apply_finance_whatsapp(uuid,jsonb,uuid,uuid) to service_role;
