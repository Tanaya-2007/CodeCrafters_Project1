// Scheduler: checks official sources sequentially, validates, dedups,
// detects changes, stores. Temporary source failure only writes a job log
// with Source Unavailable — trusted data is never erased (PS §11).
const { SOURCES, scrapeSource } = require('./scrape');
const { validate } = require('./validate');

const sleep = ms => new Promise(r => setTimeout(r, ms));
let running = false;

async function runAll(db, { reason = 'scheduled' } = {}) {
  if (running) return { skipped: true };
  running = true;
  const summary = { reason, at: new Date().toISOString(), sources: [] };
  try {
    for (const src of SOURCES) {
      const row = await db.ensureSource(src);
      const jobId = await db.logJob(row.id, {});
      const stat = { source: src.name, found: 0, inserted: 0, updated: 0, review: 0, result: 'success', error: null };
      try {
        let items;
        try {
          items = await scrapeSource(src);
        } catch (first) {
          await sleep(4000); // one retry: transient blocks/timeouts are common on govt portals
          items = await scrapeSource(src);
        }
        stat.found = items.length;
        for (const raw of items) {
          const { record, status } = validate(raw);
          if (!record) continue; // junk skipped, never stored
          const res = await db.upsertExam(row.id, { ...record, status });
          if (res.action === 'inserted' || res.action === 'pending') stat.inserted++;
          else if (res.action === 'updated') stat.updated++;
          else if (res.action === 'review') stat.review++;
        }
        await db.touchSource(row.id, stat.updated ? 'Updated' : 'Verified', stat.found);
      } catch (e) {
        stat.result = 'source_unavailable'; stat.error = String(e.message || e).slice(0, 300);
        await db.touchSource(row.id, 'Source Unavailable', 0);
      }
      await db.logJob(row.id, { id: jobId, result: stat.result, found: stat.found, inserted: stat.inserted, updated: stat.updated, review: stat.review, error: stat.error, src: src.name });
      summary.sources.push(stat);
      await sleep(1000); // polite gap between official portals
    }
  } finally { running = false; }
  return summary;
}

function startCron(db) {
  const cron = require('node-cron');
  const expr = process.env.SCRAPE_CRON || '0 */1 * * *';
  cron.schedule(expr, () => runAll(db).catch(e => console.error('[scheduler]', e.message)));
  console.log('[scheduler] cron: ' + expr);
}

module.exports = { runAll, startCron };
