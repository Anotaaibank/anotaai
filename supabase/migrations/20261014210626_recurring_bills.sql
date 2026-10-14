-- Continuous monthly bills reuse the owner-scoped, guarded finance document store.
alter table public.anota_finance_documents drop constraint finance_object;
alter table public.anota_finance_documents add constraint finance_object check(jsonb_typeof(data)='object' and data->>'kind' in ('PROFILE','INCOME','RESERVE','TRANSFER','APPOINTMENT','BILL_RULE'));
do $migration$
declare definition text;old_branch text:=$old$ else raise exception 'ANOTA_FORBIDDEN';end if;$old$;new_branch text:=$new$
 elsif k='BILL_RULE' then
  if d-array['day','category','payment_method']<>'{}'::jsonb or not(d ?& array['day','category','payment_method']) or jsonb_typeof(d->'day')<>'number' or (d->>'day')::numeric<>trunc((d->>'day')::numeric) or (d->>'day')::numeric not between 1 and 31 or jsonb_typeof(d->'category')<>'string' or length(d->>'category') not between 2 and 80 or d->>'payment_method' not in ('PIX','DINHEIRO','CARTAO','BOLETO','TRANSFERENCIA','OUTRO') or p->>'status'<>'PREVISTO' or (p->>'amount_cents')::bigint<1 then raise exception 'ANOTA_FORBIDDEN';end if;
 else raise exception 'ANOTA_FORBIDDEN';end if;$new$;
begin
 definition:=pg_get_functiondef('anota_private.validate_finance_document(jsonb)'::regprocedure);
 if position(old_branch in definition)=0 then raise exception 'Unexpected finance validator';end if;
 execute replace(definition,old_branch,new_branch);
end $migration$;
create index if not exists anota_active_monthly_rules on public.anota_finance_documents(user_id) where data->>'kind'='BILL_RULE' and (data->>'active')::boolean;
create or replace function public.anota_expand_monthly_bills(p_user uuid) returns integer language plpgsql security definer set search_path='' as $$
declare rule jsonb;month date;first_month date;last_month date;due date;last_day integer;day integer;hash text;occurrence_id uuid;payload jsonb;created integer:=0;steps integer;marker text;
begin
 if p_user is null or not anota_private.access_allowed(p_user) or not exists(select 1 from public.anota_whatsapp_bots b where b.user_id=p_user and b.enabled and b.status='PRONTO' and (b.shared_owner_id is null or public.anota_personal_recipient(b.shared_owner_id,b.allowed_phones[1])=p_user)) then raise exception 'ANOTA_FORBIDDEN';end if;
 perform pg_advisory_xact_lock(hashtextextended('finance:'||p_user::text,0));
 for rule in select data from public.anota_finance_documents where user_id=p_user and data->>'kind'='BILL_RULE' and (data->>'active')::boolean loop
  perform anota_private.validate_finance_document(rule-'updated_at');
  day:=(rule->'details'->>'day')::integer;marker:='Recorrência mensal: '||(rule->>'id');
  select max(date_trunc('month',entry_date)::date) into last_month from public.anota_expenses where user_id=p_user and details->>'notes'=marker;
  first_month:=coalesce((last_month+interval '1 month')::date,date_trunc('month',(rule->>'date')::date)::date);
  month:=first_month;steps:=0;
  while month<=(date_trunc('month',clock_timestamp() at time zone 'America/Sao_Paulo')+interval '12 months')::date and steps<60 loop
   last_day:=extract(day from month+interval '1 month - 1 day');due:=month+(least(day,last_day)-1);
   if due>='2101-01-01' then exit;end if;
   if due>=(rule->>'date')::date then
    hash:=md5('anotei-monthly:'||(rule->>'id')||':'||to_char(month,'YYYY-MM'));occurrence_id:=(substr(hash,1,8)||'-'||substr(hash,9,4)||'-4'||substr(hash,14,3)||'-8'||substr(hash,18,3)||'-'||substr(hash,21,12))::uuid;
    if not exists(select 1 from public.anota_expenses where anota_expenses.id=occurrence_id) then
     payload:=jsonb_build_object('id',occurrence_id,'kind','MENSAL','scope','PESSOAL','entry_date',due,'description',rule->>'description','category',rule->'details'->>'category','status','PREVISTO','amount_cents',(rule->>'amount_cents')::bigint,'details',jsonb_build_object('notes',marker,'payment_method',rule->'details'->>'payment_method','trip_name','','expense_audience','NAO_INFORMADO','expense_nature','NAO_CLASSIFICADO'));
     perform anota_private.write_expense(p_user,payload,null,'WHATSAPP');created:=created+1;
    end if;
   end if;
   month:=(month+interval '1 month')::date;steps:=steps+1;
  end loop;
 end loop;
 return created;
end $$;
revoke all on function public.anota_expand_monthly_bills(uuid) from public,anon,authenticated;
grant execute on function public.anota_expand_monthly_bills(uuid) to service_role;
