-- Anotei only. Monthly entitlements are shared by the authenticated account.
alter table public.anota_subscriptions add column plan_code text not null default 'BASICO' check(plan_code in ('BASICO','ILIMITADO'));
alter table public.anota_subscriptions add column usage_anchor date not null default ((now() at time zone 'America/Sao_Paulo')::date);
update public.anota_subscriptions set plan_code=case when monthly_cents=9990 or lower(plan) like '%ilimitado%' then 'ILIMITADO' else 'BASICO' end;
create function anota_private.normalize_subscription_plan() returns trigger language plpgsql set search_path='' as $$
begin
 if TG_OP='INSERT' or NEW.plan is distinct from OLD.plan then NEW.plan_code:=case when NEW.plan='Ilimitado' then 'ILIMITADO' when NEW.plan='Básico' then 'BASICO' else NEW.plan_code end;end if;
 NEW.plan:=case when NEW.plan_code='ILIMITADO' then 'Ilimitado' else 'Básico' end;
 NEW.monthly_cents:=case when NEW.plan_code='ILIMITADO' then 9990 else 4990 end;return NEW;
end $$;
revoke all on function anota_private.normalize_subscription_plan() from public,anon,authenticated;
create trigger anota_subscription_plan before insert or update on public.anota_subscriptions for each row execute function anota_private.normalize_subscription_plan();
update public.anota_subscriptions set plan=case when plan_code='ILIMITADO' then 'Ilimitado' else 'Básico' end;

alter table public.anota_whatsapp_invitations add column subscriber_name text not null default '' check(length(subscriber_name)<=80);
alter table public.anota_whatsapp_invitations add column plan_code text not null default 'BASICO' check(plan_code in ('BASICO','ILIMITADO'));
update public.anota_whatsapp_invitations i set subscriber_name=left(coalesce(u.raw_user_meta_data->>'name',''),80) from auth.users u where i.user_id=u.id;
alter table public.anota_household_phones add column contact_name text not null default '' check(length(contact_name)<=80);
update public.anota_household_phones h set contact_name=i.subscriber_name from public.anota_whatsapp_invitations i where i.user_id=h.user_id and i.phone=h.phone;
create function public.anota_named_household(p_actor uuid,p_user uuid,p_phones text[],p_second_name text) returns boolean language plpgsql security invoker set search_path='' as $$
declare original text;label text;
begin
 if cardinality(p_phones)=2 and length(trim(p_second_name)) not between 3 and 80 then raise exception 'ANOTA_FORBIDDEN';end if;
 perform public.anota_set_household_phones(p_actor,p_user,p_phones);
 select phone,subscriber_name into original,label from public.anota_whatsapp_invitations where owner_id=p_actor and user_id=p_user and active=1;
 update public.anota_household_phones set contact_name=case when phone=original then label else trim(p_second_name) end where user_id=p_user;return true;
end $$;
revoke all on function public.anota_named_household(uuid,uuid,text[],text) from public,anon,authenticated;
grant execute on function public.anota_named_household(uuid,uuid,text[],text) to service_role;
create table public.anota_customer_details(user_id uuid primary key references auth.users(id),full_name text not null check(length(full_name) between 3 and 80),cpf text not null check(cpf ~ '^[0-9]{11}$'),postal_code text not null check(postal_code ~ '^[0-9]{8}$'),street text not null check(length(street) between 2 and 160),address_number text not null check(length(address_number) between 1 and 20),complement text not null default '' check(length(complement)<=100),neighborhood text not null check(length(neighborhood) between 2 and 100),city text not null check(length(city) between 2 and 100),state text not null check(state in ('AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO')),updated_at timestamptz not null default now());
alter table public.anota_customer_details enable row level security;
revoke all on public.anota_customer_details from public,anon,authenticated;
grant all on public.anota_customer_details to service_role;
grant select on public.anota_customer_details to authenticated;
create policy anota_details_own on public.anota_customer_details for select to authenticated using((select auth.uid())=user_id);

-- Keep the original registration transaction, with all its owner and invite guards.
create function public.anota_register_customer(p_hash text,p_user uuid,p_hook text,p_plan jsonb,p_details jsonb) returns text language plpgsql security invoker set search_path='' as $$
declare phone text;code text;
begin
 if jsonb_typeof(p_details)<>'object' or p_details-array['full_name','cpf','postal_code','street','address_number','complement','neighborhood','city','state']<>'{}'::jsonb then raise exception 'ANOTA_FORBIDDEN';end if;
 phone:=public.anota_register_invitation(p_hash,p_user,p_hook,p_plan);
 insert into public.anota_customer_details(user_id,full_name,cpf,postal_code,street,address_number,complement,neighborhood,city,state) values(p_user,p_details->>'full_name',p_details->>'cpf',p_details->>'postal_code',p_details->>'street',p_details->>'address_number',coalesce(p_details->>'complement',''),p_details->>'neighborhood',p_details->>'city',p_details->>'state');
 select plan_code into code from public.anota_whatsapp_invitations where token_hash=p_hash;
 update public.anota_whatsapp_invitations set subscriber_name=case when subscriber_name='' then p_details->>'full_name' else subscriber_name end where token_hash=p_hash;
 insert into public.anota_subscriptions(user_id,status,plan,monthly_cents,plan_code) values(p_user,'SEM_ASSINATURA',case when code='ILIMITADO' then 'Ilimitado' else 'Básico' end,case when code='ILIMITADO' then 9990 else 4990 end,code);
 return phone;
end $$;
revoke all on function public.anota_register_customer(text,uuid,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.anota_register_customer(text,uuid,text,jsonb,jsonb) to service_role;

alter function public.anota_create_invitation(uuid,text,timestamptz,jsonb) rename to create_invitation_base;
alter function public.create_invitation_base(uuid,text,timestamptz,jsonb) set schema anota_private;
revoke all on function anota_private.create_invitation_base(uuid,text,timestamptz,jsonb) from public,anon,authenticated;
create function public.anota_create_invitation(p_owner uuid,p_phone text,p_expected timestamptz,p_candidate jsonb) returns public.anota_whatsapp_invitations language plpgsql security invoker set search_path='' as $$
declare result public.anota_whatsapp_invitations;label text:=coalesce(p_candidate->>'subscriber_name','');code text:=coalesce(p_candidate->>'plan_code','BASICO');
begin
 if not exists(select 1 from public.anota_access_accounts where user_id=p_owner and exempt) or code not in ('BASICO','ILIMITADO') or length(label)>80 then raise exception 'ANOTA_FORBIDDEN';end if;
 if exists(select 1 from public.anota_household_phones h where h.phone=p_phone and not exists(select 1 from public.anota_whatsapp_invitations i where i.user_id=h.user_id and i.phone=p_phone and i.owner_id=p_owner)) then raise exception 'ANOTA_PHONE_ASSIGNED';end if;
 result:=anota_private.create_invitation_base(p_owner,p_phone,p_expected,p_candidate);
 update public.anota_whatsapp_invitations set subscriber_name=case when label<>'' then label else subscriber_name end,plan_code=case when user_id is null then code else plan_code end where id=result.id returning * into result;return result;
end $$;
revoke all on function public.anota_create_invitation(uuid,text,timestamptz,jsonb) from public,anon,authenticated;
grant execute on function public.anota_create_invitation(uuid,text,timestamptz,jsonb) to service_role;
create function public.anota_label_contact(p_actor uuid,p_phone text,p_name text) returns boolean language plpgsql security invoker set search_path='' as $$
begin
 if not exists(select 1 from public.anota_access_accounts where user_id=p_actor and exempt) or length(trim(p_name)) not between 3 and 80 then raise exception 'ANOTA_FORBIDDEN';end if;
 update public.anota_whatsapp_invitations set subscriber_name=trim(p_name) where owner_id=p_actor and phone=p_phone;
 if not found then raise exception 'ANOTA_FORBIDDEN';end if;
 update public.anota_household_phones set contact_name=trim(p_name) where phone=p_phone;return true;
end $$;
revoke all on function public.anota_label_contact(uuid,text,text) from public,anon,authenticated;
grant execute on function public.anota_label_contact(uuid,text,text) to service_role;

alter table public.anota_pix_payments add column plan_code text not null default 'BASICO' check(plan_code in ('BASICO','ILIMITADO'));
update public.anota_pix_payments set plan_code='ILIMITADO' where amount_cents=9990;
drop function public.anota_request_pix(uuid,uuid,text);
create function public.anota_request_pix(p_user uuid,p_id uuid,p_reference text,p_plan_code text default null) returns public.anota_pix_payments language plpgsql security invoker set search_path='' as $$
declare settings public.anota_pix_settings;prior public.anota_pix_payments;result public.anota_pix_payments;code text;
begin
 perform pg_advisory_xact_lock(hashtextextended('anotei-payment:'||p_user::text,0));
 code:=coalesce(p_plan_code,(select plan_code from public.anota_subscriptions where user_id=p_user),'BASICO');
 if code not in ('BASICO','ILIMITADO') or length(trim(p_reference)) not between 3 and 300 then raise exception 'ANOTA_FORBIDDEN';end if;
 select * into prior from public.anota_pix_payments where id=p_id;
 if found then if prior.user_id<>p_user or prior.plan_code<>code or prior.reference<>trim(p_reference) then raise exception 'ANOTA_CHANGED';end if;return prior;end if;
 select * into prior from public.anota_pix_payments where user_id=p_user and status='PENDENTE';
 if found then if prior.plan_code<>code then raise exception 'ANOTA_PENDING_PLAN';end if;return prior;end if;
 select * into settings from public.anota_pix_settings where id;
 if length(settings.pix_key)=0 or length(settings.receiver)=0 then raise exception 'ANOTA_PIX_NOT_READY';end if;
 insert into public.anota_pix_payments(id,user_id,amount_cents,reference,access_days,plan_code) values(p_id,p_user,case when code='ILIMITADO' then 9990 else 4990 end,trim(p_reference),settings.access_days,code) returning * into result;return result;
end $$;
revoke all on function public.anota_request_pix(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.anota_request_pix(uuid,uuid,text,text) to service_role;
-- Approval, rather than a client plan choice, activates the paid entitlement.
do $$declare definition text;begin
 definition:=pg_get_functiondef('public.anota_review_pix(uuid,uuid,boolean)'::regprocedure);
 if position($old$coalesce(nullif(prior.plan,''),'Plano casal · até 2 números')$old$ in definition)=0 then raise exception 'PIX_REVIEW_UNEXPECTED';end if;
 definition:=replace(definition,$old$coalesce(nullif(prior.plan,''),'Plano casal · até 2 números')$old$,$new$case when payment.plan_code='ILIMITADO' then 'Ilimitado' else 'Básico' end$new$);
 definition:=replace(definition,'insert into public.anota_commercial_profiles(user_id,payment_method)',$new$if prior.renewal_date is null or prior.renewal_date<today then update public.anota_subscriptions set usage_anchor=today where user_id=payment.user_id;end if;
  insert into public.anota_commercial_profiles(user_id,payment_method)$new$);
 execute definition;
end $$;

create table public.anota_usage_events(user_id uuid not null references auth.users(id),kind text not null check(kind in ('REQUEST','WHATSAPP','VOICE')),event_id uuid not null,period_start date not null,amount integer not null check(amount between 0 and 86400),fingerprint text not null check(length(fingerprint)=64),started_at timestamptz not null default clock_timestamp(),expires_at timestamptz,call_id text,needs_hangup boolean not null default false,is_open boolean not null default true,result jsonb,primary key(user_id,kind,event_id));
create index anota_usage_period on public.anota_usage_events(user_id,period_start,kind);
create index anota_voice_expiration on public.anota_usage_events(expires_at) where kind='VOICE' and needs_hangup;
alter table public.anota_usage_events enable row level security;
revoke all on public.anota_usage_events from public,anon,authenticated;
grant all on public.anota_usage_events to service_role;
create function public.anota_usage_summary(p_user uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare anchor date;start_day date;finish date;today date:=(clock_timestamp() at time zone 'America/Sao_Paulo')::date;code text;exempt boolean;req bigint;wa bigint;voice bigint;
begin
 select s.usage_anchor,s.plan_code into anchor,code from public.anota_subscriptions s where s.user_id=p_user;
 anchor:=coalesce(anchor,today);code:=coalesce(code,'BASICO');start_day:=anchor+greatest(0,(today-anchor)/30)*30;finish:=start_day+30;
 exempt:=coalesce((select a.exempt from public.anota_access_accounts a where a.user_id=p_user),false);
 select coalesce(sum(amount) filter(where kind='REQUEST'),0),coalesce(sum(amount) filter(where kind='WHATSAPP'),0),coalesce(sum(case when is_open then least(amount,greatest(0,ceil(extract(epoch from clock_timestamp()-started_at)))::integer) else amount end) filter(where kind='VOICE'),0) into req,wa,voice from public.anota_usage_events where user_id=p_user and period_start=start_day;
 return jsonb_build_object('plan_code',code,'exempt',exempt,'period_start',start_day,'period_end',finish-1,'requests',req,'whatsapp_seconds',wa,'voice_seconds',voice,'limits',jsonb_build_object('requests',case when exempt or code='ILIMITADO' then null else 150 end,'whatsapp_seconds',case when exempt or code='ILIMITADO' then null else 600 end,'voice_seconds',case when exempt or code='ILIMITADO' then null else 600 end));
end $$;
revoke all on function public.anota_usage_summary(uuid) from public,anon,authenticated;
grant execute on function public.anota_usage_summary(uuid) to service_role;
create function public.anota_usage_take(p_user uuid,p_kind text,p_event uuid,p_amount integer,p_fingerprint text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare summary jsonb;start_day date;prior public.anota_usage_events;used integer;cap integer;grant_amount integer;deadline timestamptz;
begin
 if p_user is null or p_event is null or p_kind not in ('REQUEST','WHATSAPP','VOICE') or p_amount not between 1 and 86400 or length(p_fingerprint)<>64 or (p_kind='REQUEST' and p_amount<>1) or (p_kind='VOICE' and p_amount>300) or not anota_private.access_allowed(p_user) then raise exception 'ANOTA_FORBIDDEN';end if;
 perform pg_advisory_xact_lock(hashtextextended('anotei-usage:'||p_user::text,0));
 select * into prior from public.anota_usage_events where user_id=p_user and kind=p_kind and event_id=p_event;
 if found then
  if prior.fingerprint<>p_fingerprint then return jsonb_build_object('error','REUSED');end if;
  if prior.amount=0 and not prior.is_open and prior.result is null then delete from public.anota_usage_events where user_id=p_user and kind=p_kind and event_id=p_event;
  else return jsonb_build_object('id',p_event,'granted',prior.amount,'expires_at',prior.expires_at,'duplicate',true,'result',prior.result);end if;
 end if;
 summary:=public.anota_usage_summary(p_user);start_day:=(summary->>'period_start')::date;
 select coalesce(sum(amount),0) into used from public.anota_usage_events where user_id=p_user and period_start=start_day and kind=p_kind;
 cap:=(summary->'limits'->>case p_kind when 'REQUEST' then 'requests' when 'WHATSAPP' then 'whatsapp_seconds' else 'voice_seconds' end)::integer;
 grant_amount:=p_amount;
 if cap is not null then if used>=cap or (p_kind<>'VOICE' and p_amount>cap-used) then return jsonb_build_object('error','LIMIT');end if;grant_amount:=least(p_amount,cap-used);end if;
 if p_kind='VOICE' then
  if exists(select 1 from public.anota_usage_events where user_id=p_user and kind='VOICE' and is_open and expires_at>clock_timestamp()) then return jsonb_build_object('error','BUSY');end if;
  grant_amount:=least(grant_amount,greatest(0,floor(extract(epoch from ((start_day+30)::timestamp at time zone 'America/Sao_Paulo')-clock_timestamp())))::integer);
  if grant_amount<1 then return jsonb_build_object('error','LIMIT');end if;deadline:=clock_timestamp()+make_interval(secs=>grant_amount);
 end if;
 insert into public.anota_usage_events(user_id,kind,event_id,period_start,amount,fingerprint,expires_at) values(p_user,p_kind,p_event,start_day,grant_amount,p_fingerprint,deadline);
 return jsonb_build_object('id',p_event,'granted',grant_amount,'expires_at',deadline);
end $$;
revoke all on function public.anota_usage_take(uuid,text,uuid,integer,text) from public,anon,authenticated;
grant execute on function public.anota_usage_take(uuid,text,uuid,integer,text) to service_role;
create function public.anota_usage_settle(p_user uuid,p_event uuid,p_kind text,p_used integer,p_result jsonb default null) returns boolean language plpgsql security invoker set search_path='' as $$
declare prior public.anota_usage_events;actual integer;
begin
 perform pg_advisory_xact_lock(hashtextextended('anotei-usage:'||p_user::text,0));
 select * into prior from public.anota_usage_events where user_id=p_user and kind=p_kind and event_id=p_event for update;
 if not found or not prior.is_open then return false;end if;
 if p_used<0 or p_used>prior.amount or octet_length(coalesce(p_result,'null'::jsonb)::text)>64000 then raise exception 'ANOTA_FORBIDDEN';end if;
 actual:=case when p_kind='VOICE' and p_used>0 then least(prior.amount,greatest(1,ceil(extract(epoch from clock_timestamp()-prior.started_at)))::integer) else p_used end;
 update public.anota_usage_events set amount=actual,is_open=false,result=p_result where user_id=p_user and kind=p_kind and event_id=p_event;return true;
end $$;
revoke all on function public.anota_usage_settle(uuid,uuid,text,integer,jsonb) from public,anon,authenticated;
grant execute on function public.anota_usage_settle(uuid,uuid,text,integer,jsonb) to service_role;
create function public.anota_usage_bind_voice(p_user uuid,p_event uuid,p_call text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare deadline timestamptz;
begin
 if p_call!~'^rtc_[A-Za-z0-9_-]+$' or length(p_call)>160 then raise exception 'ANOTA_FORBIDDEN';end if;
 update public.anota_usage_events set call_id=p_call,needs_hangup=true,started_at=clock_timestamp(),expires_at=least(clock_timestamp()+make_interval(secs=>amount),(period_start+30)::timestamp at time zone 'America/Sao_Paulo') where user_id=p_user and event_id=p_event and kind='VOICE' and is_open and expires_at>clock_timestamp() and call_id is null returning expires_at into deadline;
 if not found then raise exception 'ANOTA_FORBIDDEN';end if;return jsonb_build_object('expires_at',deadline);
end $$;
revoke all on function public.anota_usage_bind_voice(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.anota_usage_bind_voice(uuid,uuid,text) to service_role;
