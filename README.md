# ReconEngine — Crypto Transaction Reconciliation System

A production-grade reconciliation engine that ingests transaction exports from a user and an exchange, matches them intelligently using a \
configurable tolerance engine, and surfaces discrepancies through a polished dashboard UI.

---

## 🚀 Quick Start

 Docker (Recommended, one command)

```bash
cp backend/.env.example backend/.env
docker-compose up --build
```

| Service  | URL                    |
|----------|------------------------|
| Frontend | http://localhost:3000  |
| Backend  | http://localhost:3001  |
| MongoDB  | mongodb://localhost:27017 |

---

```bash
# 1. Clone and install root dependencies
npm install

# 2. Setup backend
cd backend
cp .env.example .env       # edit MONGODB_URI if needed
npm install
npm run dev                 # starts on :3001

# 3. Setup frontend (separate terminal)
cd frontend
npm install
npm run dev                 # starts on :5173
```

---

## 📁 Project Structure

```
recon-engine/
├── backend/
│   ├── src/
│   │   ├── config/         # Environment config with Zod validation
│   │   ├── controllers/    # Route handlers
│   │   ├── middleware/     # Error handling
│   │   ├── models/         # Mongoose schemas
│   │   │   ├── RawTransaction.ts       # Staging collection
│   │   │   └── ReconciliationRun.ts    # Run + detail collections
│   │   ├── routes/         # Express router
│   │   ├── services/
│   │   │   ├── ingestionService.ts     # CSV parsing + validation
│   │   │   ├── matchingService.ts      # Two-pointer matching engine
│   │   │   └── exportService.ts        # CSV report generation
│   │   └── utils/
│   │       ├── assetNormalizer.ts      # Alias dictionary
│   │       ├── database.ts             # Mongoose connection
│   │       └── logger.ts               # Pino structured logger
│   ├── Dockerfile
│   └── package.json
│
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── ingestion/   # File upload + tolerance sliders
│   │   │   ├── report/      # Summary charts + detail table
│   │   │   └── dashboard/   # Run history
│   │   ├── lib/api.ts       # API client
│   │   └── types/api.ts     # Shared TypeScript interfaces
│   ├── Dockerfile
│   └── package.json
│
├── docker-compose.yml
└── README.md
```

---

## 🧠 Architecture Decisions

### Database Schema Design

Three separate collections were chosen to enforce a clean separation of concerns:

| Collection | Purpose |
|---|---|
| `raw_transactions` | Staging — stores every parsed CSV row exactly as received, valid or not |
| `reconciliation_runs` | Metadata per run — config used, status, summary counts |
| `reconciliation_details` | Report rows — one document per matched/unmatched pair |

**Why not one flat collection?**
Separating staging from results allows re-running the matching engine with different tolerances against the same ingested data without re-parsing CSVs. It also allows auditing exactly what raw data was received.

### Matching Algorithm: Two-Pointer / Sliding Window

Naïve O(N²) nested loops are replaced with a **O(N log N)** strategy:

1. **Filter**: Only `VALID` rows participate in matching.
2. **Group**: Transactions are bucketed by `asset_normalized + type_group` (TRANSFER_IN and TRANSFER_OUT share a bucket — they are the same event from opposite perspectives).
3. **Sort**: Each bucket is sorted by timestamp.
4. **Two-Pointer**: For each user transaction, advance an exchange pointer to the start of the timestamp window. Collect all exchange candidates within `±TIMESTAMP_TOLERANCE_SECONDS`.
5. **Best match**: Among candidates, select the one with the smallest quantity delta.
6. **Classify**: If both timestamp and quantity are within tolerances → `MATCHED`; otherwise → `CONFLICTING` with specific variance logged.
7. **Leftovers**: Unmatched rows → `UNMATCHED_USER` or `UNMATCHED_EXCHANGE`.

---

## ⚙️ API Reference

### `POST /api/reconcile`

Trigger a reconciliation run.

**Content-Type:** `multipart/form-data`

| Field | Type | Required | Description |
|---|---|---|---|
| `userFile` | File (.csv) | ✅ | User transaction export |
| `exchangeFile` | File (.csv) | ✅ | Exchange transaction export |
| `timestampToleranceSeconds` | number | ❌ | Override default (300s) |
| `quantityTolerancePct` | number | ❌ | Override default (0.01%) |

**Response `202`:**
```json
{ "runId": "uuid", "message": "Reconciliation started", "config": { ... } }
```

---

### `GET /api/report/:runId`

Full paginated report with all detail rows.

**Query params:** `?category=MATCHED|CONFLICTING|UNMATCHED_USER|UNMATCHED_EXCHANGE`, `?page=1&limit=50`, `?format=csv`

---

### `GET /api/report/:runId/summary`

High-level counts and flagged invalid rows.

---

### `GET /api/report/:runId/unmatched`

Only unmatched rows with reasons.

---

### `GET /api/runs`

List recent reconciliation runs (last 20).

---

## 🔧 Configuration

All tolerances are configurable without code changes:

```env
TIMESTAMP_TOLERANCE_SECONDS=300   # ±5 minutes by default
QUANTITY_TOLERANCE_PCT=0.01       # ±0.01% by default
```

These can also be overridden per-request in the `/reconcile` POST body.

---

## 🤔 Handling Unclear Requirements & Assumptions

This section documents every deliberate decision made about data quality edge cases found in the sample files.

### 1. Asset Aliasing — `bitcoin` → `BTC`

**Observation:** Row USR-005 uses `"bitcoin"` while exchange row EXC-1005 uses `"BTC"`.

**Decision:** An internal `ASSET_ALIAS_MAP` dictionary normalizes all known aliases (full names, alternate tickers) to canonical uppercase tickers at ingestion time. Both the `assetRaw` (original) and `asset` (normalized) values are stored. Normalization is case-insensitive.

The alias dictionary is centralized in `src/utils/assetNormalizer.ts` and can be extended without touching matching logic.

---

### 2. Timestamp Discrepancies — Missing `Z` suffix, sub-second precision

**Observation:** User file has `"2024-03-01T09:00:00"` (no Z) while exchange has `"2024-03-01T09:00:32Z"` (with Z and sub-seconds).

**Decision:** The parser appends `Z` if the trailing UTC indicator is absent, treating all bare ISO strings as UTC. This prevents JavaScript's `new Date()` from interpreting them as local time. The 32-second delta is then naturally handled by the timestamp tolerance window.

---

### 3. Duplicate Transaction ID — USR-001

**Observation:** `USR-001` appears twice in the user file (rows 2 and 17), identical in all fields.

**Decision:**
- **At ingestion:** Both rows are stored in `raw_transactions` with a warning logged. We do **not** silently drop either — the assignment requires flagging, not silent drops.
- **At matching:** The matching engine deduplicates by transaction ID (first-occurrence wins). The second `USR-001` is skipped to prevent a single exchange transaction from being double-reconciled.

This is the most conservative approach: preserve all raw data, but prevent contamination of the analytical result.

---

### 4. Bad Data — Negative Quantity (USR-019) and Missing Timestamp (USR-024)

**Observation:**
- `USR-019`: quantity = `-0.1` (negative — physically impossible for a BUY)
- `USR-024`: timestamp field is blank/missing

**Decision:**
- Both rows are ingested and stored with `validationStatus: "INVALID"` and a `validationErrors` array describing the exact issue (e.g., `["Negative quantity: -0.1"]`, `["Missing timestamp"]`).
- Neither participates in the matching engine, preventing algorithm poisoning.
- Both appear in the `/report/:runId/summary` response under `invalidRows` so the reviewer can audit exactly what was flagged and why.

---

### 5. Malformed Timestamp — USR-018

**Observation:** `USR-018` has timestamp `"2024-03-09T"` — a truncated ISO string that cannot be parsed.

**Decision:** The parser returns `null` for this value and appends `"Malformed timestamp: \"2024-03-09T\""` to `validationErrors`. Row is stored as `INVALID`.

---

### 6. TRANSFER_IN vs TRANSFER_OUT Direction Mapping

**Observation:** `USR-004` is `TRANSFER_OUT / ETH` and `EXC-1004` is `TRANSFER_IN / ETH`. These are the same physical movement viewed from opposite sides.

**Decision:** During grouping, both `TRANSFER_IN` and `TRANSFER_OUT` are placed into a shared `TRANSFER` bucket. During match evaluation, `areTypesCompatible()` returns `true` for this pairing. The reason logged on the match record notes the direction mapping.

---

### 7. Fee Field Mismatch — USR-010 vs EXC-1010

**Observation:** USR-010 has `fee: 0.0015`, EXC-1010 has `fee: 0.002`. These differ but the quantity matches.

**Decision:** Fee differences are **not** a reconciliation failure criterion per the assignment spec (which only requires matching on timestamp, quantity, type, and asset). Fee is stored and visible in the report but does not affect match classification. This is noted as a deliberate scope decision — fee reconciliation could be added as a future tolerance parameter.

---

### 8. Price Discrepancy — USR-012 vs EXC-1012

**Observation:** USR-012 quantity is `0.3` BTC, EXC-1012 is `0.3001` BTC — a delta of `0.0001`.

**Decision:** The default `QUANTITY_TOLERANCE_PCT` is `0.01%`. The delta here is `0.0333%`, which exceeds the default tolerance → classified as `CONFLICTING` with `"Quantity discrepancy of 0.0001 BTC (0.0333%) exceeds 0.01% tolerance"` as the reason. Increasing tolerance to `0.05%` would reclassify it as `MATCHED`.

---

## 📊 Tech Stack

| Layer | Technology |
|---|---|
| API | Node.js + Express + TypeScript |
| Validation | Zod |
| Database | MongoDB + Mongoose |
| CSV Parsing | csv-parser (streaming) |
| Logging | Pino + pino-pretty |
| Frontend | React + Vite + TypeScript |
| Styling | Tailwind CSS |
| Charts | Recharts |
| Icons | lucide-react |
| Containers | Docker + Docker Compose |

---

## 🔖 Suggested Git Commit Sequence

For reviewers evaluating commit hygiene — this is the recommended semantic commit sequence:

```
chore: initialize monorepo with backend and frontend workspaces
feat: add Mongoose schemas for raw_transactions and reconciliation collections
feat: implement CSV ingestion service with Zod validation and error flagging
feat: add asset alias normalizer dictionary with TRANSFER direction mapping
feat: implement two-pointer matching engine with configurable tolerances
feat: add reconciliation controller and REST API routes
feat: wire up Express app with pino logging and MongoDB connection
feat: build React ingestion tab with drag-and-drop file upload
feat: add donut chart summary dashboard with metric cards
feat: implement paginated reconciliation detail table with category filters
feat: add CSV export endpoint and download button
feat: add run history tab with live status polling
fix: handle malformed timestamps with Z-suffix normalization
fix: deduplicate user transaction IDs before matching to prevent double-reconciliation
docs: add comprehensive README with architecture decisions and edge case handling
chore: add Dockerfiles and docker-compose for one-command setup
```

---

## 🛡️ Production Considerations

- **Memory safety:** CSV parsing uses Node.js streams (`csv-parser`) — no full file buffering. Safe for large files up to Multer's 50MB limit.
- **Non-blocking reconciliation:** The `POST /reconcile` endpoint returns immediately with `202 Accepted`. The reconciliation run executes asynchronously. The frontend polls `/summary` until `COMPLETED`.
- **Structured logging:** All logs are emitted via Pino with JSON format in production, human-readable in development.
- **Graceful shutdown:** SIGTERM handler ensures clean process exit.
- **Index strategy:** Compound indexes on `(source, validationStatus)` and `(source, asset, type)` ensure O(log N) lookups during the matching phase.
