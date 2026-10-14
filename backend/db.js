// Storage layer: PostgreSQL when DATABASE_URL works, else ephemeral in-memory.
// In BOTH cases every exam record comes from live official-portal fetches —
// the memory fallback only affects persistence across restarts, never the data source.
const crypto = require('crypto');

let pg = null;
let mem = null;

async function init() {
  const url = process.env.DATABASE_URL;
  if (url) {
    try {
      const { Pool } = require('pg');
      pg = new Pool({ connectionString: url, connectionTimeoutMillis: 8000 });
      await pg.query('SELECT 1');
      await pg.query(`
        CREATE TABLE IF NOT EXISTS users(id UUID PRIMARY KEY, name VARCHAR(100) NOT NULL, email VARCHAR(255) UNIQUE NOT NULL, password_hash TEXT NOT NULL, alert_pref_days INT[] NOT NULL DEFAULT '{7,1}', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
        CREATE TABLE IF NOT EXISTS official_sources(id UUID PRIMARY KEY, name VARCHAR(150) UNIQUE NOT NULL, base_url TEXT NOT NULL, listing_url TEXT NOT NULL, parser_type VARCHAR(50) NOT NULL, check_interval_minutes INT NOT NULL DEFAULT 360, is_active BOOLEAN NOT NULL DEFAULT TRUE, last_checked_at TIMESTAMPTZ, last_status VARCHAR(30) NOT NULL DEFAULT 'New', last_items INT NOT NULL DEFAULT 0);
        CREATE TABLE IF NOT EXISTS exams(id UUID PRIMARY KEY, source_id UUID REFERENCES official_sources(id), organization VARCHAR(200) NOT NULL, title VARCHAR(300) NOT NULL, advt_no VARCHAR(100), application_start DATE, application_end DATE, exam_date DATE, admit_card_date DATE, official_url TEXT NOT NULL, content_hash CHAR(64) NOT NULL, status VARCHAR(30) NOT NULL DEFAULT 'Verified', retrieved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), last_verified_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(organization, title, official_url));
        CREATE TABLE IF NOT EXISTS exam_updates(id UUID PRIMARY KEY, exam_id UUID REFERENCES exams(id) ON DELETE CASCADE, change_type VARCHAR(20) NOT NULL, changed_fields JSONB NOT NULL DEFAULT '{}', old_snapshot JSONB NOT NULL, new_snapshot JSONB NOT NULL, detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
        CREATE TABLE IF NOT EXISTS applications(user_id UUID REFERENCES users(id) ON DELETE CASCADE, exam_id UUID REFERENCES exams(id) ON DELETE CASCADE, status VARCHAR(30) NOT NULL DEFAULT 'Interested', updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY(user_id, exam_id));
        CREATE TABLE IF NOT EXISTS alerts(id UUID PRIMARY KEY, user_id UUID REFERENCES users(id) ON DELETE CASCADE, exam_id UUID REFERENCES exams(id) ON DELETE CASCADE, alert_type VARCHAR(30) NOT NULL, fire_at DATE NOT NULL, days_before INT NOT NULL, channel VARCHAR(20) NOT NULL DEFAULT 'in_app', is_read BOOLEAN NOT NULL DEFAULT FALSE, sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(user_id, exam_id, alert_type, fire_at, days_before));
        CREATE TABLE IF NOT EXISTS scrape_jobs(id UUID PRIMARY KEY, source_id UUID REFERENCES official_sources(id) ON DELETE CASCADE, started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), finished_at TIMESTAMPTZ, result VARCHAR(20) NOT NULL DEFAULT 'running', items_found INT NOT NULL DEFAULT 0, items_inserted INT NOT NULL DEFAULT 0, items_updated INT NOT NULL DEFAULT 0, items_flagged_review INT NOT NULL DEFAULT 0, error TEXT);
        CREATE TABLE IF NOT EXISTS tokens(token TEXT PRIMARY KEY, user_id UUID, is_admin BOOLEAN NOT NULL DEFAULT FALSE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
      `);
      console.log('[db] PostgreSQL connected');
      return { mode: 'pg' };
    } catch (e) {
      console.warn('[db] PostgreSQL unavailable (' + (e.code || e.message) + ') — using ephemeral memory. Data stays 100% live; only restart-persistence is lost.');
      pg = null;
    }
  } else {
    console.warn('[db] DATABASE_URL not set — using ephemeral memory. Data stays 100% live; only restart-persistence is lost.');
  }
  mem = { users: [], exams: [], updates: [], jobs: [], sources: {}, tokens: {}, tracks: {} };
  return { mode: 'memory' };
}

const uid = () => crypto.randomUUID();
const now = () => new Date().toISOString();

// ---- sources ----
async function ensureSource(s) {
  if (pg) {
    await pg.query(`INSERT INTO official_sources(id,name,base_url,listing_url,parser_type) VALUES($1,$2,$3,$4,$5)
      ON CONFLICT(name) DO UPDATE SET base_url=EXCLUDED.base_url, listing_url=EXCLUDED.listing_url`,
      [uid(), s.name, s.base, s.listing, s.key]);
    const r = await pg.query('SELECT * FROM official_sources WHERE name=$1', [s.name]);
    return r.rows[0];
  }
  if (!mem.sources[s.key]) mem.sources[s.key] = { id: uid(), key: s.key, name: s.name, base_url: s.base, listing_url: s.listing, parser_type: s.key, last_status: 'New', last_checked_at: null, last_items: 0 };
  return mem.sources[s.key];
}
async function listSources() {
  if (pg) { const r = await pg.query('SELECT *, last_items AS items FROM official_sources ORDER BY name'); return r.rows.map(mapSource); }
  return Object.values(mem.sources).map(s => ({
    id: s.id, key: s.parser_type, name: s.name, url: s.base_url, parser: s.parser_type,
    status: s.last_status, last: s.last_checked_at ? new Date(s.last_checked_at).toLocaleString() : 'never',
    items: Number(s.last_items || 0)
  }));
}
function mapSource(r) {
  return { id: r.id, key: r.parser_type, name: r.name, url: r.base_url, parser: r.parser_type, status: r.last_status, last: r.last_checked_at ? new Date(r.last_checked_at).toLocaleString() : 'never', items: Number(r.last_items || r.items || 0) };
}
async function touchSource(id, status, items) {
  if (pg) { await pg.query('UPDATE official_sources SET last_status=$2, last_checked_at=NOW(), last_items=$3 WHERE id=$1', [id, status, items]); return; }
  const s = Object.values(mem.sources).find(x => x.id === id);
  if (s) { s.last_status = status; s.last_checked_at = now(); s.last_items = items; }
}

// ---- exams ----
function toPublic(r) {
  const snap = r.snapshot || {};
  return {
    id: r.id, organization: r.organization, title: r.title, advt_no: r.advt_no || snap.advt_no || '',
    application_start: r.application_start || null, application_end: r.application_end || null,
    exam_date: r.exam_date || null, admit_card_date: r.admit_card_date || null,
    official_url: r.official_url, status: r.status, updated: r.status === 'Updated',
    vacancies: r.vacancies ?? null, last_checked: r.last_verified_at || r.retrieved_at,
    history: []
  };
}
async function upsertExam(sourceId, rec) {
  // rec: {organization,title,advt_no,application_start,application_end,exam_date,admit_card_date,official_url,content_hash,status}
  if (pg) {
    const f = await pg.query('SELECT * FROM exams WHERE organization=$1 AND title=$2 AND official_url=$3', [rec.organization, rec.title, rec.official_url]);
    if (!f.rows.length) {
      const id = uid();
      await pg.query(`INSERT INTO exams(id,source_id,organization,title,advt_no,application_start,application_end,exam_date,admit_card_date,official_url,content_hash,status,last_verified_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW())`,
        [id, sourceId, rec.organization, rec.title, rec.advt_no || null, rec.application_start, rec.application_end, rec.exam_date, rec.admit_card_date, rec.official_url, rec.content_hash, rec.status]);
      return { action: rec.status === 'Needs Review' ? 'review' : 'pending', id };
    }
    const cur = f.rows[0];
    if (cur.content_hash === rec.content_hash) {
      await pg.query('UPDATE exams SET last_verified_at=NOW() WHERE id=$1', [cur.id]);
      return { action: 'unchanged', id: cur.id };
    }
    const changed = {};
    for (const k of ['advt_no', 'application_start', 'application_end', 'exam_date', 'admit_card_date']) {
      const a = cur[k] instanceof Date ? cur[k].toISOString().slice(0, 10) : cur[k];
      if ((a || null) !== (rec[k] || null)) changed[k] = [a || null, rec[k] || null];
    }
    await pg.query(`UPDATE exams SET advt_no=$2,application_start=$3,application_end=$4,exam_date=$5,admit_card_date=$6,content_hash=$7,status='Updated',last_verified_at=NOW(),updated_at=NOW() WHERE id=$1`,
      [cur.id, rec.advt_no || null, rec.application_start, rec.application_end, rec.exam_date, rec.admit_card_date, rec.content_hash]);
    await pg.query('INSERT INTO exam_updates(id,exam_id,change_type,changed_fields,old_snapshot,new_snapshot) VALUES($1,$2,$3,$4,$5,$6)',
      [uid(), cur.id, 'Updated', JSON.stringify(changed), JSON.stringify(cur), JSON.stringify(rec)]);
    return { action: 'updated', id: cur.id };
  }
  let cur = mem.exams.find(e => e.organization === rec.organization && e.title === rec.title && e.official_url === rec.official_url);
  if (!cur) {
    cur = { id: uid(), retrieved_at: now(), last_verified_at: now(), history: [{ at: new Date().toISOString().slice(0, 10), msg: 'New notice ingested live → Validated → ' + rec.status }], ...rec };
    mem.exams.push(cur);
    return { action: rec.status === 'Needs Review' ? 'review' : 'inserted', id: cur.id };
  }
  if (cur.content_hash === rec.content_hash) { cur.last_verified_at = now(); return { action: 'unchanged', id: cur.id }; }
  const changed = {};
  for (const k of ['advt_no', 'application_start', 'application_end', 'exam_date', 'admit_card_date'])
    if ((cur[k] || null) !== (rec[k] || null)) changed[k] = [cur[k] || null, rec[k] || null];
  Object.assign(cur, rec, { status: 'Updated', last_verified_at: now() });
  const msg = 'Change detected: ' + Object.entries(changed).map(([k, v]) => `${k} ${v[0] || '—'} → ${v[1] || '—'}`).join(', ');
  cur.history.push({ at: new Date().toISOString().slice(0, 10), msg: msg + ' → status Updated' });
  mem.updates.unshift({ id: uid(), exam_id: cur.id, exam_title: cur.title, change_type: 'Updated', changed_fields: changed, detected_at: now() });
  return { action: 'updated', id: cur.id };
}
async function listExams({ q = '', org = '', status = '', statuses = null, publicOnly = false, sort = 'deadline' } = {}) {
  let rows;
  if (pg) {
    const r = await pg.query(`SELECT e.*, COALESCE(json_agg(u.* ORDER BY u.detected_at DESC) FILTER (WHERE u.id IS NOT NULL), '[]') AS hist
      FROM exams e LEFT JOIN exam_updates u ON u.exam_id=e.id GROUP BY e.id ORDER BY e.retrieved_at DESC LIMIT 300`);
    rows = r.rows.map(x => ({ ...toPublic(x), history: (x.hist || []).map(h => ({ at: new Date(h.detected_at).toISOString().slice(0, 10), msg: describeUpdate(h) })) }));
    for (const row of rows) if (!row.history.length) row.history = [{ at: (row.last_checked || '').slice(0, 10), msg: 'New notice ingested live → Validated → ' + row.status }];
  } else {
    rows = mem.exams.map(e => ({ ...toPublic(e), history: e.history }));
  }
  if (q) { const s = q.toLowerCase(); rows = rows.filter(e => (e.title + e.organization + (e.advt_no || '')).toLowerCase().includes(s)); }
  if (org) rows = rows.filter(e => e.organization === org);
  if (status) rows = rows.filter(e => e.status === status);
  if (statuses) rows = rows.filter(e => statuses.includes(e.status));
  if (publicOnly) rows = rows.filter(e => ['Verified', 'Updated'].includes(e.status));
  rows.sort((a, b) => sort === 'exam' ? (a.exam_date || '9999').localeCompare(b.exam_date || '9999') : (a.application_end || '9999').localeCompare(b.application_end || '9999'));
  return rows;
}
function describeUpdate(h) {
  try {
    const c = typeof h.changed_fields === 'string' ? JSON.parse(h.changed_fields) : (h.changed_fields || {});
    const parts = Object.entries(c).map(([k, v]) => `${k} ${v[0] || '—'} → ${v[1] || '—'}`);
    return (parts.length ? 'Change detected: ' + parts.join(', ') : h.change_type) + ' → status Updated';
  } catch { return h.change_type; }
}
async function getExam(id) {
  const all = await listExams();
  return all.find(e => e.id === id) || null;
}
async function listUpdates(limit = 50) {
  if (pg) {
    const r = await pg.query(`SELECT u.*, e.title AS exam_title, e.status FROM exam_updates u JOIN exams e ON e.id=u.exam_id WHERE e.status IN ('Verified','Updated') ORDER BY u.detected_at DESC LIMIT $1`, [limit]);
    return r.rows.map(h => ({ exam_title: h.exam_title, status: h.status, at: new Date(h.detected_at).toISOString().slice(0, 10), msg: describeUpdate(h) }));
  }
  const pub = new Set(mem.exams.filter(e => ['Verified', 'Updated'].includes(e.status)).map(e => e.id));
  return mem.updates.filter(u => pub.has(u.exam_id)).slice(0, limit).map(u => {
    const e = mem.exams.find(x => x.id === u.exam_id);
    return { exam_title: u.exam_title, status: e?.status || 'Updated', at: u.detected_at.slice(0, 10), msg: 'Change detected: ' + Object.entries(u.changed_fields).map(([k, v]) => `${k} ${v[0] || '—'} → ${v[1] || '—'}`).join(', ') + ' → status Updated' };
  });
}

// ---- jobs ----
async function logJob(sourceId, patch) {
  if (pg) {
    if (!patch.id) {
      const r = await pg.query('INSERT INTO scrape_jobs(id,source_id,result) VALUES($1,$2,\'running\') RETURNING id', [uid(), sourceId]);
      return r.rows[0].id;
    }
    await pg.query('UPDATE scrape_jobs SET finished_at=NOW(),result=$2,items_found=$3,items_inserted=$4,items_updated=$5,items_flagged_review=$6,error=$7 WHERE id=$1',
      [patch.id, patch.result, patch.found || 0, patch.inserted || 0, patch.updated || 0, patch.review || 0, patch.error || null]);
    return patch.id;
  }
  if (!patch.id) { const j = { id: uid(), source_id: sourceId, at: now(), res: 'running', f: 0, i: 0, u: 0, r: 0 }; mem.jobs.unshift(j); return j.id; }
  const j = mem.jobs.find(x => x.id === patch.id);
  if (j) Object.assign(j, { at: now(), res: patch.result, f: patch.found || 0, i: patch.inserted || 0, u: patch.updated || 0, r: patch.review || 0, err: patch.error || null, src: patch.src });
  return patch.id;
}
async function listJobs(limit = 30) {
  if (pg) {
    const r = await pg.query(`SELECT j.*, s.name AS src FROM scrape_jobs j JOIN official_sources s ON s.id=j.source_id ORDER BY j.started_at DESC LIMIT $1`, [limit]);
    return r.rows.map(x => ({ at: new Date(x.started_at).toLocaleString(), src: x.src, res: x.result, f: x.items_found, i: x.items_inserted, u: x.items_updated, r: x.items_flagged_review }));
  }
  const names = {}; Object.values(mem.sources).forEach(s => names[s.id] = s.name);
  return mem.jobs.slice(0, limit).map(j => ({ at: new Date(j.at).toLocaleString(), src: j.src || names[j.source_id] || '?', res: j.res, f: j.f, i: j.i, u: j.u, r: j.r }));
}

// ---- users / tokens / tracker ----
const scrypt = (pw, salt) => crypto.scryptSync(pw, salt, 64).toString('hex');
async function registerUser(name, email, password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = salt + ':' + scrypt(password, salt);
  if (pg) {
    try {
      const id = uid();
      await pg.query('INSERT INTO users(id,name,email,password_hash) VALUES($1,$2,$3,$4)', [id, name, email.toLowerCase(), hash]);
      return { id, name, email: email.toLowerCase() };
    } catch (e) { if (e.code === '23505') throw Object.assign(new Error('Email already registered'), { status: 409 }); throw e; }
  }
  if (mem.users.find(u => u.email === email.toLowerCase())) throw Object.assign(new Error('Email already registered'), { status: 409 });
  const u = { id: uid(), name, email: email.toLowerCase(), hash };
  mem.users.push(u);
  return { id: u.id, name, email: u.email };
}
async function verifyUser(email, password) {
  const em = email.toLowerCase();
  if (pg) {
    const r = await pg.query('SELECT * FROM users WHERE email=$1', [em]);
    const u = r.rows[0]; if (!u) return null;
    const [salt, h] = u.password_hash.split(':');
    if (scrypt(password, salt) !== h) return null;
    return { id: u.id, name: u.name, email: u.email };
  }
  const u = mem.users.find(x => x.email === em); if (!u) return null;
  const [salt, h] = u.hash.split(':');
  if (scrypt(password, salt) !== h) return null;
  return { id: u.id, name: u.name, email: u.email };
}
async function mintToken(userId, isAdmin) {
  const t = crypto.randomBytes(32).toString('hex');
  if (pg) await pg.query('INSERT INTO tokens(token,user_id,is_admin) VALUES($1,$2,$3)', [t, userId, !!isAdmin]);
  else mem.tokens[t] = { userId, isAdmin: !!isAdmin };
  return t;
}
async function tokenOwner(authHeader) {
  const t = (authHeader || '').replace(/^Bearer\s+/i, '');
  if (!t) return null;
  if (t === 'demo-admin-' + (process.env.ADMIN_PASSWORD || 'admin123')) return { isAdmin: true, email: process.env.ADMIN_EMAIL };
  if (pg) { const r = await pg.query('SELECT * FROM tokens WHERE token=$1', [t]); return r.rows[0] ? { userId: r.rows[0].user_id, isAdmin: r.rows[0].is_admin } : null; }
  return mem.tokens[t] || null;
}

// ---- admin moderation: approve (→ public) / reject (hidden forever) ----
async function setExamStatus(id, status, note) {
  const at = new Date().toISOString().slice(0, 10);
  if (pg) {
    const f = await pg.query('SELECT * FROM exams WHERE id=$1', [id]);
    if (!f.rows.length) return null;
    const old = f.rows[0].status;
    await pg.query('UPDATE exams SET status=$2, updated_at=NOW(), last_verified_at=NOW() WHERE id=$1', [id, status]);
    await pg.query('INSERT INTO exam_updates(id,exam_id,change_type,changed_fields,old_snapshot,new_snapshot) VALUES($1,$2,$3,$4,$5,$6)',
      [uid(), id, 'Updated', JSON.stringify({ status: [old, status] }), JSON.stringify({ status: old }), JSON.stringify({ status })]);
    const all = await listExams();
    return all.find(e => e.id === id) || null;
  }
  const cur = mem.exams.find(e => e.id === id);
  if (!cur) return null;
  const old = cur.status;
  cur.status = status; cur.updated = (status === 'Updated'); cur.last_verified_at = now();
  cur.history.push({ at, msg: (note || ('status ' + old + ' → ' + status)) });
  mem.updates.unshift({ id: uid(), exam_id: id, exam_title: cur.title, change_type: 'Updated', changed_fields: { status: [old, status] }, detected_at: now() });
  const all = await listExams();
  return all.find(e => e.id === id) || null;
}

// ---- user tracker: server-owned, forward-only transitions ----
const TRACK_ORDER = ['Interested', 'Applied', 'Admit Card', 'Exam Done', 'Completed'];
async function getTracks(userId) {
  if (pg) {
    const r = await pg.query('SELECT exam_id, status FROM applications WHERE user_id=$1', [userId]);
    const out = {}; r.rows.forEach(x => out[x.exam_id] = x.status);
    return out;
  }
  return { ...(mem.tracks[userId] || {}) };
}
async function setTrack(userId, examId, status) {
  if (!TRACK_ORDER.includes(status)) throw Object.assign(new Error('unknown status'), { status: 400 });
  const exam = await getExam(examId);
  if (!exam) throw Object.assign(new Error('exam not found'), { status: 404 });
  const cur = (await getTracks(userId))[examId];
  if (!cur) {
    if (status !== 'Interested') throw Object.assign(new Error('tracker starts at Interested'), { status: 400 });
  } else {
    const ci = TRACK_ORDER.indexOf(cur), ni = TRACK_ORDER.indexOf(status);
    if (ni === ci) return { ok: true, status: cur, unchanged: true };
    if (ni !== ci + 1) throw Object.assign(new Error('tracker moves forward one step only'), { status: 400 });
  }
  if (pg) {
    await pg.query(`INSERT INTO applications(user_id,exam_id,status,updated_at) VALUES($1,$2,$3,NOW())
      ON CONFLICT(user_id,exam_id) DO UPDATE SET status=EXCLUDED.status, updated_at=NOW()`, [userId, examId, status]);
  } else {
    if (!mem.tracks[userId]) mem.tracks[userId] = {};
    mem.tracks[userId][examId] = status;
  }
  return { ok: true, status };
}

module.exports = { init, ensureSource, listSources, touchSource, upsertExam, listExams, getExam, listUpdates, logJob, listJobs, registerUser, verifyUser, mintToken, tokenOwner, setExamStatus, getTracks, setTrack, TRACK_ORDER };
