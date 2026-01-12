/**
 * Test Alias Matching
 *
 * Tests the improvement in product matching with aliases vs without
 */

import { getCompanyCatalogSource } from '../src/knowledge/sources/companyCatalogSource';
import type { ExtractedItem } from '../src/knowledge/ProductKnowledgeOrchestrator';

// Test cases - common ways users might write product names in documents
const testCases: Array<{ input: string; expectedMatch: string; category: string }> = [
  // Microsoft products
  { input: 'Rinnovo licenza M365', expectedMatch: 'Microsoft 365', category: 'Productivity Software' },
  { input: 'Subscription O365 Enterprise', expectedMatch: 'Microsoft 365', category: 'Productivity Software' },
  { input: 'MS Teams license renewal', expectedMatch: 'Microsoft Teams', category: 'Collaboration' },
  { input: 'Azure VM instances', expectedMatch: 'Azure', category: 'Cloud Computing' },
  { input: 'Dynamics CRM implementation', expectedMatch: 'Dynamics 365', category: 'Customer Relationship Management' },
  { input: 'Defender ATP subscription', expectedMatch: 'Microsoft Defender', category: 'Security Software' },
  { input: 'Power Platform consulting', expectedMatch: 'Power Platform', category: 'Low-Code Platform' },
  { input: 'Copilot for M365', expectedMatch: 'Copilot', category: 'AI & Machine Learning' },

  // AWS products
  { input: 'EC2 compute instances', expectedMatch: 'EC2', category: 'Cloud Computing' },
  { input: 'S3 storage bucket', expectedMatch: 'S3', category: 'Cloud Computing' },
  { input: 'AWS Lambda functions', expectedMatch: 'Lambda', category: 'Cloud Computing' },

  // Google products
  { input: 'G Suite licenses', expectedMatch: 'Google Workspace', category: 'Productivity Software' },
  { input: 'GCP infrastructure', expectedMatch: 'Google Cloud Platform', category: 'Cloud Computing' },

  // Salesforce
  { input: 'SFDC Sales Cloud', expectedMatch: 'Salesforce', category: 'Customer Relationship Management' },
  { input: 'Service Cloud implementation', expectedMatch: 'Service Cloud', category: 'Customer Service' },

  // SAP
  { input: 'SAP S/4 HANA upgrade', expectedMatch: 'S/4HANA', category: 'Enterprise Resource Planning' },
  { input: 'SuccessFactors HR', expectedMatch: 'SuccessFactors', category: 'Human Capital Management' },

  // Database
  { input: 'PostgreSQL database', expectedMatch: 'PostgreSQL', category: 'Database' },
  { input: 'Postgres hosting', expectedMatch: 'PostgreSQL', category: 'Database' },
  { input: 'MongoDB Atlas subscription', expectedMatch: 'MongoDB', category: 'Database' },
  { input: 'Elastic Search cluster', expectedMatch: 'Elasticsearch', category: 'Search & Analytics' },

  // Security
  { input: 'CrowdStrike EDR platform', expectedMatch: 'CrowdStrike', category: 'Security Software' },
  { input: 'Zscaler ZIA license', expectedMatch: 'Zscaler', category: 'Security Software' },
  { input: 'Okta SSO implementation', expectedMatch: 'Okta', category: 'Security Software' },

  // DevOps
  { input: 'Jenkins CI pipeline', expectedMatch: 'Jenkins', category: 'Development Tools' },
  { input: 'ArgoCD deployment', expectedMatch: 'Argo', category: 'Development Tools' },
  { input: 'Terraform infrastructure', expectedMatch: 'Terraform', category: 'Infrastructure' },
  { input: 'Docker containers', expectedMatch: 'Docker', category: 'Infrastructure' },

  // Collaboration
  { input: 'Slack Enterprise Grid', expectedMatch: 'Slack', category: 'Collaboration' },
  { input: 'Zoom Meetings license', expectedMatch: 'Zoom', category: 'Collaboration' },
  { input: 'Miro whiteboard', expectedMatch: 'Miro', category: 'Collaboration' },
  { input: 'Monday.com subscription', expectedMatch: 'monday', category: 'Project Management' },
];

async function runTests() {
  console.log('\n🧪 Testing Alias Matching Performance\n');
  console.log('   Initializing catalog source...');

  const catalogSource = getCompanyCatalogSource();
  await catalogSource.initialize();

  const stats = catalogSource.getStats();
  console.log(`   Loaded ${stats.total} products (${stats.products} products, ${stats.services} services)\n`);

  let matches = 0;
  let highConfidence = 0;
  let lowConfidence = 0;
  let noMatch = 0;

  console.log('   Running test cases...\n');

  for (const testCase of testCases) {
    const item: ExtractedItem = {
      name: testCase.input,
      type: 'product',
    };

    const result = await catalogSource.enrich(item);

    const matched = result.confidence >= 0.65;
    const highConf = result.confidence >= 0.75;

    if (matched) {
      matches++;
      if (highConf) {
        highConfidence++;
        console.log(`   ✅ "${testCase.input}" → ${result.enrichedFields?.vendor || 'Unknown'} ${result.enrichedFields?.name || 'Unknown'} (${(result.confidence * 100).toFixed(0)}%)`);
      } else {
        lowConfidence++;
        console.log(`   ⚠️  "${testCase.input}" → ${result.enrichedFields?.vendor || 'Unknown'} ${result.enrichedFields?.name || 'Unknown'} (${(result.confidence * 100).toFixed(0)}% - low confidence)`);
      }
    } else {
      noMatch++;
      console.log(`   ❌ "${testCase.input}" → No match (${(result.confidence * 100).toFixed(0)}%)`);
    }
  }

  console.log('\n📊 Test Results\n');
  console.log(`   Total test cases: ${testCases.length}`);
  console.log(`   Matched (>= 65%): ${matches} (${((matches / testCases.length) * 100).toFixed(1)}%)`);
  console.log(`   High confidence (>= 75%): ${highConfidence} (${((highConfidence / testCases.length) * 100).toFixed(1)}%)`);
  console.log(`   Low confidence (65-75%): ${lowConfidence} (${((lowConfidence / testCases.length) * 100).toFixed(1)}%)`);
  console.log(`   No match (< 65%): ${noMatch} (${((noMatch / testCases.length) * 100).toFixed(1)}%)`);

  console.log('\n📈 Coverage Analysis\n');
  const successRate = (matches / testCases.length) * 100;
  if (successRate >= 80) {
    console.log(`   🎉 Excellent! ${successRate.toFixed(1)}% match rate with aliases`);
  } else if (successRate >= 60) {
    console.log(`   👍 Good! ${successRate.toFixed(1)}% match rate - consider adding more aliases`);
  } else {
    console.log(`   ⚠️  ${successRate.toFixed(1)}% match rate - more aliases needed for better coverage`);
  }

  console.log('\n💡 Recommendations\n');
  if (noMatch > 0) {
    console.log(`   - ${noMatch} test cases failed to match - consider adding more aliases`);
  }
  if (lowConfidence > 0) {
    console.log(`   - ${lowConfidence} matches had low confidence - improve alias quality`);
  }
  if (highConfidence === testCases.length) {
    console.log(`   - Perfect! All test cases matched with high confidence`);
  }

  console.log('');
}

runTests().catch(console.error);

export { runTests, testCases };
