-- Preserve existing Anotei passwords only until each account's first cloud login.
-- Hashes remain inaccessible to browsers and authenticated/anonymous roles.
create table anota_private.legacy_passwords(
 user_id uuid primary key references auth.users(id),email text not null unique,
 password_hash text not null check(password_hash ~ '^[a-f0-9]{32}:[a-f0-9]{128}$')
);
alter table anota_private.legacy_passwords enable row level security;
revoke all on anota_private.legacy_passwords from public,anon,authenticated;
grant all on anota_private.legacy_passwords to service_role;
create function public.anota_legacy_login(p_email text) returns jsonb language sql security definer set search_path='' as $$
 select jsonb_build_object('user_id',user_id,'email',email,'password_hash',password_hash) from anota_private.legacy_passwords where email=p_email
$$;
create function public.anota_clear_legacy_login(p_user uuid) returns void language sql security definer set search_path='' as $$
 delete from anota_private.legacy_passwords where user_id=p_user
$$;
revoke all on function public.anota_legacy_login(text),public.anota_clear_legacy_login(uuid) from public,anon,authenticated;
grant execute on function public.anota_legacy_login(text),public.anota_clear_legacy_login(uuid) to service_role;
