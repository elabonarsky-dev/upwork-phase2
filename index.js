const Database = require('better-sqlite3');
const express = require('express');
const path = require('path');

const DB_PATH = path.join(__dirname, 'bookings.db');
const db = new Database(DB_PATH);

// Schema: one booking per (tenant_id, start_time_utc). Idempotency via UNIQUE(idempotency_key).
db.exec(`
  CREATE TABLE IF NOT EXISTS bookings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id TEXT NOT NULL,
    start_time_utc TEXT NOT NULL,
    idempotency_key TEXT NOT NULL,
    created_at TEXT,
    UNIQUE(tenant_id, start_time_utc),
    UNIQUE(idempotency_key)
  );
`);

const app = express();
app.use(express.json());

// POST /bookings — insert or return existing; 409 if slot taken by different idempotency_key
app.post('/bookings', (req, res) => {
  const { tenant_id, start_time_utc, idempotency_key } = req.body || {};
  if (!tenant_id || !start_time_utc || !idempotency_key) {
    return res.status(400).json({ error: 'tenant_id, start_time_utc, and idempotency_key required' });
  }

  const byKey = db.prepare('SELECT * FROM bookings WHERE idempotency_key = ?').get(idempotency_key);
  if (byKey) {
    return res.status(200).json(byKey);
  }

  const created_at = new Date().toISOString();
  try {
    const result = db.prepare(
      'INSERT INTO bookings (tenant_id, start_time_utc, idempotency_key, created_at) VALUES (?, ?, ?, ?)'
    ).run(tenant_id, start_time_utc, idempotency_key, created_at);
    const row = db.prepare('SELECT * FROM bookings WHERE id = ?').get(result.lastInsertRowid);
    return res.status(201).json(row);
  } catch (err) {
    if (err.code !== 'SQLITE_CONSTRAINT') throw err;
    // UNIQUE violation: either (tenant_id, start_time_utc) or idempotency_key
    const existing = db.prepare('SELECT * FROM bookings WHERE idempotency_key = ?').get(idempotency_key);
    if (existing) return res.status(200).json(existing);
    return res.status(409).json({ error: 'Slot already booked for this tenant and start_time_utc' });
  }
});

// GET /bookings — tenant via X-Tenant-ID or query param
app.get('/bookings', (req, res) => {
  const tenant_id = req.get('X-Tenant-ID') || req.query.tenant_id;
  if (!tenant_id) {
    return res.status(400).json({ error: 'Tenant context required: X-Tenant-ID header or tenant_id query param' });
  }
  const rows = db.prepare('SELECT * FROM bookings WHERE tenant_id = ? ORDER BY start_time_utc').all(tenant_id);
  return res.json(rows);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Listening on http://localhost:${PORT}`));
