-- Applied to Supabase production project hcorkkudgicarsmexnqf on 2026-11-11.
-- Keep migration source-controlled for future environment parity.
-- No application-data updates; bounded lock and statement timeouts.
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '90s';

CREATE INDEX IF NOT EXISTS freight_mail_inbox_received_id_idx
  ON public.freight_mail_inbox (received_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS freight_mail_messages_created_id_idx
  ON public.freight_mail_messages (created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS freight_contacts_email_normalized_idx
  ON public.freight_contacts ((lower(btrim(value))), company_id, id)
  WHERE channel = '邮箱';
