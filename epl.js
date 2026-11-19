(() => {
  const URL = 'https://ethvowgzdozeljxivwwy.supabase.co';
  const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV0aHZvd2d6ZG96ZWxqeGl2d3d5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI5NjI0MDMsImV4cCI6MjEwODUzODQwM30.kIYs6RIZqYC_fA-V6fAzwYX_Pt6J2DTRUsWIIREP2Uw';
  const API = URL + '/functions/v1/epl-api';
  const sb = window.supabase.createClient(URL, KEY);
  const state = { teams:[], players:[], freeAgents:[], matches:[], stats:[], pendingTeams:[], pendingPlayers:[], pendingAgents:[], adminTeams:[], news:[], ownedTeams:[], ownerRoster:[], availablePlayers:[] };
  const avatarCache = new Map();
  let openTeamProfileId = null;
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const say = (id,t) => { const el=$(id); if(el) el.textContent=t; };
  async function publicApi(method='GET',body=null){
    const {data:{session}}=await sb.auth.getSession();
    const r=await fetch(API,{method,headers:{apikey:KEY,Authorization:'Bearer '+(session?.access_token||KEY),'Content-Type':'application/json',Accept:'application/json'},...(body?{body:JSON.stringify(body)}:{})});
    const data=await r.json().catch(()=>({})); if(!r.ok) throw new Error(data.error||'EPL service is unavailable.'); return data;
  }
  async function adminApi(body){
    const {data,error}=await sb.functions.invoke('epl-api',{body});
    if(error) throw new Error(error.message||'Admin request failed.');
    if(data?.error) throw new Error(data.error); return data;
  }
  const team = id => state.teams.find(t=>t.id===id) || {team_name:'TBD',short_code:'—'};
  const matchName = m => `${team(m.home_team_id).team_name} vs ${team(m.away_team_id).team_name}`;
  const fmt = v => v ? new Date(v).toLocaleString(undefined,{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}) : 'Date TBC';
  // Roblox's public web APIs do not expose browser CORS headers. Use a GET-only
  // CORS bridge for the public username search and thumbnail JSON; the image
  // itself is then loaded directly from Roblox's CDN in the <img> element.
  const ROBLOX_CORS_BRIDGE='https://proxy.cors.dev/';
  async function robloxPublicGet(url){
    const response=await fetch(ROBLOX_CORS_BRIDGE+url,{headers:{Accept:'application/json'},credentials:'omit'});
    if(!response.ok)throw new Error(`Roblox lookup returned ${response.status}`);
    return response.json();
  }
  async function getAvatar(username){
    const name=String(username||'').trim();
    if(!name)return null;
    const cacheKey=name.toLowerCase();
    if(avatarCache.has(cacheKey))return avatarCache.get(cacheKey);
    try {
      // Resolve the exact Roblox username first, then request the FULL avatar
      // (not avatar-headshot) so the player's whole character is displayed.
      const searchUrl='https://users.roblox.com/v1/users/search?'+new URLSearchParams({keyword:name,limit:'10'}).toString();
      const userData=await robloxPublicGet(searchUrl);
      const matchedUser=(userData.data||[]).find(user=>String(user.name||'').toLowerCase()===cacheKey);
      const userId=matchedUser?.id;
      if(!userId)return null;
      const thumbUrl='https://thumbnails.roblox.com/v1/users/avatar?'+new URLSearchParams({userIds:String(userId),size:'420x420',format:'Png',isCircular:'false'}).toString();
      let imageUrl='';
      for(let attempt=0;attempt<3&&!imageUrl;attempt++){
        const thumbData=await robloxPublicGet(thumbUrl);
        const thumb=(thumbData.data||[]).find(item=>item.state==='Completed'&&item.imageUrl)||(thumbData.data||[]).find(item=>item.imageUrl);
        imageUrl=thumb?.imageUrl||'';
        if(!imageUrl&&attempt<2)await new Promise(resolve=>setTimeout(resolve,650));
      }
      const result={userId:String(userId),imageUrl};
      avatarCache.set(cacheKey,result);
      return result;
    } catch(error) {
      console.warn('Roblox full avatar could not be loaded for',name,error);
      return null;
    }
  }
  async function hydratePeople(people){
    const unique=[...new Set((people||[]).filter(p=>p&&p.roblox_username&&!p._avatarTried))];
    await Promise.all(unique.map(async p=>{
      p._avatarTried=true;
      const avatar=await getAvatar(p.roblox_username);
      if(avatar){
        p.roblox_user_id=avatar.userId;
        p.avatar_url=avatar.imageUrl;
      }
      // Retry on the next refresh if Roblox or the CORS bridge is unavailable.
      if(!p.avatar_url)p._avatarTried=false;
    }));
  }
  async function hydrateAvatars(){
    await hydratePeople([...state.players,...state.freeAgents]);
    renderPlayers(); renderAgents(); renderStatsLeaderboard();
    if(openTeamProfileId)renderTeamProfile(openTeamProfileId,false);
  }
  function playerAvatar(p,extraClass=''){
    const label=String(p.display_name||p.roblox_username||'').trim();
    const initials=(label.split(/\s+/).map(x=>x[0]).join('').slice(0,2)||'RB').toUpperCase();
    const cls=('epl-avatar '+extraClass).trim();
    const fallback=`<span class="epl-avatar-fallback"${p.avatar_url?' hidden':''}>${esc(initials)}</span>`;
    return `<span class="epl-avatar-wrap"><img class="${cls}" src="${esc(p.avatar_url||'') }" alt="${esc(p.roblox_username||'Roblox')} avatar" ${p.avatar_url?'':'hidden'} onerror="this.hidden=true;this.nextElementSibling.hidden=false">${fallback}</span>`;
  }
  function teamMark(t){return t.logo_url?`<img class="epl-team-logo" src="${esc(t.logo_url)}" alt="">`:`<span class="teammark">${esc(t.short_code||'EPL')}</span>`;}
  function standings(){return state.teams.map(t=>{let ms=state.matches.filter(m=>m.status==='played'&&(m.home_team_id===t.id||m.away_team_id===t.id));let w=0,l=0,pf=0,pa=0;ms.forEach(m=>{let h=m.home_team_id===t.id,f=h?m.home_score:m.away_score,a=h?m.away_score:m.home_score;pf+=f||0;pa+=a||0;if(f>a)w++;else if(f<a)l++;});return {...t,played:ms.length,w,l,pf,pa,diff:pf-pa,pts:w*2};}).sort((a,b)=>b.pts-a.pts||b.diff-a.diff||b.pf-a.pf);}
  function tableHTML(rows){if(!rows.length)return '<div class="empty">No approved teams yet.</div>';return `<table><thead><tr><th>#</th><th>Team</th><th>P</th><th>W</th><th>L</th><th>PF</th><th>PA</th><th>+/-</th><th>Pts</th></tr></thead><tbody>${rows.map((t,i)=>`<tr><td class="rank">${String(i+1).padStart(2,'0')}</td><td>${teamMark(t)} <b>${esc(t.team_name)}</b></td><td>${t.played}</td><td>${t.w}</td><td>${t.l}</td><td>${t.pf}</td><td>${t.pa}</td><td>${t.diff>0?'+':''}${t.diff}</td><td><b>${t.pts}</b></td></tr>`).join('')}</tbody></table>`;}
  function matchHTML(m){const home=team(m.home_team_id),away=team(m.away_team_id);return `<div class="match"><div class="date">${esc(fmt(m.scheduled_at))} · ${esc(m.match_note||'EPL MATCH')}</div><div class="matchup"><div class="match-side home">${teamMark(home)}<b>${esc(home.team_name)}</b></div><div class="match-centre"><div class="score">${m.status==='played'?`${m.home_score} <span>:</span> ${m.away_score}`:'VS'}</div><span class="pill">${m.status==='played'?'FT':'SCHEDULED'}</span></div><div class="match-side away"><b>${esc(away.team_name)}</b>${teamMark(away)}</div></div></div>`;}
  function renderTeamProfile(teamId,scroll=true){
    openTeamProfileId=teamId;
    const panel=$('teamProfile');const t=state.teams.find(x=>x.id===teamId);if(!t||!panel)return;
    const record=standings().find(x=>x.id===teamId)||{played:0,w:0,l:0,pf:0,pa:0,pts:0};
    const roster=state.players.filter(p=>p.team_id===teamId).sort((a,b)=>String(a.display_name).localeCompare(String(b.display_name)));
    const played=state.matches.filter(m=>m.status==='played'&&(m.home_team_id===teamId||m.away_team_id===teamId)).sort((a,b)=>String(b.scheduled_at||'').localeCompare(String(a.scheduled_at||'')));
    const recent=played.slice(0,5);
    const matchRows=recent.map(m=>{const isHome=m.home_team_id===teamId,opponent=team(isHome?m.away_team_id:m.home_team_id),forScore=isHome?m.home_score:m.away_score,against=isHome?m.away_score:m.home_score;return `<div class="team-profile-match"><span>${esc(fmt(m.scheduled_at))} · ${esc(opponent.team_name)}</span><b>${forScore}–${against} ${forScore>against?'W':forScore<against?'L':'D'}</b></div>`;}).join('')||'<div class="empty">No completed matches recorded yet.</div>';
    const playersHtml=roster.map(p=>{const playerRows=state.stats.filter(x=>x.player_registration_id===p.id).filter(x=>recent.some(m=>m.id===x.match_id));const sum=k=>playerRows.reduce((n,x)=>n+(Number(x[k])||0),0);return `<div class="team-profile-player"><div class="team-profile-player-info">${playerAvatar(p,'team-roster-avatar')}<div class="team-profile-player-copy"><b>${esc(p.display_name)}</b><div class="tiny">@${esc(p.roblox_username)} · ${esc(p.position||'Player')} · ${esc(p.roster_role||'Squad')}</div></div></div><div class="team-profile-player-stats"><span class="player-stat"><b>${sum('points')}</b><small>PTS</small></span><span class="player-stat"><b>${sum('rebounds')}</b><small>REB</small></span><span class="player-stat"><b>${sum('assists')}</b><small>AST</small></span><span class="player-stat"><b>${sum('steals')}</b><small>STL</small></span><span class="player-stat"><b>${sum('blocks')}</b><small>BLK</small></span><span class="player-stat-note">Last ${recent.length} team games</span></div></div>`;}).join('')||'<div class="empty">No approved players are currently linked to this team.</div>';
    panel.innerHTML=`<div class="team-profile-head">${teamMark(t)}<div><div class="eyebrow">Team profile</div><h2 style="margin:5px 0">${esc(t.team_name)}</h2><p class="muted" style="margin:0">${esc(t.region||'Europe')} · Captain: ${esc(t.captain_name||'Not listed')}</p></div><button class="btn" type="button" id="closeTeamProfile" style="margin-left:auto">Close ✕</button></div><div class="team-profile-record"><div class="profile-metric"><strong>${record.played}</strong><span>GAMES</span></div><div class="profile-metric"><strong>${record.w}</strong><span>WINS</span></div><div class="profile-metric"><strong>${record.l}</strong><span>LOSSES</span></div><div class="profile-metric"><strong>${record.pf}</strong><span>PTS FOR</span></div><div class="profile-metric"><strong>${record.pa}</strong><span>PTS AGAINST</span></div><div class="profile-metric"><strong>${record.pts}</strong><span>TABLE PTS</span></div></div><div class="team-profile-content"><div class="team-profile-squad"><h3>Squad & recent player stats</h3><p class="profile-help">Player totals from the team's last ${recent.length} completed games. Stats appear when entered by league admins.</p>${playersHtml}</div><div class="team-profile-results"><h3>Recent results</h3>${matchRows}</div></div>`;
    panel.classList.remove('hidden');if(scroll)panel.scrollIntoView({behavior:'smooth',block:'start'});$('closeTeamProfile').onclick=()=>{openTeamProfileId=null;panel.classList.add('hidden');panel.innerHTML='';};
  }
  function renderPublic(){
    const played=state.matches.filter(m=>m.status==='played'); $('statTeams').textContent=state.teams.length; $('statPlayed').textContent=played.length; $('statPlayers').textContent=state.players.length+state.freeAgents.length;
    const s=standings(); $('homeStandings').innerHTML=tableHTML(s.slice(0,5)); $('standingsTable').innerHTML=tableHTML(s);
    const ordered=[...state.matches].sort((a,b)=>(a.scheduled_at||'').localeCompare(b.scheduled_at||'')); $('homeFixtures').innerHTML=ordered.filter(m=>m.status==='upcoming').slice(0,4).map(matchHTML).join('')||'<div class="empty">No upcoming fixtures yet.</div>';
    const filter=$('fixtureFilter')?.value||'all'; $('fixtureList').innerHTML=ordered.filter(m=>filter==='all'||(filter==='played'?m.status==='played':m.status==='upcoming')).map(matchHTML).join('')||'<div class="empty">No fixtures yet.</div>';
    $('teamsGrid').innerHTML=state.teams.map(t=>{const row=s.find(x=>x.id===t.id)||{};return `<button type="button" class="card team-card-button" data-team-profile="${esc(t.id)}"><div class="team-card-top">${teamMark(t)}<div class="team-card-heading"><h3>${esc(t.team_name)}</h3><span>${esc(t.region||'Europe')}</span></div></div><div class="team-card-record"><div><strong>${row.w||0}</strong><span>WINS</span></div><div><strong>${row.l||0}</strong><span>LOSSES</span></div><div><strong>${row.played||0}</strong><span>GAMES</span></div><div><strong>${row.pts||0}</strong><span>POINTS</span></div></div><div class="team-card-footer">Captain: ${esc(t.captain_name||'Not listed')}<span>VIEW TEAM ↗</span></div></button>`;}).join('')||'<div class="card empty">Team profiles will appear here after approval.</div>';
    $('tableSeason').textContent='SEASON 1';
    renderPlayers(); renderAgents(); renderStatsLeaderboard();
    const newsHtml=(state.news||[]).map(n=>`<article class="newsitem"><span class="pill">${esc(n.category||'Announcement')}</span><h4>${esc(n.title)}</h4><p>${esc(n.body)}</p><small class="tiny">${esc(fmt(n.created_at))}</small></article>`).join('')||'<div class="empty">No announcements yet.</div>'; if($('newsList'))$('newsList').innerHTML=newsHtml;if($('homeNews'))$('homeNews').innerHTML=(state.news||[]).slice(0,3).map(n=>`<div class="card"><span class="pill">${esc(n.category||'News')}</span><h3 style="margin-top:12px">${esc(n.title)}</h3><p class="muted">${esc(n.body.slice(0,180))}</p></div>`).join('')||'<div class="card empty">League announcements will appear here.</div>';
    const teamSelect=$('regPlayerTeam'); if(teamSelect){const current=teamSelect.value;teamSelect.innerHTML='<option value="">Free Agent / no team</option>'+state.teams.map(t=>`<option value="${t.id}">${esc(t.team_name)}</option>`).join('');teamSelect.value=current;}
  }
  function playerCard(p,isAgent=false){const teamName=isAgent?'Free Agent':(p.team_name||'Free Agent');return `<article class="epl-player-row">${playerAvatar(p)}<div class="epl-player-info"><b>${esc(p.display_name)}</b><span>@${esc(p.roblox_username)} · ${esc(teamName)}</span><small>${esc(p.position||'Player')}</small></div><div class="epl-player-stats">${statSummary(p.id)}</div><div class="epl-player-actions"><button class="btn" type="button" data-player-profile="${esc(p.id)}">View profile ↗</button></div></article>`;}
  function renderPlayerProfile(playerId){const p=[...state.players,...state.freeAgents].find(x=>String(x.id)===String(playerId));const panel=$('playerProfile');if(!p||!panel)return;const rows=state.stats.filter(x=>String(x.player_registration_id)===String(p.id));const keys=[['points','PTS'],['three_ps','3PM'],['rebounds','REB'],['assists','AST'],['steals','STL'],['blocks','BLK'],['fgs','FGM'],['fts','FTM'],['turnovers','TOV'],['fouls','PF'],['minutes','MIN'],['plus_minus','+/-']];const sum=k=>rows.reduce((n,x)=>n+(Number(x[k])||0),0);const games=new Set(rows.map(x=>x.match_id).filter(Boolean)).size;const metricHtml=keys.slice(0,8).map(([k,label])=>`<div class="player-profile-metric"><b>${sum(k)}</b><span>${label}</span></div>`).join('');const log=[...rows].sort((a,b)=>String(b.created_at||'').localeCompare(String(a.created_at||''))).map(r=>{const m=state.matches.find(x=>String(x.id)===String(r.match_id));return `<tr><td>${esc(m?matchName(m):'Match')}</td><td>${Number(r.points)||0}</td><td>${Number(r.three_ps)||0}</td><td>${Number(r.rebounds)||0}</td><td>${Number(r.assists)||0}</td><td>${Number(r.steals)||0}</td><td>${Number(r.blocks)||0}</td><td>${Number(r.minutes)||0}</td></tr>`;}).join('');panel.innerHTML=`<div class="player-profile-hero">${playerAvatar(p)}<div><div class="eyebrow">Official player profile</div><h2>${esc(p.display_name)}</h2><div>@${esc(p.roblox_username)} · ${esc(p.position||'Player')} · ${esc(p.team_name||'Free Agent')}</div></div><button class="btn player-profile-close" id="closePlayerProfile">Close ✕</button></div><div class="player-profile-metrics">${metricHtml}</div><div class="team-profile-record"><span class="pill">${games} GAMES WITH STATS</span><span class="pill">${sum('points')} CAREER POINTS</span><span class="pill">${sum('three_ps')} 3-POINTERS</span></div><div class="player-profile-log"><h3>Game-by-game statistics</h3>${log?`<div class="tablewrap"><table><thead><tr><th>Match</th><th>PTS</th><th>3PM</th><th>REB</th><th>AST</th><th>STL</th><th>BLK</th><th>MIN</th></tr></thead><tbody>${log}</tbody></table></div>`:'<div class="empty">No game statistics have been recorded for this player yet.</div>'}</div>`;panel.classList.remove('hidden');panel.scrollIntoView({behavior:'smooth',block:'start'});$('closePlayerProfile').onclick=()=>{panel.classList.add('hidden');panel.innerHTML='';};}

  function statSummary(id){const rows=state.stats.filter(s=>s.player_registration_id===id);if(!rows.length)return '<span class="tiny">No stats recorded yet</span>';const sum=k=>rows.reduce((n,r)=>n+(Number(r[k])||0),0);return `<span><b>${sum('points')}</b> PTS</span><span><b>${sum('rebounds')}</b> REB</span><span><b>${sum('assists')}</b> AST</span><span><b>${sum('steals')}</b> STL</span><span><b>${sum('blocks')}</b> BLK</span><span><b>${sum('turnovers')}</b> TO</span><span><b>${sum('fouls')}</b> PF</span><span><b>${sum('minutes')}</b> MIN</span>`;}

  function renderStatsLeaderboard(){
    const key=$('leaderCategory')?.value||'points',limit=Number($('leaderLimit')?.value||10);
    const labels={points:'Points',three_ps:'3-pointers made',rebounds:'Rebounds',assists:'Assists',steals:'Steals',blocks:'Blocks',plus_minus:'Plus / minus',fgs:'Field goals made',fts:'Free throws made'};
    const totals=new Map();
    state.stats.forEach(s=>{const p=state.players.find(x=>String(x.id)===String(s.player_registration_id));if(!p)return;const row=totals.get(p.id)||{player:p,value:0,games:new Set()};row.value+=Number(s[key])||0;row.games.add(s.match_id);totals.set(p.id,row);});
    const rows=[...totals.values()].filter(x=>x.value!==0).sort((a,b)=>b.value-a.value||String(a.player.display_name).localeCompare(String(b.player.display_name))).slice(0,limit);
    $('statsLeaderboard').innerHTML=rows.length?`<div class="tablewrap"><table><thead><tr><th>Rank</th><th>Player</th><th>Team</th><th>${esc(labels[key])}</th><th>Games</th></tr></thead><tbody>${rows.map((r,i)=>`<tr><td class="rank">${String(i+1).padStart(2,'0')}</td><td><b>${esc(r.player.display_name)}</b><div class="tiny">@${esc(r.player.roblox_username)}</div></td><td>${esc(r.player.team_name||'Free Agent')}</td><td><b>${r.value}</b></td><td>${r.games.size}</td></tr>`).join('')}</tbody></table></div>`:'<div class="empty">No statistics have been recorded for this category yet.</div>';
  }
  function renderPlayers(){const q=($('playerSearch')?.value||'').toLowerCase();const list=state.players.filter(p=>(p.display_name+' '+p.roblox_username+' '+(p.team_name||'')).toLowerCase().includes(q));$('playersTable').innerHTML=list.map(p=>playerCard(p,false)).join('')||'<div class="empty">No players match that search.</div>';}
  function renderAgents(){const q=($('agentSearch')?.value||'').toLowerCase();const list=state.freeAgents.filter(p=>(p.display_name+' '+p.roblox_username).toLowerCase().includes(q));$('freeAgentsList').innerHTML=list.map(p=>playerCard(p,true)).join('')||'<div class="empty">No approved free agents yet.</div>';}
  async function loadPublic(){try{const d=await publicApi();Object.assign(state,d);renderPublic();renderStatsLeaderboard();hydrateAvatars();}catch(e){console.error(e);}}
  function setPage(p){document.querySelectorAll('.page').forEach(x=>x.classList.remove('active'));$('page-'+p)?.classList.add('active');document.querySelectorAll('[data-page]').forEach(x=>x.classList.toggle('active',x.dataset.page===p));window.scrollTo({top:0,behavior:'smooth'});}
  window.eplPage=setPage;
  document.querySelectorAll('[data-page]').forEach(b=>b.addEventListener('click',()=>setPage(b.dataset.page)));
  document.querySelectorAll('[data-goto]').forEach(b=>b.addEventListener('click',()=>setPage(b.dataset.goto)));
  document.addEventListener('click',e=>{const b=e.target.closest('[data-team-profile]');if(b)renderTeamProfile(b.dataset.teamProfile);const playerButton=e.target.closest('[data-player-profile]');if(playerButton)renderPlayerProfile(playerButton.dataset.playerProfile);});
  $('adminNav').onclick=()=>window.openEplAdmin?.(); $('fixtureFilter').onchange=renderPublic;
  $('playerSearch').addEventListener('input',renderPlayers); $('agentSearch').addEventListener('input',renderAgents);
  async function uploadLogo(file){if(!file)return null;if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>2*1024*1024)throw new Error('Logo must be PNG, JPG or WEBP and under 2 MB.');const ext=file.type==='image/png'?'png':file.type==='image/webp'?'webp':'jpg';const path=`team-logos/${crypto.randomUUID()}.${ext}`;const {error}=await sb.storage.from('epl-team-logos').upload(path,file,{contentType:file.type,upsert:false});if(error)throw error;return sb.storage.from('epl-team-logos').getPublicUrl(path).data.publicUrl;}
  async function formSubmit(formId,action,msgId,withLogo=false){const form=$(formId);say(msgId,'Submitting…');try{const values=Object.fromEntries(new FormData(form).entries());if(withLogo){values.logo_url=await uploadLogo(form.querySelector('input[type=file]').files[0]);delete values.team_logo;}if(action==='register-player'){values.team_id=values.team_id||null;delete values.team_name;}const result=await publicApi('POST',{action,...values});form.reset();say(msgId,'✅ Submitted! Your registration is pending approval by EPL staff.');}catch(e){say(msgId,'⚠️ '+e.message);}}
  $('playerRegistrationForm').addEventListener('submit',e=>{e.preventDefault();formSubmit('playerRegistrationForm','register-player','playerRegistrationMsg')});
  $('freeAgentRegistrationForm').addEventListener('submit',e=>{e.preventDefault();formSubmit('freeAgentRegistrationForm','register-free-agent','freeAgentRegistrationMsg')});
  function options(el,items,label){$(el).innerHTML=`<option value="">${label}</option>`+items.map(x=>`<option value="${x.id}">${esc(x.team_name||x.display_name)}</option>`).join('');}
  function renderStatPlayerOptions(){
    const matchId=$('statMatch')?.value||'';
    const match=state.matches.find(m=>String(m.id)===String(matchId));
    const select=$('statPlayer');
    if(!select)return;
    if(!match){
      select.innerHTML='<option value="">Select a match first</option>';
      return;
    }
    const teamIds=new Set([String(match.home_team_id),String(match.away_team_id)]);
    const eligible=state.players.filter(p=>p.team_id!=null&&teamIds.has(String(p.team_id)));
    const unique=[...new Map(eligible.map(p=>[String(p.id),p])).values()];
    select.innerHTML='<option value="">Select player from this match</option>'+
      unique.map(p=>`<option value="${esc(p.id)}">${esc(p.display_name||p.roblox_username)} · ${esc(team(p.team_id).team_name)}</option>`).join('');
    if(!unique.length)select.innerHTML='<option value="">No approved players linked to either team</option>';
  }
  function renderPending(){
    const group=(items,type)=>items.length?items.map(x=>`<div class="epl-pending-row"><div><b>${esc(x.team_name||x.display_name)}</b><small>${type==='team'?`${esc(x.short_code)} · ${esc(x.captain_name)} · ${esc(x.captain_discord)}`:`@${esc(x.roblox_username)}${x.discord_username?' · '+esc(x.discord_username):''}`}</small>${x.logo_url?`<img class="epl-pending-logo" src="${esc(x.logo_url)}" alt="Team logo">`:''}</div><div class="formactions"><button class="btn primary" data-review="${type}" data-id="${x.id}" data-status="approved">Approve</button><button class="btn" data-review="${type}" data-id="${x.id}" data-status="rejected">Reject</button></div></div>`).join(''):'<div class="empty">No pending applications.</div>';
    $('pendingTeams').innerHTML=group(state.pendingTeams,'team');$('pendingPlayers').innerHTML=group(state.pendingPlayers,'player');$('pendingAgents').innerHTML=group(state.pendingAgents,'agent');
    document.querySelectorAll('[data-review]').forEach(b=>b.onclick=async()=>{b.disabled=true;try{await adminApi({action:'review',type:b.dataset.review,id:b.dataset.id,status:b.dataset.status});await loadAdmin();await loadPublic();}catch(e){alert(e.message);b.disabled=false;}});
  }
  async function loadAdmin(){try{const d=await adminApi({action:'admin-data'});state.pendingTeams=d.pendingTeams||[];state.pendingPlayers=d.pendingPlayers||[];state.pendingAgents=d.pendingAgents||[];state.adminTeams=(Array.isArray(d.teams)&&d.teams.length)?d.teams:state.teams;renderAdmin();if(!d.teams) say('teamAdminMsg','Showing approved public teams. Deploy the latest epl-api Edge Function to load pending/rejected teams here too.');}catch(e){say('adminDataMsg','⚠️ '+e.message);}}
  function renderAdmin(){
    options('matchHome',state.teams,'Select home team');options('matchAway',state.teams,'Select away team');options('resultMatch',state.matches.filter(m=>m.status==='upcoming'),'Select fixture');$('resultMatch').querySelectorAll('option:not(:first-child)').forEach(o=>{const m=state.matches.find(x=>x.id===o.value);if(m)o.textContent=matchName(m);});
    $('statMatch').innerHTML='<option value="">Select match</option>'+state.matches.map(m=>`<option value="${m.id}">${esc(matchName(m))} · ${esc(m.status)}</option>`).join('');
    renderStatPlayerOptions();
    renderPending();
    if($('manageTeam')){const selected=$('manageTeam').value;$('manageTeam').innerHTML='<option value="">Select team</option>'+state.adminTeams.map(t=>`<option value="${t.id}">${esc(t.team_name)} · ${esc(t.status||'approved')}</option>`).join('');$('manageTeam').value=selected;}
    if($('manageMatch'))$('manageMatch').innerHTML='<option value="">Select fixture</option>'+state.matches.map(m=>`<option value="${m.id}">${esc(matchName(m))} · ${esc(m.status)}</option>`).join('');
    if($('disciplineSubject'))$('disciplineSubject').innerHTML='<option value="">Select</option>'+[...state.teams.map(t=>({id:t.id,name:t.team_name,type:'team'})),...state.players.map(p=>({id:p.id,name:p.display_name,type:'player'}))].map(x=>`<option data-type="${x.type}" value="${x.id}">${esc(x.name)}</option>`).join('');
  }

  // Practical Basketball admin tools: screenshot intake + safe data maintenance.
  function installPbAdminTools(){
    const root=document.getElementById('adminContent');
    if(!root || document.getElementById('pbAdminTools')) return;
    const tools=document.createElement('section');
    tools.id='pbAdminTools';
    tools.innerHTML=`
      <div class="card" style="margin-top:16px">
        <h3>Match box-score screenshot</h3>
        <p class="muted">Upload a match screenshot. Text is read in your browser and shown for admin checking before you enter or approve stats. OCR can misread small numbers, so always compare it with the original image.</p>
        <input id="pbScoreImage" type="file" accept="image/png,image/jpeg,image/webp">
        <div id="pbScorePreview" style="margin:12px 0"></div>
        <button class="btn primary" id="pbRunOcr" type="button">Read screenshot</button>
        <p class="tiny" id="pbOcrStatus" aria-live="polite"></p>
        <textarea id="pbOcrText" rows="7" style="width:100%;margin-top:8px" placeholder="Recognised box-score text will appear here for review"></textarea>
        <p class="tiny">Expected columns: PTS, AST, REB, BLK, STL, FGS, 3PS, FTS, TOV, FLS, +/-.</p>
      </div>
      <div class="card" style="margin-top:16px">
        <h3>Database data management</h3>
        <p class="muted">Delete selected league records from Supabase. This does not delete admin appointments, Discord accounts, settings or storage files.</p>
        <div class="field"><label>Data category</label>
          <select id="pbClearCategory">
            <option value="matches">Fixtures and match results</option>
            <option value="stats">Player game statistics</option>
            <option value="players">Player registrations</option>
            <option value="free_agents">Free-agent registrations</option>
            <option value="teams">Team registrations</option>
            <option value="news">League news</option>
            <option value="discipline">Discipline records</option>
            <option value="disputes">Disputes</option>
          </select>
        </div>
        <button class="btn" id="pbClearData" type="button" style="margin-top:10px">Delete selected category</button>
        <p class="tiny" id="pbClearStatus" aria-live="polite"></p>
      </div>`;
    root.appendChild(tools);
    const file=document.getElementById('pbScoreImage');
    file.addEventListener('change',()=>{
      const f=file.files?.[0],preview=document.getElementById('pbScorePreview');
      if(!f){preview.innerHTML='';return;}
      if(f.size>8*1024*1024){file.value='';preview.textContent='Please choose an image smaller than 8 MB.';return;}
      const url=URL.createObjectURL(f);
      preview.innerHTML=`<img src="${url}" alt="Uploaded box score preview" style="max-width:100%;max-height:420px;object-fit:contain;border:1px solid #dce4f1;border-radius:10px">`;
    });
    document.getElementById('pbRunOcr').addEventListener('click',async()=>{
      const f=file.files?.[0],status=document.getElementById('pbOcrStatus'),target=document.getElementById('pbOcrText');
      if(!f){status.textContent='Choose a screenshot first.';return;}
      status.textContent='Loading OCR engine…';
      try{
        if(!window.Tesseract){
          await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';s.onload=resolve;s.onerror=reject;document.head.appendChild(s);});
        }
        status.textContent='Reading screenshot. This may take a little while…';
        const result=await window.Tesseract.recognize(f,'eng',{logger:m=>{if(m.status==='recognizing text')status.textContent=`Reading screenshot… ${Math.round((m.progress||0)*100)}%`;}});
        target.value=result.data.text||'No text recognised. Try a clearer screenshot.';
        status.textContent='OCR finished. Check every username and number against the screenshot before saving stats.';
      }catch(e){status.textContent='OCR could not run: '+(e.message||'Please try again.');}
    });
    document.getElementById('pbClearData').addEventListener('click',async()=>{
      const category=document.getElementById('pbClearCategory').value;
      const label=document.getElementById('pbClearCategory').selectedOptions[0].textContent;
      if(!confirm(`This will permanently delete ${label.toLowerCase()} from the league database. Continue?`))return;
      if(!confirm('Final confirmation: this cannot be undone. Delete this category?'))return;
      const status=document.getElementById('pbClearStatus');status.textContent='Deleting…';
      try{await adminApi({action:'admin-clear-data',category});status.textContent=`${label} deleted.`;await loadPublic();await loadAdmin();}
      catch(e){status.textContent='Could not delete records: '+e.message;}
    });
  }

  window.loadEplAdmin=async()=>{await loadPublic();await loadAdmin();installPbAdminTools();};
  $('createFixture').onclick=async()=>{try{await adminApi({action:'create-match',home_team_id:$('matchHome').value,away_team_id:$('matchAway').value,scheduled_at:$('matchDate').value?new Date($('matchDate').value).toISOString():null,match_note:$('matchNote').value});say('matchMsg','Fixture saved to the shared EPL database.');$('matchDate').value='';$('matchNote').value='';await loadPublic();await loadAdmin();}catch(e){say('matchMsg','⚠️ '+e.message);}};
  $('saveResult').onclick=async()=>{try{await adminApi({action:'save-result',match_id:$('resultMatch').value,home_score:$('homeScore').value,away_score:$('awayScore').value,evidence:$('evidence').value});say('resultMsg','Result saved. Public standings have updated.');$('homeScore').value='';$('awayScore').value='';$('evidence').value='';await loadPublic();await loadAdmin();}catch(e){say('resultMsg','⚠️ '+e.message);}};
  $('statMatch')?.addEventListener('change',renderStatPlayerOptions);
  $('savePlayerStats').onclick=async()=>{try{
    if(!$('statMatch').value)throw new Error('Select a match first.');
    if(!$('statPlayer').value)throw new Error('Select a player from one of the teams in this match.');
    const body={action:'save-player-stats',match_id:$('statMatch').value,player_registration_id:$('statPlayer').value};
    ['points','rebounds','assists','steals','blocks','turnovers','fouls','minutes','fgs','three_ps','fts','plus_minus'].forEach(k=>body[k]=$('stat_'+k).value);
    await adminApi(body);say('statsMsg','Player stats saved for this game.');await loadPublic();
  }catch(e){say('statsMsg','⚠️ '+e.message);}};
  function fillTeamEditor(){const t=state.adminTeams.find(x=>x.id===$('manageTeam')?.value);const panel=$('teamEditPanel');if(!t){panel?.classList.add('hidden');return;}panel.classList.remove('hidden');$('editTeamName').value=t.team_name||'';$('editTeamCode').value=t.short_code||'';$('editTeamRegion').value=t.region||'';$('editTeamCaptain').value=t.captain_name||'';$('editTeamDiscord').value=t.captain_discord||'';$('editTeamLogo').value=t.logo_url||'';$('editTeamStatus').value=t.status||'approved';$('editTeamPreviewName').textContent=t.team_name||'Team preview';$('editTeamLogoPreview').src=t.logo_url||'';$('editTeamLogoPreview').style.display=t.logo_url?'block':'none';}
  $('manageTeam')?.addEventListener('change',fillTeamEditor);
  ['editTeamName','editTeamLogo'].forEach(id=>$(id)?.addEventListener('input',()=>{if(id==='editTeamName')$('editTeamPreviewName').textContent=$(id).value||'Team preview';else $('editTeamLogoPreview').src=$(id).value;}));
  $('saveTeamDetails')?.addEventListener('click',async()=>{try{if(!$('manageTeam').value)throw new Error('Choose a team first.');await adminApi({action:'admin-team-update',team_id:$('manageTeam').value,team_name:$('editTeamName').value,short_code:$('editTeamCode').value,region:$('editTeamRegion').value,captain_name:$('editTeamCaptain').value,captain_discord:$('editTeamDiscord').value,logo_url:$('editTeamLogo').value,status:$('editTeamStatus').value});say('teamAdminMsg','All team details saved successfully.');await loadPublic();await loadAdmin();fillTeamEditor();}catch(e){say('teamAdminMsg','⚠️ '+e.message);}});
  $('deleteTeam')?.addEventListener('click',async()=>{const id=$('manageTeam').value,t=state.adminTeams.find(x=>x.id===id);if(!id||!t){say('teamAdminMsg','Choose a team first.');return;}if(!confirm(`Permanently delete ${t.team_name}? Players will become free agents and this team's fixtures and match statistics will be removed.`))return;if(!confirm('Final confirmation: this deletion cannot be undone. Delete this team?'))return;try{await adminApi({action:'admin-team-delete',team_id:id});say('teamAdminMsg',`${t.team_name} was deleted.`);$('manageTeam').value='';await loadPublic();await loadAdmin();fillTeamEditor();}catch(e){say('teamAdminMsg','⚠️ '+e.message);}});
  $('leaderCategory')?.addEventListener('change',renderStatsLeaderboard);$('leaderLimit')?.addEventListener('change',renderStatsLeaderboard);
  $('publishNews')?.addEventListener('click',async()=>{try{await adminApi({action:'admin-publish-news',title:$('newsTitle').value,body:$('newsBody').value,category:$('newsCategory').value});$('newsTitle').value='';$('newsBody').value='';say('newsAdminMsg','Announcement published.');await loadPublic();}catch(e){say('newsAdminMsg','⚠️ '+e.message);}});
  $('applyMatchAdmin')?.addEventListener('click',async()=>{try{const v=$('matchAdminType').value;await adminApi({action:'admin-manage-match',match_id:$('manageMatch').value,status:['cancelled','upcoming'].includes(v)?v:'played',result_type:v,home_score:$('manageHomeScore').value,away_score:$('manageAwayScore').value,admin_note:$('manageMatchNote').value});say('matchAdminMsg','Match updated.');await loadPublic();await loadAdmin();}catch(e){say('matchAdminMsg','⚠️ '+e.message);}});
  $('disciplineSubjectType')?.addEventListener('change',()=>{const typ=$('disciplineSubjectType').value;[...$('disciplineSubject').options].forEach(o=>{if(o.value)o.hidden=o.dataset.type!==typ;});});
  $('saveDiscipline')?.addEventListener('click',async()=>{try{const sel=$('disciplineSubject'),opt=sel.options[sel.selectedIndex];await adminApi({action:'admin-discipline',subject_type:$('disciplineSubjectType').value,subject_id:sel.value,subject_name:opt?.textContent,discipline_action:$('disciplineAction').value,details:$('disciplineDetails').value});$('disciplineDetails').value='';say('disciplineMsg','Discipline record saved.');}catch(e){say('disciplineMsg','⚠️ '+e.message);}});
  async function ownerApi(body){return adminApi(body);}
  async function refreshOwner(){
    const {data:{session}}=await sb.auth.getSession();
    const status=$('ownerAuthStatus'),panel=$('ownerDashboard'),identity=$('ownerIdentity'),robloxSetting=$('ownerRobloxSetting');
    if(!session){status.textContent='Not signed in';identity.hidden=true;robloxSetting.hidden=true;panel.style.display='none';return;}
    const meta=session.user.user_metadata||{};
    const discordName=meta.full_name||meta.name||meta.user_name||'Discord user';
    const robloxName=String(meta.roblox_username||'').trim();
    $('ownerRobloxUsername').value=robloxName;
    robloxSetting.hidden=false;
    const ownProfile={display_name:discordName,roblox_username:robloxName,avatar_url:''};
    if(robloxName)await hydratePeople([ownProfile]);
    const initials=String(discordName).trim().split(/\s+/).map(x=>x[0]).join('').slice(0,2).toUpperCase()||'E';
    identity.innerHTML=`${robloxName?playerAvatar(ownProfile,'owner-status-avatar'):`<span class="owner-avatar-unlinked">${esc(initials)}</span>`}<div><b>${esc(discordName)}</b><small>${robloxName?'Roblox · @'+esc(robloxName):'Discord account connected · add your Roblox username below'}</small></div>`;
    identity.hidden=false;
    status.textContent=robloxName?(ownProfile.avatar_url?'Roblox headshot loaded.':'Username saved, but no headshot loaded. Check the username and try saving again.'):'Link your Roblox username to display your headshot.';
    try{const d=await ownerApi({action:'owner-data'});state.ownedTeams=d.teams||[];state.ownerRoster=d.roster||[];state.availablePlayers=d.availablePlayers||[];await hydratePeople([...state.ownerRoster,...state.availablePlayers]);panel.style.display='block';renderOwner();}
    catch(e){status.textContent='Sign-in active · '+e.message;panel.style.display='none';}
  }
  function renderOwner(){
    $('ownerTeams').innerHTML=state.ownedTeams.length?state.ownedTeams.map(t=>`<div class="epl-owner-row"><div><b>${esc(t.team_name)}</b><small>${esc(t.short_code)} · ${esc(t.status)}${t.status==='pending'?' · Awaiting approval':''}</small></div></div>`).join(''):'<p class="muted">No teams are linked to this Discord account yet. Register a team above.</p>';
    const approved=state.ownedTeams.filter(t=>t.status==='approved');if(!approved.length){$('ownerRoster').innerHTML='';return;}
    const teamId=approved[0].id,roster=state.ownerRoster.filter(p=>p.team_id===teamId);
    const starters=roster.filter(p=>p.roster_role==='starter').length,subs=roster.length-starters;
    $('ownerRoster').innerHTML=`<h3 style="margin-top:18px">${esc(approved[0].team_name)} · Squad (${roster.length}/15)</h3><p class="tiny">${starters}/5 starters · ${subs}/10 substitutes</p>`+
      roster.map(p=>`<div class="epl-owner-row"><div class="epl-owner-person">${playerAvatar(p,'owner-avatar')}<div><b>${esc(p.display_name)}</b><small>@${esc(p.roblox_username)} · ${esc(p.roster_role||'starter')}</small></div></div><div class="epl-owner-actions"><button class="btn" data-role="${p.id}" data-team="${teamId}" data-next="${p.roster_role==='starter'?'substitute':'starter'}">Make ${p.roster_role==='starter'?'sub':'starting'} player</button><button class="btn" data-remove="${p.id}" data-team="${teamId}">Remove</button></div></div>`).join('')+
      `<div class="formgrid" style="margin-top:14px"><div class="field"><label>Add approved player</label><select id="ownerAddPlayer"><option value="">Select player</option>${state.availablePlayers.map(p=>`<option value="${p.id}">${esc(p.display_name)} (@${esc(p.roblox_username)})</option>`).join('')}</select></div><div class="field"><label>Squad role</label><select id="ownerAddRole"><option value="starter">Starter</option><option value="substitute">Substitute</option></select></div></div><button class="btn primary" id="ownerAddBtn" data-team="${teamId}">Add player to squad</button><p id="ownerMsg" class="tiny"></p>`;
    document.querySelectorAll('[data-remove]').forEach(b=>b.onclick=async()=>{if(!confirm('Remove this player from your squad?'))return;try{await ownerApi({action:'owner-remove-player',team_id:b.dataset.team,player_id:b.dataset.remove});await refreshOwner();await loadPublic();}catch(e){say('ownerMsg','⚠️ '+e.message);}});
    document.querySelectorAll('[data-role]').forEach(b=>b.onclick=async()=>{try{await ownerApi({action:'owner-set-role',team_id:b.dataset.team,player_id:b.dataset.role,roster_role:b.dataset.next});await refreshOwner();}catch(e){say('ownerMsg','⚠️ '+e.message);}});
    $('ownerAddBtn').onclick=async()=>{try{await ownerApi({action:'owner-add-player',team_id:teamId,player_id:$('ownerAddPlayer').value,roster_role:$('ownerAddRole').value});await refreshOwner();await loadPublic();}catch(e){say('ownerMsg','⚠️ '+e.message);}};
  }
  $('discordOwnerLogin').onclick=async()=>{const {error}=await sb.auth.signInWithOAuth({provider:'discord',options:{redirectTo:window.location.origin+window.location.pathname,scopes:'identify email'}});if(error)say('ownerAuthStatus','Discord sign-in failed: '+error.message);};
  $('saveOwnerRoblox').onclick=async()=>{
    const username=$('ownerRobloxUsername').value.trim();
    if(username.length<3){say('ownerAuthStatus','Enter your Roblox username first.');return;}
    const button=$('saveOwnerRoblox');button.disabled=true;button.textContent='Saving…';
    try{const {error}=await sb.auth.updateUser({data:{roblox_username:username}});if(error)throw error;avatarCache.delete(username.toLowerCase());await refreshOwner();}
    catch(error){say('ownerAuthStatus','Could not save Roblox username: '+(error.message||'Please try again.'));}
    finally{button.disabled=false;button.textContent='Save my Roblox avatar';}
  };
  $('ownerSignOut').onclick=async()=>{await sb.auth.signOut();await refreshOwner();};
  sb.auth.onAuthStateChange(()=>setTimeout(refreshOwner,0));
  $('teamRegistrationForm').addEventListener('submit',e=>{e.preventDefault();formSubmit('teamRegistrationForm','register-team','teamRegistrationMsg',true)});
  loadPublic(); refreshOwner();
})();