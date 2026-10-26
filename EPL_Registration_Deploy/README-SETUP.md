# EPL registration starter (Netlify + Supabase + Discord bot)

This bundle adds team/player registration to the existing EPL `index.html` while keeping its visual style. It includes a Supabase schema, a Netlify Function, and instructions for adding staff review commands to your current Discord bot.

## What it does
- Adds an EPL Registration page to the website.
- Saves team and player applications in Supabase with status `pending`.
- Staff can list and approve/reject pending registrations from Discord.
- The public site shows only approved team/player registrations from Supabase.
- Keeps the existing CSS/layout and local demo admin features, but those old admin features remain local-only.

## Setup order
1. Make a backup of your current website folder.
2. Create a Supabase project at https://supabase.com/.
3. In Supabase > SQL Editor, run all of `supabase-schema.sql`.
4. Copy the Supabase project URL and server-side service role/secret key. Keep the key private.
5. Copy this bundle's `index.html` into your original website folder, replacing the old `index.html`. Keep any other files, especially `epl-logo.png`.
6. Copy the bundle's `netlify` folder and `netlify.toml` into that same website folder.
7. In Netlify > Site configuration > Environment variables, add:
   - `SUPABASE_URL` = your project URL
   - `SUPABASE_SERVICE_ROLE_KEY` = the server-side secret/service role key
8. Install Netlify CLI on your PC if needed (`npm.cmd install -g netlify-cli`). In a terminal opened in the website folder run `netlify login`, then `netlify link` and select the EXISTING EPL site. Deploy with `netlify deploy --prod`.
   - Important: a plain drag-and-drop static deploy does not deploy the serverless function. Use the Netlify CLI so `netlify/functions/registrations.js` is deployed.
9. Follow `DISCORD-BOT-SETUP.md` to add `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `EPL_STAFF_ROLE_ID` to the separate bot `.env`, add the two commands, deploy slash commands, and restart the bot.
10. Test `/register` page on the website, submit a test team/player, run `/registrations` in Discord, approve it with `/review-registration`, then refresh the website's Teams/Players pages.

## Security
- Never put the Supabase service role/secret key in `index.html` or any browser JavaScript.
- Never upload the bot `.env` file to Netlify or put the Discord token in the website folder.
- The website registration endpoint has basic validation only; add CAPTCHA/rate limiting before a public promotion.
- Do not use the old browser-local Admin dashboard to manage official public league data.
