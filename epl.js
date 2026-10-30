(() => {
  const URL = 'https://ethvowgzdozeljxivwwy.supabase.co';
  const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV0aHZvd2d6ZG96ZWxqeGl2d3d5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI5NjI0MDMsImV4cCI6MjEwODUzODQwM30.kIYs6RIZqYC_fA-V6fAzwYX_Pt6J2DTRUsWIIREP2Uw';
  const API = URL + '/functions/v1/epl-api';
  const sb = window.supabase.createClient(URL, KEY);
  const state = { teams:[], players:[], freeAgents:[], matches:[], stats:[], pendingTeams:[], pendingPlayers:[], pendingAgents:[] };
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const say = (id,t) => { const el=$(id); if(el) el.textContent=t; };
  async function publicApi(method='GET',body=null){
    const r=await fetch(API,{method,headers:{apikey:KEY,Authorization:'Bearer '+KEY,'Content-Type':'application/json',Accept:'application/json'},...(body?{body:JSON.stringify(body)}:{})});
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
  function avatarUrl(url){return url || 'https://tr.rbxcdn.com/30DAY-AvatarHeadshot-PLACEHOLDER/150/150/AvatarHeadshot/Webp/noFilter';}
  async function getAvatar(username){
    try { const u=await fetch('https://users.roblox.com/v1/usernames/users',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({usernames:[username],excludeBannedUsers:true})}); const ud=await u.json(); const id=ud.data?.[0]?.id; if(!id)return ''; const t=await fetch(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${id}&size=150x150&format=Png&isCircular=false`); const td=await t.json(); return td.data?.[0]?.imageUrl||''; } catch { return ''; }
  }
  async function hydrateAvatars(){
    const people=[...state.players,...state.freeAgents];
    await Promise.all(people.filter(p=>!p.avatar_url&&!p._avatarTried).map(async p=>{p._avatarTried=true;p.avatar_url=await getAvatar(p.roblox_username);}));
    renderPlayers(); renderAgents();
  }
  function teamMark(t){return t.logo_url?`<img class="epl-team-logo" src="${esc(t.logo_url)}" alt="">`:`<span class="teammark">${esc(t.short_code||'EPL')}</span>`;}
  function standings(){return state.teams.map(t=>{let ms=state.matches.filter(m=>m.status==='played'&&(m.home_team_id===t.id||m.away_team_id===t.id));let w=0,l=0,pf=0,pa=0;ms.forEach(m=>{let h=m.home_team_id===t.id,f=h?m.home_score:m.away_score,a=h?m.away_score:m.home_score;pf+=f||0;pa+=a||0;if(f>a)w++;else if(f<a)l++;});return {...t,played:ms.length,w,l,pf,pa,diff:pf-pa,pts:w*2};}).sort((a,b)=>b.pts-a.pts||b.diff-a.diff||b.pf-a.pf);}
  function tableHTML(rows){if(!rows.length)return '<div class="empty">No approved teams yet.</div>';return `<table><thead><tr><th>#</th><th>Team</th><th>P</th><th>W</th><th>L</th><th>PF</th><th>PA</th><th>+/-</th><th>Pts</th></tr></thead><tbody>${rows.map((t,i)=>`<tr><td class="rank">${String(i+1).padStart(2,'0')}</td><td>${teamMark(t)} <b>${esc(t.team_name)}</b></td><td>${t.played}</td><td>${t.w}</td><td>${t.l}</td><td>${t.pf}</td><td>${t.pa}</td><td>${t.diff>0?'+':''}${t.diff}</td><td><b>${t.pts}</b></td></tr>`).join('')}</tbody></table>`;}
  function matchHTML(m){return `<div class="match"><div><div class="date">${esc(fmt(m.scheduled_at))} · ${esc(m.match_note||'EPL MATCH')}</div><div class="matchteams" style="margin-top:9px"><span>${esc(team(m.home_team_id).team_name)}</span><span>${esc(team(m.away_team_id).team_name)}</span></div></div><div class="score">${m.status==='played'?`${m.home_score} : ${m.away_score}`:'VS'}</div><span class="pill">${m.status==='played'?'FT':'SCHEDULED'}</span></div>`;}
  function renderPublic(){
    const played=state.matches.filter(m=>m.status==='played'); $('statTeams').textContent=state.teams.length; $('statPlayed').textContent=played.length; $('statPlayers').textContent=state.players.length+state.freeAgents.length;
    const s=standings(); $('homeStandings').innerHTML=tableHTML(s.slice(0,5)); $('standingsTable').innerHTML=tableHTML(s);
    const ordered=[...state.matches].sort((a,b)=>(a.scheduled_at||'').localeCompare(b.scheduled_at||'')); $('homeFixtures').innerHTML=ordered.filter(m=>m.status==='upcoming').slice(0,4).map(matchHTML).join('')||'<div class="empty">No upcoming fixtures yet.</div>';
    const filter=$('fixtureFilter')?.value||'all'; $('fixtureList').innerHTML=ordered.filter(m=>filter==='all'||(filter==='played'?m.status==='played':m.status==='upcoming')).map(matchHTML).join('')||'<div class="empty">No fixtures yet.</div>';
    $('teamsGrid').innerHTML=state.teams.map(t=>`<div class="card">${teamMark(t)}<h3 style="margin-top:13px">${esc(t.team_name)}</h3><p class="muted">${esc(t.region||'Europe')}</p><p class="tiny">Captain: ${esc(t.captain_name||'Not listed')}</p><span class="pill">${(s.find(x=>x.id===t.id)||{}).pts||0} points</span></div>`).join('')||'<div class="card empty">Team profiles will appear here after approval.</div>';
    $('tableSeason').textContent='SEASON 1';
    renderPlayers(); renderAgents();
  }
  function playerCard(p,isAgent=false){const teamName=isAgent?'Free Agent':(p.team_name||'Free Agent');return `<div class="epl-player-row"><img class="epl-avatar" src="${esc(p.avatar_url||'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=')}" alt="${esc(p.roblox_username)} avatar"><div class="epl-player-info"><b>${esc(p.display_name)}</b><span>@${esc(p.roblox_username)} · ${esc(teamName)}</span><small>${esc(p.position||'Player')}</small></div><div class="epl-player-stats">${statSummary(p.id)}</div></div>`;}
  function statSummary(id){const rows=state.stats.filter(s=>s.player_registration_id===id);if(!rows.length)return '<span class="tiny">No stats recorded yet</span>';const sum=k=>rows.reduce((n,r)=>n+(Number(r[k])||0),0);return `<span><b>${sum('points')}</b> PTS</span><span><b>${sum('rebounds')}</b> REB</span><span><b>${sum('assists')}</b> AST</span><span><b>${sum('steals')}</b> STL</span><span><b>${sum('blocks')}</b> BLK</span><span><b>${sum('turnovers')}</b> TO</span><span><b>${sum('fouls')}</b> PF</span><span><b>${sum('minutes')}</b> MIN</span>`;}
  function renderPlayers(){const q=($('playerSearch')?.value||'').toLowerCase();const list=state.players.filter(p=>(p.display_name+' '+p.roblox_username+' '+(p.team_name||'')).toLowerCase().includes(q));$('playersTable').innerHTML=list.map(p=>playerCard(p,false)).join('')||'<div class="empty">No players match that search.</div>';}
  function renderAgents(){const q=($('agentSearch')?.value||'').toLowerCase();const list=state.freeAgents.filter(p=>(p.display_name+' '+p.roblox_username).toLowerCase().includes(q));$('freeAgentsList').innerHTML=list.map(p=>playerCard(p,true)).join('')||'<div class="empty">No approved free agents yet.</div>';}
  async function loadPublic(){try{const d=await publicApi();Object.assign(state,d);renderPublic();hydrateAvatars();}catch(e){console.error(e);}}
  function setPage(p){document.querySelectorAll('.page').forEach(x=>x.classList.remove('active'));$('page-'+p)?.classList.add('active');document.querySelectorAll('[data-page]').forEach(x=>x.classList.toggle('active',x.dataset.page===p));window.scrollTo({top:0,behavior:'smooth'});}
  window.eplPage=setPage;
  document.querySelectorAll('[data-page]').forEach(b=>b.addEventListener('click',()=>setPage(b.dataset.page)));
  document.querySelectorAll('[data-goto]').forEach(b=>b.addEventListener('click',()=>setPage(b.dataset.goto)));
  $('adminNav').onclick=()=>window.openEplAdmin?.(); $('fixtureFilter').onchange=renderPublic;
  $('playerSearch').addEventListener('input',renderPlayers); $('agentSearch').addEventListener('input',renderAgents);
  async function uploadLogo(file){if(!file)return null;if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>2*1024*1024)throw new Error('Logo must be PNG, JPG or WEBP and under 2 MB.');const ext=file.type==='image/png'?'png':file.type==='image/webp'?'webp':'jpg';const path=`team-logos/${crypto.randomUUID()}.${ext}`;const {error}=await sb.storage.from('epl-team-logos').upload(path,file,{contentType:file.type,upsert:false});if(error)throw error;return sb.storage.from('epl-team-logos').getPublicUrl(path).data.publicUrl;}
  async function formSubmit(formId,action,msgId,withLogo=false){const form=$(formId);say(msgId,'Submitting…');try{const values=Object.fromEntries(new FormData(form).entries());if(withLogo){values.logo_url=await uploadLogo(form.querySelector('input[type=file]').files[0]);delete values.team_logo;}const result=await publicApi('POST',{action,...values});form.reset();say(msgId,'✅ Submitted! Your registration is pending approval by EPL staff.');}catch(e){say(msgId,'⚠️ '+e.message);}}
  $('teamRegistrationForm').addEventListener('submit',e=>{e.preventDefault();formSubmit('teamRegistrationForm','register-team','teamRegistrationMsg',true)});
  $('playerRegistrationForm').addEventListener('submit',e=>{e.preventDefault();formSubmit('playerRegistrationForm','register-player','playerRegistrationMsg')});
  $('freeAgentRegistrationForm').addEventListener('submit',e=>{e.preventDefault();formSubmit('freeAgentRegistrationForm','register-free-agent','freeAgentRegistrationMsg')});
  function options(el,items,label){$(el).innerHTML=`<option value="">${label}</option>`+items.map(x=>`<option value="${x.id}">${esc(x.team_name||x.display_name)}</option>`).join('');}
  function renderPending(){
    const group=(items,type)=>items.length?items.map(x=>`<div class="epl-pending-row"><div><b>${esc(x.team_name||x.display_name)}</b><small>${type==='team'?`${esc(x.short_code)} · ${esc(x.captain_name)} · ${esc(x.captain_discord)}`:`@${esc(x.roblox_username)}${x.discord_username?' · '+esc(x.discord_username):''}`}</small>${x.logo_url?`<img class="epl-pending-logo" src="${esc(x.logo_url)}" alt="Team logo">`:''}</div><div class="formactions"><button class="btn primary" data-review="${type}" data-id="${x.id}" data-status="approved">Approve</button><button class="btn" data-review="${type}" data-id="${x.id}" data-status="rejected">Reject</button></div></div>`).join(''):'<div class="empty">No pending applications.</div>';
    $('pendingTeams').innerHTML=group(state.pendingTeams,'team');$('pendingPlayers').innerHTML=group(state.pendingPlayers,'player');$('pendingAgents').innerHTML=group(state.pendingAgents,'agent');
    document.querySelectorAll('[data-review]').forEach(b=>b.onclick=async()=>{b.disabled=true;try{await adminApi({action:'review',type:b.dataset.review,id:b.dataset.id,status:b.dataset.status});await loadAdmin();await loadPublic();}catch(e){alert(e.message);b.disabled=false;}});
  }
  async function loadAdmin(){try{const d=await adminApi({action:'admin-data'});state.pendingTeams=d.pendingTeams||[];state.pendingPlayers=d.pendingPlayers||[];state.pendingAgents=d.pendingAgents||[];renderAdmin();}catch(e){say('adminDataMsg','⚠️ '+e.message);}}
  function renderAdmin(){
    options('matchHome',state.teams,'Select home team');options('matchAway',state.teams,'Select away team');options('resultMatch',state.matches.filter(m=>m.status==='upcoming'),'Select fixture');$('resultMatch').querySelectorAll('option:not(:first-child)').forEach(o=>{const m=state.matches.find(x=>x.id===o.value);if(m)o.textContent=matchName(m);});
    const players=state.players;options('statPlayer',players,'Select player');$('statMatch').innerHTML='<option value="">Select match</option>'+state.matches.map(m=>`<option value="${m.id}">${esc(matchName(m))} · ${esc(m.status)}</option>`).join('');
    renderPending();
  }
  window.loadEplAdmin=async()=>{await loadPublic();await loadAdmin();};
  $('createFixture').onclick=async()=>{try{await adminApi({action:'create-match',home_team_id:$('matchHome').value,away_team_id:$('matchAway').value,scheduled_at:$('matchDate').value?new Date($('matchDate').value).toISOString():null,match_note:$('matchNote').value});say('matchMsg','Fixture saved to the shared EPL database.');$('matchDate').value='';$('matchNote').value='';await loadPublic();await loadAdmin();}catch(e){say('matchMsg','⚠️ '+e.message);}};
  $('saveResult').onclick=async()=>{try{await adminApi({action:'save-result',match_id:$('resultMatch').value,home_score:$('homeScore').value,away_score:$('awayScore').value,evidence:$('evidence').value});say('resultMsg','Result saved. Public standings have updated.');$('homeScore').value='';$('awayScore').value='';$('evidence').value='';await loadPublic();await loadAdmin();}catch(e){say('resultMsg','⚠️ '+e.message);}};
  $('savePlayerStats').onclick=async()=>{try{const body={action:'save-player-stats',match_id:$('statMatch').value,player_registration_id:$('statPlayer').value};['points','rebounds','assists','steals','blocks','turnovers','fouls','minutes'].forEach(k=>body[k]=$('stat_'+k).value);await adminApi(body);say('statsMsg','Player stats saved for this game.');await loadPublic();}catch(e){say('statsMsg','⚠️ '+e.message);}};
  loadPublic();
})();
