/**
 * End-to-End RAG Test Suite
 *
 * Tests complete flow: Bootstrap → PDF ingestion → Classification → Validation
 */

import { bootstrapReferenceCatalogs, testRAGWithReferenceCatalog } from '../agents/utils/catalogBootstrap';
import { semanticSearch } from '../agents/utils/embeddingService';
import { SYSTEM_COMPANY_ID } from '../agents/utils/embeddingService';
import { validateNormalizedItem } from '../agents/subagents/ingestion/itemValidator';

// Test data: realistic IT project catalog
const SAMPLE_PROJECT_CATALOG = `
# IT Portfolio 2025

## Active Projects

### 1. Cloud Migration Initiative
**Description:** Migrate 150 on-premise applications to AWS cloud infrastructure. Includes lift-and-shift for legacy apps and re-architecture for modern applications.
**Type:** Project
**Status:** Active
**Priority:** Critical
**Budget:** €4,500,000
**Timeline:** 24 months
**Technologies:** AWS EC2, RDS, S3, Lambda, EKS
**Team:** 25 people

### 2. SAP S/4HANA Implementation
**Description:** Replace legacy SAP ECC 6.0 with S/4HANA Cloud. Greenfield implementation with business process reengineering.
**Type:** Initiative
**Status:** Active
**Priority:** Critical
**Budget:** €8,500,000
**Timeline:** 30 months
**Technologies:** SAP S/4HANA, SAP Fiori, SAP BTP
**Team:** 40 people

### 3. Microsoft 365 Deployment
**Description:** Migrate 5000 users from on-premise Exchange and file shares to Microsoft 365. Deploy Teams, SharePoint Online, and OneDrive.
**Type:** Project
**Status:** Active
**Priority:** High
**Budget:** €3,200,000
**Timeline:** 18 months
**Technologies:** Microsoft 365, Teams, SharePoint, Power Platform
**Team:** 15 people

### 4. Zero Trust Security Implementation
**Description:** Implement zero trust security architecture across network, identity, and data layers. Deploy microsegmentation and continuous verification.
**Type:** Initiative
**Status:** Active
**Priority:** Critical
**Budget:** €3,500,000
**Timeline:** 24 months
**Technologies:** Palo Alto Prisma, Okta, CrowdStrike, Zscaler
**Team:** 20 people

## Platforms & Products

### 5. SIEM Platform
**Description:** Enterprise SIEM platform for threat detection, incident response, and compliance reporting.
**Type:** Product
**Status:** Active
**Priority:** Critical
**Budget:** €1,200,000
**Technologies:** Splunk, Azure Sentinel
**Users:** 200 SOC analysts

### 6. CI/CD Platform
**Description:** Enterprise CI/CD platform supporting 100+ applications with automated build, test, and deployment.
**Type:** Product
**Status:** Active
**Priority:** High
**Budget:** €650,000
**Technologies:** GitLab CI, ArgoCD, SonarQube
**Users:** 300 developers

## Managed Services

### 7. 24/7 Infrastructure Support
**Description:** Managed services for infrastructure monitoring, maintenance, and incident response.
**Type:** Service
**Status:** Active
**Priority:** Critical
**Annual Cost:** €850,000
**Technologies:** ServiceNow, Datadog, Ansible
**Coverage:** 24x7x365

### 8. SOC-as-a-Service
**Description:** Security Operations Center providing threat monitoring, incident response, and vulnerability management.
**Type:** Service
**Status:** Active
**Priority:** Critical
**Annual Cost:** €1,400,000
**Technologies:** Splunk, CrowdStrike, MITRE ATT&CK
**Coverage:** 24x7x365
`;

/**
 * Test 1: Bootstrap Reference Catalogs
 */
async function test1_BootstrapCatalogs() {
  console.log('\n=== TEST 1: Bootstrap Reference Catalogs ===\n');

  const result = await bootstrapReferenceCatalogs({
    force: true,
    verbose: true,
  });

  console.log(`\n✅ Bootstrap completed:`);
  console.log(`   Indexed: ${result.indexed}`);
  console.log(`   Skipped: ${result.skipped}`);
  console.log(`   Errors: ${result.errors.length}`);
  console.log(`   Duration: ${result.duration}ms`);

  if (result.errors.length > 0) {
    console.log(`\n❌ Errors:`);
    result.errors.forEach(err => console.log(`   - ${err}`));
  }

  return result.success;
}

/**
 * Test 2: RAG Performance with Optimizations
 */
async function test2_RAGPerformance() {
  console.log('\n=== TEST 2: RAG Performance Test ===\n');

  // Test without optimizations
  console.log('Testing WITHOUT optimizations...');
  const baseline = await testRAGWithReferenceCatalog({
    useOptimizations: false,
    verbose: false,
  });

  console.log(`\nBaseline Results (NO optimizations):`);
  console.log(`   Total: ${baseline.stats.total}`);
  console.log(`   Passed: ${baseline.stats.passed}/${baseline.stats.total} (${Math.round((baseline.stats.passed / baseline.stats.total) * 100)}%)`);
  console.log(`   Type Accuracy: ${baseline.stats.typeAccuracy.toFixed(1)}%`);
  console.log(`   Category Accuracy: ${baseline.stats.categoryAccuracy.toFixed(1)}%`);

  // Test with optimizations
  console.log('\n\nTesting WITH optimizations...');
  const optimized = await testRAGWithReferenceCatalog({
    useOptimizations: true,
    verbose: false,
  });

  console.log(`\nOptimized Results (Hybrid + Query Expansion + Adaptive):`);
  console.log(`   Total: ${optimized.stats.total}`);
  console.log(`   Passed: ${optimized.stats.passed}/${optimized.stats.total} (${Math.round((optimized.stats.passed / optimized.stats.total) * 100)}%)`);
  console.log(`   Type Accuracy: ${optimized.stats.typeAccuracy.toFixed(1)}%`);
  console.log(`   Category Accuracy: ${optimized.stats.categoryAccuracy.toFixed(1)}%`);

  const improvement = optimized.stats.typeAccuracy - baseline.stats.typeAccuracy;
  console.log(`\n📈 Improvement: +${improvement.toFixed(1)}%`);

  // Show failures
  const failures = optimized.results.filter(r => !r.passed);
  if (failures.length > 0) {
    console.log(`\n❌ Failed tests:`);
    failures.forEach(f => {
      console.log(`\n   Query: "${f.query}"`);
      console.log(`   Expected: ${f.expected.expectedType} | ${f.expected.expectedCategory}`);
      if (f.actual.topMatch) {
        console.log(`   Got: ${f.actual.topMatch.type} | ${f.actual.topMatch.category} (${Math.round(f.actual.topMatch.similarity * 100)}%)`);
      } else {
        console.log(`   Got: No matches found`);
      }
    });
  }

  return optimized.stats.typeAccuracy >= 85; // Target: >85%
}

/**
 * Test 3: Sample Catalog Classification
 */
async function test3_ClassifySampleCatalog() {
  console.log('\n=== TEST 3: Classify Sample Project Catalog ===\n');

  // Parse sample catalog into test queries
  const testCases = [
    {
      name: 'Cloud Migration Initiative',
      query: 'Migrate 150 on-premise applications to AWS cloud infrastructure',
      expectedType: 'initiative',
      expectedCategory: 'Cloud Migration',
    },
    {
      name: 'SAP S/4HANA Implementation',
      query: 'Replace legacy SAP ECC with S/4HANA Cloud greenfield implementation',
      expectedType: 'initiative',
      expectedCategory: 'ERP',
    },
    {
      name: 'Microsoft 365 Deployment',
      query: 'Migrate 5000 users to Microsoft 365 Teams SharePoint OneDrive',
      expectedType: 'initiative',
      expectedCategory: 'Digital Workplace',
    },
    {
      name: 'Zero Trust Security',
      query: 'Implement zero trust security architecture with microsegmentation',
      expectedType: 'initiative',
      expectedCategory: 'Security',
    },
    {
      name: 'SIEM Platform',
      query: 'Enterprise SIEM platform for threat detection and compliance',
      expectedType: 'product',
      expectedCategory: 'Security',
    },
    {
      name: 'CI/CD Platform',
      query: 'CI/CD platform for automated build test deployment',
      expectedType: 'product',
      expectedCategory: 'DevOps',
    },
    {
      name: '24/7 Infrastructure Support',
      query: 'Managed services for infrastructure monitoring and incident response',
      expectedType: 'service',
      expectedCategory: 'Managed Services',
    },
    {
      name: 'SOC-as-a-Service',
      query: 'Security Operations Center for threat monitoring and incident response',
      expectedType: 'service',
      expectedCategory: 'Managed Services',
    },
  ];

  let passed = 0;
  let failed = 0;

  for (const test of testCases) {
    const results = await semanticSearch(
      SYSTEM_COMPANY_ID,
      test.query,
      {
        limit: 3,
        similarityThreshold: 0.5,
        useHybridSearch: true,
        useQueryExpansion: true,
        useAdaptiveThreshold: true,
      }
    );

    const topMatch = results[0];
    const typeMatch = topMatch?.metadata.type === test.expectedType;
    const categoryMatch = !test.expectedCategory || topMatch?.metadata.category === test.expectedCategory;
    const testPassed = typeMatch && categoryMatch && (topMatch?.similarity || 0) > 0.6;

    if (testPassed) {
      passed++;
      console.log(`✅ ${test.name}`);
      console.log(`   Match: ${topMatch.metadata.title} (${Math.round(topMatch.similarity * 100)}%)`);
      console.log(`   Type: ${topMatch.metadata.type} ✓ | Category: ${topMatch.metadata.category} ✓`);
    } else {
      failed++;
      console.log(`❌ ${test.name}`);
      console.log(`   Expected: ${test.expectedType} | ${test.expectedCategory}`);
      if (topMatch) {
        console.log(`   Got: ${topMatch.metadata.type} | ${topMatch.metadata.category} (${Math.round(topMatch.similarity * 100)}%)`);
      } else {
        console.log(`   Got: No matches`);
      }
    }
    console.log('');
  }

  console.log(`\n📊 Results: ${passed}/${testCases.length} passed (${Math.round((passed / testCases.length) * 100)}%)`);

  return passed >= testCases.length * 0.85; // Target: 85%
}

/**
 * Test 4: Data Quality Validation
 */
async function test4_DataQualityValidation() {
  console.log('\n=== TEST 4: Data Quality Validation ===\n');

  // Simulate normalized items from ingestion
  const normalizedItems = [
    {
      id: '1',
      name: 'Multi-Cloud Management Platform',
      description: 'Unified platform for managing AWS, Azure, GCP resources',
      type: 'product' as const,
      status: 'active' as const,
      priority: 'critical' as const,
      budget: 650000,
      category: 'Cloud Management',
      subcategory: 'Multi-Cloud',
      confidence: 0.92,
    },
    {
      id: '2',
      name: 'SAP S/4HANA Cloud',
      description: 'Cloud ERP platform for finance and procurement',
      type: 'product' as const,
      status: 'active' as const,
      priority: 'critical' as const,
      budget: 2800000,
      confidence: 0.89,
      category: 'ERP',
    },
    {
      id: '3',
      name: 'SIEM Platform',
      description: 'Security monitoring and threat detection',
      type: 'product' as const,
      status: 'active' as const,
      priority: 'high' as const,
      confidence: 0.87,
      category: 'Security',
    },
    // Low quality item - should be quarantined
    {
      id: '4',
      name: 'Svc',
      description: '',
      type: 'service' as const,
      status: 'active' as const,
      confidence: 0.25, // Low confidence
      budget: -100, // Invalid budget
    },
  ];

  let validCount = 0;
  let quarantinedCount = 0;

  console.log('Validating items...\n');

  for (const item of normalizedItems) {
    const validation = validateNormalizedItem(item);

    if (validation.quarantine) {
      quarantinedCount++;
      console.log(`🚨 QUARANTINED: ${item.name}`);
      console.log(`   Score: ${validation.score.toFixed(2)}`);
      console.log(`   Reasons: ${validation.quarantineReasons.join(', ')}`);
      console.log(`   Errors: ${validation.errors.length}`);
      validation.errors.forEach(err => {
        console.log(`      - ${err.message}`);
      });
    } else {
      validCount++;
      console.log(`✅ VALID: ${item.name}`);
      console.log(`   Score: ${validation.score.toFixed(2)}`);
      if (validation.warnings.length > 0) {
        console.log(`   Warnings: ${validation.warnings.length}`);
      }
    }
    console.log('');
  }

  console.log(`\n📊 Results:`);
  console.log(`   Valid: ${validCount}`);
  console.log(`   Quarantined: ${quarantinedCount}`);
  console.log(`   Total: ${normalizedItems.length}`);

  return quarantinedCount === 1; // Should quarantine the bad item
}

/**
 * Main test runner
 */
async function runAllTests() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║         THEMIS RAG End-to-End Test Suite                  ║');
  console.log('╚════════════════════════════════════════════════════════════╝');

  const results: { name: string; passed: boolean }[] = [];

  try {
    // Test 1: Bootstrap
    const test1 = await test1_BootstrapCatalogs();
    results.push({ name: 'Bootstrap Reference Catalogs', passed: test1 });

    // Test 2: Performance
    const test2 = await test2_RAGPerformance();
    results.push({ name: 'RAG Performance (>85% accuracy)', passed: test2 });

    // Test 3: Classification
    const test3 = await test3_ClassifySampleCatalog();
    results.push({ name: 'Sample Catalog Classification', passed: test3 });

    // Test 4: Validation
    const test4 = await test4_DataQualityValidation();
    results.push({ name: 'Data Quality Validation', passed: test4 });

  } catch (error) {
    console.error('\n❌ Test suite failed with error:', error);
    return false;
  }

  // Summary
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║                     TEST SUMMARY                           ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;

  results.forEach(r => {
    const icon = r.passed ? '✅' : '❌';
    console.log(`${icon} ${r.name}`);
  });

  console.log(`\n📊 Overall: ${passed}/${results.length} tests passed (${Math.round((passed / results.length) * 100)}%)`);

  if (passed === results.length) {
    console.log('\n🎉 ALL TESTS PASSED! System is ready for production.\n');
    return true;
  } else {
    console.log(`\n⚠️  ${failed} test(s) failed. Review failures above.\n`);
    return false;
  }
}

// Run tests if executed directly
if (require.main === module) {
  runAllTests()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

export {
  runAllTests,
  test1_BootstrapCatalogs,
  test2_RAGPerformance,
  test3_ClassifySampleCatalog,
  test4_DataQualityValidation,
  SAMPLE_PROJECT_CATALOG,
};
