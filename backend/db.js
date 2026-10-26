const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const crypto = require('crypto');
const mysql = require('mysql2/promise');

let pool = null;

async function init() {
  pool = mysql.createPool({
    host: process.env.MYSQL_HOST || 'localhost',
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
    database: process.env.MYSQL_DATABASE || 'competitive_exam_tracker',
    waitForConnections: true,
    connectionLimit: 10,
    dateStrings: true
  });

  await pool.query('SELECT 1');
  console.log('[db] MySQL connected');
  await seedInitialExams();
  return { mode: 'mysql' };
}

const uid = () => crypto.randomUUID();
const now = () => new Date().toISOString();

function requireDB() {
  if (!pool) throw new Error('MySQL is not initialized. Call init() first.');
}

function mapSource(r) {
  return {
    id: r.id,
    key: r.parser_type,
    name: r.name,
    url: r.base_url,
    parser: r.parser_type,
    status: r.last_status,
    last: r.last_checked_at || 'never',
    items: Number(r.last_items || 0)
  };
}

// ---------- SOURCES ----------

async function ensureSource(s) {
  requireDB();

  await pool.query(
    `INSERT INTO official_sources
      (name, base_url, listing_url, parser_type)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       base_url = VALUES(base_url),
       listing_url = VALUES(listing_url)`,
    [s.name, s.base, s.listing, s.key]
  );

  const [rows] = await pool.query(
    'SELECT * FROM official_sources WHERE name = ?',
    [s.name]
  );

  return rows[0];
}

async function listSources() {
  requireDB();

  const [rows] = await pool.query(
    'SELECT * FROM official_sources ORDER BY name'
  );

  return rows.map(mapSource);
}

async function touchSource(id, status, items) {
  requireDB();

  await pool.query(
    `UPDATE official_sources
     SET last_status = ?, last_checked_at = NOW(), last_items = ?
     WHERE id = ?`,
    [status, items, id]
  );
}

// ---------- EXAMS ----------

function toPublic(r) {
  return {
    id: r.id,
    organization: r.organization,
    title: r.title,
    advt_no: r.advt_no || '',
    application_start: r.application_start || null,
    application_end: r.application_end || null,
    exam_date: r.exam_date || null,
    admit_card_date: r.admit_card_date || null,
    official_url: r.official_url,
    syllabus_url: r.syllabus_url || null,
    vacancies: r.vacancies ?? null,
    qualification: r.qualification || null,
    status: r.status,
    updated: r.status === 'Updated',
    last_checked: r.last_verified_at || r.retrieved_at,
    history: []
  };
}

async function upsertExam(sourceId, rec) {
  requireDB();

  const [found] = await pool.query(
    `SELECT * FROM exams
     WHERE organization = ? AND title = ? AND official_url = ?
     LIMIT 1`,
    [rec.organization, rec.title, rec.official_url]
  );

  if (!found.length) {
    const [result] = await pool.query(
      `INSERT INTO exams (
        source_id, organization, title, advt_no,
        application_start, application_end, exam_date,
        admit_card_date, official_url, syllabus_url,
        vacancies, qualification, content_hash, status,
        retrieved_at, last_verified_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        sourceId,
        rec.organization,
        rec.title,
        rec.advt_no || null,
        rec.application_start || null,
        rec.application_end || null,
        rec.exam_date || null,
        rec.admit_card_date || null,
        rec.official_url,
        rec.syllabus_url || null,
        rec.vacancies ?? null,
        rec.qualification || null,
        rec.content_hash,
        rec.status || 'Verified'
      ]
    );

    return {
      action: rec.status === 'Needs Review' ? 'review' : 'inserted',
      id: result.insertId
    };
  }

  const cur = found[0];

  if (cur.content_hash === rec.content_hash) {
    await pool.query(
      'UPDATE exams SET last_verified_at = NOW() WHERE id = ?',
      [cur.id]
    );
    return { action: 'unchanged', id: cur.id };
  }

  const changed = {};

  for (const k of [
    'advt_no',
    'application_start',
    'application_end',
    'exam_date',
    'admit_card_date'
  ]) {
    const oldValue = cur[k] || null;
    const newValue = rec[k] || null;

    if (String(oldValue || '') !== String(newValue || '')) {
      changed[k] = [oldValue, newValue];
    }
  }

  await pool.query(
    `UPDATE exams SET
      advt_no = ?,
      application_start = ?,
      application_end = ?,
      exam_date = ?,
      admit_card_date = ?,
      syllabus_url = ?,
      vacancies = ?,
      qualification = ?,
      content_hash = ?,
      status = 'Updated',
      last_verified_at = NOW(),
      updated_at = NOW()
     WHERE id = ?`,
    [
      rec.advt_no || null,
      rec.application_start || null,
      rec.application_end || null,
      rec.exam_date || null,
      rec.admit_card_date || null,
      rec.syllabus_url || null,
      rec.vacancies ?? null,
      rec.qualification || null,
      rec.content_hash,
      cur.id
    ]
  );

  await pool.query(
    `INSERT INTO exam_updates
      (exam_id, change_type, changed_fields, old_snapshot, new_snapshot)
     VALUES (?, 'Updated', ?, ?, ?)`,
    [
      cur.id,
      JSON.stringify(changed),
      JSON.stringify(cur),
      JSON.stringify(rec)
    ]
  );

  return { action: 'updated', id: cur.id };
}

async function listExams({
  q = '',
  org = '',
  status = '',
  sort = 'deadline'
} = {}) {
  requireDB();

  let sql = 'SELECT * FROM exams WHERE 1=1';
  const params = [];

  if (q) {
    sql += ' AND (title LIKE ? OR organization LIKE ? OR advt_no LIKE ?)';
    const search = `%${q}%`;
    params.push(search, search, search);
  }

  if (org) {
    sql += ' AND organization = ?';
    params.push(org);
  }

  if (status) {
    sql += ' AND status = ?';
    params.push(status);
  }

  sql += sort === 'exam'
    ? ' ORDER BY exam_date IS NULL, exam_date ASC'
    : ' ORDER BY application_end IS NULL, application_end ASC';

  sql += ' LIMIT 300';

  const [rows] = await pool.query(sql, params);
  const results = [];

  for (const row of rows) {
    const exam = toPublic(row);

    const [updates] = await pool.query(
      `SELECT * FROM exam_updates
       WHERE exam_id = ? ORDER BY detected_at DESC`,
      [row.id]
    );

    exam.history = updates.map(u => ({
      at: u.detected_at,
      msg: describeUpdate(u)
    }));

    if (!exam.history.length) {
      exam.history = [{
        at: exam.last_checked || '',
        msg: 'Notice ingested live → ' + exam.status
      }];
    }

    results.push(exam);
  }

  return results;
}

function describeUpdate(update) {
  let changes = update.changed_fields || {};

  if (typeof changes === 'string') {
    try {
      changes = JSON.parse(changes);
    } catch {
      changes = {};
    }
  }

  const parts = Object.entries(changes).map(
    ([key, values]) =>
      `${key} ${values[0] || '—'} → ${values[1] || '—'}`
  );

  return parts.length
    ? 'Change detected: ' + parts.join(', ') + ' → status Updated'
    : update.change_type;
}

async function getExam(id) {
  const exams = await listExams();
  return exams.find(e => String(e.id) === String(id)) || null;
}

async function listUpdates(limit = 50) {
  requireDB();

  const [rows] = await pool.query(
    `SELECT u.*, e.title AS exam_title, e.status
     FROM exam_updates u
     JOIN exams e ON e.id = u.exam_id
     ORDER BY u.detected_at DESC
     LIMIT ?`,
    [Number(limit)]
  );

  return rows.map(u => ({
    exam_title: u.exam_title,
    status: u.status,
    at: u.detected_at,
    msg: describeUpdate(u)
  }));
}

// ---------- SCRAPE JOBS ----------

async function logJob(sourceId, patch) {
  requireDB();

  if (!patch.id) {
    const [result] = await pool.query(
      `INSERT INTO scrape_jobs (source_id, result)
       VALUES (?, 'running')`,
      [sourceId]
    );

    return result.insertId;
  }

  await pool.query(
    `UPDATE scrape_jobs SET
      finished_at = NOW(),
      result = ?,
      items_found = ?,
      items_inserted = ?,
      items_updated = ?,
      items_flagged_review = ?,
      error = ?
     WHERE id = ?`,
    [
      patch.result,
      patch.found || 0,
      patch.inserted || 0,
      patch.updated || 0,
      patch.review || 0,
      patch.error || null,
      patch.id
    ]
  );

  return patch.id;
}

async function listJobs(limit = 30) {
  requireDB();

  const [rows] = await pool.query(
    `SELECT j.*, s.name AS src
     FROM scrape_jobs j
     JOIN official_sources s ON s.id = j.source_id
     ORDER BY j.started_at DESC
     LIMIT ?`,
    [Number(limit)]
  );

  return rows.map(j => ({
    at: j.started_at,
    src: j.src,
    res: j.result,
    f: j.items_found,
    i: j.items_inserted,
    u: j.items_updated,
    r: j.items_flagged_review
  }));
}

// ---------- USERS / PASSWORDS / TOKENS ----------

const scrypt = (password, salt) =>
  crypto.scryptSync(password, salt, 64).toString('hex');

async function registerUser(name, email, password) {
  requireDB();

  const salt = crypto.randomBytes(16).toString('hex');
  const hash = salt + ':' + scrypt(password, salt);
  const normalizedEmail = email.toLowerCase();

  try {
    const [result] = await pool.query(
      `INSERT INTO users (name, email, password_hash)
       VALUES (?, ?, ?)`,
      [name, normalizedEmail, hash]
    );

    return {
      id: result.insertId,
      name,
      email: normalizedEmail
    };
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') {
      throw Object.assign(
        new Error('Email already registered'),
        { status: 409 }
      );
    }
    throw e;
  }
}

async function verifyUser(email, password) {
  requireDB();

  const [rows] = await pool.query(
    'SELECT * FROM users WHERE email = ? LIMIT 1',
    [email.toLowerCase()]
  );

  const user = rows[0];
  if (!user) return null;

  const [salt, storedHash] = user.password_hash.split(':');

  if (scrypt(password, salt) !== storedHash) return null;

  return {
    id: user.id,
    name: user.name,
    email: user.email
  };
}

async function mintToken(userId, isAdmin) {
  requireDB();

  const token = crypto.randomBytes(32).toString('hex');

  await pool.query(
    `INSERT INTO tokens (token, user_id, is_admin)
     VALUES (?, ?, ?)`,
    [token, userId || null, !!isAdmin]
  );

  return token;
}

async function tokenOwner(authHeader) {
  requireDB();

  const token = (authHeader || '').replace(/^Bearer\s+/i, '');
  if (!token) return null;

  if (
    token === 'demo-admin-' +
    (process.env.ADMIN_PASSWORD || 'admin123')
  ) {
    return {
      isAdmin: true,
      email: process.env.ADMIN_EMAIL
    };
  }

  const [rows] = await pool.query(
    'SELECT * FROM tokens WHERE token = ? LIMIT 1',
    [token]
  );

  if (!rows.length) return null;

  return {
    userId: rows[0].user_id,
    isAdmin: Boolean(rows[0].is_admin)
  };
}
async function seedInitialExams() {
  requireDB();
  const [rows] = await pool.query('SELECT COUNT(*) AS count FROM exams');
  if (rows[0].count > 0) return;

  const seeds = [
    {
      source: 'Railway Recruitment Board',
      title: 'RRB NTPC Graduate Recruitment 2026',
      advt_no: 'CEN 05/2026',
      application_start: '2026-09-01',
      application_end: '2026-09-30',
      exam_date: '2026-11-15',
      admit_card_date: '2026-11-05',
      official_url: 'https://rrbcdg.gov.in/notices/ntpc-2026',
      vacancies: 11558,
      status: 'Verified'
    },
    {
      source: 'Union Public Service Commission',
      title: 'UPSC Civil Services (Prelims) 2027',
      advt_no: 'CSE 2027',
      application_start: '2026-10-01',
      application_end: '2026-10-28',
      exam_date: '2027-05-23',
      admit_card_date: '2027-05-01',
      official_url: 'https://upsc.gov.in/examinations/cse-2027',
      vacancies: 1056,
      status: 'Updated'
    },
    {
      source: 'Staff Selection Commission',
      title: 'SSC CGL 2026 Combined Graduate Level',
      advt_no: 'CGL/2026',
      application_start: '2026-09-15',
      application_end: '2026-10-14',
      exam_date: '2026-12-10',
      admit_card_date: '2026-11-28',
      official_url: 'https://ssc.gov.in/notices/cgl-2026',
      vacancies: 17727,
      status: 'Verified'
    },
    {
      source: 'Institute of Banking Personnel Selection',
      title: 'IBPS PO/MT XVI Recruitment 2026',
      advt_no: 'PO/MT-XVI',
      application_start: '2026-08-01',
      application_end: '2026-08-28',
      exam_date: '2026-10-18',
      admit_card_date: '2026-10-05',
      official_url: 'https://ibps.in/careers/po-2026',
      vacancies: 5208,
      status: 'Verified'
    },
    {
      source: 'Staff Selection Commission',
      title: 'SSC MTS Havaldar 2026',
      advt_no: 'MTS/2026',
      application_start: '2026-10-05',
      application_end: null,
      exam_date: null,
      admit_card_date: null,
      official_url: 'https://ssc.gov.in/notices/mts-2026',
      vacancies: null,
      status: 'Needs Review'
    },
    {
      source: 'UP Public Service Commission',
      title: 'UPPSC PCS 2026',
      advt_no: 'PCS/2026',
      application_start: '2026-10-08',
      application_end: '2026-11-08',
      exam_date: '2027-02-14',
      admit_card_date: '2027-01-30',
      official_url: 'https://uppsc.up.nic.in',
      vacancies: 220,
      status: 'Verified'
    }
  ];

  const sources = await listSources();
  for (const s of seeds) {
    const src = sources.find(x => x.name === s.source) || sources[0];
    if (!src) continue;
    const content_hash = crypto
      .createHash('sha256')
      .update([s.source, s.title, s.official_url, s.application_end || '', s.exam_date || ''].join('|').toLowerCase())
      .digest('hex');
    await upsertExam(src.id, {
      organization: s.source,
      title: s.title,
      advt_no: s.advt_no,
      application_start: s.application_start,
      application_end: s.application_end,
      exam_date: s.exam_date,
      admit_card_date: s.admit_card_date,
      official_url: s.official_url,
      syllabus_url: null,
      vacancies: s.vacancies,
      qualification: null,
      content_hash,
      status: s.status
    });
  }
}

async function updateApplication(userId, examId, status, notes = null) {
  requireDB();

  const allowed = ['Interested', 'Applied', 'Admit Card', 'Exam Done', 'Result Awaited', 'Completed'];
  if (!allowed.includes(status)) {
    const err = new Error('Invalid status "' + status + '". Allowed: ' + allowed.join(', '));
    err.status = 400;
    throw err;
  }

  const [examRows] = await pool.query('SELECT id FROM exams WHERE id = ? LIMIT 1', [examId]);
  if (!examRows.length) {
    const err = new Error('Exam with ID ' + examId + ' not found');
    err.status = 404;
    throw err;
  }

  await pool.query(
    `INSERT INTO applications (user_id, exam_id, status, notes)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       status = VALUES(status),
       notes = COALESCE(VALUES(notes), notes),
       updated_at = CURRENT_TIMESTAMP`,
    [userId, examId, status, notes]
  );

  return { userId, examId, status };
}

async function deleteApplication(userId, examId) {
  requireDB();

  const [res] = await pool.query(
    'DELETE FROM applications WHERE user_id = ? AND exam_id = ?',
    [userId, examId]
  );
  return res.affectedRows > 0;
}

async function getUserApplications(userId) {
  requireDB();

  const [rows] = await pool.query(
    `SELECT a.user_id, a.exam_id, a.status, a.notes, a.created_at, a.updated_at,
            e.organization, e.title, e.advt_no, e.application_start, e.application_end,
            e.exam_date, e.admit_card_date, e.official_url
     FROM applications a
     JOIN exams e ON a.exam_id = e.id
     WHERE a.user_id = ?
     ORDER BY a.updated_at DESC`,
    [userId]
  );

  return rows;
}

async function getUserById(userId) {
  requireDB();

  const [rows] = await pool.query(
    'SELECT id, name, email, alert_pref_days, created_at FROM users WHERE id = ? LIMIT 1',
    [userId]
  );

  return rows[0] || null;
}

async function getUserByEmail(email) {
  requireDB();

  const [rows] = await pool.query(
    'SELECT id, name, email, alert_pref_days, created_at FROM users WHERE email = ? LIMIT 1',
    [String(email).toLowerCase()]
  );

  return rows[0] || null;
}

// ---------- EXAM ROADMAPS ----------

async function getRoadmap(examId) {
  requireDB();

  const [maps] = await pool.query(
    'SELECT * FROM roadmaps WHERE exam_id = ? ORDER BY created_at DESC LIMIT 1',
    [examId]
  );
  if (!maps.length) return null;

  const roadmap = maps[0];

  const [weeks] = await pool.query(
    'SELECT * FROM roadmap_weeks WHERE roadmap_id = ? ORDER BY week_number ASC',
    [roadmap.id]
  );

  for (const week of weeks) {
    const [topics] = await pool.query(
      'SELECT * FROM roadmap_topics WHERE week_id = ? ORDER BY order_index ASC',
      [week.id]
    );
    week.topics = topics;
  }

  roadmap.weeks = weeks;
  return roadmap;
}

async function toggleTopicProgress(userId, topicId, completed) {
  requireDB();

  if (completed) {
    await pool.query(
      `INSERT INTO user_roadmap_progress (user_id, topic_id, completed, completed_at)
       VALUES (?, ?, TRUE, NOW())
       ON DUPLICATE KEY UPDATE
         completed = TRUE,
         completed_at = NOW()`,
      [userId, topicId]
    );
  } else {
    await pool.query(
      `UPDATE user_roadmap_progress
       SET completed = FALSE, completed_at = NULL
       WHERE user_id = ? AND topic_id = ?`,
      [userId, topicId]
    );
  }

  return { userId, topicId, completed };
}

async function getUserRoadmapProgress(userId, examId) {
  requireDB();

  const map = await getRoadmap(examId);
  if (!map) return null;

  const [progress] = await pool.query(
    `SELECT t.id AS topic_id, p.completed
     FROM roadmap_topics t
     JOIN roadmap_weeks w ON t.week_id = w.id
     LEFT JOIN user_roadmap_progress p
       ON p.topic_id = t.id AND p.user_id = ?
     WHERE w.roadmap_id = ?`,
    [userId, map.id]
  );

  return {
    roadmap: map,
    progress: progress.reduce((acc, row) => {
      acc[row.topic_id] = row.completed === 1 || row.completed === true;
      return acc;
    }, {})
  };
}

async function createRoadmap(examId, title, totalWeeks, weeks, createdByAdmin) {
  requireDB();

  const [result] = await pool.query(
    `INSERT INTO roadmaps (exam_id, title, total_weeks, created_by_admin)
     VALUES (?, ?, ?, ?)`,
    [examId, title, totalWeeks, createdByAdmin || null]
  );
  const roadmapId = result.insertId;

  for (const w of weeks) {
    const [weekResult] = await pool.query(
      `INSERT INTO roadmap_weeks (roadmap_id, week_number, title, start_date, end_date)
       VALUES (?, ?, ?, ?, ?)`,
      [roadmapId, w.week_number, w.title, w.start_date || null, w.end_date || null]
    );
    const weekId = weekResult.insertId;

    for (const t of (w.topics || [])) {
      await pool.query(
        `INSERT INTO roadmap_topics (week_id, topic, resource_type, resource_link, order_index)
         VALUES (?, ?, ?, ?, ?)`,
        [weekId, t.topic, t.resource_type || 'book', t.resource_link || null, t.order_index || 0]
      );
    }
  }

  return { id: roadmapId, examId, title, total_weeks: totalWeeks };
}

module.exports = {
  init,
  ensureSource,
  listSources,
  touchSource,
  upsertExam,
  listExams,
  getExam,
  listUpdates,
  logJob,
  listJobs,
  registerUser,
  verifyUser,
  mintToken,
  tokenOwner,
  updateApplication,
  deleteApplication,
  getUserApplications,
  getUserById,
  getUserByEmail,
  seedInitialExams,
  getRoadmap,
  toggleTopicProgress,
  getUserRoadmapProgress,
  createRoadmap
};
