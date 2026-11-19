import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'GET, POST, OPTIONS'};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store'}});
const clean=(v:unknown,max:number)=>typeof v==='string'?v.trim().slice(0,max):'';
async function resolveRobloxUserId(username:string):Promise<number|null>{
 const response=await fetch('https://users.roblox.com/v1/usernames/users',{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify({usernames:[username],excludeBannedUsers:false})});
 if(!response.ok)throw new Error('Roblox username lookup is temporarily unavailable.');
 const payload=await response.json();
 const match=(payload.data||[]).find((u:Record<string,unknown>)=>String(u.name||'').toLowerCase()===username.toLowerCase());
 return match?.id?Number(match.id):null;
}
Deno.serve(async(req)=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
 const url=Deno.env.get('SUPABASE_URL')!,anon=Deno.env.get('SUPABASE_ANON_KEY')!,service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
 const db=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
 if(req.method==='GET'){
  const [teams,players,freeAgents,matches,stats]=await Promise.all([
   db.from('epl_team_registrations').select('id,team_name,short_code,region,captain_name,captain_discord,logo_url,status').eq('status','approved').order('created_at'),
   db.from('epl_player_registrations').select('id,display_name,roblox_username,roblox_user_id,team_name,team_id,roster_role,position').eq('status','approved').order('created_at'),
   db.from('epl_free_agent_registrations').select('id,display_name,roblox_username,roblox_user_id').eq('status','approved').order('created_at'),
   db.from('epl_matches').select('id,home_team_id,away_team_id,scheduled_at,match_note,status,home_score,away_score,evidence').neq('status','cancelled').order('scheduled_at'),
   db.from('epl_player_game_stats').select('id,match_id,player_registration_id,points,rebounds,assists,steals,blocks,turnovers,fouls,minutes,fgs,three_ps,fts,plus_minus')]);
  const err=teams.error||players.error||freeAgents.error||matches.error||stats.error;if(err)return json({error:'Could not load EPL league data.'},500);
  return json({teams:teams.data,players:players.data,freeAgents:freeAgents.data,matches:matches.data,stats:stats.data});
 }
 if(req.method!=='POST')return json({error:'Method not allowed.'},405);
 let input:Record<string,unknown>;try{input=await req.json()}catch{return json({error:'Invalid request body.'},400)}
 const action=clean(input.action,40);
 if(action==='resolve-roblox-user'){const username=clean(input.roblox_username,40);if(username.length<3)return json({error:'Enter a valid Roblox username.'},400);try{const id=await resolveRobloxUserId(username);return id?json({roblox_user_id:id}):json({error:'That Roblox username was not found.'},404)}catch{return json({error:'Roblox could not be checked right now. Try again shortly.'},503)}}
 if(action==='register-team'){
  const token=(req.headers.get('Authorization')||'').replace(/^Bearer\s+/i,'');
  if(!token)return json({error:'Sign in with Discord before registering a team.'},401);
  const authClient=createClient(url,anon,{global:{headers:{Authorization:`Bearer ${token}`}}});
  const {data:ud,error:ue}=await authClient.auth.getUser(token);if(ue||!ud.user)return json({error:'Discord session expired. Sign in again.'},401);
  const row={team_name:clean(input.team_name,60),short_code:clean(input.short_code,4).toUpperCase(),region:clean(input.region,60),captain_name:clean(input.captain_name,60),captain_discord:clean(ud.user.user_metadata?.full_name||ud.user.user_metadata?.name||ud.user.user_metadata?.user_name||'Discord member',80),owner_user_id:ud.user.id,logo_url:clean(input.logo_url,500)||null,status:'pending'};
  if(row.team_name.length<2||row.short_code.length<2||row.region.length<2||row.captain_name.length<2)return json({error:'Please complete the team name, code, region and captain name.'},400);
  const {error}=await db.from('epl_team_registrations').insert(row);if(error)return json({error:error.code==='23505'?'That team short code is already registered.':'Could not submit the team registration.'},error.code==='23505'?409:500);return json({ok:true,status:'pending'},201);
 }
 if(action==='register-player'){
  const teamId=clean(input.team_id,50);let teamName:string|null=null;
  if(teamId){const {data:t,error:te}=await db.from('epl_team_registrations').select('id,team_name').eq('id',teamId).eq('status','approved').maybeSingle();if(te||!t)return json({error:'Choose an approved EPL team or select Free Agent.'},400);teamName=t.team_name;}
  const robloxUsername=clean(input.roblox_username,40);let robloxUserId:number|null=null;try{robloxUserId=await resolveRobloxUserId(robloxUsername)}catch(e){return json({error:'Roblox could not be checked right now. Please try again in a moment.'},503)}if(!robloxUserId)return json({error:'That Roblox username was not found. Check the spelling and try again.'},400);
  const row={display_name:clean(input.display_name,60),roblox_username:robloxUsername,roblox_user_id:robloxUserId,discord_username:clean(input.discord_username,80),team_name:teamName,team_id:teamId||null,position:clean(input.position,60)||null,status:'pending'};
  if(row.display_name.length<2||row.roblox_username.length<3||row.discord_username.length<2)return json({error:'Enter your display name, Roblox username and Discord details.'},400);
  const {error}=await db.from('epl_player_registrations').insert(row);if(error)return json({error:error.code==='23505'?'That Roblox username is already registered.':'Could not submit the player registration.'},error.code==='23505'?409:500);return json({ok:true,status:'pending'},201);
 }
 if(action==='register-free-agent'){
  const robloxUsername=clean(input.roblox_username,40);let robloxUserId:number|null=null;try{robloxUserId=await resolveRobloxUserId(robloxUsername)}catch(e){return json({error:'Roblox could not be checked right now. Please try again in a moment.'},503)}if(!robloxUserId)return json({error:'That Roblox username was not found. Check the spelling and try again.'},400);
  const row={display_name:clean(input.display_name,60),roblox_username:robloxUsername,roblox_user_id:robloxUserId,status:'pending'};
  if(row.display_name.length<2||row.roblox_username.length<3)return json({error:'Enter a display name and valid Roblox username.'},400);
  const {error}=await db.from('epl_free_agent_registrations').insert(row);if(error)return json({error:error.code==='23505'?'That Roblox username is already registered as a free agent.':'Could not submit your free-agent registration.'},error.code==='23505'?409:500);return json({ok:true,status:'pending'},201);
 }
 const token=(req.headers.get('Authorization')||'').replace(/^Bearer\s+/i,'');if(!token)return json({error:'Discord sign-in required.'},401);
 const auth=createClient(url,anon,{global:{headers:{Authorization:`Bearer ${token}`}}});const {data:userData,error:userError}=await auth.auth.getUser(token);
 if(userError||!userData.user)return json({error:'Your session is invalid. Sign in again.'},401);
 const signedUser=userData.user;
 if(action==='owner-data'){
  const {data:owned,error}=await db.from('epl_team_registrations').select('id,team_name,short_code,status,logo_url').eq('owner_user_id',signedUser.id);
  if(error)return json({error:'Could not load your teams.'},500);
  const ids=(owned||[]).filter(t=>t.status==='approved').map(t=>t.id);
  let roster=[];if(ids.length){const q=await db.from('epl_player_registrations').select('id,display_name,roblox_username,roblox_user_id,team_name,team_id,roster_role,position').in('team_id',ids).eq('status','approved').order('display_name');if(q.error)return json({error:'Could not load your squad.'},500);roster=q.data||[];}
  const {data:available,error:ae}=await db.from('epl_player_registrations').select('id,display_name,roblox_username,roblox_user_id,position').eq('status','approved').is('team_id',null).order('display_name');
  if(ae)return json({error:'Could not load available players.'},500);
  return json({teams:owned||[],roster,availablePlayers:available||[]});
 }
 if(action==='owner-add-player'||action==='owner-remove-player'||action==='owner-set-role'){
  const teamId=clean(input.team_id,50),playerId=clean(input.player_id,50);
  const {data:owned,error:oe}=await db.from('epl_team_registrations').select('id,status').eq('id',teamId).eq('owner_user_id',signedUser.id).maybeSingle();
  if(oe||!owned||owned.status!=='approved')return json({error:'You do not own an approved team with permission to manage it.'},403);
  const {data:player,error:pe}=await db.from('epl_player_registrations').select('id,status,team_id').eq('id',playerId).maybeSingle();
  if(pe||!player||player.status!=='approved')return json({error:'That approved player could not be found.'},404);
  if(action==='owner-remove-player'){
   if(player.team_id!==teamId)return json({error:'That player is not on your team.'},403);
   const {error}=await db.from('epl_player_registrations').update({team_id:null,team_name:null}).eq('id',playerId).eq('team_id',teamId);
   if(error)return json({error:'Could not remove that player.'},500);return json({ok:true});
  }
  if(action==='owner-set-role'){
   const role=clean(input.roster_role,20);if(player.team_id!==teamId||!['starter','substitute'].includes(role))return json({error:'Invalid roster role or player.'},400);
   const {data:countRows,error:ce}=await db.from('epl_player_registrations').select('id').eq('team_id',teamId).eq('status','approved').eq('roster_role',role);
   if(ce)return json({error:'Could not check roster limits.'},500);if((countRows||[]).length>=(role==='starter'?5:10))return json({error:`Your team already has the maximum ${role==='starter'?'5 starters':'10 substitutes'}.`},409);
   const {error}=await db.from('epl_player_registrations').update({roster_role:role}).eq('id',playerId).eq('team_id',teamId);if(error)return json({error:'Could not update player role.'},500);return json({ok:true});
  }
  if(player.team_id&&player.team_id!==teamId)return json({error:'That player is already registered to another team.'},409);
  const {data:rows,error:re}=await db.from('epl_player_registrations').select('id,roster_role').eq('team_id',teamId).eq('status','approved');
  if(re)return json({error:'Could not check your roster.'},500);if((rows||[]).length>=15)return json({error:'Your team has reached the 15-player limit.'},409);
  const role=clean(input.roster_role,20)==='substitute'?'substitute':'starter';const count=(rows||[]).filter(x=>x.roster_role===role).length;
  if(count>=(role==='starter'?5:10))return json({error:`Your team already has the maximum ${role==='starter'?'5 starters':'10 substitutes'}.`},409);
  const {data:t}=await db.from('epl_team_registrations').select('team_name').eq('id',teamId).single();
  const {error}=await db.from('epl_player_registrations').update({team_id:teamId,team_name:t.team_name,roster_role:role}).eq('id',playerId).is('team_id',null);
  if(error)return json({error:'Could not add that player. They may have joined another team.'},409);return json({ok:true});
 }
 const {data:admin,error:adminError}=await db.from('epl_admins').select('user_id').eq('user_id',signedUser.id).maybeSingle();if(adminError||!admin)return json({error:'You are not an appointed EPL admin.'},403);
 if(action==='admin-sync-roblox-ids'){
  let updated=0,failed=0;
  for(const table of ['epl_player_registrations','epl_free_agent_registrations']){
   const {data:rows,error}=await db.from(table).select('id,roblox_username').is('roblox_user_id',null).limit(250);
   if(error)return json({error:'Could not load existing Roblox accounts for ID migration.'},500);
   for(const row of rows||[]){try{const id=await resolveRobloxUserId(clean(row.roblox_username,40));if(id){const {error:ue}=await db.from(table).update({roblox_user_id:id}).eq('id',row.id);if(ue)failed++;else updated++;}else failed++;}catch{failed++;}}
  }
  return json({ok:true,updated,failed});
 }
 if(action==='admin-team-update'){
  const id=clean(input.team_id,50),teamName=clean(input.team_name,60),shortCode=clean(input.short_code,4).toUpperCase(),region=clean(input.region,60),captain=clean(input.captain_name,60),status=clean(input.status,20);
  if(!id||teamName.length<2||shortCode.length<2||!region||!captain||!['approved','pending','rejected'].includes(status))return json({error:'Complete the team name, short code, region, captain and valid status.'},400);
  const row={team_name:teamName,short_code:shortCode,region,captain_name:captain,captain_discord:clean(input.captain_discord,80)||null,logo_url:clean(input.logo_url,500)||null,status};
  const {data,error}=await db.from('epl_team_registrations').update(row).eq('id',id).select('id');
  if(error)return json({error:error.code==='23505'?'That short code is already in use.':'Could not update this team. Check the details and try again.'},error.code==='23505'?409:500);if(!data?.length)return json({error:'Team not found.'},404);
  const {error:pe}=await db.from('epl_player_registrations').update({team_name:teamName}).eq('team_id',id);if(pe)return json({error:'Team saved, but player team labels could not be synchronised.'},500);return json({ok:true});
 }
 if(action==='admin-team-delete'){
  const id=clean(input.team_id,50);
  if(!id)return json({error:'Choose a team to delete.'},400);
  const {data:matches,error:me}=await db.from('epl_matches').select('id').or(`home_team_id.eq.${id},away_team_id.eq.${id}`);
  if(me)return json({error:`Could not inspect team fixtures (${me.code||'DB error'}): ${me.message}`},500);
  const matchIds=(matches||[]).map(m=>m.id);
  if(matchIds.length){
   const {error:se}=await db.from('epl_player_game_stats').delete().in('match_id',matchIds);
   if(se)return json({error:`Could not delete fixture statistics (${se.code||'DB error'}): ${se.message}`},500);
   const {error:de}=await db.from('epl_matches').delete().in('id',matchIds);
   if(de)return json({error:`Could not delete team fixtures (${de.code||'DB error'}): ${de.message}`},500);
  }
  const {error:unassign}=await db.from('epl_player_registrations').update({team_id:null,team_name:null,roster_role:null}).eq('team_id',id);
  if(unassign)return json({error:`Could not release team players (${unassign.code||'DB error'}): ${unassign.message}`},500);
  const {data,error}=await db.from('epl_team_registrations').delete().eq('id',id).select('id');
  if(error)return json({error:`Could not delete team (${error.code||'DB error'}): ${error.message}. The database may have another table linked to this team.`},500);
  if(!data?.length)return json({error:'Team not found.'},404);
  return json({ok:true});
 }
 if(action==='admin-clear-data'){
  const category=clean(input.category,30);
  const allowed:Record<string,string>={matches:'epl_matches',stats:'epl_player_game_stats',players:'epl_player_registrations',free_agents:'epl_free_agent_registrations',teams:'epl_team_registrations',news:'epl_news',discipline:'epl_discipline',disputes:'epl_disputes'};
  const table=allowed[category];
  if(!table)return json({error:'Choose a valid data category.'},400);
  // Delete in a deliberate, single-category operation. Never touches epl_admins, auth.users or epl_settings.
  const {error}=await db.from(table).delete().not('id','is',null);
  if(error)return json({error:'Could not clear this category. Check table permissions and foreign-key dependencies.'},500);
  return json({ok:true,category});
 }

 if(action==='admin-data'){
  const [pt,pp,pa,teams]=await Promise.all([db.from('epl_team_registrations').select('*').eq('status','pending').order('created_at'),db.from('epl_player_registrations').select('*').eq('status','pending').order('created_at'),db.from('epl_free_agent_registrations').select('*').eq('status','pending').order('created_at'),db.from('epl_team_registrations').select('id,team_name,short_code,region,captain_name,captain_discord,logo_url,status').order('team_name')]);
  const err=pt.error||pp.error||pa.error||teams.error;if(err)return json({error:'Could not load admin registrations and teams.'},500);return json({pendingTeams:pt.data,pendingPlayers:pp.data,pendingAgents:pa.data,teams:teams.data});
 }
 if(action==='review'){
  const type=clean(input.type,20),table=type==='team'?'epl_team_registrations':type==='player'?'epl_player_registrations':type==='agent'?'epl_free_agent_registrations':'';const status=clean(input.status,20);
  if(!table||!['approved','rejected'].includes(status))return json({error:'Invalid review action.'},400);
  const {data,error}=await db.from(table).update({status,review_note:clean(input.note,300)||null,reviewed_at:new Date().toISOString()}).eq('id',clean(input.id,50)).eq('status','pending').select('id');
  if(error||!data?.length)return json({error:'That pending registration could not be found.'},404);return json({ok:true});
 }
 if(action==='create-match'){
  const row={home_team_id:clean(input.home_team_id,50),away_team_id:clean(input.away_team_id,50),scheduled_at:clean(input.scheduled_at,50)||null,match_note:clean(input.match_note,120)||null,status:'upcoming'};
  if(!row.home_team_id||!row.away_team_id||row.home_team_id===row.away_team_id)return json({error:'Choose two different approved teams.'},400);
  const {error}=await db.from('epl_matches').insert(row);if(error)return json({error:'Could not create that fixture.'},500);return json({ok:true});
 }
 if(action==='save-result'){
  const hs=Number(input.home_score),as=Number(input.away_score);if(!clean(input.match_id,50)||!Number.isInteger(hs)||!Number.isInteger(as)||hs<0||as<0)return json({error:'Enter a fixture and valid final scores.'},400);
  const {error}=await db.from('epl_matches').update({home_score:hs,away_score:as,status:'played',evidence:clean(input.evidence,500)||null,updated_at:new Date().toISOString()}).eq('id',clean(input.match_id,50));if(error)return json({error:'Could not save the match result.'},500);return json({ok:true});
 }
 if(action==='save-player-stats'){
  const row={match_id:clean(input.match_id,50),player_registration_id:clean(input.player_registration_id,50),points:Math.max(0,Math.trunc(Number(input.points)||0)),rebounds:Math.max(0,Math.trunc(Number(input.rebounds)||0)),assists:Math.max(0,Math.trunc(Number(input.assists)||0)),steals:Math.max(0,Math.trunc(Number(input.steals)||0)),blocks:Math.max(0,Math.trunc(Number(input.blocks)||0)),turnovers:Math.max(0,Math.trunc(Number(input.turnovers)||0)),fouls:Math.max(0,Math.trunc(Number(input.fouls)||0)),minutes:Math.max(0,Number(input.minutes)||0),fgs:Math.max(0,Math.trunc(Number(input.fgs)||0)),three_ps:Math.max(0,Math.trunc(Number(input.three_ps)||0)),fts:Math.max(0,Math.trunc(Number(input.fts)||0)),plus_minus:Math.trunc(Number(input.plus_minus)||0),updated_at:new Date().toISOString()};
  if(!row.match_id||!row.player_registration_id)return json({error:'Choose a match and player.'},400);const {error}=await db.from('epl_player_game_stats').upsert(row,{onConflict:'match_id,player_registration_id'});if(error)return json({error:'Could not save player stats.'},500);return json({ok:true});
 }
 return json({error:'Unknown action.'},400);
});
