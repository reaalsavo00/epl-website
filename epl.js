(() => {
  const URL = 'https://ethvowgzdozeljxivwwy.supabase.co';
  const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV0aHZvd2d6ZG96ZWxqeGl2d3d5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI5NjI0MDMsImV4cCI6MjEwODUzODQwM30.kIYs6RIZqYC_fA-V6fAzwYX_Pt6J2DTRUsWIIREP2Uw';
  const API = URL + '/functions/v1/epl-api';
  const sb = window.supabase.createClient(URL, KEY);
  const state = { teams:[], players:[], freeAgents:[], matches:[], stats:[], pendingTeams:[], pendingPlayers:[], pendingAgents:[], news:[], ownedTeams:[], ownerRoster:[], availablePlayers:[] };
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
  function matchHTML(m){const home=team(m.home_team_id),away=team(m.away_team_id);return `<div class="match"><div class="date">${esc(fmt(m.scheduled_at))} · ${esc(m.match_note||'EPL MATCH')}</div><div class="matchup"><div class="match-side home">${teamMark(home)}<b>${esc(home.team_name)}</b></div><div class="match-centre"><div class="score">${m.status==='played'?`${m.home_score} <span>:</span> ${m.away_score}`:'VS'}</div><span class="pill">${m.status==='played'?'FT':'SCHEDULED'}</span></div><div class="match-side away"><b>${esc(away.team_name)}</b>${teamMark(away)}</div></div></div>`;}
  function renderPublic(){
    const played=state.matches.filter(m=>m.status==='played'); $('statTeams').textContent=state.teams.length; $('statPlayed').textContent=played.length; $('statPlayers').textContent=state.players.length+state.freeAgents.length;
    const s=standings(); $('homeStandings').innerHTML=tableHTML(s.slice(0,5)); $('standingsTable').innerHTML=tableHTML(s);
    const ordered=[...state.matches].sort((a,b)=>(a.scheduled_at||'').localeCompare(b.scheduled_at||'')); $('homeFixtures').innerHTML=ordered.filter(m=>m.status==='upcoming').slice(0,4).map(matchHTML).join('')||'<div class="empty">No upcoming fixtures yet.</div>';
    const filter=$('fixtureFilter')?.value||'all'; $('fixtureList').innerHTML=ordered.filter(m=>filter==='all'||(filter==='played'?m.status==='played':m.status==='upcoming')).map(matchHTML).join('')||'<div class="empty">No fixtures yet.</div>';
    $('teamsGrid').innerHTML=state.teams.map(t=>`<div class="card">${teamMark(t)}<h3 style="margin-top:13px">${esc(t.team_name)}</h3><p class="muted">${esc(t.region||'Europe')}</p><p class="tiny">Captain: ${esc(t.captain_name||'Not listed')}</p><span class="pill">${(s.find(x=>x.id===t.id)||{}).pts||0} points</span></div>`).join('')||'<div class="card empty">Team profiles will appear here after approval.</div>';
    $('tableSeason').textContent='SEASON 1';
    renderPlayers(); renderAgents();
    const newsHtml=(state.news||[]).map(n=>`<article class="newsitem"><span class="pill">${esc(n.category||'Announcement')}</span><h4>${esc(n.title)}</h4><p>${esc(n.body)}</p><small class="tiny">${esc(fmt(n.created_at))}</small></article>`).join('')||'<div class="empty">No announcements yet.</div>'; if($('newsList'))$('newsList').innerHTML=newsHtml;if($('homeNews'))$('homeNews').innerHTML=(state.news||[]).slice(0,3).map(n=>`<div class="card"><span class="pill">${esc(n.category||'News')}</span><h3 style="margin-top:12px">${esc(n.title)}</h3><p class="muted">${esc(n.body.slice(0,180))}</p></div>`).join('')||'<div class="card empty">League announcements will appear here.</div>';
    const teamSelect=$('regPlayerTeam'); if(teamSelect){const current=teamSelect.value;teamSelect.innerHTML='<option value="">Free Agent / no team</option>'+state.teams.map(t=>`<option value="${t.id}">${esc(t.team_name)}</option>`).join('');teamSelect.value=current;}
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
  async function formSubmit(formId,action,msgId,withLogo=false){const form=$(formId);say(msgId,'Submitting…');try{const values=Object.fromEntries(new FormData(form).entries());if(withLogo){values.logo_url=await uploadLogo(form.querySelector('input[type=file]').files[0]);delete values.team_logo;}if(action==='register-player'){values.team_id=values.team_id||null;delete values.team_name;}const result=await publicApi('POST',{action,...values});form.reset();say(msgId,'✅ Submitted! Your registration is pending approval by EPL staff.');}catch(e){say(msgId,'⚠️ '+e.message);}}
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
    if($('manageTeam'))$('manageTeam').innerHTML='<option value="">Select team</option>'+state.teams.map(t=>`<option value="${t.id}">${esc(t.team_name)}</option>`).join('');
    if($('manageMatch'))$('manageMatch').innerHTML='<option value="">Select fixture</option>'+state.matches.map(m=>`<option value="${m.id}">${esc(matchName(m))} · ${esc(m.status)}</option>`).join('');
    if($('disciplineSubject'))$('disciplineSubject').innerHTML='<option value="">Select</option>'+[...state.teams.map(t=>({id:t.id,name:t.team_name,type:'team'})),...state.players.map(p=>({id:p.id,name:p.display_name,type:'player'}))].map(x=>`<option data-type="${x.type}" value="${x.id}">${esc(x.name)}</option>`).join('');
  }
  window.loadEplAdmin=async()=>{await loadPublic();await loadAdmin();};
  $('createFixture').onclick=async()=>{try{await adminApi({action:'create-match',home_team_id:$('matchHome').value,away_team_id:$('matchAway').value,scheduled_at:$('matchDate').value?new Date($('matchDate').value).toISOString():null,match_note:$('matchNote').value});say('matchMsg','Fixture saved to the shared EPL database.');$('matchDate').value='';$('matchNote').value='';await loadPublic();await loadAdmin();}catch(e){say('matchMsg','⚠️ '+e.message);}};
  $('saveResult').onclick=async()=>{try{await adminApi({action:'save-result',match_id:$('resultMatch').value,home_score:$('homeScore').value,away_score:$('awayScore').value,evidence:$('evidence').value});say('resultMsg','Result saved. Public standings have updated.');$('homeScore').value='';$('awayScore').value='';$('evidence').value='';await loadPublic();await loadAdmin();}catch(e){say('resultMsg','⚠️ '+e.message);}};
  $('savePlayerStats').onclick=async()=>{try{const body={action:'save-player-stats',match_id:$('statMatch').value,player_registration_id:$('statPlayer').value};['points','rebounds','assists','steals','blocks','turnovers','fouls','minutes'].forEach(k=>body[k]=$('stat_'+k).value);await adminApi(body);say('statsMsg','Player stats saved for this game.');await loadPublic();}catch(e){say('statsMsg','⚠️ '+e.message);}};
  $('manageTeam')?.addEventListener('change',()=>{const t=state.teams.find(x=>x.id===$('manageTeam').value);if(!t)return;$('editTeamName').value=t.team_name||'';$('editTeamCode').value=t.short_code||'';$('editTeamRegion').value=t.region||'';$('editTeamCaptain').value=t.captain_name||'';});
  $('saveTeamDetails')?.addEventListener('click',async()=>{try{await adminApi({action:'admin-team-update',team_id:$('manageTeam').value,team_name:$('editTeamName').value,short_code:$('editTeamCode').value,region:$('editTeamRegion').value,captain_name:$('editTeamCaptain').value});say('teamAdminMsg','Team details updated.');await loadPublic();await loadAdmin();}catch(e){say('teamAdminMsg','⚠️ '+e.message);}});
  $('publishNews')?.addEventListener('click',async()=>{try{await adminApi({action:'admin-publish-news',title:$('newsTitle').value,body:$('newsBody').value,category:$('newsCategory').value});$('newsTitle').value='';$('newsBody').value='';say('newsAdminMsg','Announcement published.');await loadPublic();}catch(e){say('newsAdminMsg','⚠️ '+e.message);}});
  $('applyMatchAdmin')?.addEventListener('click',async()=>{try{const v=$('matchAdminType').value;await adminApi({action:'admin-manage-match',match_id:$('manageMatch').value,status:['cancelled','upcoming'].includes(v)?v:'played',result_type:v,home_score:$('manageHomeScore').value,away_score:$('manageAwayScore').value,admin_note:$('manageMatchNote').value});say('matchAdminMsg','Match updated.');await loadPublic();await loadAdmin();}catch(e){say('matchAdminMsg','⚠️ '+e.message);}});
  $('disciplineSubjectType')?.addEventListener('change',()=>{const typ=$('disciplineSubjectType').value;[...$('disciplineSubject').options].forEach(o=>{if(o.value)o.hidden=o.dataset.type!==typ;});});
  $('saveDiscipline')?.addEventListener('click',async()=>{try{const sel=$('disciplineSubject'),opt=sel.options[sel.selectedIndex];await adminApi({action:'admin-discipline',subject_type:$('disciplineSubjectType').value,subject_id:sel.value,subject_name:opt?.textContent,discipline_action:$('disciplineAction').value,details:$('disciplineDetails').value});$('disciplineDetails').value='';say('disciplineMsg','Discipline record saved.');}catch(e){say('disciplineMsg','⚠️ '+e.message);}});
  async function ownerApi(body){return adminApi(body);}
  async function refreshOwner(){
    const {data:{session}}=await sb.auth.getSession();
    const status=$('ownerAuthStatus'),panel=$('ownerDashboard');
    if(!session){status.textContent='Not signed in';panel.style.display='none';return;}
    const meta=session.user.user_metadata||{};status.textContent='Signed in as '+(meta.full_name||meta.name||meta.user_name||'Discord user');
    try{const d=await ownerApi({action:'owner-data'});state.ownedTeams=d.teams||[];state.ownerRoster=d.roster||[];state.availablePlayers=d.availablePlayers||[];panel.style.display='block';renderOwner();}
    catch(e){status.textContent='Sign-in active · '+e.message;panel.style.display='none';}
  }
  function renderOwner(){
    $('ownerTeams').innerHTML=state.ownedTeams.length?state.ownedTeams.map(t=>`<div class="epl-owner-row"><div><b>${esc(t.team_name)}</b><small>${esc(t.short_code)} · ${esc(t.status)}${t.status==='pending'?' · Awaiting approval':''}</small></div></div>`).join(''):'<p class="muted">No teams are linked to this Discord account yet. Register a team above.</p>';
    const approved=state.ownedTeams.filter(t=>t.status==='approved');if(!approved.length){$('ownerRoster').innerHTML='';return;}
    const teamId=approved[0].id,roster=state.ownerRoster.filter(p=>p.team_id===teamId);
    const starters=roster.filter(p=>p.roster_role==='starter').length,subs=roster.length-starters;
    $('ownerRoster').innerHTML=`<h3 style="margin-top:18px">${esc(approved[0].team_name)} · Squad (${roster.length}/15)</h3><p class="tiny">${starters}/5 starters · ${subs}/10 substitutes</p>`+
      roster.map(p=>`<div class="epl-owner-row"><div><b>${esc(p.display_name)}</b><small>@${esc(p.roblox_username)} · ${esc(p.roster_role||'starter')}</small></div><div class="epl-owner-actions"><button class="btn" data-role="${p.id}" data-team="${teamId}" data-next="${p.roster_role==='starter'?'substitute':'starter'}">Make ${p.roster_role==='starter'?'sub':'starting'} player</button><button class="btn" data-remove="${p.id}" data-team="${teamId}">Remove</button></div></div>`).join('')+
      `<div class="formgrid" style="margin-top:14px"><div class="field"><label>Add approved player</label><select id="ownerAddPlayer"><option value="">Select player</option>${state.availablePlayers.map(p=>`<option value="${p.id}">${esc(p.display_name)} (@${esc(p.roblox_username)})</option>`).join('')}</select></div><div class="field"><label>Squad role</label><select id="ownerAddRole"><option value="starter">Starter</option><option value="substitute">Substitute</option></select></div></div><button class="btn primary" id="ownerAddBtn" data-team="${teamId}">Add player to squad</button><p id="ownerMsg" class="tiny"></p>`;
    document.querySelectorAll('[data-remove]').forEach(b=>b.onclick=async()=>{if(!confirm('Remove this player from your squad?'))return;try{await ownerApi({action:'owner-remove-player',team_id:b.dataset.team,player_id:b.dataset.remove});await refreshOwner();await loadPublic();}catch(e){say('ownerMsg','⚠️ '+e.message);}});
    document.querySelectorAll('[data-role]').forEach(b=>b.onclick=async()=>{try{await ownerApi({action:'owner-set-role',team_id:b.dataset.team,player_id:b.dataset.role,roster_role:b.dataset.next});await refreshOwner();}catch(e){say('ownerMsg','⚠️ '+e.message);}});
    $('ownerAddBtn').onclick=async()=>{try{await ownerApi({action:'owner-add-player',team_id:teamId,player_id:$('ownerAddPlayer').value,roster_role:$('ownerAddRole').value});await refreshOwner();await loadPublic();}catch(e){say('ownerMsg','⚠️ '+e.message);}};
  }
  $('discordOwnerLogin').onclick=async()=>{const {error}=await sb.auth.signInWithOAuth({provider:'discord',options:{redirectTo:window.location.origin+window.location.pathname,scopes:'identify email'}});if(error)say('ownerAuthStatus','Discord sign-in failed: '+error.message);};
  $('ownerSignOut').onclick=async()=>{await sb.auth.signOut();await refreshOwner();};
  sb.auth.onAuthStateChange(()=>setTimeout(refreshOwner,0));
  $('teamRegistrationForm').addEventListener('submit',e=>{e.preventDefault();formSubmit('teamRegistrationForm','register-team','teamRegistrationMsg',true)});
  loadPublic(); refreshOwner();
})();
