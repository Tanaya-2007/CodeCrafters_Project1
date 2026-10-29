// SarkariTrack backend — Express API + live official-source ingestion + static FE.
// Run:  cd backend && npm install && node server.js   →  http://localhost:3000
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const db = require('./db');
const { runAll, startCron } = require('./scheduler');

const app = express();
app.use(express.json({ limit: '256kb' }));

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@sarkari.track';
const ADMIN_PASS = process.env.ADMIN_PASSWORD || 'admin123';
if (!process.env.ADMIN_PASSWORD) console.warn('[auth] Using default admin password — set ADMIN_PASSWORD in .env');

// Helper to resolve candidate identity from Bearer token or fallback
async function resolveCandidate(req) {
  const header = req.headers.authorization || '';
  const owner = await db.tokenOwner(header);
  if (owner && owner.userId) return owner.userId;
  if (req.query && req.query.userId) return Number(req.query.userId);
  if (req.body && req.body.userId) return Number(req.body.userId);
  return null;
}

// ---------- public ----------
app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));
app.get('/api/exams', async (req, res, next) => {
  try { res.json(await db.listExams({ q: req.query.q || '', org: req.query.org || '', status: req.query.status || '', sort: req.query.sort || 'deadline', publicOnly: true })); }
  catch (e) { next(e); }
});
app.get('/api/exams/:id', async (req, res, next) => {
  try {
    const e = await db.getExam(req.params.id);
    if (!e || !['Verified', 'Updated'].includes(e.status)) return res.status(404).json({ error: 'not found' });
    res.json(e);
  }
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
    res.json({ token, user: { id: u.id, name: u.name, email: u.email } });
  } catch (e) { next(e); }
});
app.post('/api/auth/login', async (req, res, next) => {
  try {
    const { email = '', password = '' } = req.body || {};
    const u = await db.verifyUser(String(email), String(password));
    if (!u) return res.status(401).json({ error: 'invalid credentials' });
    res.json({ token: await db.mintToken(u.id, false), user: { id: u.id, name: u.name, email: u.email } });
  } catch (e) { next(e); }
});
app.get('/api/auth/me', async (req, res, next) => {
  try {
    const userId = await resolveCandidate(req);
    if (!userId) return res.status(401).json({ error: 'unauthorized' });
    const user = await db.getUserById(userId);
    if (!user) return res.status(404).json({ error: 'user not found' });
    res.json({ user });
  } catch (e) { next(e); }
});
app.post('/api/auth/admin', async (req, res) => {
  const { email = '', password = '' } = req.body || {};
  if (String(email).toLowerCase() === ADMIN_EMAIL.toLowerCase() && String(password) === ADMIN_PASS)
    return res.json({ token: 'demo-admin-' + ADMIN_PASS, admin: { email: ADMIN_EMAIL } });
  res.status(401).json({ error: 'invalid admin credentials' });
});

// ---------- user tracker (server-owned, forward-only) ----------
async function requireUser(req, res, next) {
  const owner = await db.tokenOwner(req.headers.authorization || '');
  if (owner && owner.userId && !owner.isAdmin) { req.userId = owner.userId; return next(); }
  res.status(401).json({ error: 'candidate login required' });
}
app.get('/api/tracker', requireUser, async (req, res, next) => {
  try { res.json(await db.getTracks(req.userId)); } catch (e) { next(e); }
});
app.post('/api/tracker', requireUser, async (req, res, next) => {
  try {
    const { exam_id = '', status = '' } = req.body || {};
    res.json(await db.setTrack(req.userId, String(exam_id), String(status)));
  } catch (e) { next(e); }
});

// ---------- admin ----------
async function requireAdmin(req, res, next) {
  const owner = await db.tokenOwner(req.headers.authorization || '');
  if (owner && owner.isAdmin) return next();
  res.status(403).json({ error: 'admin only' });
}
app.get('/api/review', requireAdmin, async (req, res, next) => {
  try { res.json(await db.listExams({ statuses: ['New', 'Needs Review'], sort: 'deadline' })); } catch (e) { next(e); }
});
app.post('/api/admin/exams/:id/approve', requireAdmin, async (req, res, next) => {
  try {
    const e = await db.setExamStatus(req.params.id, 'Verified', 'Approved by admin → public');
    if (!e) return res.status(404).json({ error: 'not found' });
    res.json(e);
  } catch (e) { next(e); }
});
app.post('/api/admin/exams/:id/reject', requireAdmin, async (req, res, next) => {
  try {
    const e = await db.setExamStatus(req.params.id, 'Rejected', 'Rejected by admin → hidden');
    if (!e) return res.status(404).json({ error: 'not found' });
    res.json(e);
  } catch (e) { next(e); }
});
app.post('/api/admin/exams/approve-all', requireAdmin, async (req, res, next) => {
  try {
    const pending = await db.listExams({ statuses: ['New'] });
    let n = 0;
    for (const e of pending) { await db.setExamStatus(e.id, 'Verified', 'Bulk-approved by admin → public'); n++; }
    res.json({ approved: n });
  } catch (e) { next(e); }
});
app.get('/api/jobs', requireAdmin, async (req, res, next) => {
  try { res.json(await db.listJobs(30)); } catch (e) { next(e); }
});
app.post('/api/admin/refresh', requireAdmin, async (req, res) => {
  runAll(db, { reason: 'manual' }).catch(e => console.error('[refresh]', e.message));
  res.json({ started: true });
});

// ---------- candidate application tracking ----------

// ---------- exam roadmaps (dynamic, per user) ----------
app.get('/api/roadmaps/:examId', async (req, res, next) => {
  try {
    const examId = Number(req.params.examId);
    const map = await db.getRoadmap(examId);
    if (!map) return res.status(404).json({ error: 'roadmap not found' });
    res.json(map);
  } catch (e) { next(e); }
});

app.get('/api/roadmaps/:examId/progress', async (req, res, next) => {
  try {
    const owner = await db.tokenOwner(req.headers.authorization || '');
    if (!owner || !owner.userId) return res.status(401).json({ error: 'candidate login required' });
    const data = await db.getUserRoadmapProgress(owner.userId, Number(req.params.examId));
    if (!data) return res.status(404).json({ error: 'roadmap not found' });
    res.json(data);
  } catch (e) { next(e); }
});

app.post('/api/roadmaps/:examId/progress', async (req, res, next) => {
  try {
    const owner = await db.tokenOwner(req.headers.authorization || '');
    if (!owner || !owner.userId) return res.status(401).json({ error: 'candidate login required' });
    const { topicId, completed } = req.body || {};
    if (!topicId) return res.status(400).json({ error: 'topicId required' });
    res.json(await db.toggleTopicProgress(owner.userId, Number(topicId), completed === true));
  } catch (e) { next(e); }
});

app.post('/api/admin/roadmaps/:examId', requireAdmin, async (req, res, next) => {
  try {
    const { title, totalWeeks, weeks, createdByAdmin } = req.body || {};
    if (!totalWeeks || !weeks) return res.status(400).json({ error: 'totalWeeks and weeks required' });
    res.json(await db.createRoadmap(Number(req.params.examId), title, Number(totalWeeks), weeks, createdByAdmin));
  } catch (e) { next(e); }
});

app.get('/api/applications', async (req, res, next) => {
  try {
    const userId = await resolveCandidate(req);
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const apps = await db.getUserApplications(userId);
    res.json(apps);
  } catch (e) { next(e); }
});

app.post('/api/applications', async (req, res, next) => {
  try {
    const userId = await resolveCandidate(req);
    const { examId, status, notes } = req.body || {};

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required to track applications' });
    }
    if (!examId || !status) {
      return res.status(400).json({ error: 'examId and status are required' });
    }

    const saved = await db.updateApplication(userId, Number(examId), status, notes || null);
    res.json({ success: true, application: saved });
  } catch (e) {
    next(e);
  }
});

app.delete('/api/applications/:examId', async (req, res, next) => {
  try {
    const userId = await resolveCandidate(req);
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const examId = Number(req.params.examId);
    if (!examId) {
      return res.status(400).json({ error: 'valid examId required' });
    }
    const existed = await db.deleteApplication(userId, examId);
    res.json({ success: true, removed: examId, existed });
  } catch (e) { next(e); }
});

app.post('/api/applications/delete', async (req, res, next) => {
  try {
    const userId = await resolveCandidate(req);
    const examId = Number(req.body?.examId);
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    if (!examId) {
      return res.status(400).json({ error: 'valid examId required' });
    }
    const existed = await db.deleteApplication(userId, examId);
    res.json({ success: true, removed: examId, existed });
  } catch (e) { next(e); }
});

// ---------- frontend ----------
const FE = path.join(__dirname, '..', 'frontend');
const fs = require('fs');

// Server-side render: fetch exams first, inject into HTML so no blank flash
async function renderPageWithExams(res, fileName) {
  let exams = [];
  try {
    exams = await db.listExams({ publicOnly: true });
  } catch (_) { /* db may not be ready yet */ }

  const html = fs.readFileSync(path.join(FE, fileName), 'utf8');
  const injected = html.replace(
    '</body>',
    `<script>window.__EXAMS__ = ${JSON.stringify(exams)};</script></body>`
  );
  res.send(injected);
}

app.use(express.static(FE));
app.get('/', (req, res) => renderPageWithExams(res, 'index.html'));
app.get('/dashboard.html', (req, res) => renderPageWithExams(res, 'dashboard.html'));
app.get('/explore.html', (req, res) => renderPageWithExams(res, 'explore.html'));
app.get('/exam-details.html', (req, res) => renderPageWithExams(res, 'exam-details.html'));
app.get('/tracker.html', (req, res) => renderPageWithExams(res, 'tracker.html'));
app.get('/history.html', (req, res) => renderPageWithExams(res, 'history.html'));
app.get('/notifications.html', (req, res) => renderPageWithExams(res, 'notifications.html'));
app.get('/profile.html', (req, res) => renderPageWithExams(res, 'profile.html'));
app.get('/foryou.html', (req, res) => renderPageWithExams(res, 'foryou.html'));
app.get('/compare.html', (req, res) => res.sendFile(path.join(FE, 'compare.html')));
app.get('/admin.html', (req, res) => res.sendFile(path.join(FE, 'admin.html')));
app.get('/admin-sources.html', (req, res) => res.sendFile(path.join(FE, 'admin-sources.html')));
app.get('/admin-review.html', (req, res) => res.sendFile(path.join(FE, 'admin-review.html')));
app.get('/admin-changes.html', (req, res) => res.sendFile(path.join(FE, 'admin-changes.html')));
app.get('/admin-jobs.html', (req, res) => res.sendFile(path.join(FE, 'admin-jobs.html')));
app.get('/admin-login.html', (req, res) => res.sendFile(path.join(FE, 'admin-login.html')));
app.get('/login.html', (req, res) => res.sendFile(path.join(FE, 'login.html')));
app.get('/register.html', (req, res) => res.sendFile(path.join(FE, 'register.html')));

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
