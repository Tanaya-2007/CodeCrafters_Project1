// Personalization engine: profile → eligible exams → study material.
// Reference content (standard books/syllabus), NOT scraped notices.
// All study material includes books, YouTube videos, previous year papers, authorized websites.

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
  {
    id: 'upsc-cse',
    name: 'UPSC Civil Services (IAS/IPS/IFS)',
    org: 'Union Public Service Commission',
    interest: ['upsc'],
    minQ: 4,
    streams: 'any',
    age: '', // removed age text per user request
    blurb: 'Graduation in any stream. India\'s toughest + most prestigious exam.',
    match: { org: [/public service commission/i], title: [/civil|ifs|forest|engineering|medical|cms|ese/i] },
    material: {
      subjects: ['Polity & Governance', 'Modern History', 'Geography', 'Economy', 'Environment', 'Art & Culture', 'CSAT'],
      books: [
        'M. Laxmikanth — Indian Polity',
        'Spectrum (Rajiv Ahir) — Modern History',
        'G.C. Leong — Physical Geography + NCERT XI–XII',
        'Ramesh Singh — Indian Economy',
        'Shankar IAS — Environment',
        'Nitin Singhania — Art & Culture',
        'NCERT Class VI–XII (All Subjects)'
      ],
      websites: [
        { t: 'UPSC Official Website', u: 'https://upsc.gov.in/' },
        { t: 'UPSC Active Examinations', u: 'https://upsc.gov.in/examinations/active-exams' },
        { t: 'UPSC Previous Year Papers', u: 'https://upsc.gov.in/examinations/previous-year-papers' }
      ],
      videos: [
        { t: 'UPSC Preparation Strategy', u: 'https://www.youtube.com/@StudyIQIAS' },
        { t: 'Laxmikanth Polity Full Course', u: 'https://www.youtube.com/@DrishtiIAS' },
        { t: "Current Affairs Daily", u: 'https://www.youtube.com/@InsightsIAS' }
      ],
      pyq: [
        { t: 'UPSC Prelims PYQ 2023', u: 'https://upsc.gov.in/examinations/previous-year-papers' },
        { t: 'UPSC Mains PYQ 2022', u: 'https://upsc.gov.in/examinations/previous-year-papers' }
      ]
    }
  },
  {
    id: 'upsc-nda',
    name: 'NDA & Naval Academy',
    org: 'Union Public Service Commission',
    interest: ['def'],
    minQ: 2,
    streams: 'any (PCM needed for Air Force/Navy)',
    age: '',
    blurb: 'After Class 12 — join as an officer while you graduate.',
    match: { org: [/public service commission/i], title: [/n\.?d\.?a|national defence|naval academy/i] },
    material: {
      subjects: ['Mathematics (XI–XII)', 'English', 'General Ability (GK + Science)'],
      books: [
        'NCERT Mathematics XI–XII',
        'R.S. Aggarwal — Quantitative Aptitude',
        'Lucent\'s General Knowledge',
        'NCERT Science + Social Science'
      ],
      websites: [
        { t: 'UPSC NDA Official Page', u: 'https://upsc.gov.in/examinations/nda-na' },
        { t: 'Join Indian Army NDA', u: 'https://joinindianarmy.nic.in/' }
      ],
      videos: [
        { t: 'NDA Exam Strategy', u: 'https://www.youtube.com/@SSBCrack' },
        { t: 'NDA Maths Full Course', u: 'https://www.youtube.com/@AbhinayMaths' }
      ],
      pyq: [
        { t: 'NDA Written Exam PYQ', u: 'https://upsc.gov.in/examinations/previous-year-papers' }
      ]
    }
  },
  {
    id: 'ssc-cgl',
    name: 'SSC CGL (Inspector, ASO, Auditor…)',
    org: 'Staff Selection Commission',
    interest: ['ssc'],
    minQ: 4,
    streams: 'any (JSO/AAO need specific degrees)',
    age: '',
    blurb: 'The flagship graduate-level SSC exam — 17,000+ posts in 2026.',
    match: { org: [/staff selection/i], title: [/cgl|combined graduate/i] },
    material: {
      subjects: ['Quantitative Aptitude', 'English', 'General Intelligence & Reasoning', 'General Awareness'],
      books: [
        'Neetu Singh — Plinth to Paramount (English)',
        'R.S. Aggarwal — Quantitative Aptitude',
        'R.S. Aggarwal — Reasoning',
        'Lucent\'s General Knowledge',
        'Kiran Publication — SSC CGL Previous Year Papers'
      ],
      websites: [
        { t: 'SSC Official Portal', u: 'https://ssc.gov.in/' },
        { t: 'SSC CGL Notification', u: 'https://ssc.gov.in/notices' }
      ],
      videos: [
        { t: 'SSC CGL Preparation Strategy', u: 'https://www.youtube.com/@AbhinayMaths' },
        { t: 'SSC English Full Course', u: 'https://www.youtube.com/@NeetuSinghClasses' },
        { t: 'SSC Reasoning Tricks', u: 'https://www.youtube.com/@ReasoningPoint' }
      ],
      pyq: [
        { t: 'SSC CGL Tier 1 PYQ 2023', u: 'https://ssc.gov.in/notices' },
        { t: 'SSC CGL Tier 2 PYQ 2022', u: 'https://ssc.gov.in/notices' }
      ]
    }
  },
  {
    id: 'ssc-chsl',
    name: 'SSC CHSL (LDC, DEO, JSA)',
    org: 'Staff Selection Commission',
    interest: ['ssc'],
    minQ: 2,
    streams: 'any',
    age: '',
    blurb: 'Biggest 12th-pass central govt exam — start early, no degree needed.',
    match: { org: [/staff selection/i], title: [/chsl|10\s*\+\s*2|combined higher/i] },
    material: {
      subjects: ['Maths (X level)', 'English', 'Reasoning', 'General Awareness'],
      books: [
        'R.S. Aggarwal — Quant & Reasoning (X-level chapters)',
        'Neetu Singh — English basics',
        'Lucent\'s General Knowledge',
        'Kiran Publication — SSC CHSL Previous Year Papers'
      ],
      websites: [
        { t: 'SSC Official Portal', u: 'https://ssc.gov.in/' },
        { t: 'SSC CHSL Notification', u: 'https://ssc.gov.in/notices' }
      ],
      videos: [
        { t: 'SSC CHSL Maths Tricks', u: 'https://www.youtube.com/@AbhinayMaths' },
        { t: 'SSC CHSL English', u: 'https://www.youtube.com/@NeetuSinghClasses' }
      ],
      pyq: [
        { t: 'SSC CHSL Tier 1 PYQ 2023', u: 'https://ssc.gov.in/notices' }
      ]
    }
  },
  {
    id: 'ssc-mts',
    name: 'SSC MTS / Havaldar / GD Constable',
    org: 'Staff Selection Commission',
    interest: ['ssc', 'police'],
    minQ: 1,
    streams: 'any',
    age: '',
    blurb: '10th-pass entry — Havaldar, MTS and GD Constable rallies.',
    match: { org: [/staff selection/i], title: [/mts|havaldar|gd constable|constable/i] },
    material: {
      subjects: ['Numerical Aptitude (X level)', 'Reasoning', 'English/Hindi', 'General Awareness + PET/PST fitness'],
      books: [
        'NCERT Class X Maths',
        'Lucent\'s General Knowledge',
        'Previous SSC GD papers',
        'R.S. Aggarwal — Reasoning Basics'
      ],
      websites: [
        { t: 'SSC Official Portal', u: 'https://ssc.gov.in/' },
        { t: 'SSC GD Constable Recruitment', u: 'https://ssc.gov.in/notices' }
      ],
      videos: [
        { t: 'SSC GD Constable Preparation', u: 'https://www.youtube.com/@AbhinayMaths' },
        { t: 'SSC GD Physical Training', u: 'https://www.youtube.com/@SSCGDConstable' }
      ],
      pyq: [
        { t: 'SSC GD Constable PYQ 2023', u: 'https://ssc.gov.in/notices' }
      ]
    }
  },
  {
    id: 'rrb-ntpc',
    name: 'RRB NTPC (Clerk, CA, Station Master…)',
    org: 'Railway Recruitment Board',
    interest: ['rail'],
    minQ: 2,
    streams: 'any (UG posts: 12th; Graduate posts: degree)',
    age: '',
    blurb: '11,500+ posts in 2026 — the largest railway graduate intake.',
    match: { org: [/railway/i], title: [/ntpc/i] },
    material: {
      subjects: ['Mathematics', 'Reasoning', 'General Awareness (Railways focus)'],
      books: [
        'R.S. Aggarwal — Quant + Reasoning',
        'Lucent\'s GK + railway budget/facts notes',
        'Kiran Publication — RRB NTPC Previous Year Papers'
      ],
      websites: [
        { t: 'RRB Chandigarh Notices', u: 'https://rrbcdg.gov.in/' },
        { t: 'RRB NTPC Official Portal', u: 'https://rrbcdg.gov.in/' }
      ],
      videos: [
        { t: 'RRB NTPC Maths Strategy', u: 'https://www.youtube.com/@AbhinayMaths' },
        { t: 'RRB NTPC Reasoning', u: 'https://www.youtube.com/@ReasoningPoint' }
      ],
      pyq: [
        { t: 'RRB NTPC CBT 1 PYQ', u: 'https://rrbcdg.gov.in/' },
        { t: 'RRB NTPC CBT 2 PYQ', u: 'https://rrbcdg.gov.in/' }
      ]
    }
  },
  {
    id: 'rrb-groupd',
    name: 'RRB Group D / ALP / Technician',
    org: 'Railway Recruitment Board',
    interest: ['rail'],
    minQ: 1,
    streams: 'any (ALP/Tech: ITI/Diploma preferred)',
    age: '',
    blurb: '10th/ITI entry — loco pilot, technician and track maintainer.',
    match: { org: [/railway/i], title: [/group.?d|level.?1|alp|loco|technician|rpf/i] },
    material: {
      subjects: ['Maths', 'Reasoning', 'General Science', 'ITI trade (for ALP/Tech)'],
      books: [
        'NCERT Science IX–X',
        'R.S. Aggarwal basics',
        'ITI trade theory book',
        'Lucent\'s General Knowledge'
      ],
      websites: [
        { t: 'RRB Chandigarh Notices', u: 'https://rrbcdg.gov.in/' },
        { t: 'RRB ALP Technician Recruitment', u: 'https://rrbcdg.gov.in/' }
      ],
      videos: [
        { t: 'RRB Group D Maths', u: 'https://www.youtube.com/@AbhinayMaths' },
        { t: 'RRB ALP Technical Subjects', u: 'https://www.youtube.com/@RailwayExamPrep' }
      ],
      pyq: [
        { t: 'RRB Group D PYQ 2022', u: 'https://rrbcdg.gov.in/' },
        { t: 'RRB ALP Technician PYQ', u: 'https://rrbcdg.gov.in/' }
      ]
    }
  },
  {
    id: 'ibps-po',
    name: 'IBPS PO / MT (Officer)',
    org: 'Institute of Banking Personnel Selection',
    interest: ['bank'],
    minQ: 4,
    streams: 'any',
    age: '',
    blurb: 'Probationary Officer across 11 public-sector banks.',
    match: { org: [/banking personnel|ibps|state bank|reserve bank/i], title: [/po|probationary|management trainee|officer/i] },
    material: {
      subjects: ['Quant + Data Interpretation', 'Reasoning + Puzzles', 'English', 'Banking & Financial Awareness'],
      books: [
        'R.S. Aggarwal — Quant (DI chapters)',
        'M.K. Pandey — Analytical Reasoning',
        'S.P. Bakshi — Objective English',
        'Banking awareness capsules + RBI FAQs'
      ],
      websites: [
        { t: 'IBPS Careers', u: 'https://www.ibps.in/' },
        { t: 'IBPS PO Notification', u: 'https://www.ibps.in/notices' }
      ],
      videos: [
        { t: 'IBPS PO Quant Strategy', u: 'https://www.youtube.com/@AbhinayMaths' },
        { t: 'IBPS PO English Full Course', u: 'https://www.youtube.com/@NeetuSinghClasses' },
        { t: 'Banking Awareness', u: 'https://www.youtube.com/@Adda247' }
      ],
      pyq: [
        { t: 'IBPS PO Prelims PYQ 2023', u: 'https://www.ibps.in/' },
        { t: 'IBPS PO Mains PYQ 2022', u: 'https://www.ibps.in/' }
      ]
    }
  },
  {
    id: 'ibps-clerk',
    name: 'IBPS Clerk / Customer Service',
    org: 'Institute of Banking Personnel Selection',
    interest: ['bank'],
    minQ: 4,
    streams: 'any',
    age: '',
    blurb: 'Clerical cadre — fastest banking entry after graduation.',
    match: { org: [/banking personnel|ibps/i], title: [/clerk|customer|csa|assistant/i] },
    material: {
      subjects: ['Quant', 'Reasoning', 'English', 'Banking Awareness'],
      books: [
        'R.S. Aggarwal basics',
        'Lucent\'s GK (banking chapters)',
        'S.P. Bakshi — Objective English'
      ],
      websites: [
        { t: 'IBPS Careers', u: 'https://www.ibps.in/' },
        { t: 'IBPS Clerk Notification', u: 'https://www.ibps.in/' }
      ],
      videos: [
        { t: 'IBPS Clerk Quant', u: 'https://www.youtube.com/@AbhinayMaths' },
        { t: 'IBPS Clerk English', u: 'https://www.youtube.com/@NeetuSinghClasses' }
      ],
      pyq: [
        { t: 'IBPS Clerk Prelims PYQ', u: 'https://www.ibps.in/' },
        { t: 'IBPS Clerk Mains PYQ', u: 'https://www.ibps.in/' }
      ]
    }
  },
  {
    id: 'ibps-rrb',
    name: 'IBPS RRB (Officer / Clerk)',
    org: 'Institute of Banking Personnel Selection',
    interest: ['bank'],
    minQ: 4,
    streams: 'any',
    age: '',
    blurb: 'Regional Rural Banks — Officer Scale I and Office Assistant.',
    match: { org: [/banking personnel|ibps|rrb/i], title: [/rrb|regional rural/i] },
    material: {
      subjects: ['Quant', 'Reasoning', 'English', 'Hindi', 'Computer Knowledge', 'Banking Awareness'],
      books: [
        'R.S. Aggarwal — Quant + Reasoning',
        'S.P. Bakshi — Objective English',
        'Lucent\'s GK',
        'Computer Awareness by Arihant'
      ],
      websites: [
        { t: 'IBPS RRB Careers', u: 'https://www.ibps.in/' },
        { t: 'IBPS RRB Notification', u: 'https://www.ibps.in/' }
      ],
      videos: [
        { t: 'IBPS RRB Strategy', u: 'https://www.youtube.com/@Adda247' },
        { t: 'IBPS RRB Reasoning', u: 'https://www.youtube.com/@ReasoningPoint' }
      ],
      pyq: [
        { t: 'IBPS RRB PO PYQ 2023', u: 'https://www.ibps.in/' },
        { t: 'IBPS RRB Clerk PYQ 2022', u: 'https://www.ibps.in/' }
      ]
    }
  },
  {
    id: 'uppsc',
    name: 'UPPSC PCS (SDM/DSP/ETO…)',
    org: 'UP Public Service Commission',
    interest: ['state'],
    minQ: 4,
    streams: 'any',
    age: '',
    blurb: 'Uttar Pradesh\'s civil services — SDM/DSP track for graduates.',
    match: { org: [/uttar pradesh.*public|uppsc/i], title: [/./] },
    material: {
      subjects: ['UP GK + History', 'Polity (Laxmikanth)', 'GS like UPSC Prelims', 'Hindi'],
      books: [
        'Pariksha Vani — UP GK',
        'M. Laxmikanth — Polity',
        'Spectrum — History',
        'NCERT VI–XII (All Subjects)'
      ],
      websites: [
        { t: 'UPPSC Official Portal', u: 'https://uppsc.up.nic.in/' },
        { t: 'UPPSC PCS Notification', u: 'https://uppsc.up.nic.in/' }
      ],
      videos: [
        { t: 'UPPSC PCS Strategy', u: 'https://www.youtube.com/@DrishtiIAS' },
        { t: 'UP GK Full Course', u: 'https://www.youtube.com/@StudyIQIAS' }
      ],
      pyq: [
        { t: 'UPPSC PCS Prelims PYQ', u: 'https://uppsc.up.nic.in/' },
        { t: 'UPPSC PCS Mains PYQ', u: 'https://uppsc.up.nic.in/' }
      ]
    }
  },
  {
    id: 'agniveer',
    name: 'Agniveer (Army/Navy/Airforce)',
    org: 'Indian Army',
    interest: ['def'],
    minQ: 1,
    streams: 'any (technical: PCM/ITI)',
    age: '',
    blurb: '10th/12th entry — rally + CEE written test.',
    match: { org: [/army|navy|airforce|agniveer/i], title: [/agniveer|rally|cee|soldier/i] },
    material: {
      subjects: ['GK + Current Affairs', 'Maths & Reasoning (X level)', 'Science', 'Physical fitness (1.6 km, pull-ups)'],
      books: [
        'NCERT Class X all subjects',
        'Lucent\'s GK',
        'Agniveer CEE practice sets',
        'R.S. Aggarwal — Reasoning Basics'
      ],
      websites: [
        { t: 'Join Indian Army', u: 'https://joinindianarmy.nic.in/' },
        { t: 'Agniveer Recruitment', u: 'https://joinindianarmy.nic.in/' }
      ],
      videos: [
        { t: 'Agniveer Preparation', u: 'https://www.youtube.com/@SSBCrack' },
        { t: 'Agniveer Physical Training', u: 'https://www.youtube.com/@IndianArmy' }
      ],
      pyq: [
        { t: 'Agniveer CEE PYQ 2023', u: 'https://joinindianarmy.nic.in/' }
      ]
    }
  },
  {
    id: 'ctet',
    name: 'CTET / Teaching (PRT/TGT)',
    org: 'CBSE / State Boards',
    interest: ['teach'],
    minQ: 4,
    streams: 'any (+ B.Ed/D.El.Ed required)',
    age: '',
    blurb: 'Graduation + teacher training unlocks KVS/NVS/state teacher posts.',
    match: null,
    live: false,
    material: {
      subjects: ['Child Pedagogy', 'Subject depth (your stream)', 'NCERT VI–VIII base', 'Hindi/English Language'],
      books: [
        'NCERT VI–VIII textbooks',
        'Lucent\'s GK',
        'Previous CTET papers',
        'Child Development & Pedagogy by Arihant'
      ],
      websites: [
        { t: 'CTET Official Site', u: 'https://ctet.nic.in/' },
        { t: 'CTET Notification', u: 'https://ctet.nic.in/' }
      ],
      videos: [
        { t: 'CTET Paper 1 Strategy', u: 'https://www.youtube.com/@Adda247' },
        { t: 'CTET Paper 2 Strategy', u: 'https://www.youtube.com/@StudyIQIAS' }
      ],
      pyq: [
        { t: 'CTET Paper 1 PYQ 2023', u: 'https://ctet.nic.in/' },
        { t: 'CTET Paper 2 PYQ 2022', u: 'https://ctet.nic.in/' }
      ]
    }
  },
  {
    id: 'police',
    name: 'UP Police / SSC GD / State Constable',
    org: 'State Police Boards',
    interest: ['police'],
    minQ: 2,
    streams: 'any',
    age: '',
    blurb: '12th-pass uniformed entry — written + physical in one cycle.',
    match: null,
    live: false,
    material: {
      subjects: ['General Hindi', 'GK & Current Affairs', 'Reasoning & Mental Ability', 'Physical (race, long jump)'],
      books: [
        'Lucent\'s GK + Hindi vyakaran',
        'R.S. Aggarwal — reasoning basics',
        'NCERT Class X Social Science'
      ],
      websites: [
        { t: 'UP Police Recruitment Board', u: 'https://uppbpb.gov.in/' },
        { t: 'SSC GD Constable Recruitment', u: 'https://ssc.gov.in/' }
      ],
      videos: [
        { t: 'UP Police Preparation', u: 'https://www.youtube.com/@Adda247' },
        { t: 'SSC GD Physical Training', u: 'https://www.youtube.com/@SSCGDConstable' }
      ],
      pyq: [
        { t: 'UP Police Constable PYQ 2023', u: 'https://uppbpb.gov.in/' },
        { t: 'SSC GD Constable PYQ 2022', u: 'https://ssc.gov.in/' }
      ]
    }
  },
  {
    id: 'gds',
    name: 'Post Office GDS (Gramin Dak Sevak)',
    org: 'India Post GDS',
    interest: ['post'],
    minQ: 1,
    streams: 'any',
    age: '',
    blurb: 'No exam — Class-10 merit + local language. Easiest central posting near home.',
    match: { org: [/post|gds/i], title: [/gds|gramin|dak|postal/i] },
    material: {
      subjects: ['Class-X merit (Maths/English marks)', 'Local language studied in X', 'Cycle/computer basics for verification'],
      books: [
        'NCERT Class X Maths & English',
        'State-board local-language grammar'
      ],
      websites: [
        { t: 'GDS Online Engagement', u: 'https://indiapostgdsonline.gov.in/' },
        { t: 'India Post Careers', u: 'https://www.indiapost.gov.in/' }
      ],
      videos: [
        { t: 'GDS Merit List Process', u: 'https://www.youtube.com/@IndiaPost' },
        { t: 'GDS Document Verification', u: 'https://www.youtube.com/@IndiaPost' }
      ],
      pyq: [
        { t: 'GDS Merit List 2023', u: 'https://indiapostgdsonline.gov.in/' }
      ]
    }
  }
];

function getProfile() { try { return JSON.parse(localStorage.getItem('st_profile') || 'null'); } catch { return null; } }
function saveProfile(p) { localStorage.setItem('st_profile', JSON.stringify({ ...p, updated: new Date().toISOString() })); }
function qualLevel(id) { const q = QUALS.find(x => x.id === id); return q ? q.level : 0; }

// verdict: eligible | preparing (one rung away) | later
function recommend(p) {
  if (!p || !p.qual) return null;
  const lv = qualLevel(p.qual);
  const interests = p.interests || [];
  // Filter families by user interests — only show exams matching at least one interest
  const filtered = FAMILIES.filter(f => interests.some(i => (f.interest || []).includes(i)));
  if (filtered.length === 0) return [];
  const out = filtered.map(f => {
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
    const like = interests.some(i => (f.interest || []).includes(i));
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
