# Project Docs Overview

One place to find the essentials from the scattered READMEs: stack, commands, environment, and where to read more.

## Stack at a Glance
- Backend: Express + TypeScript, Supabase Postgres, JWT auth, secure file upload.
- Frontend: Next.js 16 + TypeScript (dev on port 3001), basic styling and state via React/Hook Form/Zod/Zustand.
- Ports: backend `3000` (API base `http://localhost:3000/api`), frontend `3001` by default.

## Quick Start
1. Backend
   - `cd backend && npm install`
   - Run: `npm run dev` (or `npm run build && npm start` for production). Windows helper: `START-BACKEND.bat` / `START-BACKEND.ps1`.
   - Health check: `http://localhost:3000/health`
   - Migrations: `npm run migrate` (or paste `migrations/001_initial_schema.sql` into Supabase).
2. Frontend
   - `cd frontend && npm install`
   - Run: `npm run dev` (starts on `3001`); Windows helper: `START-FRONTEND.bat`.
   - API target must point to backend (see env vars below).
3. Full flow
   - Backend up on `3000`, frontend on `3001`, then register/login and navigate to dashboard/ingestion flows.

## Environment Variables
- Backend (`backend/.env`)
  - `PORT=3000`
  - `APP_URL=http://localhost:3000`
  - `FRONTEND_URL=http://localhost:3001`
  - `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` (and `KG_SUPABASE_*` if used)
  - `DATABASE_URL` (Postgres connection string)
  - `JWT_SECRET`
  - `UPLOAD_DIR=./uploads`
  - Optional email settings: `EMAIL_FROM=...`
- Frontend (`frontend/.env.local`)
  - `NEXT_PUBLIC_API_URL=http://localhost:3000/api`
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`

## API Quick Map
- Auth: `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/verify-email`, `POST /api/auth/forgot-password`, `POST /api/auth/reset-password`
- Social auth: `POST /api/auth/oauth/:provider` (`google` or `github`) expecting an OAuth token; issues the same JWT as standard login.
- Users: `GET/PUT /api/users/profile`, `GET /api/users/company/:companyId`, `DELETE /api/users/:userId/deactivate`
- Initiatives: `POST/GET/PUT/DELETE /api/initiatives`, stats at `GET /api/initiatives/stats`
- Files: `POST /api/files/upload`, `GET /api/files`, `GET /api/files/:id`, `DELETE /api/files/:id`, integrity check `GET /api/files/:id/verify-integrity`

## Testing
- Backend unit/integration: `cd backend && npm test`
- Backend e2e (requires Supabase test creds): `cd backend && npm run test:e2e`
- Frontend: `npm run lint`; Playwright hook available via `npm run test:e2e` once tests exist.

## File Map (where to read more)
- `backend/README.md` — full backend features, endpoints, env details, troubleshooting.
- `backend/README-TESTS.md` — test strategy (unit vs e2e), CI notes, Supabase secrets needed.
- `frontend/README.md` — Next.js boilerplate (keep API URL aligned with backend port).
- Legacy summaries (`README.md`, `README-BACKEND.md`) contain older notes and some encoding artifacts; prefer the files above.

## Tips
- Update secrets before any deploy; always use HTTPS in production.
- Keep migrations in sync before running e2e tests.
- Health probe: backend `http://localhost:3000/health`; frontend availability via `http://localhost:3001`.
