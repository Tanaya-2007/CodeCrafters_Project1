// Preparation tracker: subject checklists + % per tracked exam.
// Device-local (localStorage) so it works offline and in demo mode;
// server sync can ride on the existing /api/tracker session later.
const PREP_EXTRA = ['Previous-year papers solved', 'Full-length mock attempted'];

function subjectsFor(exam) {
  try {
    const f = (typeof familyForNotice === 'function') ? familyForNotice(exam) : null;
    const base = (f && f.material && f.material.subjects) ? [...f.material.subjects] : ['Syllabus topic 1', 'Syllabus topic 2', 'Revision'];
    return [...base, ...PREP_EXTRA];
  } catch (_) { return [...PREP_EXTRA]; }
}
function getPrep() { try { return JSON.parse(localStorage.getItem('st_prep') || '{}'); } catch { return {}; } }
function setPrep(p) { localStorage.setItem('st_prep', JSON.stringify(p)); }
function togglePrep(examId, idx) {
  const p = getPrep();
  if (!p[examId]) p[examId] = {};
  p[examId][idx] = !p[examId][idx];
  if (!p[examId][idx]) delete p[examId][idx];
  setPrep(p);
  document.dispatchEvent(new CustomEvent('prep-changed'));
}
function prepPct(exam) {
  const subs = subjectsFor(exam);
  const done = getPrep()[exam.id] || {};
  const n = subs.filter((_, i) => done[i]).length;
  return { pct: Math.round((n / subs.length) * 100), done: n, total: subs.length };
}
function ringHTML(pct, size) {
  const s = size || 54;
  return `<span style="width:${s}px;height:${s}px;border-radius:50%;flex-shrink:0;display:inline-grid;place-items:center;font-weight:900;font-size:${Math.round(s * 0.28)}px;background:conic-gradient(var(--ink) ${pct}%,#eceef3 ${pct}%);position:relative"><span style="background:#fff;border-radius:50%;width:${s - 12}px;height:${s - 12}px;display:grid;place-items:center">${pct}%</span></span>`;
}
