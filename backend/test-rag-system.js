/**
 * Test RAG System - Simple JavaScript Test
 *
 * This script tests the complete RAG system without needing TypeScript compilation
 */

require('dotenv').config();

async function runTests() {
  console.log('\n╔═══════════════════════════════════════════════════════════════╗');
  console.log('║              THEMIS RAG System Test Suite                    ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');

  // Test 1: Check environment
  console.log('📋 Test 1: Environment Check\n');

  const hasOpenAI = !!process.env.OPENAI_API_KEY;
  const hasSupabase = !!process.env.SUPABASE_URL && (!!process.env.SUPABASE_KEY || !!process.env.SUPABASE_SERVICE_KEY);

  console.log(`   OpenAI API Key: ${hasOpenAI ? '✅' : '❌'}`);
  console.log(`   Supabase Config: ${hasSupabase ? '✅' : '❌'}`);

  if (!hasOpenAI || !hasSupabase) {
    console.log('\n❌ Environment not configured. Please check .env file\n');
    return false;
  }

  try {
    // Import compiled modules
    const catalogBootstrap = require('./dist/agents/utils/catalogBootstrap');
    const embeddingService = require('./dist/agents/utils/embeddingService');
    const itemValidator = require('./dist/agents/subagents/ingestion/itemValidator');

    // Test 2: Bootstrap Reference Catalogs
    console.log('\n📦 Test 2: Bootstrap Reference Catalogs\n');

    const bootstrapResult = await catalogBootstrap.bootstrapReferenceCatalogs({
      force: false, // Don't re-index if already done
      verbose: true,
    });

    console.log(`\n   Indexed: ${bootstrapResult.indexed}`);
    console.log(`   Skipped: ${bootstrapResult.skipped}`);
    console.log(`   Duration: ${bootstrapResult.duration}ms`);
    console.log(`   Status: ${bootstrapResult.success ? '✅' : '❌'}`);

    if (!bootstrapResult.success) {
      console.log('\n❌ Bootstrap failed\n');
      return false;
    }

    // Test 3: Simple Classification Test
    console.log('\n🎯 Test 3: Classification Test\n');

    const testQueries = [
      { query: 'Cloud migration to AWS infrastructure', expectedType: 'initiative' },
      { query: 'SAP S/4HANA ERP implementation project', expectedType: 'initiative' },
      { query: 'SIEM security monitoring platform', expectedType: 'product' },
      { query: 'Managed infrastructure support service 24/7', expectedType: 'service' },
    ];

    let correct = 0;
    const SYSTEM_COMPANY_ID = '00000000-0000-0000-0000-000000000000';

    for (const test of testQueries) {
      const results = await embeddingService.semanticSearch(
        SYSTEM_COMPANY_ID,
        test.query,
        {
          limit: 1,
          similarityThreshold: 0.5,
          useHybridSearch: true,
          useQueryExpansion: true,
          useAdaptiveThreshold: true,
        }
      );

      const match = results[0];
      const isCorrect = match &&
                       match.metadata.type === test.expectedType &&
                       match.similarity > 0.6;

      if (isCorrect) {
        correct++;
        console.log(`   ✅ "${test.query.substring(0, 40)}..."`);
        console.log(`      → ${match.metadata.type} | ${match.metadata.category}`);
        console.log(`      Confidence: ${Math.round(match.similarity * 100)}%\n`);
      } else {
        console.log(`   ❌ "${test.query.substring(0, 40)}..."`);
        console.log(`      Expected: ${test.expectedType}`);
        console.log(`      Got: ${match?.metadata.type || 'no match'}\n`);
      }
    }

    const accuracy = (correct / testQueries.length) * 100;
    console.log(`   Accuracy: ${accuracy.toFixed(1)}% (${correct}/${testQueries.length})`);
    console.log(`   Status: ${accuracy >= 75 ? '✅' : '❌'}`);

    // Test 4: Validation System
    console.log('\n✅ Test 4: Validation System\n');

    const testItems = [
      {
        id: '1',
        name: 'Valid Initiative',
        description: 'A well-formed project',
        type: 'initiative',
        status: 'active',
        priority: 'high',
        budget: 1000000,
        confidence: 0.85,
      },
      {
        id: '2',
        name: 'Bad',
        description: '',
        type: 'initiative',
        status: 'active',
        confidence: 0.2, // Too low
        budget: -500, // Invalid
      },
    ];

    const { summary } = itemValidator.validateBatch(testItems);

    console.log(`   Total: ${summary.total}`);
    console.log(`   Valid: ${summary.valid}`);
    console.log(`   Quarantined: ${summary.quarantined}`);
    console.log(`   Avg Score: ${summary.avgScore.toFixed(2)}`);
    console.log(`   Status: ${summary.quarantined === 1 ? '✅' : '❌'}`);

    // Test 5: End-to-End Integration
    console.log('\n🔗 Test 5: End-to-End Integration\n');

    const sampleInput = {
      name: 'Enterprise Data Lake Implementation',
      description: 'Build cloud-native data lake on AWS S3 with analytics',
    };

    console.log(`   Input: "${sampleInput.name}"`);

    // Step 1: RAG Classification
    const ragResults = await embeddingService.semanticSearch(
      SYSTEM_COMPANY_ID,
      `${sampleInput.name} ${sampleInput.description}`,
      {
        limit: 1,
        useHybridSearch: true,
        useQueryExpansion: true,
        useAdaptiveThreshold: true,
      }
    );

    const bestMatch = ragResults[0];

    if (!bestMatch) {
      console.log('   ❌ No RAG match found\n');
      return false;
    }

    console.log(`\n   ✅ RAG Classification:`);
    console.log(`      Match: ${bestMatch.metadata.title}`);
    console.log(`      Type: ${bestMatch.metadata.type}`);
    console.log(`      Category: ${bestMatch.metadata.category}`);
    console.log(`      Confidence: ${Math.round(bestMatch.similarity * 100)}%`);

    // Step 2: Validation
    const normalizedItem = {
      id: 'test-1',
      name: sampleInput.name,
      description: sampleInput.description,
      type: bestMatch.metadata.type,
      status: 'active',
      category: bestMatch.metadata.category,
      confidence: bestMatch.similarity,
    };

    const validation = itemValidator.validateNormalizedItem(normalizedItem);

    console.log(`\n   ✅ Validation:`);
    console.log(`      Valid: ${validation.valid ? 'YES' : 'NO'}`);
    console.log(`      Score: ${validation.score.toFixed(2)}`);
    console.log(`      Quarantine: ${validation.quarantine ? 'YES' : 'NO'}`);

    const integrationSuccess =
      bestMatch.metadata.type === 'initiative' && // Expected type
      bestMatch.similarity > 0.7 &&
      validation.valid;

    console.log(`\n   Status: ${integrationSuccess ? '✅' : '❌'}`);

    // Final Summary
    console.log('\n╔═══════════════════════════════════════════════════════════════╗');
    console.log('║                        TEST SUMMARY                           ║');
    console.log('╚═══════════════════════════════════════════════════════════════╝\n');

    const allPassed =
      bootstrapResult.success &&
      accuracy >= 75 &&
      summary.quarantined === 1 &&
      integrationSuccess;

    console.log(`   📦 Bootstrap: ${bootstrapResult.success ? '✅ Pass' : '❌ Fail'}`);
    console.log(`   🎯 Classification: ${accuracy >= 75 ? '✅ Pass' : '❌ Fail'} (${accuracy.toFixed(1)}%)`);
    console.log(`   ✅ Validation: ${summary.quarantined === 1 ? '✅ Pass' : '❌ Fail'}`);
    console.log(`   🔗 Integration: ${integrationSuccess ? '✅ Pass' : '❌ Fail'}`);

    console.log(`\n   Overall: ${allPassed ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}\n`);

    if (allPassed) {
      console.log('   🎉 System is ready for production!\n');
    } else {
      console.log('   ⚠️  Review failed tests above\n');
    }

    return allPassed;

  } catch (error) {
    console.error('\n❌ Test failed with error:', error.message);
    console.error('\nStack trace:', error.stack);
    return false;
  }
}

// Run tests
runTests()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
