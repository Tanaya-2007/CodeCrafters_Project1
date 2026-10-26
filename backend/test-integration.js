const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const mysql = require('mysql2/promise');
const http = require('http');
const express = require('express');
const db = require('./db');

async function runTests() {
  console.log('=== STARTING INTEGRATION & DATABASE TESTS ===\n');

  // Direct MySQL connection for independent verification
  const rawConn = await mysql.createConnection({
    host: process.env.MYSQL_HOST || 'localhost',
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
    database: process.env.MYSQL_DATABASE || 'competitive_exam_tracker',
    dateStrings: true
  });

  // Init db layer
  await db.init();

  // Spin up an in-process Express server instance on a test port
  const app = express();
  app.use(express.json({ limit: '256kb' }));

  async function resolveCandidate(req) {
    const header = req.headers.authorization || '';
    const owner = await db.tokenOwner(header);
    if (owner && owner.userId) return owner.userId;
    if (req.query && req.query.userId) return Number(req.query.userId);
    if (req.body && req.body.userId) return Number(req.body.userId);
    return null;
  }

  // Set up the routes as in server.js
  app.get('/api/health', (req, res) => res.json({ ok: true }));
  app.get('/api/exams', async (req, res, next) => {
    try { res.json(await db.listExams()); } catch (e) { next(e); }
  });
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
  app.get('/api/applications', async (req, res, next) => {
    try {
      const userId = await resolveCandidate(req);
      if (!userId) return res.status(401).json({ error: 'Authentication required' });
      const apps = await db.getUserApplications(userId);
      res.json(apps);
    } catch (e) { next(e); }
  });
  app.post('/api/applications', async (req, res, next) => {
    try {
      const userId = await resolveCandidate(req);
      const { examId, status, notes } = req.body || {};
      if (!userId) return res.status(401).json({ error: 'Authentication required to track applications' });
      if (!examId || !status) return res.status(400).json({ error: 'examId and status are required' });
      const saved = await db.updateApplication(userId, Number(examId), status, notes || null);
      res.json({ success: true, application: saved });
    } catch (e) { next(e); }
  });
  app.delete('/api/applications/:examId', async (req, res, next) => {
    try {
      const userId = await resolveCandidate(req);
      if (!userId) return res.status(401).json({ error: 'Authentication required' });
      const examId = Number(req.params.examId);
      if (!examId) return res.status(400).json({ error: 'valid examId required' });
      const existed = await db.deleteApplication(userId, examId);
      res.json({ success: true, removed: examId, existed });
    } catch (e) { next(e); }
  });

  const server = http.createServer(app);
  await new Promise(r => server.listen(3099, r));
  console.log('Test server listening on port 3099');

  const BASE = 'http://localhost:3099';

  async function api(path, method = 'GET', body = null, token = null) {
    const headers = {};
    if (body) headers['Content-Type'] = 'application/json';
    if (token) headers['Authorization'] = 'Bearer ' + token;
    const res = await fetch(BASE + path, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined
    });
    const data = await res.json().catch(() => ({}));
    return { status: res.status, ok: res.ok, data };
  }

  try {
    // 1. Health check
    const h = await api('/api/health');
    console.log('✓ Health check passed:', h.data);

    // 2. Candidate Registration Test
    const testEmail = `test_candidate_${Date.now()}@example.com`;
    const regRes = await api('/api/auth/register', 'POST', {
      name: 'Integration Test Candidate',
      email: testEmail,
      password: 'password123'
    });
    if (!regRes.ok || !regRes.data.token || !regRes.data.user.id) {
      throw new Error('Registration failed: ' + JSON.stringify(regRes.data));
    }
    const testUserId = regRes.data.user.id;
    const testToken = regRes.data.token;
    console.log(`✓ Registration passed: user_id=${testUserId}, email=${testEmail}`);

    // Verify registration in MySQL directly
    const [userRows] = await rawConn.query('SELECT id, name, email FROM users WHERE id = ?', [testUserId]);
    if (!userRows.length || userRows[0].email !== testEmail) {
      throw new Error('User not found in MySQL directly!');
    }
    console.log('✓ Verified user in MySQL users table directly:', userRows[0]);

    // 3. Candidate Login Test
    const loginRes = await api('/api/auth/login', 'POST', {
      email: testEmail,
      password: 'password123'
    });
    if (!loginRes.ok || !loginRes.data.token || loginRes.data.user.id !== testUserId) {
      throw new Error('Login failed: ' + JSON.stringify(loginRes.data));
    }
    console.log('✓ Login passed with token issued.');

    // 4. Exams Retrieval Test
    const examsRes = await api('/api/exams');
    if (!examsRes.ok || !Array.isArray(examsRes.data) || examsRes.data.length === 0) {
      throw new Error('Exams list is empty or failed');
    }
    const testExam = examsRes.data[0];
    const testExamId = Number(testExam.id);
    console.log(`✓ Exams list returned ${examsRes.data.length} exams from MySQL. Using Exam ID ${testExamId}: "${testExam.title}"`);

    // Verify Exam in MySQL directly
    const [examRows] = await rawConn.query('SELECT id, title, organization FROM exams WHERE id = ?', [testExamId]);
    if (!examRows.length) throw new Error(`Exam ID ${testExamId} not found in MySQL exams table!`);
    console.log('✓ Verified exam in MySQL exams table directly:', examRows[0]);

    // 5. Application Tracking: "Interested"
    console.log('\n--- Testing Status Transitions in MySQL ---');
    const trackRes = await api('/api/applications', 'POST', {
      examId: testExamId,
      status: 'Interested',
      notes: 'Initial test note'
    }, testToken);
    if (!trackRes.ok) throw new Error('Tracking Interested failed: ' + JSON.stringify(trackRes.data));
    console.log('✓ API tracked exam as "Interested"');

    // Verify in MySQL
    let [appRows] = await rawConn.query('SELECT * FROM applications WHERE user_id = ? AND exam_id = ?', [testUserId, testExamId]);
    if (!appRows.length || appRows[0].status !== 'Interested') {
      throw new Error('Application status "Interested" not saved in MySQL!');
    }
    console.log('✓ Direct MySQL query verified application:', appRows[0]);

    // 6. Test all status transitions: Applied, Admit Card, Exam Done, Completed
    const statuses = ['Applied', 'Admit Card', 'Exam Done', 'Completed'];
    for (const st of statuses) {
      const updateRes = await api('/api/applications', 'POST', {
        examId: testExamId,
        status: st
      }, testToken);
      if (!updateRes.ok) throw new Error(`Status update to "${st}" failed: ` + JSON.stringify(updateRes.data));

      // Direct MySQL verification
      const [chk] = await rawConn.query('SELECT status, updated_at FROM applications WHERE user_id = ? AND exam_id = ?', [testUserId, testExamId]);
      if (!chk.length || chk[0].status !== st) {
        throw new Error(`MySQL status verification failed for "${st}"! Got: ` + JSON.stringify(chk));
      }
      console.log(`✓ Status transitioned to "${st}" -> MySQL verified status: ${chk[0].status} (updated_at: ${chk[0].updated_at})`);
    }

    // 7. Test Application Retrieval (/api/applications)
    console.log('\n--- Testing Application Retrieval (Page Refresh simulation) ---');
    const getAppsRes = await api('/api/applications', 'GET', null, testToken);
    if (!getAppsRes.ok || !Array.isArray(getAppsRes.data)) {
      throw new Error('GET /api/applications failed: ' + JSON.stringify(getAppsRes.data));
    }
    const myApp = getAppsRes.data.find(a => a.exam_id === testExamId);
    if (!myApp || myApp.status !== 'Completed') {
      throw new Error('Application retrieval did not return persisted status "Completed": ' + JSON.stringify(getAppsRes.data));
    }
    console.log(`✓ GET /api/applications returned persisted application for user ${testUserId}: exam_id=${myApp.exam_id}, status=${myApp.status}, title="${myApp.title}"`);

    // 8. Test Multiple Exams Tracking & User Isolation
    console.log('\n--- Testing User Association & Multi-Exam Tracking ---');
    if (examsRes.data.length > 1) {
      const secondExamId = Number(examsRes.data[1].id);
      await api('/api/applications', 'POST', { examId: secondExamId, status: 'Interested' }, testToken);
      const [multiRows] = await rawConn.query('SELECT exam_id, status FROM applications WHERE user_id = ?', [testUserId]);
      if (multiRows.length !== 2) throw new Error('Expected 2 tracked applications for user!');
      console.log(`✓ Candidate ${testUserId} has 2 tracked exams in MySQL:`, multiRows);
    }

    // Register second candidate to test user isolation
    const otherEmail = `other_candidate_${Date.now()}@example.com`;
    const otherReg = await api('/api/auth/register', 'POST', {
      name: 'Other Candidate',
      email: otherEmail,
      password: 'password123'
    });
    const otherToken = otherReg.data.token;
    const otherUserId = otherReg.data.user.id;
    const otherApps = await api('/api/applications', 'GET', null, otherToken);
    if (otherApps.data.length !== 0) {
      throw new Error('User isolation failure: new user sees applications of another candidate!');
    }
    console.log(`✓ User isolation verified: new candidate ${otherUserId} has 0 tracked applications, isolated from candidate ${testUserId}`);

    // 9. Test Application Untrack / Removal
    console.log('\n--- Testing Untracking / Removal from MySQL ---');
    const delRes = await api(`/api/applications/${testExamId}`, 'DELETE', null, testToken);
    if (!delRes.ok) throw new Error('Delete application failed: ' + JSON.stringify(delRes.data));

    const [postDel] = await rawConn.query('SELECT * FROM applications WHERE user_id = ? AND exam_id = ?', [testUserId, testExamId]);
    if (postDel.length !== 0) {
      throw new Error('Application was not deleted from MySQL!');
    }
    console.log(`✓ Untrack verified: exam ${testExamId} deleted from MySQL applications table.`);

    // 10. Clean up test users and data
    await rawConn.query('DELETE FROM applications WHERE user_id IN (?, ?)', [testUserId, otherUserId]);
    await rawConn.query('DELETE FROM tokens WHERE user_id IN (?, ?)', [testUserId, otherUserId]);
    await rawConn.query('DELETE FROM users WHERE id IN (?, ?)', [testUserId, otherUserId]);
    console.log('\n✓ Test cleanup completed.');

    console.log('\n======================================================');
    console.log('🎉 ALL INTEGRATION & MYSQL PERSISTENCE TESTS PASSED! 🎉');
    console.log('======================================================\n');
  } finally {
    server.close();
    await rawConn.end();
  }
}

runTests().catch(err => {
  console.error('\n❌ TEST FAILED:', err);
  process.exit(1);
});



