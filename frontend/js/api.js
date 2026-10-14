// Live API loader — replaces mock EXAMS/SOURCES/JOBS with 100% real-time
// official-portal data whenever the backend is reachable. Include AFTER
// data.js + app.js, BEFORE the page's own inline script.
// Offline (plain Live Server): mock data stays, with an OFFLINE pill.
(async function () {
  const token = () => localStorage.getItem('st_token') || '';
  async function get(p) {
    const r = await fetch(p, {
      cache: 'no-store',
      headers: token() ? { Authorization: 'Bearer ' + token() } : {}
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
  let exams = null, sources = null, jobs = null, changes = null;
  try {
    [exams, sources, jobs, changes] = await Promise.all([
      get('/api/exams'), get('/api/sources'),
      get('/api/jobs').catch(() => null), get('/api/changes').catch(() => null)
    ]);
  } catch (e) { pill(false); return; } // backend unreachable → keep page defaults
  if (Array.isArray(exams) && exams.length) {
    EXAMS.length = 0;
    exams.forEach(e => EXAMS.push(e));
  }
  // admin console also needs the pending queue (public endpoint hides it)
  try {
    const pg = document.body.dataset.page || '';
    if (pg === 'admin' || pg.startsWith('admin-')) {
      const q = await get('/api/review').catch(() => null);
      if (Array.isArray(q)) {
        const ids = new Set(EXAMS.map(e => e.id));
        q.forEach(e => { if (!ids.has(e.id)) EXAMS.push(e); });
      }
    }
  } catch (_) { /* candidates never see the queue */ }
  if (Array.isArray(sources) && sources.length) { SOURCES.length = 0; sources.forEach(s => SOURCES.push(s)); }
  if (Array.isArray(jobs) && jobs.length && typeof JOBS !== 'undefined') { JOBS.length = 0; jobs.forEach(j => JOBS.push(j)); }
  if (Array.isArray(changes)) window.LIVE_CHANGES = changes;
  pill(true, EXAMS.length);
  document.dispatchEvent(new CustomEvent('data-changed'));
  try { if (typeof render === 'function') render(); } catch (_) { /* pages without render() */ }
  // exam-details renders once at load — rebuild it if present
  try { if (typeof renderDetails === 'function') renderDetails(); } catch (_) { /* not details page */ }
  // pull server-owned tracker into local cache when logged in
  try {
    if (localStorage.getItem('st_token')) {
      const tr = await get('/api/tracker').catch(() => null);
      if (tr && typeof tr === 'object') {
        setTracker(tr);
        document.dispatchEvent(new CustomEvent('tracker-changed'));
        try { if (typeof render === 'function') render(); } catch (_) {}
        try { if (typeof renderDetails === 'function') renderDetails(); } catch (_) {}
      }
    }
  } catch (_) { /* device-local tracker stays */ }
})();

// Server-owned tracker helper. save() → {ok} | {error} | null(offline).
// Server enforces forward-only transitions; Completed never wraps around.
window.TrackAPI = {
  async save(examId, status) {
    const t = localStorage.getItem('st_token');
    if (!t) return null;
    try {
      const r = await fetch('/api/tracker', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + t },
        body: JSON.stringify({ exam_id: examId, status })
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) return { error: j.error || 'rejected by server' };
      return { ok: true };
    } catch (_) { return null; }
  }
};
