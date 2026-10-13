// SarkariTrack backend — Express API + live official-source ingestion + static FE.
// Run:  cd backend && npm install && node server.js   →  http://localhost:3000
require('dotenv').config();
const path = require('path');
const express = require('express');
const db = require('./db');
const { runAll, startCron } = require('./scheduler');

const app = express();
app.use(express.json({ limit: '256kb' }));

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@sarkari.track';
const ADMIN_PASS = process.env.ADMIN_PASSWORD || 'admin123';
if (!process.env.ADMIN_PASSWORD) console.warn('[auth] Using default admin password — set ADMIN_PASSWORD in .env');

// ---------- public ----------
app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));
app.get('/api/exams', async (req, res, next) => {
  try { res.json(await db.listExams({ q: req.query.q || '', org: req.query.org || '', status: req.query.status || '', sort: req.query.sort || 'deadline' })); }
  catch (e) { next(e); }
});
app.get('/api/exams/:id', async (req, res, next) => {
  try { const e = await db.getExam(req.params.id); if (!e) return res.status(404).json({ error: 'not found' }); res.json(e); }
  catch (e) { next(e); }
});
app.get('/api/sources', async (req, res, next) => { try { res.json(await db.listSources()); } catch (e) { next(e); } });
app.get('/api/changes', async (req, res, next) => { try { res.json(await db.listUpdates(80)); } catch (e) { next(e); } });

// ---------- auth (candidates) ----------
app.post('/api/auth/register', async (req, res, next) => {
  try {
    const { name = '', email = '', password = '' } = req.body || {};
    if (!name.trim() || !/.+@.+\..+/.test(email) || String(password).length < 6)
      return res.status(400).json({ error: 'name, valid email and 6+ char password required' });
    const u = await db.registerUser(name.trim(), email.trim(), String(password));
    const token = await db.mintToken(u.id, false);
    res.json({ token, user: { name: u.name, email: u.email } });
  } catch (e) { next(e); }
});
app.post('/api/auth/login', async (req, res, next) => {
  try {
    const { email = '', password = '' } = req.body || {};
    const u = await db.verifyUser(String(email), String(password));
    if (!u) return res.status(401).json({ error: 'invalid credentials' });
    res.json({ token: await db.mintToken(u.id, false), user: { name: u.name, email: u.email } });
  } catch (e) { next(e); }
});
app.post('/api/auth/admin', async (req, res) => {
  const { email = '', password = '' } = req.body || {};
  if (String(email).toLowerCase() === ADMIN_EMAIL.toLowerCase() && String(password) === ADMIN_PASS)
    return res.json({ token: 'demo-admin-' + ADMIN_PASS, admin: { email: ADMIN_EMAIL } });
  res.status(401).json({ error: 'invalid admin credentials' });
});

// ---------- admin ----------
async function requireAdmin(req, res, next) {
  const owner = await db.tokenOwner(req.headers.authorization || '');
  if (owner && owner.isAdmin) return next();
  res.status(403).json({ error: 'admin only' });
}
app.get('/api/review', requireAdmin, async (req, res, next) => {
  try { res.json(await db.listExams({ status: 'Needs Review' })); } catch (e) { next(e); }
});
app.get('/api/jobs', requireAdmin, async (req, res, next) => {
  try { res.json(await db.listJobs(30)); } catch (e) { next(e); }
});
app.post('/api/admin/refresh', requireAdmin, async (req, res) => {
  runAll(db, { reason: 'manual' }).catch(e => console.error('[refresh]', e.message));
  res.json({ started: true });
});

// ---------- frontend ----------
const FE = path.join(__dirname, '..', 'frontend');
app.use(express.static(FE));
app.get('/', (req, res) => res.sendFile(path.join(FE, 'index.html')));

// ---------- errors ----------
app.use('/api', (req, res) => res.status(404).json({ error: 'unknown endpoint' }));
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const status = err.status || 500;
  console.error('[api]', status, err.message);
  res.status(status).json({ error: err.message || 'server error' });
});

const PORT = process.env.PORT || 3000;
(async () => {
  await db.init();
  app.listen(PORT, () => console.log(`SarkariTrack live at http://localhost:${PORT}`));
  runAll(db, { reason: 'startup' }).catch(e => console.error('[startup scrape]', e.message)); // non-blocking first ingestion
  startCron(db);
})();
