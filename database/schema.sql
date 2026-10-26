
-- ============================================================
-- Competitive Exam & Recruitment Dashboard
-- MySQL 8.0+
-- ============================================================

DROP DATABASE IF EXISTS competitive_exam_tracker;

CREATE DATABASE competitive_exam_tracker;
USE competitive_exam_tracker;

-- 1. USERS
CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    alert_pref_days VARCHAR(20) NOT NULL DEFAULT '7,1',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 2. OFFICIAL SOURCES
CREATE TABLE official_sources (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(150) NOT NULL UNIQUE,
    base_url VARCHAR(500) NOT NULL,
    listing_url VARCHAR(500) NOT NULL,
    parser_type VARCHAR(50) NOT NULL,
    check_interval_minutes INT NOT NULL DEFAULT 360,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    last_checked_at DATETIME,
    last_status VARCHAR(30) NOT NULL DEFAULT 'New',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT chk_source_status CHECK (
        last_status IN (
            'New', 'Verified', 'Needs Review', 'Updated',
            'Source Unavailable', 'Expired/Completed'
        )
    )
);

-- 3. EXAMS / RECRUITMENTS
-- Note: application_start and application_end are nullable to support
-- notices where application dates are awaited/TBD or not yet announced.
-- Safe migration for existing database:
-- ALTER TABLE exams MODIFY COLUMN application_start DATE NULL;
-- ALTER TABLE exams MODIFY COLUMN application_end DATE NULL;
CREATE TABLE exams (
    id INT AUTO_INCREMENT PRIMARY KEY,
    source_id INT NOT NULL,
    organization VARCHAR(200) NOT NULL,
    title VARCHAR(300) NOT NULL,
    advt_no VARCHAR(100),
    application_start DATE,
    application_end DATE,
    exam_date DATE,
    admit_card_date DATE,
    official_url VARCHAR(1000) NOT NULL,
    syllabus_url VARCHAR(1000),
    vacancies INT,
    qualification TEXT,
    status VARCHAR(30) NOT NULL DEFAULT 'New',
    content_hash CHAR(64) NOT NULL,
    retrieved_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_verified_at DATETIME,
    is_ambiguous BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_exams_source
        FOREIGN KEY (source_id)
        REFERENCES official_sources(id)
        ON DELETE RESTRICT ON UPDATE CASCADE,

    CONSTRAINT chk_application_dates
        CHECK (application_end >= application_start),

    CONSTRAINT chk_exam_status CHECK (
        status IN (
            'New', 'Verified', 'Needs Review', 'Updated',
            'Source Unavailable', 'Expired/Completed'
        )
    ),

    CONSTRAINT uq_exam_dedup
        UNIQUE (organization, title, advt_no, application_end)
);

CREATE INDEX idx_exams_end ON exams(application_end);
CREATE INDEX idx_exams_status ON exams(status);
CREATE INDEX idx_exams_org ON exams(organization);

-- 4. EXAM UPDATES / CHANGE HISTORY
CREATE TABLE exam_updates (
    id INT AUTO_INCREMENT PRIMARY KEY,
    exam_id INT NOT NULL,
    change_type VARCHAR(30) NOT NULL,
    changed_fields JSON NOT NULL,
    old_snapshot JSON NOT NULL,
    new_snapshot JSON NOT NULL,
    detected_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_updates_exam
        FOREIGN KEY (exam_id)
        REFERENCES exams(id)
        ON DELETE CASCADE ON UPDATE CASCADE,

    CONSTRAINT chk_change_type CHECK (
        change_type IN (
            'New', 'Updated', 'Correction',
            'Date Extended', 'Admit Card', 'Result'
        )
    )
);

CREATE INDEX idx_updates_exam ON exam_updates(exam_id);

-- 5. APPLICATION TRACKER
CREATE TABLE applications (
    user_id INT NOT NULL,
    exam_id INT NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'Interested',
    notes TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (user_id, exam_id),

    CONSTRAINT fk_applications_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE ON UPDATE CASCADE,

    CONSTRAINT fk_applications_exam
        FOREIGN KEY (exam_id)
        REFERENCES exams(id)
        ON DELETE CASCADE ON UPDATE CASCADE,

    CONSTRAINT chk_application_status CHECK (
        status IN (
            'Interested', 'Applied', 'Admit Card',
            'Exam Done', 'Result Awaited', 'Completed'
        )
    )
);

-- 6. ALERTS / NOTIFICATIONS
CREATE TABLE alerts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    exam_id INT NOT NULL,
    alert_type VARCHAR(30) NOT NULL,
    fire_at DATE NOT NULL,
    days_before INT NOT NULL,
    channel VARCHAR(20) NOT NULL DEFAULT 'in_app',
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    sent_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_alerts_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE ON UPDATE CASCADE,

    CONSTRAINT fk_alerts_exam
        FOREIGN KEY (exam_id)
        REFERENCES exams(id)
        ON DELETE CASCADE ON UPDATE CASCADE,

    CONSTRAINT chk_alert_type CHECK (
        alert_type IN ('Deadline', 'Exam', 'Admit Card', 'Update')
    ),

    CONSTRAINT chk_alert_channel CHECK (
        channel IN ('in_app', 'email')
    ),

    CONSTRAINT uq_alert_idempotent
        UNIQUE (user_id, exam_id, alert_type, fire_at, days_before)
);

CREATE INDEX idx_alerts_user ON alerts(user_id, is_read);

-- 7. SCRAPING JOB LOGS
CREATE TABLE scrape_jobs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    source_id INT NOT NULL,
    started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    finished_at DATETIME,
    result VARCHAR(30) NOT NULL DEFAULT 'running',
    items_found INT NOT NULL DEFAULT 0,
    items_inserted INT NOT NULL DEFAULT 0,
    items_updated INT NOT NULL DEFAULT 0,
    items_flagged_review INT NOT NULL DEFAULT 0,
    error TEXT,

    CONSTRAINT fk_scrape_jobs_source
        FOREIGN KEY (source_id)
        REFERENCES official_sources(id)
        ON DELETE CASCADE ON UPDATE CASCADE,

    CONSTRAINT chk_scrape_result CHECK (
        result IN (
            'running', 'success', 'partial',
            'failed', 'source_unavailable'
        )
    )
);

-- 8. AUTHENTICATION TOKENS
-- Included because the current backend/db.js
-- shown in your screenshot creates a tokens table.
CREATE TABLE tokens (
    token VARCHAR(512) PRIMARY KEY,
    user_id INT,
    is_admin BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_tokens_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE ON UPDATE CASCADE
);

-- 9. PUBLIC EXAMS VIEW
CREATE OR REPLACE VIEW v_exams_public AS
SELECT
    e.*,
    s.name AS source_name,
    s.listing_url
FROM exams e
JOIN official_sources s ON e.source_id = s.id
WHERE e.status IN ('Verified', 'Updated');

-- 10. INITIAL OFFICIAL SOURCES
INSERT INTO official_sources
    (name, base_url, listing_url, parser_type)
VALUES
    (
        'Union Public Service Commission',
        'https://upsc.gov.in',
        'https://upsc.gov.in/examinations',
        'upsc_html'
    ),
    (
        'Staff Selection Commission',
        'https://ssc.gov.in',
        'https://ssc.gov.in/notices',
        'ssc_html'
    ),
    (
        'Railway Recruitment Board',
        'https://rrbcdg.gov.in',
        'https://rrbcdg.gov.in/notices',
        'rrb_html'
    ),
    (
        'Institute of Banking Personnel Selection',
        'https://ibps.in',
        'https://ibps.in/careers',
        'ibps_html'
    );

-- 11. VERIFICATION
SHOW TABLES;

-- 12. EXAM ROADMAPS (dynamic per exam — admin defines weeks + topics)
CREATE TABLE roadmaps (
    id INT AUTO_INCREMENT PRIMARY KEY,
    exam_id INT NOT NULL,
    title VARCHAR(200) NOT NULL DEFAULT 'Exam Preparation Roadmap',
    total_weeks INT NOT NULL DEFAULT 8,
    created_by_admin INT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_roadmaps_exam
        FOREIGN KEY (exam_id)
        REFERENCES exams(id)
        ON DELETE CASCADE ON UPDATE CASCADE,

    CONSTRAINT fk_roadmaps_admin
        FOREIGN KEY (created_by_admin)
        REFERENCES users(id)
        ON DELETE SET NULL ON UPDATE CASCADE
);

-- 13. ROADMAP WEEKS
CREATE TABLE roadmap_weeks (
    id INT AUTO_INCREMENT PRIMARY KEY,
    roadmap_id INT NOT NULL,
    week_number INT NOT NULL,
    title VARCHAR(200) NOT NULL,
    start_date DATE NULL,
    end_date DATE NULL,

    CONSTRAINT fk_weeks_roadmap
        FOREIGN KEY (roadmap_id)
        REFERENCES roadmaps(id)
        ON DELETE CASCADE ON UPDATE CASCADE,

    UNIQUE (roadmap_id, week_number)
);

-- 14. ROADMAP TOPICS / TASKS
CREATE TABLE roadmap_topics (
    id INT AUTO_INCREMENT PRIMARY KEY,
    week_id INT NOT NULL,
    topic VARCHAR(300) NOT NULL,
    resource_type VARCHAR(20) NOT NULL DEFAULT 'book'
        CHECK (resource_type IN ('book','video','mock','pyq','notes')),
    resource_link VARCHAR(1000) NULL,
    order_index INT NOT NULL DEFAULT 0,

    CONSTRAINT fk_topics_week
        FOREIGN KEY (week_id)
        REFERENCES roadmap_weeks(id)
        ON DELETE CASCADE ON UPDATE CASCADE
);

-- 15. USER ROADMAP PROGRESS (per-user topic completion)
CREATE TABLE user_roadmap_progress (
    user_id INT NOT NULL,
    topic_id INT NOT NULL,
    completed BOOLEAN NOT NULL DEFAULT FALSE,
    completed_at TIMESTAMP NULL DEFAULT NULL,

    PRIMARY KEY (user_id, topic_id),

    CONSTRAINT fk_progress_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE ON UPDATE CASCADE,

    CONSTRAINT fk_progress_topic
        FOREIGN KEY (topic_id)
        REFERENCES roadmap_topics(id)
        ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX idx_roadmap_weeks_roadmap ON roadmap_weeks(roadmap_id);
CREATE INDEX idx_roadmap_topics_week ON roadmap_topics(week_id);
CREATE INDEX idx_user_roadmap_progress_user ON user_roadmap_progress(user_id);
CREATE INDEX idx_user_roadmap_progress_topic ON user_roadmap_progress(topic_id);

-- 16. PUBLIC EXAMS VIEW
CREATE OR REPLACE VIEW v_exams_public AS
SELECT
    e.*,
    s.name AS source_name,
    s.listing_url
FROM exams e
JOIN official_sources s ON e.source_id = s.id
WHERE e.status IN ('Verified', 'Updated');

SELECT
    TABLE_NAME,
    COLUMN_NAME,
    REFERENCED_TABLE_NAME,
    REFERENCED_COLUMN_NAME
FROM information_schema.KEY_COLUMN_USAGE
WHERE TABLE_SCHEMA = 'competitive_exam_tracker'
  AND REFERENCED_TABLE_NAME IS NOT NULL;

SELECT * FROM official_sources;
