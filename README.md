# AICTE Approval Operations Intelligence Platform

**Smart India Hackathon problem statement SIH26262** — Integrated AICTE Approval Workflow
Automation, Compliance Monitoring and Alert Management System.

> **Prototype disclaimer.** This is an **independent SIH prototype**, not the official AICTE
> website or system. It is not affiliated with, endorsed by, or integrated with AICTE. All
> institutions, users, applications, documents and rules in the seeded dataset are synthetic.
> There is no live AICTE integration of any kind. Regulatory parameters are configurable and
> must be verified against the current official handbook before any real use.
>
> Official references (for design and regulatory context only):
> - AICTE public website: <https://www.aicte.gov.in/>
> - Approval Process Handbook: <https://www.aicte.gov.in/sites/default/files/APH%20Final.pdf>
>   (Approval Process Handbook 2024–2027 — always verify the latest version, amendments and
>   circulars on the official site before relying on any rule encoded here.)

---

## 1. What this platform does

A single operations portal for the full lifecycle of institution approval applications:

| Area | Capability |
| --- | --- |
| **Application workflow** | Create/submit applications, stage-wise transitions (scrutiny → clarification → EVC → SAC/SHC → approval/rejection), configurable workflow versions, deadlines per stage, return/resubmit limits, deficiency checklists, clarification Q&A, authorized decisions. |
| **Scrutiny workbench** | Officer queue with filters, checklist verification (verified / deficient / manual), OCR-extracted field review, notes, recommendations, return-with-reason. |
| **EVC management** | Expert Visit Committee cases, prerequisites gate (no scheduling with blocking compliance), scheduling with participants, visit reports, outcomes. |
| **SAC/SHC review** | Committee review cases with recommendations up to the approving authority. |
| **Compliance & undertakings** | Obligation register, deadlines, evidence submission, officer verification, reminder/escalation policies. |
| **Document registry** | Upload/replace/expire documents, pdfplumber text extraction (optional Tesseract OCR for scans), field extraction with review status, chain-of-custody hash, expiry calendar with warning windows. |
| **Alerts & escalations** | SLA/deadline/expiry/overdue escalation engine (hourly in-process scheduler), notification inbox with unread count, acknowledge actions. |
| **Delay-risk radar** | Explainable risk scoring per application — every score lists its contributing factors and recommended next action; bottleneck analysis across stages/officers/dependencies. |
| **Reports & analytics** | Database-backed dashboards (executive, officer, institution), ageing distribution, workload, monthly trend, CSV exports. |
| **AI assistance (optional)** | AI document assistant (summaries, checklist help, extraction suggestions) and a **source-cited AICTE Handbook RAG assistant** that abstains when evidence is insufficient. Both degrade honestly when no provider is configured. |
| **Regulatory rules** | Versioned, reviewable, testable rule records with activation workflow and verification status. |
| **Security & audit** | Server-enforced RBAC (10 roles), JWT auth with session revocation, login rate limiting, and a **hash-chained audit trail** with integrity verification. |

**Design principle:** deterministic software controls workflow, deadlines, permissions and state
transitions; AI only helps users understand documents, find sources and summarize; authorized
humans make every regulatory decision. No button in this product is decorative — every action
calls the API and persists to the database.

---

## 2. Architecture

```
frontend/  Next.js 15 (App Router, TypeScript, Tailwind, TanStack Query, Recharts, Lucide)
           31 pages — role-aware shell (header + collapsible sidebar), all data via /api/* rewrite
             │  /api/:path*  (Next rewrites; BACKEND_URL, default http://127.0.0.1:8000)
             ▼
backend/   FastAPI (90 routes) — thin routes, service layer
           ├── app/api/routes/    auth, applications, documents, evc, compliance,
           │                      analytics, admin, ai, tasks, rag
           ├── app/services/      workflow_engine, risk_service, sla_service, evc_service,
           │                      compliance_service, document_service, ocr_service, rag_service,
           │                      regulatory_rules_service, dashboards_service, audit_service,
           │                      notification_service, ai_provider, idempotency
           ├── app/core/          config, security (bcrypt+PyJWT), permissions (RBAC matrix)
           ├── app/models/        SQLAlchemy ORM (33 tables)
           ├── alembic/           migrations (initial schema)
           └── app/seed.py        synthetic demo dataset
             ▼
storage     SQLite by default (backend/data/)  ·  PostgreSQL via docker-compose
files       ./data/uploads on disk (default)   ·  S3/MinIO-compatible when S3_ENABLED=true
jobs        in-process APScheduler (hourly SLA tick)  ·  optional Celery module (see §6)
```

Interactive API documentation: **<http://127.0.0.1:8000/docs>** · health check: **`/health`**
(reports API, database, job mode, AI/email/storage configuration).

---

## 3. Quick start (local development)

Prerequisites: Python 3.11+, Node 18+.

### Backend

```bash
cd backend
python -m venv venv
venv/bin/python -m pip install -r requirements.txt      # Windows: venv\Scripts\python -m pip install -r requirements.txt

cp ../.env.example .env                                # then edit values (see §5)
venv/bin/python -m alembic upgrade head                # create schema (or let create_all do it)
venv/bin/python -m app.seed                            # synthetic demo data (use --reset to wipe+reseed)
venv/bin/python -m uvicorn app.main:app --reload --port 8000
```

On Windows the interpreter is `venv\Scripts\python.exe` (the commands above become
`venv\Scripts\python -m ...`).

### Frontend

```bash
cd frontend
npm install
npm run dev                                             # http://localhost:3000
```

Open <http://localhost:3000> and sign in with a demo account (§4). The frontend proxies
`/api/*` to the backend, so no CORS configuration is needed in development.

### Full stack with Docker Compose

```bash
JWT_SECRET_KEY=$(python -c "import secrets; print(secrets.token_urlsafe(48))") docker compose up --build
```

Brings up PostgreSQL, Redis, MinIO, the backend (runs `alembic upgrade head`, seeds, then
serves) and the frontend. Frontend: <http://localhost:3000> · API: <http://localhost:8000/docs>.

---

## 4. Demo accounts

Seeded by `python -m app.seed`. **Every account uses the password `Demo@12345`** —
local demonstration data only, never reuse it anywhere real.

| Email | Role |
| --- | --- |
| `admin@ops.local` | System Administrator |
| `scrutiny@ops.local` | Scrutiny Officer (Northern Region) |
| `scrutiny2@ops.local` | Scrutiny Officer (Southern Region) |
| `evc@ops.local` | EVC Coordinator |
| `evcmember@ops.local` | EVC Member |
| `review@ops.local` | SAC/SHC Reviewer |
| `compliance@ops.local` | Compliance Officer |
| `regional@ops.local` | Regional Officer |
| `approver@ops.local` | Approving Authority |
| `auditor@ops.local` | Auditor (read-only + audit trail) |
| `office.sunrise@ops.local` | Institution — Sunrise Institute of Technology |
| `office.green@ops.local` | Institution — Greenfield Polytechnic |
| `office.lake@ops.local` | Institution — Lakeside College of Engineering |
| `office.harbor@ops.local` | Institution — Harbour City Institute of Technology |

The sidebar shows only the items the signed-in role may use, and the backend re-checks every
permission server-side — hiding a menu item is never the security boundary.

---

## 5. Configuration

Copy `.env.example` to `backend/.env` and adjust. Highlights:

| Variable | Purpose | Default |
| --- | --- | --- |
| `SQLALCHEMY_DATABASE_URI` | SQLite demo DB or PostgreSQL URL | `sqlite:///./data/aicte_platform.db` |
| `JWT_SECRET_KEY` | **Change it** — sign the access tokens | dev placeholder |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | JWT lifetime | `180` |
| `CORS_ORIGINS` | Allowed browser origins (comma-separated) | `http://localhost:3000` |
| `S3_ENABLED` + `S3_*` | S3/MinIO-compatible file storage | off → local `./data/uploads` |
| `AI_API_BASE_URL` / `AI_API_KEY` / `AI_MODEL` | Any OpenAI-compatible chat API for AI features | empty → AI features report "not configured" |
| `AI_EMBEDDING_MODEL` | Embeddings for the Handbook RAG assistant | empty → keyword retrieval fallback |
| `TESSERACT_CMD` | Tesseract binary for scanned-document OCR | empty → pdfplumber text extraction only |
| `SMTP_*` | Outbound email | empty → **console simulation**, messages marked `delivery_status='simulated'`, never claimed as delivered |
| `JOB_MODE` | `inprocess` (default) or `celery` | `inprocess` |
| `ENVIRONMENT` | `development` \| `testing` | `development` |

Frontend: `BACKEND_URL` (build-time; the `/api/*` rewrite target — compose sets
`http://backend:8000`, local default `http://127.0.0.1:8000`).

**No secrets are committed.** `.env` and `backend/data/` are gitignored; only
`.env.example` with placeholders is tracked.

---

## 6. Background jobs, OCR, AI — honest behavior

- **Deadline/escalation engine** runs in-process (APScheduler, hourly `sla_tick`) in both local
  and docker-compose setups. `app/workers/celery_app.py` provides an equivalent Celery beat
  schedule for scaled deployments; it requires installing `celery` and a broker and is **not**
  part of the default stack.
- **OCR/text extraction:** pdfplumber for text PDFs (default, no setup); pytesseract for scans
  only when the `tesseract` binary is present. Missing tooling degrades with an explicit status,
  never with fabricated extracted fields.
- **AI features are optional.** Without `AI_API_*` configuration every AI endpoint returns a
  clear "AI provider is not configured" response (or raw retrieved passages for the Handbook
  assistant) — there is no fake AI output, no fake progress bars. With a provider, every AI
  operation records provider/model for traceability, runs against untrusted-document prompts
  hardened against prompt injection, and fails safely (never blocks a workflow action).
- **Handbook RAG** retrieves only from ingested, registered source documents, always returns
  citations, and **abstains** when no sufficiently relevant passage exists.
- **Email** is console-simulated unless SMTP is configured; the notification inbox in the app
  is the real delivery channel for the demo.

---

## 7. Testing

```bash
cd backend
venv/bin/python -m pytest -q          # full suite
```

Test modules:

| File | Covers |
| --- | --- |
| `tests/test_auth_rbac.py` | login, JWT/session handling, rate limiting, role matrix, cross-institution isolation, forbidden access |
| `tests/test_workflow.py` | stage transitions, permission gates, return limits, deadlines, checklist rules |
| `tests/test_documents_compliance.py` | upload/OCR/extraction/verify, expiry handling, obligations, evidence verification |
| `tests/test_tasks_rag_ai.py` | worklist scoping, task completion, RAG abstains-without-sources / cites-with-sources, AI honest degradation |
| `tests/test_e2e_journey.py` | the full demonstration journey: submit → scrutiny → clarification → EVC → SAC/SHC → approval, plus alerts, delay-risk factors, bottleneck data, audit hash-chain verification |

Frontend:

```bash
cd frontend
npm run typecheck     # tsc --noEmit
npm run build         # production build
```

The tests run against the real FastAPI app with a real (temporary) database — no mocked
persistence, no asserted-but-unrun checks.

---

## 8. Security notes

- **Authentication:** bcrypt password hashing, short-lived JWTs whose `jti` is tracked in a
  sessions table (logout and password change revoke sessions), login rate limiting
  (per-IP), failed logins audited, password change revokes all other sessions.
- **Authorization:** a single permission matrix (`app/core/permissions.py`) drives both the
  API guards and the sidebar; every route enforces it server-side. Institution users can only
  ever see their own institution's data — enforced in queries, not in the UI.
- **Audit:** every important action writes to a hash-chained audit log
  (`prev_hash` → `entry_hash`); `verify_chain()` detects any tampering and is exercised in the
  test suite. Auditors have read-only access.
- **Input:** Pydantic validation on all write payloads, parameterized SQL via ORM,
  unhandled exceptions return a correlation reference without stack traces.
- **Headers/CORS:** explicit origin allowlist; file downloads set `Content-Disposition` and are
  permission-checked per document.
- **Prototype limitation (documented, not hidden):** the JWT is stored in `localStorage` so the
  demo works without a cookie domain. In production this should be a `Secure`, `httpOnly`,
  `SameSite` cookie. See §9.

---

## 9. Known limitations (deliberate and documented)

1. **No live AICTE integration** — no real government systems, no real approval effect. All data
   is synthetic.
2. **Regulatory rules are placeholders** until verified against the current official Approval
   Process Handbook and its amendments; the rules engine keeps source references and
   verification status precisely so they can be reviewed before trusting them.
3. **JWT in localStorage** (prototype convenience) instead of httpOnly cookies.
4. **Email is simulated** (console) unless SMTP is provided; the in-app notification inbox is
   the working channel.
5. **AI features require your own OpenAI-compatible endpoint**; without one they clearly report
   "not configured" rather than fabricating answers. The Handbook assistant's embedded
   knowledge is limited to ingested sources.
6. **OCR for scanned documents needs the Tesseract binary** installed on the host; text PDFs
   work with pdfplumber alone.
7. **Default database is SQLite** for zero-setup demos; docker-compose runs PostgreSQL for a
   more realistic evaluation. SQLite is not a production choice for concurrent officer load.
8. **Background jobs run in-process** in the default stack; the optional Celery path requires
   installing celery and a broker.
9. File virus-scanning, SSO/MFA and formal data-residency controls are out of scope for the
   prototype.

---

## 10. Repository layout

```
├── README.md                 ← this file
├── docker-compose.yml        postgres + redis + minio + backend + frontend
├── .env.example              configuration reference (copy to backend/.env)
├── backend/
│   ├── app/
│   │   ├── main.py           FastAPI app, CORS, scheduler, /health
│   │   ├── api/routes/       auth, applications, documents, evc, compliance,
│   │   │                     analytics, admin, ai, tasks, rag
│   │   ├── services/         workflow engine, risk, SLA, OCR, RAG, audit chain, …
│   │   ├── core/             config, security, permissions (RBAC matrix)
│   │   ├── models/           SQLAlchemy ORM (33 tables)
│   │   ├── workers/          optional Celery app
│   │   └── seed.py           synthetic demo dataset
│   ├── alembic/              migrations (initial schema revision)
│   ├── tests/                pytest suite incl. end-to-end journey
│   └── Dockerfile
└── frontend/
    ├── src/app/(portal)/     role-aware pages: dashboard, applications, tasks, scrutiny,
    │                         review, documents, calendar, evc, compliance, alerts, risk,
    │                         bottlenecks, reports, ai-assistant, handbook-assistant,
    │                         users, workflow-config, regulatory-rules, audit, settings, …
    ├── src/components/       shell, tables, filters, charts, workbenches, dialogs
    ├── src/lib/              API client, types, display helpers
    └── Dockerfile
```

---

## 11. Verifying integrity yourself

```bash
cd backend
# hash-chain verification runs in the test suite; or via API as an auditor:
#   GET /audit/verify      (also listed at http://127.0.0.1:8000/docs)
```

```bash
venv/bin/python -m pytest tests/test_e2e_journey.py -q   # full journey + chain verification
```

---

*Independent prototype built for Smart India Hackathon SIH26262. Not the official AICTE
system; not affiliated with or endorsed by AICTE.*
