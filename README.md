# SarkariTrack — PS-1 Competitive Exam & Recruitment Dashboard

Fresh implementation for PS-1. Tech stack: **HTML/CSS/JS frontend, Node+Express backend, PostgreSQL DB**.

## 1. Run it live (real-time official data, zero dummy data)

```powershell
cd backend
npm install
node server.js
# open http://localhost:3000  (serves frontend + API)
```

- Candidate: register / login → Dashboard → Explore → Track.
- Admin: `admin@sarkari.track` / `admin123` (override via `.env` → copy `.env.example`).
- Opened via plain Live Server (no backend)? Pages show demo data with an **○ Demo data** pill. With the backend running they show **● Live** — every record fetched live from official portals.

## 2. Live official sources (`backend/scrape.js`)

| Portal | URL | Status |
|---|---|---|
| Union Public Service Commission | https://upsc.gov.in | live (retries on flake) |
| Staff Selection Commission | https://ssc.gov.in | JS-SPA — tracked, 0 items until headless upgrade |
| Railway Recruitment Board | https://rrbcdg.gov.in | live |
| IBPS | https://www.ibps.in | live (TLS-chain fallback, read-only) |
| UP Public Service Commission | https://uppsc.up.nic.in | live |
| India Post GDS | https://indiapostgdsonline.gov.in | live |
| Reserve Bank of India | https://opportunities.rbi.org.in | JS-SPA — tracked |
| Indian Army | https://joinindianarmy.nic.in | JS shell — tracked |

IBPS/SBI/BPSC block server checks from some networks; the scheduler reports
`Source Unavailable` instead of inventing data (PS §11). Polite fetching:
browser UA, 15s timeout, sequential + 1s gap, 25 items/source cap.

## 3. Backend map (`backend/`)

- `server.js` — Express API + static frontend. `GET /api/exams?q&org&status&sort` (**public: admin-approved `Verified`/`Updated` only**), `GET /api/exams/:id`, `GET /api/sources`, `GET /api/changes`, `POST /api/auth/register|login|admin`, candidate `GET|POST /api/tracker` (server-owned, forward-only), admin `GET /api/review` (`New` + `Needs Review`), `GET /api/jobs`, `POST /api/admin/exams/:id/approve|reject`, `POST /api/admin/exams/approve-all`, `POST /api/admin/refresh`.
- **Moderation workflow:** every fresh scrape lands as `New` (invisible publicly). Admin Approves → `Verified` (public) or Rejects → `Rejected` (hidden forever). Ambiguous parses land as `Needs Review`. No API rate limiting — functionality first.
- `scrape.js` — per-portal fetch + parse (anchor/keyword/date/advt extraction, parent-row enrichment, title dedup).
- `validate.js` — required fields, `end ≥ start` (bad date dropped → Needs Review), SHA-256 dedup key.
- `scheduler.js` — 6h cron (`SCRAPE_CRON`), startup run, one retry, job logs; failures never erase trusted data.
- `db.js` — PostgreSQL via `DATABASE_URL` (tables auto-created IF NOT EXISTS; `database/schema.sql` stays canonical for the DB teammate). Without PG it uses ephemeral memory — data is still 100% live-fetched.
- Tracker stays device-local (localStorage); backend tracker endpoints land with PG-backed auth.

## 4. PostgreSQL structure (DB teammate — `database/schema.sql`)

`users` (alert prefs `{7,1}`) · `official_sources` · `exams` (dedup UNIQUE, `end≥start`) ·
`exam_updates` (JSONB diffs) · `applications` · `alerts` (idempotent UNIQUE) ·
`scrape_jobs` · `v_exams_public` (Verified/Updated only).

## 5. Repo history note

The old `Assessment.html`/`Result.html`/etc. files (wrong PS) were deleted in commit `e6886cd` before this push.
