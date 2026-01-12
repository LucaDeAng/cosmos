/**
 * Agent Harmonization Script
 *
 * Ensures all agents work together seamlessly:
 * 1. Bootstrap RAG with reference catalogs
 * 2. Test data ingestion pipeline
 * 3. Verify normalizer + validator integration
 * 4. Check pattern learning feedback loop
 */

import { bootstrapReferenceCatalogs } from '../agents/utils/catalogBootstrap';
import { semanticSearch } from '../agents/utils/embeddingService';
import { SYSTEM_COMPANY_ID } from '../agents/utils/embeddingService';
import { validateBatch, filterValidatedItems, generateValidationReport } from '../agents/subagents/ingestion/itemValidator';

interface HarmonizationResult {
  bootstrapSuccess: boolean;
  ragAccuracy: number;
  validationWorking: boolean;
  integrationScore: number;
  recommendations: string[];
}

/**
 * Step 1: Ensure RAG is bootstrapped
 */
async function step1_EnsureRAGBootstrap(): Promise<boolean> {
  console.log('\n📦 Step 1: Bootstrap RAG System\n');

  const result = await bootstrapReferenceCatalogs({
    force: false, // Only index new items
    verbose: true,
  });

  if (result.indexed === 0 && result.skipped > 0) {
    console.log('\n✅ RAG already bootstrapped with reference catalogs');
    return true;
  }

  if (result.success && result.indexed > 0) {
    console.log(`\n✅ Bootstrapped ${result.indexed} new items`);
    return true;
  }

  console.error(`\n❌ Bootstrap failed with ${result.errors.length} errors`);
  return false;
}

/**
 * Step 2: Test RAG classification accuracy
 */
async function step2_TestRAGAccuracy(): Promise<number> {
  console.log('\n🎯 Step 2: Test RAG Classification Accuracy\n');

  const testQueries = [
    { query: 'Cloud migration to AWS', expectedType: 'initiative' },
    { query: 'SAP S/4HANA ERP implementation', expectedType: 'initiative' },
    { query: 'SIEM security platform', expectedType: 'product' },
    { query: 'Managed infrastructure support service', expectedType: 'service' },
    { query: 'DevOps CI/CD platform', expectedType: 'product' },
  ];

  let correct = 0;

  for (const test of testQueries) {
    const results = await semanticSearch(
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
    const isCorrect = match && match.metadata.type === test.expectedType && match.similarity > 0.6;

    if (isCorrect) {
      correct++;
      console.log(`✅ "${test.query}" → ${match.metadata.type} (${Math.round(match.similarity * 100)}%)`);
    } else {
      console.log(`❌ "${test.query}" → ${match?.metadata.type || 'no match'} (expected: ${test.expectedType})`);
    }
  }

  const accuracy = (correct / testQueries.length) * 100;
  console.log(`\n📊 Accuracy: ${accuracy.toFixed(1)}% (${correct}/${testQueries.length})`);

  return accuracy;
}

/**
 * Step 3: Test validation integration
 */
async function step3_TestValidation(): Promise<boolean> {
  console.log('\n✅ Step 3: Test Validation System\n');

  // Create test items
  const testItems = [
    {
      id: '1',
      name: 'Valid Product',
      description: 'A well-formed product platform',
      type: 'product' as const,
      status: 'active' as const,
      priority: 'high' as const,
      budget: 1000000,
      confidence: 0.85,
    },
    {
      id: '2',
      name: 'Bad Item',
      description: '',
      type: 'service' as const,
      status: 'active' as const,
      confidence: 0.2, // Low confidence - should be quarantined
      budget: -500, // Invalid budget
    },
  ];

  const { results, summary } = validateBatch(testItems);
  const { accepted, quarantined } = filterValidatedItems(testItems, results, 'non_quarantined');

  console.log(`Total items: ${summary.total}`);
  console.log(`Valid: ${summary.valid}`);
  console.log(`Quarantined: ${summary.quarantined}`);
  console.log(`Avg Quality Score: ${summary.avgScore.toFixed(2)}`);

  console.log(`\n✅ Accepted items: ${accepted.length}`);
  console.log(`🚨 Quarantined items: ${quarantined.length}`);

  // Should quarantine the bad item
  const validationWorks = quarantined.length === 1 && accepted.length === 1;

  if (validationWorks) {
    console.log('\n✅ Validation working correctly');
  } else {
    console.log('\n❌ Validation not working as expected');
  }

  return validationWorks;
}

/**
 * Step 4: Test end-to-end integration
 */
async function step4_TestIntegration(): Promise<number> {
  console.log('\n🔗 Step 4: Test End-to-End Integration\n');

  // Simulate ingestion flow
  const rawItem = {
    name: 'Enterprise Data Lake Implementation',
    description: 'Build cloud-native data lake on AWS S3 with data governance and analytics',
  };

  console.log(`Input: "${rawItem.name}"`);

  // Step 1: RAG enhancement
  const ragResults = await semanticSearch(
    SYSTEM_COMPANY_ID,
    `${rawItem.name} ${rawItem.description}`,
    {
      limit: 3,
      useHybridSearch: true,
      useQueryExpansion: true,
      useAdaptiveThreshold: true,
    }
  );

  const bestMatch = ragResults[0];

  if (!bestMatch) {
    console.log('❌ No RAG matches found');
    return 0;
  }

  console.log(`\n✅ RAG Match: ${bestMatch.metadata.title}`);
  console.log(`   Type: ${bestMatch.metadata.type}`);
  console.log(`   Category: ${bestMatch.metadata.category}`);
  console.log(`   Similarity: ${Math.round(bestMatch.similarity * 100)}%`);

  // Step 2: Create normalized item
  const normalizedItem = {
    id: 'test-1',
    name: rawItem.name,
    description: rawItem.description,
    type: bestMatch.metadata.type as 'product' | 'service',
    status: 'active' as const,
    category: bestMatch.metadata.category as string,
    subcategory: bestMatch.metadata.subcategory as string,
    confidence: bestMatch.similarity,
  };

  console.log(`\n✅ Normalized Item:`);
  console.log(`   Type: ${normalizedItem.type}`);
  console.log(`   Category: ${normalizedItem.category}`);
  console.log(`   Confidence: ${normalizedItem.confidence.toFixed(2)}`);

  // Step 3: Validate
  const validation = validateBatch([normalizedItem]);

  console.log(`\n✅ Validation:`);
  console.log(`   Valid: ${validation.summary.valid}`);
  console.log(`   Quality Score: ${validation.summary.avgScore.toFixed(2)}`);

  // Integration score based on:
  // - RAG found match (25 points)
  // - High similarity (25 points)
  // - Correct type inferred (25 points)
  // - Passed validation (25 points)
  let score = 0;
  if (bestMatch) score += 25;
  if (bestMatch.similarity > 0.7) score += 25;
  if (normalizedItem.type === 'product') score += 25; // Expected type for this item (data lake = product)
  if (validation.summary.valid === 1) score += 25;

  console.log(`\n📊 Integration Score: ${score}/100`);

  return score;
}

/**
 * Main harmonization check
 */
async function harmonizeAgents(): Promise<HarmonizationResult> {
  console.log('\n╔═══════════════════════════════════════════════════════════════╗');
  console.log('║           THEMIS Agent Harmonization Check                   ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝');

  const result: HarmonizationResult = {
    bootstrapSuccess: false,
    ragAccuracy: 0,
    validationWorking: false,
    integrationScore: 0,
    recommendations: [],
  };

  // Step 1: Bootstrap
  result.bootstrapSuccess = await step1_EnsureRAGBootstrap();

  if (!result.bootstrapSuccess) {
    result.recommendations.push('❌ Fix RAG bootstrap errors before proceeding');
    return result;
  }

  // Step 2: RAG Accuracy
  result.ragAccuracy = await step2_TestRAGAccuracy();

  if (result.ragAccuracy < 80) {
    result.recommendations.push('⚠️  RAG accuracy below 80% - consider re-bootstrapping or adding more reference data');
  }

  // Step 3: Validation
  result.validationWorking = await step3_TestValidation();

  if (!result.validationWorking) {
    result.recommendations.push('❌ Validation system not working correctly - check quality gates');
  }

  // Step 4: Integration
  result.integrationScore = await step4_TestIntegration();

  if (result.integrationScore < 75) {
    result.recommendations.push('⚠️  Integration score below 75 - check agent pipeline');
  }

  // Generate overall recommendations
  if (result.ragAccuracy >= 85 && result.validationWorking && result.integrationScore >= 90) {
    result.recommendations.push('✅ All systems working optimally - ready for production');
  } else if (result.ragAccuracy >= 80 && result.validationWorking && result.integrationScore >= 75) {
    result.recommendations.push('✅ Systems working well - minor optimizations recommended');
  } else {
    result.recommendations.push('⚠️  Systems need optimization before production use');
  }

  // Summary
  console.log('\n╔═══════════════════════════════════════════════════════════════╗');
  console.log('║                     HARMONIZATION SUMMARY                     ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');

  console.log(`📦 Bootstrap: ${result.bootstrapSuccess ? '✅ Success' : '❌ Failed'}`);
  console.log(`🎯 RAG Accuracy: ${result.ragAccuracy.toFixed(1)}% ${result.ragAccuracy >= 85 ? '✅' : result.ragAccuracy >= 80 ? '⚠️' : '❌'}`);
  console.log(`✅ Validation: ${result.validationWorking ? '✅ Working' : '❌ Not Working'}`);
  console.log(`🔗 Integration: ${result.integrationScore}/100 ${result.integrationScore >= 90 ? '✅' : result.integrationScore >= 75 ? '⚠️' : '❌'}`);

  console.log('\n📋 Recommendations:');
  result.recommendations.forEach(rec => console.log(`   ${rec}`));

  console.log('\n');

  return result;
}

// Quick check function for monitoring
export async function quickHealthCheck(): Promise<boolean> {
  const result = await harmonizeAgents();
  return result.bootstrapSuccess &&
         result.ragAccuracy >= 80 &&
         result.validationWorking &&
         result.integrationScore >= 75;
}

// Run if executed directly
if (require.main === module) {
  harmonizeAgents()
    .then(result => {
      const healthy = result.bootstrapSuccess &&
                     result.ragAccuracy >= 80 &&
                     result.validationWorking &&
                     result.integrationScore >= 75;

      process.exit(healthy ? 0 : 1);
    })
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

export { harmonizeAgents, HarmonizationResult };
