# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

THEMIS is a multi-agent AI system for IT maturity assessment and enterprise portfolio management. It follows a sequential workflow: companies complete maturity assessment, upload portfolio items, then receive AI-powered evaluations for roadmap, budget, and strategy planning.

## Development Commands

### Backend (Express + TypeScript, port 3000)
```bash
cd backend
npm run dev          # Start dev server with hot reload
npm run build        # Compile TypeScript (runs tsc + copies prompts)
npm run start        # Run compiled code
npm run test         # Run Jest tests (--runInBand)
npm run test:e2e     # Run E2E tests
npm run lint         # ESLint
npm run migrate      # Run database migrations
```

### Frontend (Next.js 16, port 3001)
```bash
cd frontend
npm run dev          # Start dev server on port 3001
npm run build        # Production build
npm run test:e2e     # Playwright tests (chromium)
npm run lint         # ESLint
```

### Quick Start
```batch
START-BACKEND.bat    # Or: cd backend && npm run dev
START-FRONTEND.bat   # Or: cd frontend && npm run dev
```

## Architecture

### Multi-Agent System
The backend uses an **orchestrator pattern** with specialized AI agents:
- **Orchestrator Agent** (`src/agents/orchestratorAgent.ts`) - Routes requests to appropriate sub-agents
- **Client Assessment Agent** - Evaluates IT maturity (Step 1)
- **Document Extraction Agent** - Extracts portfolio items from uploaded files (Step 2)
- **Portfolio Assessment Agent** - Scores and ranks portfolio items (Step 3)
- **Roadmap Generator** - Creates strategic roadmaps (Step 4)
- **Budget Optimizer** - Optimizes budget allocation (Step 5)
- **Strategy Advisor** - Prioritizes initiatives with MoSCoW/WSJF frameworks (Step 6)

Sub-agents are in `src/agents/subagents/`. Agent prompts are in `src/agents/prompts/` (must be copied during build).

### Data Flow
```
Frontend (Next.js) → REST API → Backend (Express)
                                    ↓
                         Orchestrator Agent
                                    ↓
                         Specialized Sub-agents
                                    ↓
                         Supabase (PostgreSQL)
```

### Backend Structure
- `src/routes/` - Express route handlers (assessment, portfolio, budget, strategy, etc.)
- `src/services/` - Business logic (ingestion, learning, metrics)
- `src/repositories/` - Database access layer (Supabase queries)
- `src/agents/` - AI agent implementations
- `src/knowledge/` - Product knowledge orchestration and deduplication
- `src/middleware/` - Auth, validation middleware
- `src/config/` - Database and app configuration

### Frontend Structure
- `app/` - Next.js App Router pages (login, dashboard, portfolio, roadmap, budget, strategy)
- `components/` - React components (ui/, dashboard/, portfolio/)
- `store/` - Zustand stores (authStore, loadingStore, notificationStore)
- `lib/api.ts` - Axios API client with JWT interceptors
- `lib/design-tokens.ts` - Design system tokens
- `hooks/` - Custom React hooks

### State Management
- **Frontend**: Zustand for auth/loading/notifications, TanStack Query for server state
- **Backend**: Supabase PostgreSQL with repositories pattern

## Design System Constraints

### Icons (MANDATORY)
- Use **only** Lucide icons (`lucide-react`)
- Always set `strokeWidth={1.5}`
- Use monochrome color: `#202223` (import `ICON_COLOR` from `@/components/ui/Icon`)
- Size presets: xs(14), sm(16), md(20), lg(24), xl(32)

```tsx
// Correct
import { Icon, ICON_COLOR } from '@/components/ui/Icon';
import { Search } from 'lucide-react';
<Icon icon={Search} size="lg" />
<Search size={24} strokeWidth={1.5} color={ICON_COLOR} />

// Wrong - no other icon libraries, no gradients, no fill
```

### Loading States
- Use `SmartLoader` for complex loading states
- Use `SpinnerIcon` or `LoadingSpinner` for inline spinners
- No colored loaders (no `text-blue-600`) - always use `#202223`
- No gradient progress bars

## Database

- **Provider**: Supabase PostgreSQL
- **Key tables**: companies, users, assessments, assessment_snapshots, initiatives, portfolio_products, portfolio_services, portfolio_assessments, roadmaps, budget_optimizations, strategy_analyses, audit_logs

## Testing

### Backend Tests
Tests are in `backend/__tests__/`. Run with `npm run test` (uses Jest with `--runInBand`).

### Frontend E2E
Tests are in `frontend/e2e/`. Run with `npm run test:e2e` (Playwright, chromium project).

## Environment Variables

Backend requires `.env` with:
- `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `DATABASE_URL`
- `JWT_SECRET`
- `OPENAI_API_KEY` (for LangChain agents)

Frontend requires `.env.local` with:
- `NEXT_PUBLIC_API_URL` (default: http://localhost:3000/api)
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
