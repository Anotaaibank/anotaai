-- Anotei only. Versioned reply fencing; no message is sent by this migration.
-- Deploy this migration and the matching worker code together. Old workers fail closed.
alter table public.anota_whatsapp_inbox add column if not exists reply_version bigint not null default 0 constraint anota_reply_version_range check(reply_version between 0 and 9007199254740991);

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
drop trigger if exists anota_whatsapp_reply_version on public.anota_whatsapp_inbox;
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

revoke all on function public.anota_reply_claim(uuid) from public,anon,authenticated;
grant execute on function public.anota_reply_claim(uuid) to service_role;
