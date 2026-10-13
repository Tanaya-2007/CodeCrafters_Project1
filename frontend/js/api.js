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
  if (Array.isArray(sources) && sources.length) { SOURCES.length = 0; sources.forEach(s => SOURCES.push(s)); }
  if (Array.isArray(jobs) && jobs.length && typeof JOBS !== 'undefined') { JOBS.length = 0; jobs.forEach(j => JOBS.push(j)); }
  if (Array.isArray(changes)) window.LIVE_CHANGES = changes;
  pill(true, EXAMS.length);
  document.dispatchEvent(new CustomEvent('data-changed'));
  try { if (typeof render === 'function') render(); } catch (_) { /* pages without render() */ }
  // exam-details renders once at load — rebuild it if present
  try { if (typeof renderDetails === 'function') renderDetails(); } catch (_) { /* not details page */ }
})();
