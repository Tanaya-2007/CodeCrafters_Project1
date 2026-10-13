// Live ingestion from official government portals. No dummy data anywhere:
// every record originates from a real HTTP fetch of a trusted .gov / .nic / .org site.
// Polite by design: browser UA, 15s timeout, sequential sources, 1s gap,
// item caps, failures logged as Source Unavailable (never stored as data).
const cheerio = require('cheerio');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) SarkariTrack-MVP/1.0 (+https://github.com/Tanaya-2007/CodeCrafters_Project1)';

// 8 official sources. Portal statuses are honest: JS-SPA portals (SSC/RBI/Army)
// yield 0 items server-side until the headless-JS upgrade — the scheduler
// reports them instead of inventing data.
// NOTE: ibps.in serves an incomplete TLS chain on some networks; it is retried
// with chain verification off ONLY for reading public notices (nothing is submitted).
const SOURCES = [
  { key: 'upsc', name: 'Union Public Service Commission', base: 'https://upsc.gov.in', listing: 'https://upsc.gov.in/', linkFilter: /whats-new|examinations|recruitment/i, skipText: /face authentication|status of .*cases|recruitment cases kept/i },
  { key: 'ssc', name: 'Staff Selection Commission', base: 'https://ssc.gov.in', listing: 'https://ssc.gov.in/', linkFilter: null, skipText: null },
  { key: 'rrb', name: 'Railway Recruitment Board', base: 'https://rrbcdg.gov.in', listing: 'https://rrbcdg.gov.in/', linkFilter: /getdata/i, skipText: null },
  { key: 'ibps', name: 'Institute of Banking Personnel Selection', base: 'https://www.ibps.in', listing: 'https://www.ibps.in/', linkFilter: null, skipText: /personnel selection services for recruitment, promotion/i, insecureTLS: true },
  { key: 'uppsc', name: 'UP Public Service Commission', base: 'https://uppsc.up.nic.in', listing: 'https://uppsc.up.nic.in/', linkFilter: null, skipText: null },
  { key: 'gds', name: 'India Post GDS', base: 'https://indiapostgdsonline.gov.in', listing: 'https://indiapostgdsonline.gov.in/', linkFilter: null, skipText: null },
  { key: 'rbi', name: 'Reserve Bank of India', base: 'https://opportunities.rbi.org.in', listing: 'https://opportunities.rbi.org.in/', linkFilter: null, skipText: null },
  { key: 'army', name: 'Indian Army', base: 'https://joinindianarmy.nic.in', listing: 'https://joinindianarmy.nic.in/', linkFilter: null, skipText: null },
];

const KEYWORDS = /recruit|advertis|notification|vacanc|exam|apply|posts|result|admit|engagement|apprentice|agniveer|rally|panel|interview|schedule|time table|counselling|call letter|shortlist/i;

async function fetchOnce(url, timeoutMs, insecure) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), timeoutMs);
  try {
    const opts = { signal: c.signal, headers: { 'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml' } };
    if (insecure) opts.dispatcher = undefined;
    const r = await fetch(url, opts);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const ct = (r.headers.get('content-type') || '').toLowerCase();
    if (ct && !ct.includes('html') && !ct.includes('text')) throw new Error('non-HTML: ' + ct);
    return await r.text();
  } finally { clearTimeout(t); }
}

async function fetchHTML(url, timeoutMs = 15000, insecure = false) {
  try {
    return await fetchOnce(url, timeoutMs, false);
  } catch (e) {
    // Fallback ONLY for reading public notices from hosts with broken chains.
    if (insecure && /certificate|tls|ssl|verify|signature/i.test(String(e.cause?.code || e.message))) {
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
      try { return await fetchOnce(url, timeoutMs, true); }
      finally { delete process.env.NODE_TLS_REJECT_UNAUTHORIZED; }
    }
    throw e;
  }
}

function extractAdvt(text) {
  let m = text.match(/\b(CEN\s*\d+\s*\/\s*\d{4})/i); if (m) return m[1].replace(/\s+/g, ' ').toUpperCase();
  m = text.match(/(Advt\.?\s*No\.?\s*[\w\-\/\. ]{1,24}?\d{4})/i); if (m) return m[1].replace(/\s+/g, ' ').trim().slice(0, 60);
  m = text.match(/CRP[-\s]?(PO\/MT|CLERK|RRB)[-\s]?[A-Z0-9]*/i); if (m) return m[0].replace(/\s+/g, ' ').toUpperCase().slice(0, 40);
  m = text.match(/\(?(\d{2}\/\d{4})\)?/); if (m) return m[1];
  return '';
}
function extractDates(text) {
  const out = [];
  const re = /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}|\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4})/gi;
  let m; while ((m = re.exec(text)) && out.length < 4) out.push(m[1]);
  return out;
}

// Parent-row context: list pages often keep the CEN number / state / date
// OUTSIDE the <a> (e.g. "(06/2026)  Notification (07-10-2026)", GDS state tables).
function parentContext($, a) {
  const p = $(a).closest('li,tr,div.row,div.item,td').first();
  if (!p.length) return '';
  return p.text().replace(/\s+/g, ' ').trim().slice(0, 220);
}

function parseListing(html, src) {
  const $ = cheerio.load(html);
  const seenURL = new Set(), seenTitle = new Set(), items = [];
  $('a[href]').each((_, a) => {
    if (items.length >= 25) return false;
    const href = ($(a).attr('href') || '').trim();
    if (!href || /^(javascript:|mailto:|tel:|#)/i.test(href)) return;
    if (src.linkFilter && !src.linkFilter.test(href)) return;
    let text = $(a).text().replace(/\s+/g, ' ').trim();
    if (text.length < 18 || text.length > 300) return;
    if (!KEYWORDS.test(text)) return;
    if (src.skipText && src.skipText.test(text)) return;
    let url;
    try { url = new URL(href, src.base).toString(); } catch { return; }
    if (!/^https?:/i.test(url)) return;
    if (seenURL.has(url)) return;
    // Enrich thin anchor text with parent-row context (CEN no, state, date).
    const ctx = parentContext($, a);
    if (ctx && ctx.length > text.length + 10 && ctx.length < 260 && KEYWORDS.test(ctx)) {
      if (/CEN\s*\d+\/\d+|\(\d{2}\/\d{4}\)|Advt/i.test(ctx) && !/CEN|Advt|\(\d{2}\/\d{4}\)/i.test(text)) text = ctx;
    }
    const normTitle = text.toLowerCase();
    if (seenTitle.has(normTitle)) return; // collapse per-state PDF spam etc.
    seenURL.add(url); seenTitle.add(normTitle);
    const dates = extractDates(text);
    items.push({
      organization: src.name, title: text, advt_no: extractAdvt(text),
      application_start: null, application_end: null, exam_date: null, admit_card_date: null,
      notice_date: dates[0] || null, official_url: url
    });
  });
  return items;
}

async function scrapeSource(src) {
  const html = await fetchHTML(src.listing, 15000, !!src.insecureTLS);
  return parseListing(html, src);
}

module.exports = { SOURCES, fetchHTML, parseListing, scrapeSource, extractAdvt, extractDates };
