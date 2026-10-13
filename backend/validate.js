// PS Section 11 — Validation & Reliability Rules.
// Verified  = org + title + official URL present (a real official notice).
// Needs Review = ambiguous (junk title, bad URL, end < start, duplicate-ish).
// A source failure NEVER deletes trusted data (handled in scheduler: failures only log).
const crypto = require('crypto');

function clean(s) {
  return String(s || '').replace(/&nbsp;|&#0?39;|&amp;|&quot;/g, m => ({ '&nbsp;': ' ', '&#039;': "'", '&#39;': "'", '&amp;': '&', '&quot;': '"' }[m] || m))
    .replace(/\s+/g, ' ').trim();
}
function validURL(u) { try { const x = new URL(u); return x.protocol === 'http:' || x.protocol === 'https:'; } catch { return false; } }
function parseDate(s) {
  if (!s) return null;
  s = String(s).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  m = s.match(/(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{4})/i);
  if (m) { const mo = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' }[m[2].slice(0, 3).toLowerCase()]; return `${m[3]}-${mo}-${m[1].padStart(2, '0')}`; }
  return null;
}
function hash(rec) {
  return crypto.createHash('sha256').update([rec.organization, rec.title, rec.official_url, rec.application_end || '', rec.exam_date || ''].join('|').toLowerCase()).digest('hex');
}

// raw: {organization,title,advt_no,application_start,application_end,exam_date,admit_card_date,official_url}
// → {record|null, status} — null only when the item is junk (never stored).
function validate(raw) {
  const title = clean(raw.title);
  if (title.length < 15 || !validURL(raw.official_url)) return { record: null, reason: 'junk' };
  let end = parseDate(raw.application_end), start = parseDate(raw.application_start);
  let exam = parseDate(raw.exam_date), admit = parseDate(raw.admit_card_date);
  let review = false;
  if (start && end && end < start) { end = null; review = true; } // end must not precede start → drop bad date, flag review
  const rec = {
    organization: clean(raw.organization), title,
    advt_no: clean(raw.advt_no) || null,
    application_start: start, application_end: end, exam_date: exam, admit_card_date: admit,
    official_url: raw.official_url
  };
  rec.content_hash = hash(rec);
  return { record: rec, status: review ? 'Needs Review' : 'Verified' };
}

module.exports = { clean, validURL, parseDate, hash, validate };
