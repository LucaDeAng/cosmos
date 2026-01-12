/**
 * Test Product/Service Recognition
 *
 * Verifies that the RAG system correctly distinguishes between products and services
 */

require('dotenv').config();

async function runTests() {
  const { semanticSearch } = require('./dist/agents/utils/embeddingService');

  console.log('\n=== Testing Product/Service Recognition ===\n');

  const testCases = [
    { query: 'Enterprise monitoring platform with dashboards and alerts', expected: 'product' },
    { query: '24/7 infrastructure support and maintenance service', expected: 'service' },
    { query: 'Cloud management tool for multi-cloud environments', expected: 'product' },
    { query: 'Consulting for digital transformation strategy', expected: 'service' },
    { query: 'SIEM security platform for threat detection', expected: 'product' },
    { query: 'Managed SOC service with 24x7 monitoring', expected: 'service' },
    { query: 'CI/CD automation platform', expected: 'product' },
    { query: 'DevOps transformation consulting and implementation', expected: 'service' },
    { query: 'CRM software platform for sales teams', expected: 'product' },
    { query: 'ERP support and maintenance subscription', expected: 'service' },
  ];

  let correct = 0;
  const SYSTEM_ID = '00000000-0000-0000-0000-000000000000';

  for (const test of testCases) {
    const results = await semanticSearch(SYSTEM_ID, test.query, {
      limit: 1,
      useHybridSearch: true,
      useQueryExpansion: true,
      useAdaptiveThreshold: true,
    });

    const match = results[0];
    const matchType = match?.metadata.type;
    const isCorrect = matchType === test.expected;

    if (isCorrect) correct++;

    const icon = isCorrect ? '✅' : '❌';
    console.log(`${icon} "${test.query.substring(0, 50)}..."`);
    console.log(`   Expected: ${test.expected} | Got: ${matchType || 'no match'} | Similarity: ${Math.round((match?.similarity || 0) * 100)}%`);
    console.log(`   Match: ${match?.metadata.title || 'none'}`);
    console.log('');
  }

  const accuracy = (correct / testCases.length) * 100;
  console.log(`\n📊 Accuracy: ${accuracy.toFixed(1)}% (${correct}/${testCases.length})`);
  console.log(accuracy >= 85 ? '\n✅ PASS - System correctly identifies products vs services' : '\n❌ FAIL - Needs improvement');

  return accuracy >= 85;
}

runTests()
  .then(success => process.exit(success ? 0 : 1))
  .catch(error => {
    console.error('Error:', error);
    process.exit(1);
  });
