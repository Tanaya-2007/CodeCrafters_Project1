// TODO (next step after UI approval): Express APIs + scheduler + parser + alerts.
// Planned routes:
//   POST /api/auth/register, POST /api/auth/login
//   GET  /api/exams?q=&org=&status=&sort=
//   GET  /api/exams/:id
//   POST /api/tracker (user_id, exam_id, status)
//   GET  /api/alerts (in-app)
//   POST /api/admin/check-now (trigger scheduler)
// DB: PostgreSQL, see ../database/schema.sql (owned by DB teammate).
const express = require('express');
const app = express();
app.use(express.json());
app.get('/api/health', (req, res) => res.json({ ok: true, stage: 'ui-first, backend-next' }));
app.use(express.static('../frontend'));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`UI preview at http://localhost:${PORT}/frontend/dashboard.html`));
