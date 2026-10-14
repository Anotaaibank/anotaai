-- Independent Anotei: two WhatsApp numbers per subscriber account, manual Pix approval.
alter table public.anota_whatsapp_bots drop constraint anota_shared_bot_shape;
alter table public.anota_whatsapp_bots drop constraint anota_whatsapp_bots_allowed_phones_check;
alter table public.anota_whatsapp_bots add constraint anota_allowed_phones_shape check(cardinality(allowed_phones)>=1 and (shared_owner_id is null or cardinality(allowed_phones)<=2));
alter table public.anota_whatsapp_bots add constraint anota_shared_bot_shape check(shared_owner_id is null or (shared_owner_id<>user_id and cardinality(allowed_phones) between 1 and 2 and instance_id is null and token_cipher is null));
create table public.anota_access_accounts(user_id uuid primary key references auth.users(id),exempt boolean not null default false);
create table public.anota_pix_settings(id boolean primary key default true check(id),pix_key text not null default '',receiver text not null default '',monthly_cents bigint not null default 0 check(monthly_cents between 0 and 10000000),access_days integer not null default 30 check(access_days between 1 and 366),enforce_access boolean not null default false,updated_at timestamptz not null default now());
insert into public.anota_pix_settings(id) values(true);
create table public.anota_pix_payments(id uuid primary key,user_id uuid not null references auth.users(id),amount_cents bigint not null check(amount_cents>0),reference text not null check(length(reference) between 3 and 300),status text not null default 'PENDENTE' check(status in ('PENDENTE','APROVADO','REJEITADO')),access_days integer not null check(access_days between 1 and 366),created_at timestamptz not null default now(),reviewed_at timestamptz,reviewed_by uuid references auth.users(id),access_until date);
create unique index anota_pix_one_pending on public.anota_pix_payments(user_id) where status='PENDENTE';
create index anota_pix_review on public.anota_pix_payments(status,created_at);
create index anota_pix_reviewer on public.anota_pix_payments(reviewed_by);
create index anota_pix_owner on public.anota_pix_payments(user_id,created_at desc);
create table public.anota_household_phones(user_id uuid not null references auth.users(id),phone text not null unique check(phone ~ '^55[0-9]{10,11}$'),primary key(user_id,phone));
insert into public.anota_household_phones(user_id,phone) select user_id,unnest(allowed_phones) from public.anota_whatsapp_bots where shared_owner_id is not null;
alter table public.anota_access_accounts enable row level security;
alter table public.anota_pix_settings enable row level security;
alter table public.anota_pix_payments enable row level security;
alter table public.anota_household_phones enable row level security;
revoke all on public.anota_access_accounts,public.anota_pix_settings,public.anota_pix_payments,public.anota_household_phones from public,anon,authenticated;
grant all on public.anota_access_accounts,public.anota_pix_settings,public.anota_pix_payments,public.anota_household_phones to service_role;

create function anota_private.access_allowed(p_user uuid) returns boolean language sql stable security definer set search_path='' as $$
 select coalesce((select exempt from public.anota_access_accounts where user_id=p_user),false)
 or not coalesce((select enforce_access from public.anota_pix_settings where id),false)
 or exists(select 1 from public.anota_subscriptions s left join public.anota_commercial_profiles p on p.user_id=s.user_id where s.user_id=p_user and s.status in ('ATIVA','TESTE') and s.renewal_date>=(now() at time zone 'America/Sao_Paulo')::date and (s.status='TESTE' or p.payment_method<>'PIX' or exists(select 1 from public.anota_pix_payments a where a.user_id=p_user and a.status='APROVADO' and a.access_until=s.renewal_date)));
$$;
revoke all on function anota_private.access_allowed(uuid) from public,anon,authenticated;
create function public.anota_access_allowed(p_user uuid) returns boolean language sql stable security definer set search_path='' as $$select anota_private.access_allowed(p_user)$$;
revoke all on function public.anota_access_allowed(uuid) from public,anon,authenticated;
grant execute on function public.anota_access_allowed(uuid) to service_role;
create function public.anota_can_use() returns boolean language sql stable security definer set search_path='' as $$select auth.uid() is not null and anota_private.access_allowed(auth.uid())$$;
revoke all on function public.anota_can_use() from public,anon;
grant execute on function public.anota_can_use() to authenticated,service_role;
alter policy anota_select_own on public.anota_expenses using((select auth.uid())=user_id and (select public.anota_can_use()));
alter policy finance_read_own on public.anota_finance_documents using((select auth.uid())=user_id and (select public.anota_can_use()));
create function anota_private.financial_access_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare target uuid;
begin
 target:=case when TG_OP='DELETE' then OLD.user_id else NEW.user_id end;
 if current_setting('anotei.registration_user',true)=target::text or anota_private.access_allowed(target) then if TG_OP='DELETE' then return OLD;else return NEW;end if;end if;
 raise exception 'ANOTA_SUBSCRIPTION_REQUIRED';
end $$;
revoke all on function anota_private.financial_access_guard() from public,anon,authenticated;
create trigger anota_expense_access before insert or update or delete on public.anota_expenses for each row execute function anota_private.financial_access_guard();
create trigger anota_document_access before insert or update or delete on public.anota_finance_documents for each row execute function anota_private.financial_access_guard();

-- Keep historical migrations immutable; amend the existing registration transaction.
do $$ declare definition text;begin
 definition:=pg_get_functiondef('public.anota_register_invitation(text,uuid,text,jsonb)'::regprocedure);
 if position('perform anota_private.apply_finance' in definition)=0 then raise exception 'REGISTER_FUNCTION_UNEXPECTED';end if;
 definition:=replace(definition,'perform anota_private.apply_finance','perform set_config(''anotei.registration_user'',p_user::text,true); perform anota_private.apply_finance');
 definition:=replace(definition,'return invite.phone;','insert into public.anota_household_phones(user_id,phone) values(p_user,invite.phone); return invite.phone;');
 execute definition;
 definition:=pg_get_functiondef('public.anota_create_invitation(uuid,text,timestamp with time zone,jsonb)'::regprocedure);
 definition:=replace(definition,'if cardinality(master.allowed_phones)>100 then raise exception ''ANOTA_FORBIDDEN'';end if;','');
 execute definition;
end $$;

create or replace function public.anota_personal_recipient(p_owner uuid,p_phone text) returns uuid language plpgsql security invoker set search_path='' as $$
declare master public.anota_whatsapp_bots; invite public.anota_whatsapp_invitations; member public.anota_whatsapp_bots; target uuid;
begin
 select * into master from public.anota_whatsapp_bots where user_id=p_owner;
 if master.user_id is null or not master.enabled or master.status<>'PRONTO' or master.shared_owner_id is not null or not(p_phone=any(master.allowed_phones)) then return null;end if;
 select user_id into target from public.anota_household_phones where phone=p_phone;
 if target is null then select * into invite from public.anota_whatsapp_invitations where owner_id=p_owner and phone=p_phone;if not found then return case when anota_private.access_allowed(p_owner) then p_owner else null end;end if;return null;end if;
 select * into member from public.anota_whatsapp_bots where user_id=target;
 select * into invite from public.anota_whatsapp_invitations where owner_id=p_owner and user_id=target;
 if member.enabled and member.status='PRONTO' and member.shared_owner_id=p_owner and cardinality(member.allowed_phones) between 1 and 2 and p_phone=any(member.allowed_phones) and invite.active=1 and anota_private.access_allowed(target) then return target;end if;
 return null;
end $$;
-- Invoker routine needs the private helper but never grants private schema access to clients.
grant usage on schema anota_private to service_role;
grant execute on function anota_private.access_allowed(uuid) to service_role;

create function public.anota_set_household_phones(p_actor uuid,p_user uuid,p_phones text[]) returns boolean language plpgsql security invoker set search_path='' as $$
declare master public.anota_whatsapp_bots; member public.anota_whatsapp_bots; original text; number text;
begin
 if not exists(select 1 from public.anota_access_accounts where user_id=p_actor and exempt) or p_user=p_actor or cardinality(p_phones) not between 1 and 2 then raise exception 'ANOTA_FORBIDDEN';end if;
 for number in select distinct unnest(p_phones) order by 1 loop perform pg_advisory_xact_lock(hashtextextended('anotei-phone:'||number,0));end loop;
 select * into master from public.anota_whatsapp_bots where user_id=p_actor for update;
 select * into member from public.anota_whatsapp_bots where user_id=p_user for update;
 select phone into original from public.anota_whatsapp_invitations where owner_id=p_actor and user_id=p_user and active=1;
 if master.user_id is null or member.shared_owner_id<>p_actor or original is null or not(original=any(p_phones)) or (select count(distinct n) from unnest(p_phones) n)<>cardinality(p_phones) then raise exception 'ANOTA_FORBIDDEN';end if;
 foreach number in array p_phones loop
  if number!~'^55[0-9]{10,11}$' or number=master.phone or exists(select 1 from public.anota_whatsapp_invitations where phone=number and user_id is distinct from p_user) or exists(select 1 from public.anota_household_phones where phone=number and user_id<>p_user) or (number=any(master.allowed_phones) and not(number=any(member.allowed_phones))) then raise exception 'ANOTA_FORBIDDEN';end if;
 end loop;
 update public.anota_whatsapp_bots set allowed_phones=array(select distinct n from unnest(array_cat(master.allowed_phones,p_phones)) n),updated_at=clock_timestamp() where user_id=p_actor;
 delete from public.anota_household_phones where user_id=p_user;
 insert into public.anota_household_phones select p_user,unnest(p_phones);
 update public.anota_whatsapp_bots set allowed_phones=p_phones,updated_at=clock_timestamp() where user_id=p_user;
 return true;
end $$;
revoke all on function public.anota_set_household_phones(uuid,uuid,text[]) from public,anon,authenticated;
grant execute on function public.anota_set_household_phones(uuid,uuid,text[]) to service_role;

alter table public.anota_commercial_profiles drop constraint anota_commercial_profiles_payment_method_check;
alter table public.anota_commercial_profiles add constraint anota_commercial_profiles_payment_method_check check(payment_method in ('CARTAO','PIX','BOLETO','NAO_DEFINIDO'));
create function public.anota_request_pix(p_user uuid,p_id uuid,p_reference text) returns public.anota_pix_payments language plpgsql security invoker set search_path='' as $$
declare settings public.anota_pix_settings; prior public.anota_pix_payments;result public.anota_pix_payments;
begin
 perform pg_advisory_xact_lock(hashtextextended('anotei-payment:'||p_user::text,0));
 select * into prior from public.anota_pix_payments where id=p_id;
 if found then if prior.user_id<>p_user then raise exception 'ANOTA_FORBIDDEN';end if;return prior;end if;
 select * into prior from public.anota_pix_payments where user_id=p_user and status='PENDENTE';if found then return prior;end if;
 select * into settings from public.anota_pix_settings where id;
 if length(settings.pix_key)=0 or length(settings.receiver)=0 or settings.monthly_cents<=0 or length(trim(p_reference)) not between 3 and 300 then raise exception 'ANOTA_PIX_NOT_READY';end if;
 insert into public.anota_pix_payments(id,user_id,amount_cents,reference,access_days) values(p_id,p_user,settings.monthly_cents,trim(p_reference),settings.access_days) returning * into result;return result;
end $$;
revoke all on function public.anota_request_pix(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.anota_request_pix(uuid,uuid,text) to service_role;
create function public.anota_review_pix(p_actor uuid,p_id uuid,p_approve boolean) returns public.anota_pix_payments language plpgsql security invoker set search_path='' as $$
declare payment public.anota_pix_payments;prior public.anota_subscriptions;profile public.anota_commercial_profiles;result public.anota_pix_payments;until_date date;today date:=(clock_timestamp() at time zone 'America/Sao_Paulo')::date;
begin
 if not exists(select 1 from public.anota_access_accounts where user_id=p_actor and exempt) then raise exception 'ANOTA_FORBIDDEN';end if;
 select * into payment from public.anota_pix_payments where id=p_id for update;
 if not found then raise exception 'ANOTA_FORBIDDEN';end if;
 if payment.status<>'PENDENTE' then return payment;end if;
 perform pg_advisory_xact_lock(hashtextextended('anotei-subscription:'||payment.user_id::text,0));
 select * into prior from public.anota_subscriptions where user_id=payment.user_id for update;
 select * into profile from public.anota_commercial_profiles where user_id=payment.user_id for update;
 until_date:=greatest(today,case when prior.status='ATIVA' then prior.renewal_date+1 else today end)+payment.access_days-1;
 update public.anota_pix_payments set status=case when p_approve then 'APROVADO' else 'REJEITADO' end,reviewed_at=clock_timestamp(),reviewed_by=p_actor,access_until=case when p_approve then until_date else null end where id=p_id returning * into result;
 if p_approve then
  insert into public.anota_subscriptions(user_id,status,plan,monthly_cents,renewal_date,updated_at) values(payment.user_id,'ATIVA',coalesce(nullif(prior.plan,''),'Plano casal · até 2 números'),payment.amount_cents,until_date,clock_timestamp()) on conflict(user_id) do update set status='ATIVA',plan=excluded.plan,monthly_cents=excluded.monthly_cents,renewal_date=excluded.renewal_date,updated_at=excluded.updated_at;
  insert into public.anota_commercial_profiles(user_id,payment_method) values(payment.user_id,'PIX') on conflict(user_id) do update set payment_method='PIX',updated_at=clock_timestamp();
  insert into public.anota_subscription_events(user_id,actor_id,before_subscription,after_subscription,before_profile,after_profile) select payment.user_id,p_actor,to_jsonb(prior),to_jsonb(s),to_jsonb(profile),to_jsonb(p) from public.anota_subscriptions s join public.anota_commercial_profiles p using(user_id) where s.user_id=payment.user_id;
 end if;return result;
end $$;
revoke all on function public.anota_review_pix(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.anota_review_pix(uuid,uuid,boolean) to service_role;
