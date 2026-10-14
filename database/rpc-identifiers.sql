-- Apply after the base migrations, only to Anotei.
-- Keep table column names distinct from PL/pgSQL local identifiers.
create or replace function anota_private.write_expense(p_user uuid,p_payload jsonb,p_expected timestamptz,p_origin text)
returns public.anota_expenses language plpgsql security definer set search_path='' as $$
declare old public.anota_expenses; result public.anota_expenses; v_id uuid; d date;
begin
 if p_user is null or p_payload is null or jsonb_typeof(p_payload)<>'object' or p_payload-array['id','kind','scope','entry_date','description','category','status','amount_cents','details']<>'{}'::jsonb or p_payload->>'scope'<>'PESSOAL' or p_origin not in ('MANUAL','VOICE','WHATSAPP') then raise exception 'ANOTA_FORBIDDEN';end if;
 v_id:=(p_payload->>'id')::uuid;d:=(p_payload->>'entry_date')::date;
 if p_payload->>'status'='REALIZADO' and d>(clock_timestamp() at time zone 'America/Sao_Paulo')::date then raise exception 'ANOTA_FUTURE_PAID';end if;
 perform pg_advisory_xact_lock(hashtextextended(v_id::text,0));
 select * into old from public.anota_expenses where anota_expenses.id=v_id for update;
 if found then
  if old.user_id<>p_user then raise exception 'ANOTA_FORBIDDEN';end if;
  if p_expected is null then
   if (to_jsonb(old)-array['user_id','active','origin','created_at','updated_at'])=p_payload then return old;end if;
   raise exception 'ANOTA_CHANGED';
  end if;
  if old.updated_at<>p_expected then raise exception 'ANOTA_CHANGED';end if;
 elsif p_expected is not null then raise exception 'ANOTA_CHANGED';end if;
 insert into public.anota_expenses(id,user_id,kind,scope,entry_date,description,category,status,amount_cents,details,origin)
 values(v_id,p_user,p_payload->>'kind','PESSOAL',d,p_payload->>'description',p_payload->>'category',p_payload->>'status',(p_payload->>'amount_cents')::bigint,p_payload->'details',p_origin)
 on conflict on constraint anota_expenses_pkey do update set kind=excluded.kind,entry_date=excluded.entry_date,description=excluded.description,category=excluded.category,status=excluded.status,amount_cents=excluded.amount_cents,details=excluded.details,updated_at=clock_timestamp()
 returning * into result;
 insert into public.anota_audit_logs(user_id,entity_id,action,details) values(p_user,v_id,case when old.id is null then 'DESPESA_CRIADA' else 'DESPESA_EDITADA' end,jsonb_build_object('origin',result.origin));
 return result;
end $$;
revoke all on function anota_private.write_expense(uuid,jsonb,timestamptz,text) from public,anon,authenticated;


create or replace function anota_private.apply_finance(p_user uuid,p_plan jsonb,p_origin text) returns jsonb language plpgsql security definer set search_path='' as $$
declare item jsonb;doc jsonb;old public.anota_finance_documents;receipt public.anota_finance_operations;entry public.anota_expenses;reserve jsonb;due text;available bigint;revision timestamptz;result jsonb;v_id uuid;
begin
 if p_user is null or p_origin not in ('MANUAL','VOICE','WHATSAPP') or jsonb_typeof(p_plan)<>'object' or p_plan-array['id','expenses','documents','checks','title','lines']<>'{}'::jsonb or jsonb_typeof(p_plan->'expenses')<>'array' or jsonb_typeof(p_plan->'documents')<>'array' or jsonb_typeof(p_plan->'checks')<>'array' or jsonb_array_length(p_plan->'expenses')>60 or jsonb_array_length(p_plan->'documents')>5 or jsonb_array_length(p_plan->'checks')>5 then raise exception 'ANOTA_FORBIDDEN';end if;
 v_id:=(p_plan->>'id')::uuid;
 perform pg_advisory_xact_lock(hashtextextended('finance:'||p_user::text,0));
 select * into receipt from public.anota_finance_operations where anota_finance_operations.id=v_id;
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
 result:=jsonb_build_object('ok',true,'saved',true,'title',p_plan->>'title','operation_id',v_id,'expense_ids',(select coalesce(jsonb_agg(v->'payload'->>'id'),'[]'::jsonb) from jsonb_array_elements(p_plan->'expenses') v));
 insert into public.anota_finance_operations(id,user_id,plan,result) values(v_id,p_user,p_plan,result);return result;
end $$;
revoke all on function anota_private.apply_finance(uuid,jsonb,text) from public,anon,authenticated;
