# Add shared registration review to your existing EPL Discord bot

This file is a guide to merge into your current `EPL-Bot` folder. Do not overwrite your working bot blindly: keep your current `/ping`, ready event, and login code.

## 1) Add these variables to `EPL-Bot/.env`

```env
SUPABASE_URL=https://YOUR-PROJECT-REF.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR_SUPABASE_SECRET_SERVICE_ROLE_KEY
EPL_STAFF_ROLE_ID=YOUR_DISCORD_STAFF_ROLE_ID
```

Keep these secrets in `.env` only. Never paste them into the website, Discord, screenshots, or this chat. If your Supabase dashboard calls the secret key `service_role` or shows a newer secret/service key, use the server-side secret intended for privileged backend access. Never use it in public frontend code.

## 2) Add commands to `deploy-commands.js`

Add `PermissionFlagsBits` to your discord.js imports if you need it elsewhere (not required for registration below). Add these builders to the existing `commands` array, before `.map(command => command.toJSON())`:

```js
new SlashCommandBuilder()
  .setName('registrations')
  .setDescription('List pending EPL registrations for staff.'),
new SlashCommandBuilder()
  .setName('review-registration')
  .setDescription('Approve or reject an EPL registration.')
  .addStringOption(option => option.setName('type').setDescription('Registration type').setRequired(true)
    .addChoices({ name: 'Team', value: 'team' }, { name: 'Player', value: 'player' }))
  .addStringOption(option => option.setName('id').setDescription('Registration UUID shown by /registrations').setRequired(true))
  .addStringOption(option => option.setName('decision').setDescription('Approve or reject').setRequired(true)
    .addChoices({ name: 'Approve', value: 'approved' }, { name: 'Reject', value: 'rejected' }))
  .addStringOption(option => option.setName('note').setDescription('Optional reason or staff note').setRequired(false)),
```

## 3) Add the handler to your existing `index.js`

At the top, make sure you have `Events` imported from `discord.js`. Then add this helper above `client.on(Events.InteractionCreate, ...)`:

```js
async function supabaseRequest(table, query, method = 'GET', body) {
  const base = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  const response = await fetch(`${base.replace(/\/$/, '')}/rest/v1/${table}${query || ''}`, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation'
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(data?.message || `Supabase request failed (${response.status})`);
  return data;
}

function isEplStaff(interaction) {
  const roleId = process.env.EPL_STAFF_ROLE_ID;
  const roles = interaction.member?.roles;
  const hasRole = Boolean(roleId && (roles?.cache?.has(roleId) || (Array.isArray(roles) && roles.includes(roleId))));
  const isAdmin = Boolean(interaction.memberPermissions?.has('Administrator'));
  return hasRole || isAdmin;
}
```

Inside your existing `client.on(Events.InteractionCreate, async interaction => { ... })`, keep your existing ping/register/website handlers. Add these two branches after the `if (!interaction.isChatInputCommand()) return;` line and before the end of the event handler:

```js
if (interaction.commandName === 'registrations') {
  if (!isEplStaff(interaction)) {
    return interaction.reply({ content: '⛔ EPL staff only.', ephemeral: true });
  }
  await interaction.deferReply({ ephemeral: true });
  try {
    const [teams, players] = await Promise.all([
      supabaseRequest('epl_team_registrations', '?status=eq.pending&select=id,team_name,short_code,captain_name,created_at&order=created_at.asc&limit=10'),
      supabaseRequest('epl_player_registrations', '?status=eq.pending&select=id,display_name,roblox_username,discord_username,created_at&order=created_at.asc&limit=10')
    ]);
    const teamText = teams.length ? teams.map(t => `• **TEAM** ${t.team_name} (${t.short_code}) — Captain: ${t.captain_name}
ID: \`${t.id}\``).join('
') : 'No pending team registrations.';
    const playerText = players.length ? players.map(p => `• **PLAYER** ${p.display_name} / Roblox: ${p.roblox_username} / Discord: ${p.discord_username}
ID: \`${p.id}\``).join('
') : 'No pending player registrations.';
    return interaction.editReply(`**Pending EPL registrations**

${teamText}

${playerText}

Use \`/review-registration\` with the exact ID to approve or reject.`);
  } catch (error) {
    console.error(error);
    return interaction.editReply('Could not load registrations. Check the bot terminal and Supabase settings.');
  }
}

if (interaction.commandName === 'review-registration') {
  if (!isEplStaff(interaction)) {
    return interaction.reply({ content: '⛔ EPL staff only.', ephemeral: true });
  }
  const type = interaction.options.getString('type', true);
  const id = interaction.options.getString('id', true).trim();
  const decision = interaction.options.getString('decision', true);
  const note = interaction.options.getString('note') || null;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return interaction.reply({ content: 'That ID does not look like a registration UUID. Copy the full ID from `/registrations`.', ephemeral: true });
  }
  await interaction.deferReply({ ephemeral: true });
  try {
    const table = type === 'team' ? 'epl_team_registrations' : 'epl_player_registrations';
    const updated = await supabaseRequest(table, `?id=eq.${encodeURIComponent(id)}&status=eq.pending`, 'PATCH', {
      status: decision,
      review_note: note,
      reviewed_at: new Date().toISOString()
    });
    if (!updated?.length) return interaction.editReply('No pending registration matched that ID. It may already have been reviewed.');
    const name = type === 'team' ? updated[0].team_name : updated[0].display_name;
    return interaction.editReply(`✅ ${type === 'team' ? 'Team' : 'Player'} registration for **${name}** marked **${decision}**. ${decision === 'approved' ? 'It should appear on the website after its registration list refreshes.' : 'It will remain hidden from the public website.'}`);
  } catch (error) {
    console.error(error);
    return interaction.editReply('Could not update the registration. Check the bot terminal and Supabase settings.');
  }
}
```

## 4) Redeploy the slash commands and restart the bot

From the existing bot folder in VS Code terminal:

```powershell
node deploy-commands.js
node index.js
```

If the bot is already running, press `Ctrl+C` in that terminal before restarting it.

## Important limitations to fix before a large public launch

- The registration endpoint includes basic validation but not CAPTCHA/rate limiting. Add bot protection before promoting the form widely.
- The existing site's old Admin dashboard still saves demo data only in browser `localStorage`. Do not use that page for official approvals, fixtures, or scores. The new registration review is in Discord; a secure web admin dashboard needs authenticated staff login.
- The website only displays approved registrations from the shared database. It does not migrate old demo records automatically.
