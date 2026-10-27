-- Test harness only. This is NOT a migration and must never run on Supabase.
-- The runner has already created and verified its own disposable server/database.
create extension if not exists pgcrypto;
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
grant usage on schema auth to anon, authenticated, service_role;
create table auth.users (
 id uuid primary key,
 email text unique,
 aud text,
 role text,
 raw_user_meta_data jsonb not null default '{}'::jsonb,
 raw_app_meta_data jsonb not null default '{}'::jsonb,
 created_at timestamptz default now(),
 updated_at timestamptz default now()
);
grant all on auth.users to service_role;
create function auth.uid() returns uuid language sql stable as $$
 select coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),
   nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid
$$;
grant execute on function auth.uid() to anon, authenticated, service_role;
-- Emulate the permissive table defaults the product's explicit grants/revokes
-- must withstand. This tests PostgreSQL roles/RLS, not the Supabase Auth service.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
