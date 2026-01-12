/**
 * External Knowledge Test Script
 *
 * Tests the external knowledge service including:
 * - AWS catalog fetching
 * - Azure catalog fetching
 * - Cache operations
 * - Search functionality
 *
 * Run with: npx tsx test-external-knowledge.ts
 */

// CRITICAL: Load dotenv BEFORE any ES module imports
// Using require() ensures synchronous execution before import hoisting
// eslint-disable-next-line @typescript-eslint/no-require-imports
require('dotenv').config();

// Verify Supabase env vars
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
  console.error('ERROR: Missing Supabase environment variables');
  console.error('Ensure .env file has SUPABASE_URL and SUPABASE_SERVICE_KEY');
  process.exit(1);
}

console.log('Environment loaded successfully');

import {
  getExternalKnowledge,
  refreshExternalKnowledge,
  searchExternalKnowledge,
  getExternalKnowledgeStats,
  clearCache,
  getCacheStats,
  transformToRAGDocuments,
} from './src/services/external-knowledge';
import { fetchAWSCatalog } from './src/services/external-knowledge/awsCatalogFetcher';
import { fetchAzureCatalog } from './src/services/external-knowledge/azureCatalogFetcher';

// ANSI colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
};

function log(message: string, color: keyof typeof colors = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function header(title: string) {
  console.log('\n' + '='.repeat(60));
  log(` ${title}`, 'cyan');
  console.log('='.repeat(60) + '\n');
}

function success(message: string) {
  log(`   ${message}`, 'green');
}

function error(message: string) {
  log(`   ${message}`, 'red');
}

function info(message: string) {
  log(`   ${message}`, 'blue');
}

async function testAWSFetcher() {
  header('TEST 1: AWS Catalog Fetcher');

  try {
    info('Fetching AWS service catalog...');
    const startTime = Date.now();

    const result = await fetchAWSCatalog();

    const duration = Date.now() - startTime;
    success(`Fetched ${result.item_count} AWS services in ${duration}ms`);

    // Show sample items
    if (result.items.length > 0) {
      info('\nSample AWS services:');
      for (const item of result.items.slice(0, 5)) {
        console.log(`   - ${item.name_en} (${item.category})`);
      }
    }

    // Show categories
    const categories = [...new Set(result.items.map(i => i.category))];
    info(`\nCategories found: ${categories.length}`);
    for (const cat of categories.slice(0, 10)) {
      console.log(`   - ${cat}`);
    }

    return true;
  } catch (err) {
    error(`AWS fetch failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    return false;
  }
}

async function testAzureFetcher() {
  header('TEST 2: Azure Catalog Fetcher');

  try {
    info('Fetching Azure service catalog (max 50 items)...');
    const startTime = Date.now();

    const result = await fetchAzureCatalog(50);

    const duration = Date.now() - startTime;
    success(`Fetched ${result.item_count} Azure services in ${duration}ms`);

    // Show sample items
    if (result.items.length > 0) {
      info('\nSample Azure services:');
      for (const item of result.items.slice(0, 5)) {
        console.log(`   - ${item.name_en} (${item.category})`);
      }
    }

    // Show categories
    const categories = [...new Set(result.items.map(i => i.category))];
    info(`\nCategories found: ${categories.length}`);
    for (const cat of categories.slice(0, 10)) {
      console.log(`   - ${cat}`);
    }

    return true;
  } catch (err) {
    error(`Azure fetch failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    return false;
  }
}

async function testCacheOperations() {
  header('TEST 3: Cache Operations');

  try {
    // Clear cache first
    info('Clearing cache...');
    await clearCache();
    success('Cache cleared');

    // Check stats after clear
    const emptyStats = await getCacheStats();
    info(`Cache status: hasCache=${emptyStats.hasCache}, items=${emptyStats.itemCount}`);

    // Fetch fresh data (will populate cache)
    info('\nFetching fresh data to populate cache...');
    const startTime = Date.now();
    const items = await refreshExternalKnowledge({ maxItemsPerSource: 30 });
    const duration = Date.now() - startTime;

    success(`Fetched ${items.length} items in ${duration}ms`);

    // Check stats after populate
    const fullStats = await getCacheStats();
    info(`\nCache stats after populate:`);
    console.log(`   - hasCache: ${fullStats.hasCache}`);
    console.log(`   - itemCount: ${fullStats.itemCount}`);
    console.log(`   - sourceCounts: ${JSON.stringify(fullStats.sourceCounts)}`);
    console.log(`   - fetchedAt: ${fullStats.fetchedAt}`);
    console.log(`   - expiresAt: ${fullStats.expiresAt}`);

    // Fetch from cache (should be fast)
    info('\nFetching from cache...');
    const cacheStart = Date.now();
    const cachedItems = await getExternalKnowledge();
    const cacheDuration = Date.now() - cacheStart;

    success(`Got ${cachedItems.length} items from cache in ${cacheDuration}ms`);

    return true;
  } catch (err) {
    error(`Cache test failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    return false;
  }
}

async function testSearchFunctionality() {
  header('TEST 4: Search Functionality');

  try {
    // Get items first
    const items = await getExternalKnowledge();
    info(`Searching across ${items.length} items...`);

    // Test various searches
    const searches = [
      { query: 'compute virtual machine', source: undefined, category: undefined },
      { query: 'storage s3', source: 'aws', category: undefined },
      { query: 'database sql', source: undefined, category: undefined },
      { query: 'kubernetes container', source: undefined, category: undefined },
      { query: 'machine learning ai', source: undefined, category: undefined },
    ];

    for (const search of searches) {
      info(`\nSearch: "${search.query}" ${search.source ? `(source: ${search.source})` : ''}`);

      const results = searchExternalKnowledge(items, search.query, {
        source: search.source,
        category: search.category,
        limit: 5,
      });

      if (results.length > 0) {
        success(`Found ${results.length} results:`);
        for (const item of results) {
          console.log(`   - [${item.source}] ${item.name_en} (${item.category})`);
        }
      } else {
        console.log('   No results found');
      }
    }

    return true;
  } catch (err) {
    error(`Search test failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    return false;
  }
}

async function testRAGTransformation() {
  header('TEST 5: RAG Document Transformation');

  try {
    const items = await getExternalKnowledge();
    info(`Transforming ${items.length} items to RAG documents...`);

    const documents = transformToRAGDocuments(items.slice(0, 5));

    success(`Created ${documents.length} RAG documents`);
    info('\nSample document:');
    if (documents.length > 0) {
      console.log(`\n   Content:\n   ${documents[0].content.split('\n').join('\n   ')}`);
      console.log(`\n   Metadata: ${JSON.stringify(documents[0].metadata, null, 2)}`);
    }

    return true;
  } catch (err) {
    error(`RAG transformation failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    return false;
  }
}

async function testStatsEndpoint() {
  header('TEST 6: Stats Endpoint');

  try {
    info('Getting external knowledge stats...');
    const stats = await getExternalKnowledgeStats();

    success('Stats retrieved:');
    console.log(`   - cached: ${stats.cached}`);
    console.log(`   - itemCount: ${stats.itemCount}`);
    console.log(`   - sourceCounts: ${JSON.stringify(stats.sourceCounts)}`);
    console.log(`   - lastFetched: ${stats.lastFetched}`);
    console.log(`   - cacheExpires: ${stats.cacheExpires}`);

    return true;
  } catch (err) {
    error(`Stats test failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    return false;
  }
}

async function runAllTests() {
  console.log('\n');
  log('='.repeat(60), 'cyan');
  log('   EXTERNAL KNOWLEDGE SERVICE - TEST SUITE', 'cyan');
  log('='.repeat(60), 'cyan');

  const results: Record<string, boolean> = {};

  // Run tests sequentially
  results['AWS Fetcher'] = await testAWSFetcher();
  results['Azure Fetcher'] = await testAzureFetcher();
  results['Cache Operations'] = await testCacheOperations();
  results['Search Functionality'] = await testSearchFunctionality();
  results['RAG Transformation'] = await testRAGTransformation();
  results['Stats Endpoint'] = await testStatsEndpoint();

  // Print summary
  header('TEST RESULTS SUMMARY');

  let passed = 0;
  let failed = 0;

  for (const [name, result] of Object.entries(results)) {
    if (result) {
      success(`${name}`);
      passed++;
    } else {
      error(`${name}`);
      failed++;
    }
  }

  console.log('\n' + '-'.repeat(40));
  log(`   Total: ${passed + failed} | Passed: ${passed} | Failed: ${failed}`, failed > 0 ? 'yellow' : 'green');
  console.log('-'.repeat(40) + '\n');

  process.exit(failed > 0 ? 1 : 0);
}

// Run tests
runAllTests().catch(err => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
