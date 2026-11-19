# Practical Basketball — rebuild package

## Included
- `index.html`: refreshed responsive site shell and refined team-card layout.
- `epl.js`: league application logic with expanded box-score fields and admin tools.
- `supabase/functions/epl-api/index.ts`: Edge Function source with admin-only category clearing and expanded stat fields.
- `supabase/migrations/202611190001_practical_basketball_rebuild.sql`: additive database/storage migration.
- `practical-basketball-logo.png`: supplied league logo.

## Deployment
1. Back up Supabase first. The migration is additive and does not delete existing league data.
2. Run the SQL migration in Supabase SQL Editor.
3. Deploy `supabase/functions/epl-api` as `epl-api`.
4. Confirm Edge Function secrets include `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`. Never put the service-role key in frontend files.
5. Upload `index.html`, `epl.js`, and the logo to the same hosting directory.
6. Test Discord OAuth redirect URLs, registrations, team-owner actions, admin actions, match results and stats before launch.

## Screenshot OCR limitation
The admin dashboard includes screenshot preview and in-browser Tesseract text extraction. This is OCR text recognition only, not a reliable automatic box-score parser. Admins must compare every username and number with the image and correct/enter the stats before saving. Automatic column matching, player matching and auto-approval are not claimed as implemented.

## Data clearing
The admin-only dashboard offers category-by-category deletion with two confirmation prompts. It does not delete `epl_admins`, `auth.users`, `epl_settings`, or storage objects. Back up first.

## Important integration note
The backend source provided for this rebuild does not contain every action referenced by the existing frontend. The existing controls for `admin-team-update`, `admin-publish-news`, `admin-manage-match`, and `admin-discipline` need their corresponding handlers merged into the deployed Edge Function. The full project was not connected to or live-tested against Supabase in this session. Do not assume deployment is complete until those checks pass.
