/**
 * Catalog Bootstrap & Self-Improvement System
 *
 * Automatically seeds the RAG system with reference catalogs and implements
 * continuous improvement through feedback loops and pattern learning.
 */

import { COMPLETE_REFERENCE_CATALOG, ReferenceCatalogItem } from './referenceCatalogs';
import { storeEmbedding, semanticSearch, SourceType } from './embeddingService';
import { SYSTEM_COMPANY_ID } from './embeddingService';

export interface BootstrapOptions {
  force?: boolean;  // Re-index even if already exists
  verbose?: boolean; // Log progress
}

export interface BootstrapResult {
  success: boolean;
  indexed: number;
  skipped: number;
  errors: string[];
  duration: number;
}

/**
 * Bootstrap RAG system with reference catalogs
 */
export async function bootstrapReferenceCatalogs(
  options: BootstrapOptions = {}
): Promise<BootstrapResult> {
  const { force = false, verbose = false } = options;
  const startTime = Date.now();

  const result: BootstrapResult = {
    success: true,
    indexed: 0,
    skipped: 0,
    errors: [],
    duration: 0,
  };

  if (verbose) {
    console.log(`[CatalogBootstrap] Starting bootstrap of ${COMPLETE_REFERENCE_CATALOG.length} reference items`);
  }

  for (const item of COMPLETE_REFERENCE_CATALOG) {
    try {
      // Check if already indexed (unless force=true)
      if (!force) {
        const existing = await semanticSearch(SYSTEM_COMPANY_ID, item.name, {
          sourceTypes: [mapDomainToSourceType(item.domain)],
          limit: 1,
          similarityThreshold: 0.95, // Very high threshold to detect exact matches
        });

        if (existing.length > 0 && existing[0].similarity > 0.95) {
          result.skipped++;
          if (verbose) {
            console.log(`[CatalogBootstrap] Skipped ${item.id}: ${item.name} (already indexed)`);
          }
          continue;
        }
      }

      // Create rich content for embedding
      const content = formatItemForEmbedding(item);

      // Store embedding
      // Note: sourceId is left null for reference catalogs (they're not actual DB entities)
      await storeEmbedding(SYSTEM_COMPANY_ID, {
        content,
        sourceType: mapDomainToSourceType(item.domain),
        sourceId: undefined, // Reference items don't have real UUIDs
        metadata: {
          title: item.name,
          type: item.type,
          category: item.category,
          subcategory: item.subcategory,
          status: item.status,
          priority: item.priority,
          domain: item.domain,
          tags: item.tags,
          budget: item.budget,
          timeline: item.timeline,
          technologies: item.technologies,
          isReferenceCatalog: true,
          referenceId: item.id, // Keep original ID in metadata
        },
      });

      result.indexed++;
      if (verbose) {
        console.log(`[CatalogBootstrap] Indexed ${item.id}: ${item.name}`);
      }
    } catch (error) {
      result.success = false;
      const errorMsg = `Failed to index ${item.id}: ${error instanceof Error ? error.message : String(error)}`;
      result.errors.push(errorMsg);
      console.error(`[CatalogBootstrap] ${errorMsg}`);
    }
  }

  result.duration = Date.now() - startTime;

  if (verbose) {
    console.log(`[CatalogBootstrap] Completed in ${result.duration}ms`);
    console.log(`[CatalogBootstrap] Indexed: ${result.indexed}, Skipped: ${result.skipped}, Errors: ${result.errors.length}`);
  }

  return result;
}

/**
 * Format reference item for optimal embedding
 */
function formatItemForEmbedding(item: ReferenceCatalogItem): string {
  const parts: string[] = [];

  // Title and type
  parts.push(`${item.type.toUpperCase()}: ${item.name}`);

  // Description
  parts.push(`\nDescription: ${item.description}`);

  // Category information
  parts.push(`\nCategory: ${item.category}`);
  if (item.subcategory) {
    parts.push(`Subcategory: ${item.subcategory}`);
  }

  // Status and priority
  parts.push(`Status: ${item.status}`);
  if (item.priority) {
    parts.push(`Priority: ${item.priority}`);
  }

  // Budget and timeline
  if (item.budget) {
    parts.push(`Budget: €${item.budget.toLocaleString()}`);
  }
  if (item.timeline) {
    parts.push(`Timeline: ${item.timeline}`);
  }

  // Technologies
  if (item.technologies && item.technologies.length > 0) {
    parts.push(`\nTechnologies: ${item.technologies.join(', ')}`);
  }

  // Tags
  if (item.tags && item.tags.length > 0) {
    parts.push(`Tags: ${item.tags.join(', ')}`);
  }

  // Domain
  parts.push(`\nDomain: ${item.domain.replace(/_/g, ' ')}`);

  return parts.join('\n');
}

/**
 * Map domain to appropriate source type for RAG storage
 */
function mapDomainToSourceType(domain: ReferenceCatalogItem['domain']): SourceType {
  const mapping: Record<ReferenceCatalogItem['domain'], SourceType> = {
    it_infrastructure: 'catalog_it_services',
    digital_transformation: 'catalog_it_services',
    cloud: 'catalog_technologies',
    erp: 'catalog_it_services',
    security: 'catalog_it_services',
    data_analytics: 'catalog_technologies',
    devops: 'catalog_technologies',
  };

  return mapping[domain] || 'catalog';
}

/**
 * Test RAG system with reference catalog queries
 */
export interface TestQuery {
  query: string;
  expectedType: 'initiative' | 'product' | 'service';
  expectedCategory?: string;
  expectedDomain?: ReferenceCatalogItem['domain'];
}

export const TEST_QUERIES: TestQuery[] = [
  // Initiatives
  {
    query: 'Migrate applications to AWS cloud infrastructure',
    expectedType: 'initiative',
    expectedCategory: 'Cloud Migration',
    expectedDomain: 'cloud',
  },
  {
    query: 'SAP S/4HANA implementation project',
    expectedType: 'initiative',
    expectedCategory: 'ERP',
    expectedDomain: 'erp',
  },
  {
    query: 'Microsoft 365 deployment for 5000 users',
    expectedType: 'initiative',
    expectedCategory: 'Digital Workplace',
    expectedDomain: 'digital_transformation',
  },
  {
    query: 'Implement zero trust security architecture',
    expectedType: 'initiative',
    expectedCategory: 'Security',
    expectedDomain: 'security',
  },
  {
    query: 'Build enterprise data lake on cloud',
    expectedType: 'initiative',
    expectedCategory: 'Data Platform',
    expectedDomain: 'data_analytics',
  },

  // Products
  {
    query: 'SIEM platform for threat detection and compliance',
    expectedType: 'product',
    expectedCategory: 'Security',
    expectedDomain: 'security',
  },
  {
    query: 'Real-time analytics platform with Kafka',
    expectedType: 'product',
    expectedCategory: 'Analytics',
    expectedDomain: 'data_analytics',
  },
  {
    query: 'CI/CD platform for automated deployments',
    expectedType: 'product',
    expectedCategory: 'DevOps',
    expectedDomain: 'devops',
  },
  {
    query: 'Salesforce CRM for sales and service teams',
    expectedType: 'product',
    expectedCategory: 'CRM',
    expectedDomain: 'erp',
  },

  // Services
  {
    query: '24/7 managed infrastructure support and monitoring',
    expectedType: 'service',
    expectedCategory: 'Managed Services',
    expectedDomain: 'it_infrastructure',
  },
  {
    query: 'SOC as a service for security operations',
    expectedType: 'service',
    expectedCategory: 'Managed Services',
    expectedDomain: 'security',
  },
  {
    query: 'Cloud migration assessment and planning service',
    expectedType: 'service',
    expectedCategory: 'Consulting',
    expectedDomain: 'cloud',
  },
  {
    query: 'RPA implementation and process automation service',
    expectedType: 'service',
    expectedCategory: 'Automation',
    expectedDomain: 'digital_transformation',
  },
];

export interface TestResult {
  query: string;
  expected: TestQuery;
  actual: {
    topMatch?: {
      name: string;
      type: string;
      category: string;
      similarity: number;
    };
    correctType: boolean;
    correctCategory: boolean;
    correctDomain: boolean;
  };
  passed: boolean;
}

/**
 * Run comprehensive RAG test suite
 */
export async function testRAGWithReferenceCatalog(
  options: {
    useOptimizations?: boolean;
    verbose?: boolean;
  } = {}
): Promise<{
  results: TestResult[];
  stats: {
    total: number;
    passed: number;
    failed: number;
    typeAccuracy: number;
    categoryAccuracy: number;
    domainAccuracy: number;
  };
}> {
  const { useOptimizations = true, verbose = false } = options;
  const results: TestResult[] = [];

  for (const testQuery of TEST_QUERIES) {
    const searchResults = await semanticSearch(
      SYSTEM_COMPANY_ID,
      testQuery.query,
      {
        limit: 5,
        similarityThreshold: 0.5,
        // Use optimizations if requested
        ...(useOptimizations && {
          useHybridSearch: true,
          hybridAlpha: 0.7,
          useQueryExpansion: true,
          useAdaptiveThreshold: true,
        }),
      }
    );

    const topMatch = searchResults[0];
    const testResult: TestResult = {
      query: testQuery.query,
      expected: testQuery,
      actual: {
        topMatch: topMatch ? {
          name: topMatch.metadata.title as string || 'Unknown',
          type: topMatch.metadata.type as string || 'Unknown',
          category: topMatch.metadata.category as string || 'Unknown',
          similarity: topMatch.similarity,
        } : undefined,
        correctType: topMatch?.metadata.type === testQuery.expectedType,
        correctCategory: !testQuery.expectedCategory || topMatch?.metadata.category === testQuery.expectedCategory,
        correctDomain: !testQuery.expectedDomain || topMatch?.metadata.domain === testQuery.expectedDomain,
      },
      passed: false,
    };

    // Test passes if type matches and similarity is reasonable
    testResult.passed =
      testResult.actual.correctType &&
      testResult.actual.correctCategory &&
      (topMatch?.similarity || 0) > 0.6;

    results.push(testResult);

    if (verbose) {
      console.log(`\n[RAG Test] Query: "${testQuery.query}"`);
      console.log(`  Expected: ${testQuery.expectedType} | ${testQuery.expectedCategory}`);
      if (topMatch) {
        console.log(`  Actual: ${topMatch.metadata.type} | ${topMatch.metadata.category} (${Math.round(topMatch.similarity * 100)}%)`);
        console.log(`  Result: ${testResult.passed ? '✅ PASS' : '❌ FAIL'}`);
      } else {
        console.log(`  Actual: No matches found`);
        console.log(`  Result: ❌ FAIL`);
      }
    }
  }

  // Calculate statistics
  const passed = results.filter(r => r.passed).length;
  const typeCorrect = results.filter(r => r.actual.correctType).length;
  const categoryCorrect = results.filter(r => r.actual.correctCategory).length;
  const domainCorrect = results.filter(r => r.actual.correctDomain).length;

  const stats = {
    total: results.length,
    passed,
    failed: results.length - passed,
    typeAccuracy: (typeCorrect / results.length) * 100,
    categoryAccuracy: (categoryCorrect / results.length) * 100,
    domainAccuracy: (domainCorrect / results.length) * 100,
  };

  if (verbose) {
    console.log(`\n[RAG Test] Summary:`);
    console.log(`  Total: ${stats.total}`);
    console.log(`  Passed: ${stats.passed} (${Math.round((passed / stats.total) * 100)}%)`);
    console.log(`  Failed: ${stats.failed}`);
    console.log(`  Type Accuracy: ${stats.typeAccuracy.toFixed(1)}%`);
    console.log(`  Category Accuracy: ${stats.categoryAccuracy.toFixed(1)}%`);
    console.log(`  Domain Accuracy: ${stats.domainAccuracy.toFixed(1)}%`);
  }

  return { results, stats };
}

export default {
  bootstrapReferenceCatalogs,
  testRAGWithReferenceCatalog,
  TEST_QUERIES,
};
