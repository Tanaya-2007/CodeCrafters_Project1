# SarkariTrack — PS-1 Competitive Exam & Recruitment Dashboard

Fresh implementation for the uploaded PS-1. Tech stack: **HTML/CSS/JS frontend, Node+Express backend, PostgreSQL DB**.

> Old remote code (`Assessment.html`, `Result.html`, etc.) is from a different PS — do NOT reuse. Local folder `D:\tanaya\CodeCrafters` was empty, so this is a clean start.

## 1. How to delete the old GitHub code

Local has nothing to delete. To wipe the remote repo after reviewing this UI:

```powershell
cd D:\tanaya\CodeCrafters
git clone https://github.com/Tanaya-2007/CodeCrafters_Project1 tmp_repo
# verify tmp_repo contains the 6 wrong files, then:
Remove-Item tmp_repo\*.html, tmp_repo\*.css -Force
Copy-Item -Recurse frontend,database,backend,README.md tmp_repo\
cd tmp_repo; git add -A; git commit -m "Replace with PS-1 exam dashboard (UI-first)"; git push origin main
```

Or delete via GitHub web: open each of the 6 files → `...` → Delete, then upload this project.

## 2. PostgreSQL structure (for DB teammate — details in `database/schema.sql`)

| Table | Purpose | Key rules |
|---|---|---|
| `users` | login, `alert_pref_days INT[]` e.g. `{7,1}` | email UNIQUE |
| `official_sources` | 3–5 MVP sources (UPSC, SSC, RRB, IBPS), `parser_type`, `last_checked_at` | name UNIQUE |
| `exams` | structured record: org, title, advt_no, start/end, exam/admit dates, official_url, content_hash, status | `end>=start`, `UNIQUE(org,title,advt_no,end)` dedup, `retrieved_at` required |
| `exam_updates` | change history: changed_fields JSONB, old/new snapshots | — |
| `applications` | tracker `PK(user_id, exam_id)`, status Interested→Completed | — |
| `alerts` | idempotent alerts | `UNIQUE(user,exam,type,fire_at,days_before)` |
| `scrape_jobs` | scheduler audit; failure never erases trusted data | — |
| `v_exams_public` | view: only Verified/Updated for dashboard | — |

## 3. Run the UI now (no backend needed)

```powershell
cd D:\tanaya\CodeCrafters\frontend
python -m http.server 8080
# open http://localhost:8080/index.html  (login → dashboard → exam-details → tracker)
```

Demo flow covered: upcoming exams → open exam + official link → Add to tracker → countdown → "Simulate official update" button → Updated badge + history → in-app alert.

## 4. Next: backend (after UI approval)

`backend/server.js` is a placeholder. Next step: `npm install` + auth, exam CRUD, tracker, cron scheduler, cheerio/pdf-parse parsers, in-app/email alerts.
