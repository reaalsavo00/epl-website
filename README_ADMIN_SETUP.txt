EPL Discord Admin Login - setup notes

WHAT THIS UPDATE DOES
- Adds Discord sign-in to the existing Admin button.
- Calls a Supabase Edge Function to verify the signed-in user's UUID against public.epl_admins.
- Only an account whose UUID is in epl_admins sees the dashboard.
- Keeps the existing public pages, registration forms, crest path and styling.

IMPORTANT LIMITATION
The existing admin dashboard still stores league data in browser localStorage. This update restricts who can open the dashboard, but it does NOT make team/fixture/news data shared between devices. That is a separate database migration.

1) Deploy the Edge Function
Create a Supabase Edge Function named: check-epl-admin
Paste the contents of supabase/functions/check-epl-admin/index.ts into its index.ts and deploy it.
The function uses Supabase's built-in environment variables SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY. Do not put the service-role key in GitHub or the website.

2) Supabase Auth URL configuration
In Supabase: Authentication > URL Configuration
Set Site URL to:
https://reaalsavo00.github.io
Add this Redirect URL:
https://reaalsavo00.github.io/epl-website/
Also add http://localhost:8000/ if testing locally.

3) Discord provider
Keep the Discord provider enabled in Supabase. In Discord Developer Portal > OAuth2 > Redirects, keep the exact Supabase callback URL shown by Supabase. Do not use the GitHub Pages URL as the Discord OAuth redirect; Supabase is the OAuth callback handler.

4) Add the first approved admin (the league owner)
First sign in once through the website's Admin button with the Discord account you want to appoint. Supabase will create the auth user.
Then in Supabase SQL Editor run:

select id, email, raw_user_meta_data
from auth.users
order by created_at desc;

Find your own Discord-linked account and copy its id UUID. Then run this, replacing the UUID:

insert into public.epl_admins (user_id)
values ('PASTE-YOUR-AUTH-USER-UUID-HERE')
on conflict (user_id) do nothing;

Only add accounts you personally approve. To remove an admin:
delete from public.epl_admins where user_id = 'THE-USER-UUID';

5) Publish to GitHub Pages
Upload/commit index.html and epl-logo.png to the repository root, plus the supabase folder and setup SQL/README for reference. The Supabase function is deployed separately from GitHub Pages.

SECURITY
The Supabase publishable/anon key in index.html is designed for browser use. Never publish a Supabase secret/service-role key, Discord client secret, or database password.
