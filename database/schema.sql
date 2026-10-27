-- Apply only to the NEW Anota Aí Supabase project. No Icom tables or historical data.
create schema if not exists anota_private;
revoke all on schema anota_private from public,anon,authenticated;

create table if not exists public.anota_expenses (
 id uuid primary key, user_id uuid not null references auth.users(id),
 kind text not null check(kind in ('PESSOAL','MENSAL')),
 scope text not null default 'PESSOAL' check(scope='PESSOAL'),
 entry_date date not null check(entry_date between '2000-01-01' and '2100-12-31'),
 description text not null check(length(description) between 2 and 160),
 category text not null check(category in ('Restaurante','Supermercado','Escola / educação','Plano de saúde','Saúde / medicamentos','Aluguel / moradia','Condomínio','Água','Energia elétrica','Gás','Internet / telefone','Combustível','Transporte / estacionamento','Veículo pessoal','Viagem / hospedagem','Lazer','Vestuário / compras','Cuidados pessoais','Serviços domésticos','Pets','Seguros','Impostos / taxas','Assinaturas','Outras despesas pessoais')),
 status text not null check(status in ('PREVISTO','REALIZADO')),
 amount_cents bigint not null check(amount_cents between 1 and 1000000000),
 details jsonb not null default '{}' check(jsonb_typeof(details)='object'),
 active boolean not null default true,
 origin text not null check(origin in ('MANUAL','VOICE','WHATSAPP')),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 constraint personal_details check(details - array['notes','payment_method','trip_name','expense_audience','expense_nature','income_activity'] = '{}'::jsonb),
 constraint detail_values check(coalesce(details->>'payment_method','OUTRO') in ('PIX','DINHEIRO','CARTAO','BOLETO','TRANSFERENCIA','OUTRO') and coalesce(details->>'expense_audience','NAO_INFORMADO') in ('FAMILIA','INDIVIDUAL','NAO_INFORMADO') and coalesce(details->>'expense_nature','NAO_CLASSIFICADO') in ('ESSENCIAL','OPCIONAL','NAO_CLASSIFICADO') and length(coalesce(details->>'trip_name',''))<=80 and length(coalesce(details->>'notes',''))<=2000 and (not(details ? 'income_activity') or (jsonb_typeof(details->'income_activity')='string' and length(trim(details->>'income_activity')) between 2 and 80 and kind='PESSOAL')) )
);
create index if not exists anota_expenses_owner_date on public.anota_expenses(user_id,entry_date desc);
alter table public.anota_expenses enable row level security;
create policy anota_select_own on public.anota_expenses for select to authenticated using ((select auth.uid())=user_id);
-- All writes go through guarded RPCs, preventing reassignment and bypass of audit.
grant select on public.anota_expenses to authenticated;
revoke insert,update,delete on public.anota_expenses from anon,authenticated;

create table if not exists public.anota_audit_logs (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id),
 entity_id uuid,action text not null,details jsonb not null default '{}',created_at timestamptz not null default now()
);
alter table public.anota_audit_logs enable row level security;
create policy audit_read_own on public.anota_audit_logs for select to authenticated using ((select auth.uid())=user_id);
grant select on public.anota_audit_logs to authenticated;
revoke insert,update,delete on public.anota_audit_logs from anon,authenticated;

create table if not exists public.anota_whatsapp_bots (
 user_id uuid primary key references auth.users(id),phone text not null,
 allowed_phones text[] not null check(cardinality(allowed_phones) between 1 and 100),enabled boolean not null default false,
 status text not null default 'NOVO' check(status in ('NOVO','CRIANDO','PRONTO','INCERTO','FALHOU')),
 instance_id text unique,token_cipher text,hook_cipher text not null,updated_at timestamptz not null default now()
);
create table if not exists public.anota_whatsapp_inbox (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id),
 provider_id text not null,sender text not null,type text not null check(type in ('audio','text')),
 text text not null default '',transcript text not null default '',
 status text not null default 'FILA' check(status in ('FILA','PROCESSANDO','LANCADO','ESCLARECER','ERRO','RESOLVIDO')),
 entry_id uuid references public.anota_expenses(id),reply text not null default '',reply_status text not null default 'NAO_ENVIADO',
 created_at timestamptz not null default now(),lease uuid,claimed_at timestamptz,
 reply_version bigint not null default 0 constraint anota_reply_version_range check(reply_version between 0 and 9007199254740991),
 unique(user_id,provider_id)
);
alter table public.anota_whatsapp_bots enable row level security;
alter table public.anota_whatsapp_inbox enable row level security;
revoke all on public.anota_whatsapp_bots,public.anota_whatsapp_inbox from anon,authenticated;
grant all on public.anota_expenses,public.anota_audit_logs,public.anota_whatsapp_bots,public.anota_whatsapp_inbox to service_role;
create index anota_whatsapp_queue on public.anota_whatsapp_inbox(status,created_at);

create or replace function anota_private.write_expense(p_user uuid,p_payload jsonb,p_expected timestamptz,p_origin text)
returns public.anota_expenses language plpgsql security definer set search_path='' as $$
declare old public.anota_expenses; result public.anota_expenses; id uuid; d date;
begin
 if p_user is null or p_payload is null or jsonb_typeof(p_payload)<>'object' or p_payload-array['id','kind','scope','entry_date','description','category','status','amount_cents','details']<>'{}'::jsonb or p_payload->>'scope'<>'PESSOAL' or p_origin not in ('MANUAL','VOICE','WHATSAPP') then raise exception 'ANOTA_FORBIDDEN';end if;
 id:=(p_payload->>'id')::uuid;d:=(p_payload->>'entry_date')::date;
 if p_payload->>'status'='REALIZADO' and d>(clock_timestamp() at time zone 'America/Sao_Paulo')::date then raise exception 'ANOTA_FUTURE_PAID';end if;
 perform pg_advisory_xact_lock(hashtextextended(id::text,0));
 select * into old from public.anota_expenses where anota_expenses.id=id for update;
 if found then
  if old.user_id<>p_user then raise exception 'ANOTA_FORBIDDEN';end if;
  if p_expected is null then
   if (to_jsonb(old)-array['user_id','active','origin','created_at','updated_at'])=p_payload then return old;end if;
   raise exception 'ANOTA_CHANGED';
  end if;
  if old.updated_at<>p_expected then raise exception 'ANOTA_CHANGED';end if;
 elsif p_expected is not null then raise exception 'ANOTA_CHANGED';end if;
 insert into public.anota_expenses(id,user_id,kind,scope,entry_date,description,category,status,amount_cents,details,origin)
 values(id,p_user,p_payload->>'kind','PESSOAL',d,p_payload->>'description',p_payload->>'category',p_payload->>'status',(p_payload->>'amount_cents')::bigint,p_payload->'details',p_origin)
 on conflict on constraint anota_expenses_pkey do update set kind=excluded.kind,entry_date=excluded.entry_date,description=excluded.description,category=excluded.category,status=excluded.status,amount_cents=excluded.amount_cents,details=excluded.details,updated_at=clock_timestamp()
 returning * into result;
 insert into public.anota_audit_logs(user_id,entity_id,action,details) values(p_user,id,case when old.id is null then 'DESPESA_CRIADA' else 'DESPESA_EDITADA' end,jsonb_build_object('origin',result.origin));
 return result;
end $$;
revoke all on function anota_private.write_expense(uuid,jsonb,timestamptz,text) from public,anon,authenticated;

create or replace function public.anota_save_expense(p_payload jsonb,p_expected timestamptz default null,p_origin text default 'MANUAL')
returns public.anota_expenses language plpgsql security definer set search_path='' as $$
begin if auth.uid() is null or p_origin not in ('MANUAL','VOICE') then raise exception 'ANOTA_FORBIDDEN';end if;return anota_private.write_expense(auth.uid(),p_payload,p_expected,p_origin);end $$;
revoke all on function public.anota_save_expense(jsonb,timestamptz,text) from public,anon;
grant execute on function public.anota_save_expense(jsonb,timestamptz,text) to authenticated;

create or replace function public.anota_archive_expense(p_id uuid,p_expected timestamptz,p_active boolean)
returns public.anota_expenses language plpgsql security definer set search_path='' as $$
declare result public.anota_expenses;
begin
 if auth.uid() is null then raise exception 'ANOTA_FORBIDDEN';end if;
 update public.anota_expenses set active=p_active,updated_at=clock_timestamp() where id=p_id and user_id=auth.uid() and updated_at=p_expected returning * into result;
 if not found then raise exception 'ANOTA_CHANGED';end if;
 insert into public.anota_audit_logs(user_id,entity_id,action) values(auth.uid(),p_id,case when p_active then 'DESPESA_RESTAURADA' else 'DESPESA_ARQUIVADA' end);
 return result;
end $$;
revoke all on function public.anota_archive_expense(uuid,timestamptz,boolean) from public,anon;
grant execute on function public.anota_archive_expense(uuid,timestamptz,boolean) to authenticated;

create or replace function public.anota_schedule_expenses(p_payloads jsonb)
returns setof public.anota_expenses language plpgsql security definer set search_path='' as $$
declare payload jsonb;
begin
 if auth.uid() is null or jsonb_typeof(p_payloads)<>'array' or jsonb_array_length(p_payloads) not between 1 and 60 then raise exception 'ANOTA_FORBIDDEN';end if;
 for payload in select * from jsonb_array_elements(p_payloads) loop
  if payload->>'kind'<>'MENSAL' or payload->>'status'<>'PREVISTO' then raise exception 'ANOTA_FORBIDDEN';end if;
  return next anota_private.write_expense(auth.uid(),payload,null,'MANUAL');
 end loop;
end $$;
revoke all on function public.anota_schedule_expenses(jsonb) from public,anon;
grant execute on function public.anota_schedule_expenses(jsonb) to authenticated;

create or replace function public.anota_provision_claim(p_user uuid) returns boolean language plpgsql security invoker set search_path='' as $$
begin update public.anota_whatsapp_bots set status='CRIANDO',updated_at=clock_timestamp() where user_id=p_user and status in ('NOVO','FALHOU');return found;end $$;
create or replace function public.anota_claim_message() returns public.anota_whatsapp_inbox language plpgsql security invoker set search_path='' as $$
declare message public.anota_whatsapp_inbox;
begin
 select * into message from public.anota_whatsapp_inbox where status='FILA' or (status='PROCESSANDO' and claimed_at<clock_timestamp()-interval '10 minutes') order by created_at for update skip locked limit 1;
 if not found then return null;end if;
 update public.anota_whatsapp_inbox set status='PROCESSANDO',lease=gen_random_uuid(),claimed_at=clock_timestamp() where id=message.id returning * into message;
 return message;
end $$;
create or replace function public.anota_reply_claim(p_id uuid) returns boolean language plpgsql security invoker set search_path='' as $$
-- Legacy workers cannot claim a reply by its ID alone. Rolling deployment fails closed.
begin return false;end $$;
-- Reply version is database-owned. Delivery status alone does not change its payload.
-- JSON extraction also supports the baseline before finance adds confirmation columns.
create or replace function anota_private.bump_whatsapp_reply_version() returns trigger language plpgsql security invoker set search_path='' as $$
declare before_payload jsonb;after_payload jsonb;
begin
 before_payload:=jsonb_build_object('status',OLD.status,'reply',OLD.reply,
  'finance_confirmation',to_jsonb(OLD)->'finance_confirmation','confirmation_code',to_jsonb(OLD)->'confirmation_code',
  'confirmation_used',coalesce(to_jsonb(OLD)->'confirmation_used','false'::jsonb),'context_reset_at',to_jsonb(OLD)->'context_reset_at');
 after_payload:=jsonb_build_object('status',NEW.status,'reply',NEW.reply,
  'finance_confirmation',to_jsonb(NEW)->'finance_confirmation','confirmation_code',to_jsonb(NEW)->'confirmation_code',
  'confirmation_used',coalesce(to_jsonb(NEW)->'confirmation_used','false'::jsonb),'context_reset_at',to_jsonb(NEW)->'context_reset_at');
 NEW.reply_version:=OLD.reply_version+case when before_payload is distinct from after_payload then 1 else 0 end;
 return NEW;
end $$;
revoke all on function anota_private.bump_whatsapp_reply_version() from public,anon,authenticated,service_role;
create trigger anota_whatsapp_reply_version before update on public.anota_whatsapp_inbox for each row execute function anota_private.bump_whatsapp_reply_version();
create or replace function public.anota_reply_claim(p_id uuid,p_user uuid,p_sender text,p_lease uuid,p_reply_version bigint) returns boolean language plpgsql security invoker set search_path='' as $$
begin
 update public.anota_whatsapp_inbox set reply_status='ENVIANDO'
 where id=p_id and user_id=p_user and sender=p_sender and lease is not distinct from p_lease
 and reply_version=p_reply_version and p_reply_version>=0
 and reply_status='NAO_ENVIADO' and reply<>'' and status in ('LANCADO','ESCLARECER','ERRO','RESOLVIDO');
 return found;
end $$;
revoke all on function public.anota_reply_claim(uuid,uuid,text,uuid,bigint) from public,anon,authenticated;
grant execute on function public.anota_reply_claim(uuid,uuid,text,uuid,bigint) to service_role;
create or replace function public.anota_record_whatsapp(p_user uuid,p_message uuid,p_payload jsonb)
returns public.anota_expenses language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.anota_whatsapp_inbox i join public.anota_whatsapp_bots b on b.user_id=i.user_id where i.id=p_message and i.user_id=p_user and i.status='PROCESSANDO' and b.enabled and b.status='PRONTO' and i.sender=any(b.allowed_phones)) or (p_payload->>'id')::uuid<>p_message then raise exception 'ANOTA_FORBIDDEN';end if;
 return anota_private.write_expense(p_user,p_payload,null,'WHATSAPP');
end $$;
revoke all on function public.anota_provision_claim(uuid),public.anota_claim_message(),public.anota_reply_claim(uuid),public.anota_record_whatsapp(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.anota_provision_claim(uuid),public.anota_claim_message(),public.anota_reply_claim(uuid),public.anota_record_whatsapp(uuid,uuid,jsonb) to service_role;
