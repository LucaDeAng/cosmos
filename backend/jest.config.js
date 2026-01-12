/** Jest config for backend tests */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.ts'],
  clearMocks: true,
  verbose: true,

  // Setup file to configure test environment
  setupFiles: ['<rootDir>/jest.setup.js'],

  // Transform TypeScript files with ts-jest
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: 'tsconfig.json',
    }],
    // Transform ESM modules in node_modules with babel
    '^.+\\.m?js$': 'babel-jest',
  },

  // Allow transformation of ESM packages
  transformIgnorePatterns: [
    '/node_modules/(?!(uuid|p-retry|is-network-error|@langchain|langchain)/)',
  ],

  // Increase timeout for tests that make API calls
  testTimeout: 30000,

  // Force exit after tests complete (handles async operations)
  forceExit: true,
};
