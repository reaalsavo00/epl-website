-- The epl_admins table was created earlier. This policy keeps the allowlist private.
-- Only the Edge Function's service-role client reads it; browser roles cannot read or edit it.
alter table public.epl_admins enable row level security;
revoke all on table public.epl_admins from anon, authenticated;
