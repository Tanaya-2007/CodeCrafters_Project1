// Shared mock data (backend API will replace). Keep in sync with database/schema.sql
// EXAMS starts EMPTY so no stale/mock data is ever shown before live API loads.
const EXAMS = [];
const SOURCES = [
  {name:"Union Public Service Commission",url:"https://upsc.gov.in",parser:"upsc_html",interval:60,status:"Source Unavailable",last:"2026-10-28 07:30",items:0},
  {name:"Staff Selection Commission",url:"https://ssc.gov.in",parser:"ssc_html",interval:60,status:"Source Unavailable",last:"2026-10-28 06:45",items:0},
  {name:"Railway Recruitment Board",url:"https://rrbcdg.gov.in",parser:"rrb_html",interval:60,status:"Source Unavailable",last:"2026-10-28 08:00",items:0},
  {name:"Institute of Banking Personnel Selection",url:"https://ibps.in",parser":"ibps_html",interval:60,status:"Source Unavailable",last:"2026-10-28 05:15",items:0},
  {name:"UP Public Service Commission",url:"https://uppsc.up.nic.in",parser:"uppsc_html",interval:60,status:"Source Unavailable",last:"2026-10-28 04:30",items:0},
  {name:"India Post GDS",url:"https://indiapostgdsonline.gov.in",parser:"gds_html",interval:60,status:"Source Unavailable",last:"2026-10-28 03:45",items:0},
  {name:"Reserve Bank of India",url:"https://opportunities.rbi.org.in",parser:"rbi_html",interval:60,status:"Source Unavailable",last:"2026-10-28 02:30",items:0},
  {name:"Indian Army",url:"https://joinindianarmy.nic.in",parser:"army_html",interval:60,status:"Source Unavailable",last:"2026-10-28 01:15",items:0},
  {name":"NABARD",url:"https://nabard.org",parser:"nabard_html",interval:60,status:"Source Unavailable",last:"2026-10-28 00:45",items:0},
  {name":"Food Corporation of India",url:"https://fci.gov.in",parser:"fci_html",interval:60,status:"Source Unavailable",last:"2026-10-27 23:15",items:0},
  {name":"Delhi Metro Rail Corporation",url:"https://delhimetrorail.in",parser:"dmrc_html",interval:60,status:"Source Unavailable",last:"2026-10-27 22:30",items:0},
  {name":"Central Board of Secondary Education",url:"https://cbse.gov.in",parser:"cbse_html",interval:60,status:"Source Unavailable",last:"2026-10-27 21:45",items:0}
];
const JOBS = [];
function daysLeft(d){if(!d)return null;const a=new Date();a.setHours(0,0,0,0);const b=new Date(d);b.setHours(0,0,0,0);return Math.ceil((b-a)/864e5);}
function countdownText(e){const n=daysLeft(e.application_end);if(n===null)return"Date awaited";if(n<0)return"Closed";if(n===0)return"Closes today";return`${n}d left`;}
function fullCountdown(e){const n=daysLeft(e.application_end);if(n===null)return"Date awaited (Needs Review)";if(n<0)return"Applications closed";if(n===0)return"Closes TODAY";return`Application closes in ${n} day${n>1?"s":""}`;}
function statusBadge(s){const m={Verified:"b-verified",Updated:"b-updated","Needs Review":"b-review",New:"b-new","Source Unavailable":"b-review"};return`<span class="badge ${m[s]||"b-new"}">${s}</span>`;}
function urgency(e){const n=daysLeft(e.application_end);if(n===null)return 0;const t=(new Date(e.application_end)-new Date(e.application_start))/864e5;return Math.min(100,Math.max(4,100-(n/Math.max(t,1))*100));}
function getTracker(){try{return JSON.parse(localStorage.getItem("tracker")||"{}");}catch{return{};}}
function setTracker(t){localStorage.setItem("tracker",JSON.stringify(t));}
// Candidate-visible records ONLY: anything awaiting admin verification
// (New / Needs Review / Rejected) must never render on user screens.
function isPublic(e){return e&&['Verified','Updated'].includes(e.status);}
function currentUser(){return localStorage.getItem("st_user")||null;}
function currentRole(){return localStorage.getItem("st_role")||null;}
function prefs(){try{return JSON.parse(localStorage.getItem("prefs")||'{"d7":true,"d1":true,"upd":true,"email":false}');}catch{return{d7:true,d1:true,upd:true,email:false};}}
function savePrefs(p){localStorage.setItem("prefs",JSON.stringify(p));}
// Clean garbage from live portal scrapes (AngularJS template syntax, etc.)
function cleanTitle(t){
  if(!t) return t;
  return String(t)
    .replace(/{{\s*['"][^'"]*['"]\s*\|\s*translate\s*}}/g, '')
    .replace(/{{\s*[^}]*\s*}}/g, '')
    .replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>')
    .replace(/\s+/g,' ').trim();
}