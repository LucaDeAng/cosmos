/**
 * Preload script for external knowledge tests
 *
 * This file loads dotenv BEFORE importing any modules that depend on env vars.
 * Run with: npx tsx run-test-external-knowledge.ts
 */

import dotenv from 'dotenv';
import path from 'path';

// Load .env file
dotenv.config({ path: path.join(__dirname, '.env') });

// Verify required env vars
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
  console.error('ERROR: Missing Supabase environment variables');
  console.error('Ensure .env file has SUPABASE_URL and SUPABASE_SERVICE_KEY');
  process.exit(1);
}

console.log('Environment loaded:');
console.log(`  SUPABASE_URL: ${process.env.SUPABASE_URL.substring(0, 40)}...`);

// Now dynamically import and run the tests
async function main() {
  const {
    getExternalKnowledge,
    refreshExternalKnowledge,
    searchExternalKnowledge,
    getExternalKnowledgeStats,
    clearCache,
    getCacheStats,
    transformToRAGDocuments,
  } = await import('./src/services/external-knowledge');
  const { fetchAWSCatalog } = await import('./src/services/external-knowledge/awsCatalogFetcher');
  const { fetchAzureCatalog } = await import('./src/services/external-knowledge/azureCatalogFetcher');

  // Colors
  const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
  };

  const log = (msg: string, color: keyof typeof colors = 'reset') =>
    console.log(`${colors[color]}${msg}${colors.reset}`);
  const header = (title: string) => {
    console.log('\n' + '='.repeat(60));
    log(` ${title}`, 'cyan');
    console.log('='.repeat(60) + '\n');
  };
  const success = (msg: string) => log(`   ${msg}`, 'green');
  const error = (msg: string) => log(`   ${msg}`, 'red');
  const info = (msg: string) => log(`   ${msg}`, 'blue');

  const results: Record<string, boolean> = {};

  // TEST 1: AWS Fetcher
  header('TEST 1: AWS Catalog Fetcher');
  try {
    info('Fetching AWS service catalog...');
    const start = Date.now();
    const result = await fetchAWSCatalog();
    success(`Fetched ${result.item_count} AWS services in ${Date.now() - start}ms`);
    info('\nSample services:');
    result.items.slice(0, 5).forEach(i => console.log(`   - ${i.name_en} (${i.category})`));
    results['AWS Fetcher'] = true;
  } catch (err) {
    error(`Failed: ${err instanceof Error ? err.message : String(err)}`);
    results['AWS Fetcher'] = false;
  }

  // TEST 2: Azure Fetcher
  header('TEST 2: Azure Catalog Fetcher');
  try {
    info('Fetching Azure service catalog (max 50)...');
    const start = Date.now();
    const result = await fetchAzureCatalog(50);
    success(`Fetched ${result.item_count} Azure services in ${Date.now() - start}ms`);
    info('\nSample services:');
    result.items.slice(0, 5).forEach(i => console.log(`   - ${i.name_en} (${i.category})`));
    results['Azure Fetcher'] = true;
  } catch (err) {
    error(`Failed: ${err instanceof Error ? err.message : String(err)}`);
    results['Azure Fetcher'] = false;
  }

  // TEST 3: Cache Operations
  header('TEST 3: Cache Operations');
  try {
    info('Clearing cache...');
    await clearCache();
    success('Cache cleared');

    const emptyStats = await getCacheStats();
    info(`Status: hasCache=${emptyStats.hasCache}, items=${emptyStats.itemCount}`);

    info('\nFetching fresh data...');
    const start = Date.now();
    const items = await refreshExternalKnowledge({ maxItemsPerSource: 30 });
    success(`Fetched ${items.length} items in ${Date.now() - start}ms`);

    const stats = await getCacheStats();
    info(`\nCache stats: ${JSON.stringify(stats.sourceCounts)}`);

    info('\nFetching from cache...');
    const cacheStart = Date.now();
    const cached = await getExternalKnowledge();
    success(`Got ${cached.length} items from cache in ${Date.now() - cacheStart}ms`);

    results['Cache Operations'] = true;
  } catch (err) {
    error(`Failed: ${err instanceof Error ? err.message : String(err)}`);
    results['Cache Operations'] = false;
  }

  // TEST 4: Search
  header('TEST 4: Search Functionality');
  try {
    const items = await getExternalKnowledge();
    info(`Searching across ${items.length} items...`);

    const queries = ['compute', 'storage', 'database', 'kubernetes'];
    for (const q of queries) {
      const results = searchExternalKnowledge(items, q, { limit: 3 });
      info(`\n"${q}": ${results.length} results`);
      results.forEach(r => console.log(`   - [${r.source}] ${r.name_en}`));
    }
    results['Search'] = true;
  } catch (err) {
    error(`Failed: ${err instanceof Error ? err.message : String(err)}`);
    results['Search'] = false;
  }

  // TEST 5: RAG Transform
  header('TEST 5: RAG Transformation');
  try {
    const items = await getExternalKnowledge();
    const docs = transformToRAGDocuments(items.slice(0, 3));
    success(`Created ${docs.length} RAG documents`);
    if (docs.length > 0) {
      console.log(`\n   Sample:\n   ${docs[0].content.split('\n').slice(0, 3).join('\n   ')}`);
    }
    results['RAG Transform'] = true;
  } catch (err) {
    error(`Failed: ${err instanceof Error ? err.message : String(err)}`);
    results['RAG Transform'] = false;
  }

  // TEST 6: Stats
  header('TEST 6: Stats Endpoint');
  try {
    const stats = await getExternalKnowledgeStats();
    success(`Stats: cached=${stats.cached}, items=${stats.itemCount}`);
    console.log(`   Sources: ${JSON.stringify(stats.sourceCounts)}`);
    results['Stats'] = true;
  } catch (err) {
    error(`Failed: ${err instanceof Error ? err.message : String(err)}`);
    results['Stats'] = false;
  }

  // Summary
  header('RESULTS SUMMARY');
  let passed = 0, failed = 0;
  for (const [name, result] of Object.entries(results)) {
    if (result) { success(name); passed++; }
    else { error(name); failed++; }
  }
  console.log(`\n   Total: ${passed + failed} | Passed: ${passed} | Failed: ${failed}\n`);

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
