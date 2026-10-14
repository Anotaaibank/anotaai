-- Apply only to the independent Anotei database, after schema.sql.
-- Management roles are checked on the server using ANOTA_MANAGER_USER_IDS.
-- No role is granted through editable user metadata or through this schema.
create table if not exists public.anota_feedbacks (
 id uuid primary key, user_id uuid not null references auth.users(id),
 topic text not null check(topic in ('Visão geral','Meu dinheiro','Rendas complementares','Agenda','Minhas despesas','Despesas fixas','Viagens','WhatsApp','IA por voz e texto','Outros')),
 kind text not null check(kind in ('Sugestão','Problema','Elogio','Dúvida')),
 message text not null check(length(trim(message)) between 10 and 3000),
 status text not null default 'NOVO' check(status in ('NOVO','EM_ANALISE','PLANEJADO','RESOLVIDO')),
 response text not null default '' check(length(response)<=2000),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create index if not exists anota_feedback_owner_created on public.anota_feedbacks(user_id,created_at desc);
create index if not exists anota_feedback_status_created on public.anota_feedbacks(status,created_at desc);
alter table public.anota_feedbacks enable row level security;
revoke all on public.anota_feedbacks from public,anon,authenticated;
grant select on public.anota_feedbacks to authenticated;
grant insert(id,user_id,topic,kind,message) on public.anota_feedbacks to authenticated;
grant all on public.anota_feedbacks to service_role;
drop policy if exists feedback_select_own on public.anota_feedbacks;
create policy feedback_select_own on public.anota_feedbacks for select to authenticated using ((select auth.uid())=user_id);
drop policy if exists feedback_insert_own on public.anota_feedbacks;
create policy feedback_insert_own on public.anota_feedbacks for insert to authenticated with check ((select auth.uid())=user_id and status='NOVO' and response='');

create table if not exists public.anota_subscriptions (
 user_id uuid primary key references auth.users(id),
 status text not null check(status in ('SEM_ASSINATURA','TESTE','ATIVA','ATRASADA','CANCELADA')),
 plan text not null default '' check(length(plan)<=80),
 monthly_cents bigint not null default 0 check(monthly_cents between 0 and 10000000),
 renewal_date date, updated_at timestamptz not null default now(),
 constraint active_subscription_price check(status<>'ATIVA' or monthly_cents>0)
);
alter table public.anota_subscriptions enable row level security;
revoke all on public.anota_subscriptions from public,anon,authenticated;
grant all on public.anota_subscriptions to service_role;
-- No client policies: only the authorized management API can alter or list subscriptions.

create table if not exists public.anota_commercial_profiles (
 user_id uuid primary key references auth.users(id),
 payment_method text not null check(payment_method in ('CARTAO','BOLETO','NAO_DEFINIDO')),
 notes text not null default '' check(length(notes)<=2000),follow_up_date date,
 cancellation_reason text not null default '' check(length(cancellation_reason)<=500),
 updated_at timestamptz not null default now()
);
create table if not exists public.anota_campaigns (
 id uuid primary key,name text not null check(length(trim(name)) between 2 and 100),
 influencer text not null check(length(trim(influencer)) between 2 and 100),
 channel text not null check(length(trim(channel)) between 2 and 80),
 code text not null unique check(code ~ '^[a-z0-9][a-z0-9-]{2,47}$'),
 commission_bps integer not null check(commission_bps between 0 and 10000),
 active boolean not null default true,created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create table if not exists public.anota_acquisition (
 user_id uuid primary key references auth.users(id),
 campaign_id uuid not null references public.anota_campaigns(id),captured_at timestamptz not null
);
create index if not exists anota_acquisition_campaign on public.anota_acquisition(campaign_id);
create table if not exists public.anota_subscription_events (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id),
 actor_id uuid not null references auth.users(id),before_subscription jsonb,after_subscription jsonb not null,
 before_profile jsonb,after_profile jsonb,created_at timestamptz not null default now()
);
create index if not exists anota_subscription_events_created on public.anota_subscription_events(created_at desc,id);
alter table public.anota_commercial_profiles enable row level security;
alter table public.anota_campaigns enable row level security;
alter table public.anota_acquisition enable row level security;
alter table public.anota_subscription_events enable row level security;
revoke all on public.anota_commercial_profiles,public.anota_campaigns,public.anota_acquisition,public.anota_subscription_events from public,anon,authenticated;
grant all on public.anota_commercial_profiles,public.anota_campaigns,public.anota_acquisition,public.anota_subscription_events to service_role;
-- No public table access. Invite routes resolve a single active code on the server.

create or replace function public.anota_manage_subscription(
 p_subscription jsonb,p_profile jsonb,p_expected timestamptz,p_profile_expected timestamptz,p_actor uuid
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 target uuid := (p_subscription->>'user_id')::uuid;
 old public.anota_subscriptions; result public.anota_subscriptions;
 old_profile public.anota_commercial_profiles; profile public.anota_commercial_profiles;
 modified timestamptz;
begin
 -- Serialize initial inserts as well as concurrent edits of an existing row.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('anotei-commerce:'||target::text,0));
 select * into old from public.anota_subscriptions where user_id=target;
 select * into old_profile from public.anota_commercial_profiles where user_id=target;
 if old.updated_at is distinct from p_expected or (p_profile is not null and old_profile.updated_at is distinct from p_profile_expected) then raise exception 'ANOTA_CHANGED'; end if;
 modified := greatest(clock_timestamp(),coalesce(old.updated_at,'epoch'::timestamptz)+interval '1 millisecond',coalesce(old_profile.updated_at,'epoch'::timestamptz)+interval '1 millisecond');
 insert into public.anota_subscriptions(user_id,status,plan,monthly_cents,renewal_date,updated_at)
 values(target,p_subscription->>'status',p_subscription->>'plan',(p_subscription->>'monthly_cents')::bigint,(p_subscription->>'renewal_date')::date,modified)
 on conflict(user_id) do update set status=excluded.status,plan=excluded.plan,monthly_cents=excluded.monthly_cents,renewal_date=excluded.renewal_date,updated_at=excluded.updated_at returning * into result;
 if p_profile is not null then
  if result.status='CANCELADA' and length(trim(coalesce(p_profile->>'cancellation_reason','')))=0 then raise exception 'Informe o motivo do cancelamento'; end if;
  insert into public.anota_commercial_profiles(user_id,payment_method,notes,follow_up_date,cancellation_reason,updated_at)
  values(target,p_profile->>'payment_method',p_profile->>'notes',(p_profile->>'follow_up_date')::date,p_profile->>'cancellation_reason',modified)
  on conflict(user_id) do update set payment_method=excluded.payment_method,notes=excluded.notes,follow_up_date=excluded.follow_up_date,cancellation_reason=excluded.cancellation_reason,updated_at=excluded.updated_at returning * into profile;
 else profile := old_profile; end if;
 insert into public.anota_subscription_events(user_id,actor_id,before_subscription,after_subscription,before_profile,after_profile,created_at)
 values(target,p_actor,case when old.user_id is null then null else to_jsonb(old) end,to_jsonb(result),case when old_profile.user_id is null then null else to_jsonb(old_profile) end,case when profile.user_id is null then null else to_jsonb(profile) end,modified);
 insert into public.anota_audit_logs(user_id,entity_id,action,details)
 values(p_actor,target,'ASSINATURA_MANUAL_ATUALIZADA',jsonb_build_object('status',result.status,'monthly_cents',result.monthly_cents));
 return to_jsonb(result);
end $$;
revoke all on function public.anota_manage_subscription(jsonb,jsonb,timestamptz,timestamptz,uuid) from public,anon,authenticated;
grant execute on function public.anota_manage_subscription(jsonb,jsonb,timestamptz,timestamptz,uuid) to service_role;
