// Shared mock data (backend API will replace). Keep in sync with database/schema.sql
// EXAMS starts EMPTY so no stale/mock data is ever shown before live API loads.
const EXAMS = [];
const SOURCES = [];
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
