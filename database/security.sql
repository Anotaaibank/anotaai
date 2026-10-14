-- Apply after schema.sql, finance.sql and commerce.sql, only to Anotei.
-- Supabase defaults may grant anonymous table access at creation time.
-- Keep explicit authenticated SELECT / feedback column INSERT and guarded RPCs.
revoke all on table
 public.anota_expenses,public.anota_audit_logs,
 public.anota_whatsapp_bots,public.anota_whatsapp_inbox,
 public.anota_finance_documents,public.anota_finance_operations,
 public.anota_feedbacks,public.anota_subscriptions,
 public.anota_commercial_profiles,public.anota_campaigns,
 public.anota_acquisition,public.anota_subscription_events
from public,anon;

create index if not exists anota_audit_owner_created on public.anota_audit_logs(user_id,created_at desc);
create index if not exists anota_inbox_expense on public.anota_whatsapp_inbox(entry_id) where entry_id is not null;
create index if not exists anota_subscription_events_user on public.anota_subscription_events(user_id);
create index if not exists anota_subscription_events_actor on public.anota_subscription_events(actor_id);
