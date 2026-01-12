// Jest setup file - Set up test environment variables
process.env.NODE_ENV = 'test';

// Mock OpenAI API key (tests should mock actual calls)
process.env.OPENAI_API_KEY = 'test-openai-api-key-for-testing';

// DO NOT set fake Supabase URLs - let E2E tests skip when not configured
// E2E tests check for real Supabase URLs and skip when not available
// Unit tests should mock Supabase client directly

// Only set Supabase vars if running unit tests (not e2e)
// E2E tests will skip automatically when these are not set to real URLs
if (!process.env.SUPABASE_URL) {
  // Set placeholder that will trigger skip in e2e tests
  // but allow unit tests to mock the client
  process.env.SUPABASE_URL = '';
  process.env.SUPABASE_SERVICE_KEY = '';
}

// Mock JWT secret
process.env.JWT_SECRET = 'test-jwt-secret-for-testing';

// Mock database URL
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test_db';

console.log('[Jest Setup] Test environment variables configured');
