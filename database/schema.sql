-- ============================================================
-- Competitive Exam & Recruitment Dashboard — PostgreSQL Schema
-- OWNER: DB teammate (canonical definition). Backend auto-creates these
-- tables IF NOT EXISTS when DATABASE_URL is set — this file stays the
-- source of truth for types, constraints and seeds.
-- Covers PS §10 (Database Entities) + §11 (Validation)
-- ============================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------- 1. USERS ----------
-- Shown on: login, register (name/email/password), profile (alert_pref_days)
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,                  -- salt:scrypt-hex (backend hashes, never plain)
  alert_pref_days INT[] NOT NULL DEFAULT '{7,1}', -- e.g. 7 days & 1 day before deadline
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------- 2. OFFICIAL SOURCES ----------
-- Shown on: admin → Sources (name, url, parser, status, last checked, items)
CREATE TABLE official_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(150) NOT NULL UNIQUE,          -- 'Railway Recruitment Board'
  base_url TEXT NOT NULL,
  listing_url TEXT NOT NULL,                  -- exact page the scheduler fetches
  parser_type VARCHAR(50) NOT NULL,           -- source key: upsc_html, rrb_html, ibps_html…
  check_interval_minutes INT NOT NULL DEFAULT 360,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_checked_at TIMESTAMPTZ,
  last_status VARCHAR(30) NOT NULL DEFAULT 'New'
    CHECK (last_status IN ('New','Verified','Needs Review','Updated','Source Unavailable','Expired/Completed')),
  last_items INT NOT NULL DEFAULT 0,          -- notices found on last check
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------- 3. EXAMS / RECRUITMENTS (structured + validated record) ----------
-- Shown on: dashboard + explore cards (org, title, advt_no, dates, url,
-- status, vacancies, last_verified_at), exam-details (+ full history)
-- NOTE: dates are NULLABLE — listing pages rarely carry application windows;
-- records without dates stay Verified notices with "date awaited" countdowns.
CREATE TABLE exams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES official_sources(id) ON DELETE RESTRICT,
  organization VARCHAR(200) NOT NULL,         -- 'Railway Recruitment Board'
  title VARCHAR(300) NOT NULL,                -- official notice title, verbatim
  advt_no VARCHAR(100),                       -- 'CEN 06/2026', 'CRP-PO/MT-XVI', NULL if absent
  application_start DATE,                     -- NULL = not published on listing page
  application_end DATE,                       -- NULL = not published on listing page
  exam_date DATE,
  admit_card_date DATE,
  official_url TEXT NOT NULL,                 -- official notice URL (source of truth)
  vacancies INT,                              -- NULL when not stated
  status VARCHAR(30) NOT NULL DEFAULT 'New'
    CHECK (status IN ('New','Verified','Needs Review','Updated','Source Unavailable','Expired/Completed')),
  content_hash CHAR(64) NOT NULL,             -- SHA-256(org|title|url|end|exam) → dedup + change detection
  retrieved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), -- retrieval time (required, PS §11)
  last_verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_dates CHECK (application_end IS NULL OR application_start IS NULL OR application_end >= application_start),
  CONSTRAINT uq_exam_dedup UNIQUE (organization, title, official_url)
  -- Same notice re-scraped must NOT create a duplicate row (backend also
  -- compares content_hash to detect field changes → Updated + exam_updates row)
);

CREATE INDEX idx_exams_end ON exams(application_end);
CREATE INDEX idx_exams_status ON exams(status);
CREATE INDEX idx_exams_org ON exams(organization);

-- ---------- 4. EXAM UPDATES / CHANGE HISTORY ----------
-- Shown on: Update History page, admin → Changes, exam-details bottom block
CREATE TABLE exam_updates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id UUID NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  change_type VARCHAR(20) NOT NULL CHECK (change_type IN ('New','Updated','Correction','Date Extended','Admit Card','Result')),
  changed_fields JSONB NOT NULL DEFAULT '{}', -- {"application_end": ["2026-09-30","2026-10-05"]}
  old_snapshot JSONB NOT NULL,
  new_snapshot JSONB NOT NULL,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_updates_exam ON exam_updates(exam_id);

-- ---------- 5. APPLICATION TRACKER (user + exam + status) ----------
-- Shown on: My Applications page, exam-details status block
CREATE TABLE applications (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  exam_id UUID NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  status VARCHAR(30) NOT NULL DEFAULT 'Interested'
    CHECK (status IN ('Interested','Applied','Admit Card','Exam Done','Result Awaited','Completed')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, exam_id)
);

-- ---------- 6. ALERTS (idempotent) ----------
-- Shown on: Notifications page (in-app MVP; email later via channel column)
CREATE TABLE alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  exam_id UUID NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  alert_type VARCHAR(30) NOT NULL CHECK (alert_type IN ('Deadline','Exam','Admit Card','Update')),
  fire_at DATE NOT NULL,                      -- which deadline/date triggered it
  days_before INT NOT NULL,                   -- 7 or 1 (matches users.alert_pref_days)
  channel VARCHAR(20) NOT NULL DEFAULT 'in_app' CHECK (channel IN ('in_app','email')),
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Idempotency (PS §11): same user+exam+type+fire_at+days_before fires once
  CONSTRAINT uq_alert_idempotent UNIQUE (user_id, exam_id, alert_type, fire_at, days_before)
);
CREATE INDEX idx_alerts_user ON alerts(user_id, is_read);

-- ---------- 7. SCRAPE JOB LOG (scheduler audit) ----------
-- Shown on: admin → Job Logs. A failed run only writes a row here —
-- trusted exam rows are NEVER deleted on source failure (PS §11).
CREATE TABLE scrape_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES official_sources(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  result VARCHAR(20) NOT NULL DEFAULT 'running'
    CHECK (result IN ('running','success','partial','failed','source_unavailable')),
  items_found INT NOT NULL DEFAULT 0,
  items_inserted INT NOT NULL DEFAULT 0,
  items_updated INT NOT NULL DEFAULT 0,
  items_flagged_review INT NOT NULL DEFAULT 0,
  error TEXT
);

-- ---------- 8. LOGIN TOKENS (backend session store) ----------
-- Not shown in UI. Backend mints on login/register, checks per request.
CREATE TABLE tokens (
  token TEXT PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE, -- NULL = admin token
  is_admin BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------- HELPER: public dashboard view (Verified + Updated only) ----------
CREATE OR REPLACE VIEW v_exams_public AS
SELECT e.*, s.name AS source_name, s.listing_url
FROM exams e JOIN official_sources s ON s.id = e.source_id
WHERE e.status IN ('Verified','Updated');

-- ---------- SEED: live source set (must match backend/scrape.js SOURCES) ----------
INSERT INTO official_sources (name, base_url, listing_url, parser_type) VALUES
 ('Union Public Service Commission', 'https://upsc.gov.in', 'https://upsc.gov.in/', 'upsc_html'),
 ('Staff Selection Commission', 'https://ssc.gov.in', 'https://ssc.gov.in/', 'ssc_html'),
 ('Railway Recruitment Board', 'https://rrbcdg.gov.in', 'https://rrbcdg.gov.in/', 'rrb_html'),
 ('Institute of Banking Personnel Selection', 'https://www.ibps.in', 'https://www.ibps.in/', 'ibps_html'),
 ('UP Public Service Commission', 'https://uppsc.up.nic.in', 'https://uppsc.up.nic.in/', 'uppsc_html'),
 ('India Post GDS', 'https://indiapostgdsonline.gov.in', 'https://indiapostgdsonline.gov.in/', 'gds_html'),
 ('Reserve Bank of India', 'https://opportunities.rbi.org.in', 'https://opportunities.rbi.org.in/', 'rbi_html'),
 ('Indian Army', 'https://joinindianarmy.nic.in', 'https://joinindianarmy.nic.in/', 'army_html')
ON CONFLICT (name) DO UPDATE SET base_url = EXCLUDED.base_url, listing_url = EXCLUDED.listing_url;
