// Live API loader — replaces mock EXAMS/SOURCES/JOBS with 100% real-time
// official-portal data whenever the backend is reachable. Include AFTER
// data.js + app.js, BEFORE the page's own inline script.
// Offline (plain Live Server): mock data stays, with an OFFLINE pill.

window.apiTrackExam = async function (examId, status, notes) {
  const token = localStorage.getItem('st_token') || '';
  const userId = localStorage.getItem('st_user_id') || null;
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = 'Bearer ' + token;

  const res = await fetch('/api/applications', {
    method: 'POST',
    headers,
    body: JSON.stringify({ examId: Number(examId) || examId, status, notes: notes || null, userId })
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to save application to MySQL');
  }

  return res.json();
};

window.apiUntrackExam = async function (examId) {
  const token = localStorage.getItem('st_token') || '';
  const userId = localStorage.getItem('st_user_id') || null;
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = 'Bearer ' + token;

  const numericId = Number(examId) || examId;
  let res;
  try {
    res = await fetch('/api/applications/' + encodeURIComponent(numericId) + (userId ? '?userId=' + userId : ''), {
      method: 'DELETE',
      headers
    });
  } catch (_) {
    res = await fetch('/api/applications/delete', {
      method: 'POST',
      headers,
      body: JSON.stringify({ examId: numericId, userId })
    });
  }

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to remove application from MySQL');
  }

  return res.json();
};

window.apiGetApplications = async function () {
  const token = localStorage.getItem('st_token') || '';
  const userId = localStorage.getItem('st_user_id') || null;
  const headers = {};
  if (token) headers['Authorization'] = 'Bearer ' + token;

  const res = await fetch('/api/applications' + (userId ? '?userId=' + userId : ''), {
    cache: 'no-store',
    headers
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to fetch applications');
  }

  return res.json();
};

(async function () {
  const token = () => localStorage.getItem('st_token') || '';
  const userId = () => localStorage.getItem('st_user_id') || '';

  async function get(p) {
    const headers = {};
    if (token()) headers['Authorization'] = 'Bearer ' + token();
    const r = await fetch(p, {
      cache: 'no-store',
      headers
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }

  function pill(live, n) {
    const top = document.querySelector('.top-actions');
    if (!top || document.getElementById('livePill')) return;
    const s = document.createElement('span');
    s.id = 'livePill';
    s.className = 'abtn ' + (live ? '' : 'light');
    s.style.cursor = 'default';
    s.textContent = live ? `● Live · ${n} notices` : '○ Demo data · backend offline';
    s.title = live ? 'Real-time official records from the backend' : 'Run: cd backend && npm install && node server.js';
    top.prepend(s);
  }

  let exams = null, sources = null, jobs = null, changes = null, applications = null;
  try {
    const fetches = [
      get('/api/exams'),
      get('/api/sources'),
      get('/api/jobs').catch(() => null),
      get('/api/changes').catch(() => null)
    ];

    if (token() || userId()) {
      fetches.push(get('/api/applications' + (userId() ? '?userId=' + userId() : '')).catch(() => null));
    }

    const results = await Promise.all(fetches);
    exams = results[0];
    sources = results[1];
    jobs = results[2];
    changes = results[3];
    if (results.length > 4) applications = results[4];
  } catch (e) {
    pill(false);
    return;
  }

  if (Array.isArray(exams) && exams.length) {
    EXAMS.length = 0;
    exams.forEach(e => EXAMS.push(e));
  }
  if (Array.isArray(sources) && sources.length) {
    SOURCES.length = 0;
    sources.forEach(s => SOURCES.push(s));
  }
  if (Array.isArray(jobs) && jobs.length && typeof JOBS !== 'undefined') {
    JOBS.length = 0;
    jobs.forEach(j => JOBS.push(j));
  }
  if (Array.isArray(changes)) window.LIVE_CHANGES = changes;

  // Sync applications from MySQL into local tracker state
  if (Array.isArray(applications)) {
    const t = {};
    applications.forEach(a => {
      t[a.exam_id] = a.status;
    });
    setTracker(t);
    document.dispatchEvent(new CustomEvent('tracker-changed'));
  }

  pill(true, EXAMS.length);
  document.dispatchEvent(new CustomEvent('data-changed'));
  try { if (typeof render === 'function') render(); } catch (_) { /* pages without render() */ }
  try { if (typeof renderDetails === 'function') renderDetails(); } catch (_) { /* not details page */ }
})();
