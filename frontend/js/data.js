// Shared mock data (backend API will replace). Keep in sync with database/schema.sql
// All dates updated to current (Oct 2026) so users see fresh data, not stale 2026-10-12.
const EXAMS = [
  {id:"rrb-ntpc-2026",organization:"Railway Recruitment Board",title:"RRB NTPC Graduate Recruitment 2026",advt_no:"CEN 05/2026",application_start:"2026-09-15",application_end:"2026-10-20",exam_date:"2026-11-15",admit_card_date:"2026-11-05",official_url:"https://rrbcdg.gov.in/notices/ntpc-2026",status:"Verified",updated:false,vacancies:11558,last_checked:"2026-10-28T08:00:00Z",history:[{at:"2026-10-28",msg:"New notice ingested → Validated → Verified"}]},
  {id:"upsc-cse-2027",organization:"Union Public Service Commission",title:"UPSC Civil Services (Prelims) 2027",advt_no:"CSE 2027",application_start:"2026-10-01",application_end:"2026-10-28",exam_date:"2027-05-23",admit_card_date:"2027-05-01",official_url:"https://upsc.gov.in/examinations/cse-2027",status:"Updated",updated:true,vacancies:1056,last_checked:"2026-10-28T07:30:00Z",history:[{at:"2026-10-01",msg:"New notice → Verified"},{at:"2026-10-10",msg:"Change detected: application_end 2026-10-21 → 2026-10-28 → status Updated"},{at:"2026-10-28",msg:"Scheduler re-check → no new changes"}]},
  {id:"ssc-cgl-2026",organization:"Staff Selection Commission",title:"SSC CGL 2026 Combined Graduate Level",advt_no:"CGL/2026",application_start:"2026-09-15",application_end:"2026-10-14",exam_date:"2026-12-10",admit_card_date:"2026-11-28",official_url:"https://ssc.gov.in/notices/cgl-2026",status:"Verified",updated:false,vacancies:17727,last_checked:"2026-10-28T06:45:00Z",history:[{at:"2026-09-16",msg:"New notice → Verified"},{at:"2026-10-28",msg:"Scheduler re-check → no new changes"}]},
  {id:"ibps-po-2026",organization:"Institute of Banking Personnel Selection",title:"IBPS PO/MT XVI Recruitment 2026",advt_no:"PO/MT-XVI",application_start:"2026-08-01",application_end:"2026-08-28",exam_date:"2026-10-18",admit_card_date:"2026-10-05",official_url:"https://ibps.in/careers/po-2026",status:"Verified",updated:false,vacancies:5208,last_checked:"2026-10-28T05:15:00Z",history:[{at:"2026-08-02",msg:"New notice → Verified"},{at:"2026-10-28",msg:"Scheduler re-check → no new changes"}]},
  {id:"uppsc-pcs-2026",organization:"UP Public Service Commission",title:"UPPSC PCS 2026",advt_no:"PCS/2026",application_start:"2026-10-08",application_end:"2026-11-08",exam_date:"2027-02-14",admit_card_date:"2027-01-30",official_url:"https://uppsc.up.nic.in",status:"Verified",updated:false,vacancies:220,last_checked:"2026-10-28T04:30:00Z",history:[{at:"2026-10-08",msg:"New notice → Verified"},{at:"2026-10-28",msg:"Scheduler re-check → no new changes"}]}];
const SOURCES = [
  {name:"Union Public Service Commission",url:"https://upsc.gov.in",parser:"upsc_html",interval:120,status:"Verified",last:"2026-10-28 07:30",items:14},
  {name:"Staff Selection Commission",url:"https://ssc.gov.in",parser:"ssc_html",interval:120,status:"Verified",last:"2026-10-28 06:45",items:22},
  {name:"Railway Recruitment Board",url:"https://rrbcdg.gov.in",parser:"rrb_html",interval:120,status:"Verified",last:"2026-10-28 08:00",items:9},
  {name:"Institute of Banking Personnel Selection",url:"https://ibps.in",parser:"ibsc_html",interval:120,status:"Verified",last:"2026-10-28 05:15",items:6}];
const JOBS = [
  {at:"2026-10-28 08:00",src:"Railway Recruitment Board",res:"success",f:1,i:0,u:0,r:0},
  {at:"2026-10-28 07:30",src:"Union Public Service Commission",res:"success",f:1,i:0,u:0,r:0},
  {at:"2026-10-28 06:45",src:"Staff Selection Commission",res:"success",f:1,i:0,u:0,r:0},
  {at:"2026-10-28 05:15",src:"Institute of Banking Personnel Selection",res:"success",f:1,i:0,u:0,r:0}];
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
