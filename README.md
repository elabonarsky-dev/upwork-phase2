# Bookings Backend

Minimal backend that enforces **at most one booking per (tenant_id, start_time_utc)**. Correctness is enforced by the database (UNIQUE constraints); no in-memory locks or timing logic.

## Run locally

```bash
npm install
node index.js
```

Server runs at `http://localhost:3000` (override with `PORT`).

## API

- **POST /bookings** — Create or idempotently return a booking. Body: `tenant_id`, `start_time_utc` (ISO 8601 UTC), `idempotency_key`. Returns 201 on create, 200 when same idempotency_key already exists, 409 when slot is taken by another key.
- **GET /bookings** — List bookings for a tenant. Tenant via header `X-Tenant-ID` or query `tenant_id`.

## Example curl commands

### Idempotency test (same key twice → same booking, 200)

```bash
curl -s -X POST http://localhost:3000/bookings -H "Content-Type: application/json" -d "{\"tenant_id\":\"tenant_a\",\"start_time_utc\":\"2026-01-01T10:00:00Z\",\"idempotency_key\":\"abc-123\"}"
# 201 + booking

curl -s -X POST http://localhost:3000/bookings -H "Content-Type: application/json" -d "{\"tenant_id\":\"tenant_a\",\"start_time_utc\":\"2026-01-01T10:00:00Z\",\"idempotency_key\":\"abc-123\"}"
# 200 + same booking
```

### Conflict test (same slot, different key → 409)

```bash
curl -s -X POST http://localhost:3000/bookings -H "Content-Type: application/json" -d "{\"tenant_id\":\"tenant_a\",\"start_time_utc\":\"2026-01-01T10:00:00Z\",\"idempotency_key\":\"other-key\"}"
# 409
```

### Concurrency test (run in parallel; one wins, others get 409 or 200 by key)

```bash
# Run 5 concurrent requests for same slot with different keys (one 201, four 409)
  curl -s -X POST http://localhost:3000/bookings -H "Content-Type: application/json" -d "{\"tenant_id\":\"tenant_a\",\"start_time_utc\":\"2026-01-01T12:00:00Z\",\"idempotency_key\":\"concurrent-1\"}"

  curl -s -X POST http://localhost:3000/bookings -H "Content-Type: application/json" -d "{\"tenant_id\":\"tenant_a\",\"start_time_utc\":\"2026-01-01T12:00:00Z\",\"idempotency_key\":\"concurrent-2\"}"

  curl -s -X POST http://localhost:3000/bookings -H "Content-Type: application/json" -d "{\"tenant_id\":\"tenant_a\",\"start_time_utc\":\"2026-01-01T12:00:00Z\",\"idempotency_key\":\"concurrent-3\"}"
```

### Manual Insert to Database

```bash
#Insert a duplicate row directly via SQL client.
INSERT INTO bookings (tenant_id, start_time_utc, idempotency_key) VALUES ('tenant_a', '2026-01-01T10:00:00Z', 'manual-test');

```

### GET by tenant

```bash
curl -s "http://localhost:3000/bookings?tenant_id=tenant_a"
# or
curl -s -H "X-Tenant-ID: tenant_a" http://localhost:3000/bookings
```

## Inspect the database

**Option A — Node (no SQLite CLI needed, works on Windows):**

```bash
npm run db:show
```

**Option B — If you have sqlite3 CLI installed:**

```bash
sqlite3 bookings.db "SELECT * FROM bookings;"
```

On Windows, list files with `dir` (not `ls`). SQLite CLI is optional; use Option A if it’s not installed.

Schema: `bookings` has `id`, `tenant_id`, `start_time_utc`, `idempotency_key`, `created_at` with `UNIQUE(tenant_id, start_time_utc)` and `UNIQUE(idempotency_key)`.
