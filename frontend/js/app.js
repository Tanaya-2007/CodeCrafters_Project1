// SarkariTrack shell v5 — role-based access (user vs admin) + mobile tabbar
(function(){
  const page = document.body.dataset.page || "";
  const user = currentUser();
  const role = currentRole();
  const adminPages = ["admin","admin-sources","admin-review","admin-changes","admin-jobs"];
  const publicPages = ["login","admin-login","register","landing"];
  const isAdminPage = adminPages.includes(page);
  if(!publicPages.includes(page)){
    if(isAdminPage){
      if(role!=="admin"){ location.href = "admin-login.html"; return; }
    }else{
      if(role!=="user"||!user){ location.href = "login.html"; return; }
    }
  }
  const isAdmin = isAdminPage;
  const userLinks = [
    ["dashboard.html","◉","Dashboard","dashboard","Home & deadlines"],
    ["explore.html","⌕","Explore","explore","Search all exams"],
    ["tracker.html","✓","Tracker","tracker","My applications"],
    ["notifications.html","🔔","Alerts","notifications","Deadlines & updates"],
    ["history.html","◷","History","history","Official changes"],
    ["profile.html","⚙","Profile","profile","Settings & prefs"],
  ];
  const adminLinks = [
    ["admin.html","◉","Overview","admin","Health"],
    ["admin-sources.html","◈","Sources","admin-sources","Official portals"],
    ["admin-review.html","◎","Review","admin-review","Ambiguous queue"],
    ["admin-changes.html","✦","Changes","admin-changes","Field diffs"],
    ["admin-jobs.html","≡","Jobs","admin-jobs","Scheduler logs"],
  ];
  const links = isAdmin ? adminLinks : userLinks;
  const side = document.getElementById("side");
  if(side){
    let html = '<div class="brand"><span class="mark">S</span><div>SarkariTrack<small>' + (isAdmin?"ADMIN CONSOLE":"CANDIDATE SPACE") + '</small></div></div>';
    html += '<div class="slabel">' + (isAdmin?"Manage":"Menu") + '</div>';
    html += links.map(function(l){ return '<a class="slink ' + (page===l[3]?"on":"") + '" href="' + l[0] + '"><span class="ic">' + l[1] + '</span><span>' + l[2] + '<small>' + l[4] + '</small></span></a>'; }).join("");
    side.innerHTML = html;
  }
  const top = document.getElementById("top");
  if(top){
    const home = isAdmin ? "admin.html" : "dashboard.html";
    const notifBtn = isAdmin ? "" : '<button class="abtn light" aria-label="Notifications" onclick="location.href=\'notifications.html\'">🔔 <span id="bellN"></span></button>';
    const profBtn = isAdmin
      ? '<button class="abtn" onclick="adminLogout()">⏻ Admin</button>'
      : '<button class="abtn" onclick="location.href=\'profile.html\'">👤 ' + ((user||"").split("@")[0]||"Account") + '</button>';
    top.innerHTML = '<a class="mlogo" href="' + home + '"><span class="mark">S</span>SarkariTrack</a>'
    + '<div class="search"><span>⌕</span><input id="topq" enterkeyhint="search" placeholder="Search exams…" onkeydown="if(event.key===\'Enter\')goExplore()"></div>'
    + '<div class="top-actions">' + notifBtn + profBtn + '</div>';
    const b = document.getElementById("bellN");
    if(b && !isAdmin){ const n = pendingAlerts().length; b.textContent = n ? "(" + n + ")" : ""; }
  }
  if(!isAdmin && !document.querySelector(".tabbar")){
    const tabs = [["dashboard.html","◉","Home","dashboard"],["explore.html","⌕","Explore","explore"],["tracker.html","✓","Tracker","tracker"],["notifications.html","🔔","Alerts","notifications"],["profile.html","⚙","You","profile"]];
    const bar = document.createElement("nav");
    bar.className = "tabbar";
    bar.innerHTML = tabs.map(function(t){ return '<a href="' + t[0] + '" class="' + (page===t[3]?"on":"") + '"><span>' + t[1] + '</span>' + t[2] + '</a>'; }).join("");
    document.body.appendChild(bar);
  }
})();
function goExplore(){ const q=document.getElementById("topq")?.value||""; location.href="explore.html?q="+encodeURIComponent(q); }
function pendingAlerts(){
  const t=getTracker(),p=prefs(),out=[];
  Object.entries(t).forEach(([id])=>{ const e=EXAMS.find(x=>String(x.id)===String(id)); if(!e)return;
    const n=daysLeft(e.application_end);
    if(n!==null&&n>=0&&n<=7&&((n<=1&&p.d1)||(n>1&&p.d7))) out.push(e);
    if(e.updated&&p.upd) out.push(e);
  });
  return [...new Set(out)];
}
function toast(msg){ let w=document.getElementById("toasts"); if(!w){w=document.createElement("div");w.id="toasts";document.body.appendChild(w);} const d=document.createElement("div"); d.className="toast"; d.textContent=msg; w.appendChild(d); setTimeout(()=>d.remove(),2800); }
function logout(){ ["st_user","st_role","st_token","st_admin","st_user_id","st_name","tracker"].forEach(k=>localStorage.removeItem(k)); location.href="login.html"; }
function adminLogout(){ ["st_admin","st_role","st_token"].forEach(k=>localStorage.removeItem(k)); location.href="admin-login.html"; }
function toggleTrack(id){
  const t=getTracker();
  const isTracked = !!t[id];
  if(isTracked){
    delete t[id];
    setTracker(t);
    toast("Removed from tracker");
    document.dispatchEvent(new CustomEvent("tracker-changed"));
    if(typeof window.apiUntrackExam === 'function'){
      window.apiUntrackExam(id).catch(e => console.warn('[tracker untrack]', e.message));
    }
  } else {
    t[id]="Interested";
    setTracker(t);
    toast("Added to tracker");
    document.dispatchEvent(new CustomEvent("tracker-changed"));
    if(typeof window.apiTrackExam === 'function'){
      window.apiTrackExam(id, "Interested").catch(e => console.warn('[tracker track]', e.message));
    }
  }
}
function simulateUpdate(){
  const e=EXAMS.find(x=>String(x.id)==="rrb-ntpc-2026" || (x.title && x.title.includes("RRB NTPC"))) || EXAMS[0];
  if(!e) return;
  if(e.updated){ toast("Already simulated — reload to reset"); return; }
  e.application_end="2026-10-05"; e.status="Updated"; e.updated=true; e.last_checked=new Date().toISOString();
  if(!Array.isArray(e.history)) e.history = [];
  e.history.push({at:new Date().toISOString().slice(0,10),msg:"Change detected: application_end 2026-09-30 → 2026-10-05 → status Updated"});
  toast("Official update detected: RRB deadline extended");
  document.dispatchEvent(new CustomEvent("data-changed"));
}
function avatarColor(org){ let h=0; for(const c of org||"") h=(h*31+c.charCodeAt(0))%360; return `hsl(${h},28%,22%)`; }
