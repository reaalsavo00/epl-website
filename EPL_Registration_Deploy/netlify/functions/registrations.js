const json = (statusCode, body) => ({
  statusCode,
  headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Accept",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
  },
  body: JSON.stringify(body)
});

const clean = (value, max) => typeof value === "string" ? value.trim().slice(0, max) : "";

async function dbRequest(table, query, method = "GET", body) {
  const base = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) throw new Error("Supabase environment variables are not configured in Netlify.");
  const response = await fetch(`${base.replace(/\/$/, "")}/rest/v1/${table}${query || ""}`, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: "return=representation"
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { message: text }; }
  if (!response.ok) {
    const error = new Error(data?.message || data?.hint || "Database request failed.");
    error.status = response.status;
    throw error;
  }
  return data;
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return json(204, {});
  if (event.httpMethod === "GET") {
    try {
      const [teams, players] = await Promise.all([
        dbRequest("epl_team_registrations", "?status=eq.approved&select=id,team_name,short_code,region,captain_name,status,created_at&order=created_at.asc"),
        dbRequest("epl_player_registrations", "?status=eq.approved&select=id,display_name,roblox_username,team_name,position,status,created_at&order=created_at.asc")
      ]);
      return json(200, { teams, players });
    } catch (error) {
      console.error("EPL registrations GET failed:", error.message);
      return json(500, { error: "Could not load approved registrations." });
    }
  }
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed." });

  try {
    const input = JSON.parse(event.body || "{}");
    if (input.type === "team") {
      const row = {
        team_name: clean(input.team_name, 60),
        short_code: clean(input.short_code, 4).toUpperCase(),
        region: clean(input.region, 60),
        captain_name: clean(input.captain_name, 60),
        captain_discord: clean(input.captain_discord, 80),
        status: "pending"
      };
      if (row.team_name.length < 2 || row.short_code.length < 2 || row.region.length < 2 || row.captain_name.length < 2 || row.captain_discord.length < 2) {
        return json(400, { error: "Please complete every required team field." });
      }
      await dbRequest("epl_team_registrations", "", "POST", row);
      return json(201, { ok: true, status: "pending" });
    }
    if (input.type === "player") {
      const row = {
        display_name: clean(input.display_name, 60),
        roblox_username: clean(input.roblox_username, 40),
        discord_username: clean(input.discord_username, 80),
        team_name: clean(input.team_name, 60) || null,
        position: clean(input.position, 60) || null,
        status: "pending"
      };
      if (row.display_name.length < 2 || row.roblox_username.length < 3 || row.discord_username.length < 2) {
        return json(400, { error: "Please complete your display name, Roblox username and Discord details." });
      }
      await dbRequest("epl_player_registrations", "", "POST", row);
      return json(201, { ok: true, status: "pending" });
    }
    return json(400, { error: "Unknown registration type." });
  } catch (error) {
    console.error("EPL registration POST failed:", error.message);
    if (error.status === 409 || error.status === 23505) return json(409, { error: "That team short code may already be registered. Try another." });
    if (error instanceof SyntaxError) return json(400, { error: "Invalid form data." });
    return json(500, { error: "Registration could not be saved. Please try again later." });
  }
};
