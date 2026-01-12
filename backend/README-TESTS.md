Automated tests for backend

How the tests are designed
- Unit/integration tests use Jest + Supertest.
- External dependencies (Supabase client, LangChain agent, authentication middleware) are mocked so tests are fast and stable.

Run tests

```powershell
cd backend
npm test
```

Long-term / best practices
- Add separate end-to-end integration tests that run against a dedicated test database (e.g., Supabase project / branch) to validate migrations and DB behavior.
- Keep unit tests fast and deterministic by mocking external services; run e2e tests in CI using a real test DB.
  
E2E tests (long-term)
- The project contains e2e tests under `__tests__/e2e` that run only when the environment variables
	`SUPABASE_URL` and `SUPABASE_SERVICE_KEY` (or `SUPABASE_SERVICE_ROLE_KEY`) are set.
- These tests create a temporary `company`, exercise `company_assessments` insert/upsert behavior and clean up.
 - These tests create temporary data and exercise insert/upsert behavior. A new test covers
	 `company_assessment_snapshots` upsert semantics (see migration `006_company_assessment_snapshots.sql`).

Run E2E locally (example):

```powershell
cd backend
$env:SUPABASE_URL = 'https://your-test-project.supabase.co'
$env:SUPABASE_SERVICE_KEY = 'your-service-role-key'
npm run test:e2e
```

CI / GitHub Actions notes
- The CI workflow (see .github/workflows/ci.yml) will:
	1. Run migrations against a TEST Supabase project (configured via repo secrets)
	2. Run unit tests
	3. Run e2e tests only if SUPABASE secrets are present

Make sure your CI secrets include:
- SUPABASE_URL
- SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SERVICE_KEY)

