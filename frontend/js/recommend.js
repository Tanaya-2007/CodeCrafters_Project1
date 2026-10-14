// Personalization engine: profile → eligible exams → study material.
// Reference content (standard books/syllabus), NOT scraped notices:
// safe to ship statically; live notices link into families via matchers.
const QUALS = [
  { id: 'q10', label: 'Class 10 (Matric)', level: 1 },
  { id: 'q12', label: 'Class 12 (Intermediate)', level: 2 },
  { id: 'iti', label: 'ITI certificate', level: 2 },
  { id: 'dip', label: 'Diploma (Polytechnic)', level: 3 },
  { id: 'ug', label: 'Graduation (any stream)', level: 4 },
  { id: 'pg', label: 'Post-Graduation', level: 5 }
];
const STREAMS = ['Science', 'Commerce', 'Arts / Humanities', 'Engineering', 'Medical', 'Law', 'Other'];
const STATES = ['Andhra Pradesh', 'Bihar', 'Delhi', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Odisha', 'Punjab', 'Rajasthan', 'Tamil Nadu', 'Telangana', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal', 'Other'];
const INTERESTS = [
  { id: 'upsc', label: 'Civil Services (UPSC)' }, { id: 'ssc', label: 'SSC exams' },
  { id: 'bank', label: 'Banking (IBPS/SBI/RBI)' }, { id: 'rail', label: 'Railways (RRB)' },
  { id: 'teach', label: 'Teaching (CTET/STET)' }, { id: 'def', label: 'Defence (NDA/Agniveer)' },
  { id: 'police', label: 'Police / Paramilitary' }, { id: 'post', label: 'Postal / GDS' },
  { id: 'state', label: 'State PSC (UPPSC etc.)' }
];

const FAMILIES = [
  { id: 'upsc-cse', name: 'UPSC Civil Services (IAS/IPS/IFS)', org: 'Union Public Service Commission', interest: ['upsc'], minQ: 4, streams: 'any', age: '21–32 yrs (relaxation by category)', blurb: 'Graduation in any stream. India\u2019s toughest + most prestigious exam.',
    match: { org: [/public service commission/i], title: [/civil|ifs|forest|engineering|medical|cms|ese/i] },
    material: { subjects: ['Polity & Governance', 'Modern History', 'Geography', 'Economy', 'Environment', 'Art & Culture', 'CSAT'],
      books: ['M. Laxmikanth — Indian Polity', 'Spectrum (Rajiv Ahir) — Modern History', 'G.C. Leong — Physical Geography + NCERT XI–XII', 'Ramesh Singh — Indian Economy', 'Shankar IAS — Environment', 'Nitin Singhania — Art & Culture'],
      links: [{ t: 'UPSC active examinations (official)', u: 'https://upsc.gov.in/examinations/active-exams' }, { t: 'UPSC homepage', u: 'https://upsc.gov.in/' }] } },
  { id: 'upsc-nda', name: 'NDA & Naval Academy', org: 'Union Public Service Commission', interest: ['def'], minQ: 2, streams: 'any (PCM needed for Air Force/Navy)', age: '16.5–19.5 yrs, unmarried', blurb: 'After Class 12 — join as an officer while you graduate.',
    match: { org: [/public service commission/i], title: [/n\.?d\.?a|national defence|naval academy/i] },
    material: { subjects: ['Mathematics (XI–XII)', 'English', 'General Ability (GK + Science)'],
      books: ['NCERT Mathematics XI–XII', 'R.S. Aggarwal — Quantitative Aptitude', 'Lucent\u2019s General Knowledge', 'NCERT Science + Social Science'],
      links: [{ t: 'UPSC examinations (official)', u: 'https://upsc.gov.in/examinations/' }] } },
  { id: 'ssc-cgl', name: 'SSC CGL (Inspector, ASO, Auditor…)', org: 'Staff Selection Commission', interest: ['ssc'], minQ: 4, streams: 'any (JSO/AAO need specific degrees)', age: '18–32 (post-wise)', blurb: 'The flagship graduate-level SSC exam — 17,000+ posts in 2026.',
    match: { org: [/staff selection/i], title: [/cgl|combined graduate/i] },
    material: { subjects: ['Quantitative Aptitude', 'English', 'General Intelligence & Reasoning', 'General Awareness'],
      books: ['Neetu Singh — Plinth to Paramount (English)', 'R.S. Aggarwal — Quantitative Aptitude', 'R.S. Aggarwal — Reasoning', 'Lucent\u2019s General Knowledge'],
      links: [{ t: 'SSC official portal', u: 'https://ssc.gov.in/' }] } },
  { id: 'ssc-chsl', name: 'SSC CHSL (LDC, DEO, JSA)', org: 'Staff Selection Commission', interest: ['ssc'], minQ: 2, streams: 'any', age: '18–27 yrs', blurb: 'Biggest 12th-pass central govt exam — start early, no degree needed.',
    match: { org: [/staff selection/i], title: [/chsl|10\s*\+\s*2|combined higher/i] },
    material: { subjects: ['Maths (X level)', 'English', 'Reasoning', 'General Awareness'],
      books: ['R.S. Aggarwal — Quant & Reasoning (X-level chapters)', 'Neetu Singh — English basics', 'Lucent\u2019s GK'],
      links: [{ t: 'SSC official portal', u: 'https://ssc.gov.in/' }] } },
  { id: 'ssc-mts', name: 'SSC MTS / Havaldar / GD Constable', org: 'Staff Selection Commission', interest: ['ssc', 'police'], minQ: 1, streams: 'any', age: '18–25/27 yrs', blurb: '10th-pass entry — Havaldar, MTS and GD Constable rallies.',
    match: { org: [/staff selection/i], title: [/mts|havaldar|gd constable|constable/i] },
    material: { subjects: ['Numerical Aptitude (X level)', 'Reasoning', 'English/Hindi', 'General Awareness + PET/PST fitness'],
      books: ['NCERT Class X Maths', 'Lucent\u2019s GK', 'Previous SSC GD papers'],
      links: [{ t: 'SSC official portal', u: 'https://ssc.gov.in/' }] } },
  { id: 'rrb-ntpc', name: 'RRB NTPC (Clerk, CA, Station Master…)', org: 'Railway Recruitment Board', interest: ['rail'], minQ: 2, streams: 'any (UG posts: 12th; Graduate posts: degree)', age: '18–33 yrs (post-wise)', blurb: '11,500+ posts in 2026 — the largest railway graduate intake.',
    match: { org: [/railway/i], title: [/ntpc/i] },
    material: { subjects: ['Mathematics', 'Reasoning', 'General Awareness (Railways focus)'],
      books: ['R.S. Aggarwal — Quant + Reasoning', 'Lucent\u2019s GK + railway budget/facts notes'],
      links: [{ t: 'RRB Chandigarh notices (official)', u: 'https://rrbcdg.gov.in/' }] } },
  { id: 'rrb-groupd', name: 'RRB Group D / ALP / Technician', org: 'Railway Recruitment Board', interest: ['rail'], minQ: 1, streams: 'any (ALP/Tech: ITI/Diploma preferred)', age: '18–33 yrs', blurb: '10th/ITI entry — loco pilot, technician and track maintainer.',
    match: { org: [/railway/i], title: [/group.?d|level.?1|alp|loco|technician|rpf/i] },
    material: { subjects: ['Maths', 'Reasoning', 'General Science', 'ITI trade (for ALP/Tech)'],
      books: ['NCERT Science IX–X', 'R.S. Aggarwal basics', 'ITI trade theory book'],
      links: [{ t: 'RRB Chandigarh notices (official)', u: 'https://rrbcdg.gov.in/' }] } },
  { id: 'ibps-po', name: 'IBPS PO / MT (Officer)', org: 'Institute of Banking Personnel Selection', interest: ['bank'], minQ: 4, streams: 'any', age: '20–30 yrs', blurb: 'Probationary Officer across 11 public-sector banks.',
    match: { org: [/banking personnel|ibps|state bank|reserve bank/i], title: [/po|probationary|management trainee|officer/i] },
    material: { subjects: ['Quant + Data Interpretation', 'Reasoning + Puzzles', 'English', 'Banking & Financial Awareness'],
      books: ['R.S. Aggarwal — Quant (DI chapters)', 'M.K. Pandey — Analytical Reasoning', 'S.P. Bakshi — Objective English', 'Banking awareness capsules + RBI FAQs'],
      links: [{ t: 'IBPS careers (official)', u: 'https://www.ibps.in/' }] } },
  { id: 'ibps-clerk', name: 'IBPS Clerk / Customer Service', org: 'Institute of Banking Personnel Selection', interest: ['bank'], minQ: 4, streams: 'any', age: '20–28 yrs', blurb: 'Clerical cadre — fastest banking entry after graduation.',
    match: { org: [/banking personnel|ibps/i], title: [/clerk|customer|csa|assistant/i] },
    material: { subjects: ['Quant', 'Reasoning', 'English', 'Banking Awareness'],
      books: ['R.S. Aggarwal basics', 'Lucent\u2019s GK (banking chapters)'],
      links: [{ t: 'IBPS careers (official)', u: 'https://www.ibps.in/' }] } },
  { id: 'gds', name: 'Post Office GDS (Gramin Dak Sevak)', org: 'India Post GDS', interest: ['post'], minQ: 1, streams: 'any', age: '18–40 yrs', blurb: 'No exam — Class-10 merit + local language. Easiest central posting near home.',
    match: { org: [/post|gds/i], title: [/gds|gramin|dak|postal/i] },
    material: { subjects: ['Class-X merit (Maths/English marks)', 'Local language studied in X', 'Cycle/computer basics for verification'],
      books: ['NCERT Class X Maths & English', 'State-board local-language grammar'],
      links: [{ t: 'GDS online engagement (official)', u: 'https://indiapostgdsonline.gov.in/' }] } },
  { id: 'uppsc', name: 'UPPSC PCS (SDM/DSP/ETO…)', org: 'UP Public Service Commission', interest: ['state'], minQ: 4, streams: 'any', age: '21–40 yrs', blurb: 'Uttar Pradesh\u2019s civil services — SDM/DSP track for graduates.',
    match: { org: [/uttar pradesh.*public|uppsc/i], title: [/./] },
    material: { subjects: ['UP GK + History', 'Polity (Laxmikanth)', 'GS like UPSC Prelims'],
      books: ['Pariksha Vani — UP GK', 'M. Laxmikanth — Polity', 'Spectrum — History'],
      links: [{ t: 'UPPSC official portal', u: 'https://uppsc.up.nic.in/' }] } },
  { id: 'agniveer', name: 'Agniveer (Army/Navy/Airforce)', org: 'Indian Army', interest: ['def'], minQ: 1, streams: 'any (technical: PCM/ITI)', age: '17.5–23 yrs', blurb: '10th/12th entry with rally + CEE written test.',
    match: { org: [/army|navy|airforce|agniveer/i], title: [/agniveer|rally|cee|soldier/i] },
    material: { subjects: ['GK + Current Affairs', 'Maths & Reasoning (X level)', 'Science', 'Physical fitness (1.6 km, pull-ups)'],
      books: ['NCERT Class X all subjects', 'Lucent\u2019s GK', 'Agniveer CEE practice sets'],
      links: [{ t: 'Join Indian Army (official)', u: 'https://joinindianarmy.nic.in/' }] } },
  { id: 'ctet', name: 'CTET / Teaching (PRT/TGT)', org: 'CBSE / State Boards', interest: ['teach'], minQ: 4, streams: 'any (+ B.Ed/D.El.Ed required)', age: 'No upper limit', blurb: 'Graduation + teacher training unlocks KVS/NVS/state teacher posts.',
    match: null, live: false,
    material: { subjects: ['Child Pedagogy', 'Subject depth (your stream)', 'NCERT VI–VIII base'],
      books: ['NCERT VI–VIII textbooks', 'Lucent\u2019s GK', 'Previous CTET papers'],
      links: [{ t: 'CTET official site', u: 'https://ctet.nic.in/' }] } },
  { id: 'police', name: 'UP Police / SSC GD / State Constable', org: 'State Police Boards', interest: ['police'], minQ: 2, streams: 'any', age: '18–25 yrs + PET/PST', blurb: '12th-pass uniformed entry — written + physical in one cycle.',
    match: null, live: false,
    material: { subjects: ['General Hindi', 'GK & Current Affairs', 'Reasoning & Mental Ability', 'Physical (race, long jump)'],
      books: ['Lucent\u2019s GK + Hindi vyakaran', 'R.S. Aggarwal reasoning basics'],
      links: [{ t: 'UP Police Recruitment Board', u: 'https://uppbpb.gov.in/' }] } }
];

function getProfile() { try { return JSON.parse(localStorage.getItem('st_profile') || 'null'); } catch { return null; } }
function saveProfile(p) { localStorage.setItem('st_profile', JSON.stringify({ ...p, updated: new Date().toISOString() })); }
function qualLevel(id) { const q = QUALS.find(x => x.id === id); return q ? q.level : 0; }

// verdict: eligible | preparing (one rung away) | later
function recommend(p) {
  if (!p || !p.qual) return null;
  const lv = qualLevel(p.qual);
  const out = FAMILIES.map(f => {
    let verdict = 'later', why = '';
    const streamOk = f.streams === 'any' || !p.stream || f.streams === 'any';
    if (lv >= f.minQ) {
      verdict = 'eligible';
      why = 'You meet the education bar (' + (QUALS.find(q => q.level === f.minQ)?.label || '') + ').';
    } else if (lv === f.minQ - 1) {
      verdict = 'preparing';
      why = 'One step away — finish ' + (QUALS.find(q => q.level === f.minQ)?.label || 'the next level') + ' to unlock.';
    } else {
      const need = QUALS.find(q => q.level === f.minQ);
      why = 'Needs ' + (need ? need.label : 'higher qualification') + ' first — start the foundation now.';
    }
    if (f.streams !== 'any' && p.stream) why += ' Note: ' + f.streams + '.';
    const like = (p.interests || []).some(i => (f.interest || []).includes(i));
    return { f, verdict, why, like };
  });
  out.sort((a, b) => (b.like - a.like) || ({ eligible: 0, preparing: 1, later: 2 }[a.verdict] - { eligible: 0, preparing: 1, later: 2 }[b.verdict]));
  return out;
}

// link a live notice to its exam family (for material + why-recommended)
function familyForNotice(n) {
  if (!n) return null;
  for (const f of FAMILIES) {
    if (!f.match) continue;
    const orgOk = !f.match.org || f.match.org.some(r => r.test(n.organization || ''));
    const titleOk = !f.match.title || f.match.title.some(r => r.test(n.title || ''));
    if (orgOk && titleOk) return f;
  }
  return null;
}
