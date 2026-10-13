-- ============================================================
-- Competitive Exam & Recruitment Dashboard — PostgreSQL Schema
-- For DB teammate. Backend (Node/Express) will use this.
-- Covers Section 10 (Database Entities) + Section 11 (Validation)
-- ============================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------- 1. USERS ----------
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  alert_pref_days INT[] NOT NULL DEFAULT '{7,1}', -- e.g. 7 days & 1 day before deadline
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------- 2. OFFICIAL SOURCES (3-5 for MVP) ----------
-- e.g. UPSC, SSC, RRB, IBPS, UPPSC
CREATE TABLE official_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(150) NOT NULL UNIQUE,          -- 'Railway Recruitment Board'
  base_url TEXT NOT NULL,
  listing_url TEXT NOT NULL,                  -- page scheduler checks
  parser_type VARCHAR(50) NOT NULL,           -- 'rrb_html', 'upsc_pdf', etc. (each source has own parser)
  check_interval_minutes INT NOT NULL DEFAULT 360,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_checked_at TIMESTAMPTZ,
  last_status VARCHAR(30) NOT NULL DEFAULT 'New'
    CHECK (last_status IN ('New','Verified','Needs Review','Updated','Source Unavailable','Expired/Completed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------- 3. EXAMS / RECRUITMENTS (structured + validated record) ----------
CREATE TABLE exams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES official_sources(id) ON DELETE RESTRICT,
  organization VARCHAR(200) NOT NULL,         -- 'Railway Recruitment Board'
  title VARCHAR(300) NOT NULL,                -- 'Example recruitment examination'
  advt_no VARCHAR(100),                       -- 'RRB NTPC 2026'
  application_start DATE NOT NULL,
  application_end DATE NOT NULL,
  exam_date DATE,
  admit_card_date DATE,
  official_url TEXT NOT NULL,                 -- official notification URL (source of truth)
  syllabus_url TEXT,
  vacancies INT,
  qualification TEXT,
  status VARCHAR(30) NOT NULL DEFAULT 'New'
    CHECK (status IN ('New','Verified','Needs Review','Updated','Source Unavailable','Expired/Completed')),
  content_hash CHAR(64) NOT NULL,             -- SHA256 of normalized fields, for duplicate/change detection
  retrieved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), -- retrieval time (required)
  last_verified_at TIMESTAMPTZ,
  is_ambiguous BOOLEAN NOT NULL DEFAULT FALSE, -- TRUE -> Needs Review
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_dates CHECK (application_end >= application_start),
  CONSTRAINT uq_exam_dedup UNIQUE (organization, title, advt_no, application_end)
  -- Duplicate notices must NOT create duplicate records (enforced here + in code via content_hash)
);

CREATE INDEX idx_exams_end ON exams(application_end);
CREATE INDEX idx_exams_status ON exams(status);
CREATE INDEX idx_exams_org ON exams(organization);

-- ---------- 4. NOTIFICATIONS / UPDATES (change history) ----------
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

-- ---------- 6. ALERTS / NOTIFICATIONS (idempotent) ----------
CREATE TABLE alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  exam_id UUID NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  alert_type VARCHAR(30) NOT NULL CHECK (alert_type IN ('Deadline','Exam','Admit Card','Update')),
  fire_at DATE NOT NULL,                      -- which deadline/date triggered it
  days_before INT NOT NULL,                   -- 7 or 1
  channel VARCHAR(20) NOT NULL DEFAULT 'in_app' CHECK (channel IN ('in_app','email')),
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Idempotency: same user+exam+type+fire_at+days_before can only alert once
  CONSTRAINT uq_alert_idempotent UNIQUE (user_id, exam_id, alert_type, fire_at, days_before)
);
CREATE INDEX idx_alerts_user ON alerts(user_id, is_read);

-- ---------- 7. SCRAPE JOB LOG (scheduler audit, never erase trusted data on failure) ----------
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

-- ---------- HELPER: validation view for dashboard ----------
CREATE OR VIEW v_exams_public AS
SELECT e.*, s.name AS source_name, s.listing_url
FROM exams e JOIN official_sources s ON s.id = e.source_id
WHERE e.status IN ('Verified','Updated');

-- ---------- SEED: 4 official sources (MVP: 3-5) ----------
INSERT INTO official_sources (name, base_url, listing_url, parser_type) VALUES
 ('Union Public Service Commission', 'https://upsc.gov.in', 'https://upsc.gov.in/examinations', 'upsc_html'),
 ('Staff Selection Commission', 'https://ssc.gov.in', 'https://ssc.gov.in/notices', 'ssc_html'),
 ('Railway Recruitment Board', 'https://rrbcdg.gov.in', 'https://rrbcdg.gov.in/notices', 'rrb_html'),
 ('Institute of Banking Personnel Selection', 'https://ibps.in', 'https://ibps.in/careers', 'ibps_html');
