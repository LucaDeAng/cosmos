/**
 * RAG Custom Training Module
 *
 * Uses Strategic Assessment Profile to create tenant-specific RAG training data.
 * This significantly improves Product/Service classification accuracy by:
 * - Adding company-specific product/service examples to RAG catalog
 * - Including industry terminology and context
 * - Mapping company naming patterns
 * - Defining ambiguous case handling rules
 */

import { createClient } from '@supabase/supabase-js';
import { generateEmbedding } from './embeddingService';
import type { StrategicAssessmentProfile } from '../schemas/strategicAssessmentSchema';

export interface CustomCatalogItem {
  id: string;
  tenant_id: string;
  type: 'product' | 'service';
  name: string;
  description: string;
  category: string;
  subcategory?: string;
  keywords: string[];
  metadata: {
    source: 'strategic_assessment' | 'user_provided';
    industry: string;
    business_model: string;
    classification_reasoning: string;
    assessment_profile_version: string;
    created_at: string;
  };
}

export interface RAGTrainingStats {
  tenant_id: string;
  products_added: number;
  services_added: number;
  total_embeddings_created: number;
  industry_context_added: boolean;
  ambiguous_cases_documented: number;
  training_completed_at: string;
}

/**
 * Bootstrap tenant-specific RAG catalog from strategic assessment profile
 */
export async function bootstrapTenantRAG(
  tenantId: string,
  profile: StrategicAssessmentProfile
): Promise<RAGTrainingStats> {
  console.log(`\n🎯 Bootstrapping custom RAG for tenant: ${tenantId}`);
  console.log(`   Industry: ${profile.company_identity.industry}`);
  console.log(`   Business Model: ${profile.company_identity.business_model}\n`);

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase credentials for RAG training');
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  const stats: RAGTrainingStats = {
    tenant_id: tenantId,
    products_added: 0,
    services_added: 0,
    total_embeddings_created: 0,
    industry_context_added: false,
    ambiguous_cases_documented: 0,
    training_completed_at: new Date().toISOString(),
  };

  const catalogItems: CustomCatalogItem[] = [];

  // ============================================================
  // 1. CREATE PRODUCT EXAMPLES FROM ASSESSMENT
  // ============================================================

  if (profile.portfolio_composition.product_portfolio?.top_products) {
    console.log(`📦 Adding ${profile.portfolio_composition.product_portfolio.top_products.length} product examples...\n`);

    for (const product of profile.portfolio_composition.product_portfolio.top_products) {
      const item: CustomCatalogItem = {
        id: `tenant-${tenantId}-product-${product.name.toLowerCase().replace(/\s+/g, '-')}`,
        tenant_id: tenantId,
        type: 'product',
        name: product.name,
        description: product.description,
        category: product.category,
        keywords: product.keywords || extractKeywords(product.name, product.description),
        metadata: {
          source: 'strategic_assessment',
          industry: profile.company_identity.industry,
          business_model: profile.company_identity.business_model,
          classification_reasoning: `Product example from strategic assessment. ${product.category} in ${profile.company_identity.industry} industry.`,
          assessment_profile_version: profile.assessment_version || '2.0',
          created_at: new Date().toISOString(),
        },
      };

      catalogItems.push(item);
      stats.products_added++;

      console.log(`   ✅ Added product: "${product.name}" (${product.category})`);
    }
  }

  // ============================================================
  // 2. CREATE SERVICE EXAMPLES FROM ASSESSMENT
  // ============================================================

  if (profile.portfolio_composition.service_portfolio?.top_services) {
    console.log(`\n🔧 Adding ${profile.portfolio_composition.service_portfolio.top_services.length} service examples...\n`);

    for (const service of profile.portfolio_composition.service_portfolio.top_services) {
      const item: CustomCatalogItem = {
        id: `tenant-${tenantId}-service-${service.name.toLowerCase().replace(/\s+/g, '-')}`,
        tenant_id: tenantId,
        type: 'service',
        name: service.name,
        description: service.description,
        category: service.service_type,
        subcategory: service.delivery_model,
        keywords: service.keywords || extractKeywords(service.name, service.description),
        metadata: {
          source: 'strategic_assessment',
          industry: profile.company_identity.industry,
          business_model: profile.company_identity.business_model,
          classification_reasoning: `Service example from strategic assessment. ${service.service_type} with ${service.delivery_model} delivery in ${profile.company_identity.industry} industry.`,
          assessment_profile_version: profile.assessment_version || '2.0',
          created_at: new Date().toISOString(),
        },
      };

      catalogItems.push(item);
      stats.services_added++;

      console.log(`   ✅ Added service: "${service.name}" (${service.service_type})`);
    }
  }

  // ============================================================
  // 3. ADD INDUSTRY CONTEXT DOCUMENT
  // ============================================================

  const industryContextItem: CustomCatalogItem = {
    id: `tenant-${tenantId}-industry-context`,
    tenant_id: tenantId,
    type: 'product', // Type doesn't matter for context documents
    name: `${profile.company_identity.industry} Industry Context`,
    description: profile.rag_training_config.industry_context,
    category: 'Industry Context',
    keywords: [
      profile.company_identity.industry,
      ...(profile.company_identity.industry_terminology || []),
      ...(profile.rag_training_config.product_indicators || []),
      ...(profile.rag_training_config.service_indicators || []),
    ],
    metadata: {
      source: 'strategic_assessment',
      industry: profile.company_identity.industry,
      business_model: profile.company_identity.business_model,
      classification_reasoning: 'Industry context for RAG semantic search',
      assessment_profile_version: profile.assessment_version || '2.0',
      created_at: new Date().toISOString(),
    },
  };

  catalogItems.push(industryContextItem);
  stats.industry_context_added = true;

  console.log(`\n📚 Added industry context document`);

  // ============================================================
  // 4. DOCUMENT AMBIGUOUS CASES
  // ============================================================

  if (profile.rag_training_config.ambiguous_cases) {
    console.log(`\n⚠️  Documenting ${profile.rag_training_config.ambiguous_cases.length} ambiguous cases...\n`);

    for (const ambiguousCase of profile.rag_training_config.ambiguous_cases) {
      const item: CustomCatalogItem = {
        id: `tenant-${tenantId}-ambiguous-${ambiguousCase.term.toLowerCase().replace(/\s+/g, '-')}`,
        tenant_id: tenantId,
        type: 'product', // Default, interpretation will be in metadata
        name: `${ambiguousCase.term} (Ambiguous Case)`,
        description: ambiguousCase.interpretation,
        category: 'Ambiguous Term',
        keywords: [ambiguousCase.term, profile.company_identity.industry],
        metadata: {
          source: 'strategic_assessment',
          industry: profile.company_identity.industry,
          business_model: profile.company_identity.business_model,
          classification_reasoning: `Ambiguous term handling: ${ambiguousCase.interpretation}`,
          assessment_profile_version: profile.assessment_version || '2.0',
          created_at: new Date().toISOString(),
        },
      };

      catalogItems.push(item);
      stats.ambiguous_cases_documented++;

      console.log(`   📝 Documented: "${ambiguousCase.term}" → ${ambiguousCase.interpretation}`);
    }
  }

  // ============================================================
  // 5. GENERATE EMBEDDINGS AND STORE IN DATABASE
  // ============================================================

  console.log(`\n🔢 Generating embeddings for ${catalogItems.length} items...\n`);

  for (const item of catalogItems) {
    try {
      // Create searchable text for embedding
      const searchText = `${item.name} ${item.description} ${item.category} ${item.keywords.join(' ')}`;

      // Generate embedding
      const embedding = await generateEmbedding(searchText);

      // Store in rag_documents table
      const { error: insertError } = await supabase.from('rag_documents').insert({
        system_id: tenantId, // Use tenantId as system_id for tenant-specific RAG
        content: searchText,
        metadata: {
          title: item.name,
          type: item.type,
          category: item.category,
          subcategory: item.subcategory,
          description: item.description,
          keywords: item.keywords,
          tenant_specific: true,
          ...item.metadata,
        },
        embedding: embedding,
        source: 'strategic_assessment',
        source_id: item.id,
      });

      if (insertError) {
        console.error(`   ❌ Error storing ${item.name}:`, insertError.message);
      } else {
        stats.total_embeddings_created++;
        console.log(`   ✅ Embedded: "${item.name}"`);
      }
    } catch (error) {
      console.error(`   ❌ Error processing ${item.name}:`, error);
    }
  }

  // ============================================================
  // 6. STORE RAG TRAINING METADATA
  // ============================================================

  const { error: metaError } = await supabase.from('tenant_rag_metadata').upsert({
    tenant_id: tenantId,
    industry: profile.company_identity.industry,
    business_model: profile.company_identity.business_model,
    training_stats: stats,
    profile_version: profile.assessment_version || '2.0',
    trained_at: stats.training_completed_at,
    rag_config: profile.rag_training_config,
  });

  if (metaError) {
    console.warn('Warning: Could not store RAG metadata (table may not exist yet)');
  }

  // ============================================================
  // SUMMARY
  // ============================================================

  console.log('\n╔═══════════════════════════════════════════════════════════════╗');
  console.log('║                 RAG TRAINING COMPLETE                         ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');
  console.log(`   Products Added: ${stats.products_added}`);
  console.log(`   Services Added: ${stats.services_added}`);
  console.log(`   Embeddings Created: ${stats.total_embeddings_created}`);
  console.log(`   Industry Context: ${stats.industry_context_added ? 'Added' : 'Not added'}`);
  console.log(`   Ambiguous Cases: ${stats.ambiguous_cases_documented}`);
  console.log('');
  console.log(`   ✅ RAG is now trained for ${profile.company_identity.industry}!`);
  console.log(`   ✅ Classification accuracy should improve significantly.\n`);

  return stats;
}

/**
 * Update tenant RAG with additional product/service
 */
export async function addToTenantRAG(
  tenantId: string,
  item: {
    type: 'product' | 'service';
    name: string;
    description: string;
    category: string;
    keywords?: string[];
  }
): Promise<boolean> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase credentials');
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  const searchText = `${item.name} ${item.description} ${item.category} ${item.keywords?.join(' ') || ''}`;
  const embedding = await generateEmbedding(searchText);

  const { error } = await supabase.from('rag_documents').insert({
    system_id: tenantId,
    content: searchText,
    metadata: {
      title: item.name,
      type: item.type,
      category: item.category,
      description: item.description,
      keywords: item.keywords || [],
      tenant_specific: true,
      source: 'user_provided',
      created_at: new Date().toISOString(),
    },
    embedding: embedding,
    source: 'user_provided',
    source_id: `tenant-${tenantId}-${item.type}-${item.name.toLowerCase().replace(/\s+/g, '-')}`,
  });

  return !error;
}

/**
 * Get classification context for a tenant
 */
export async function getTenantClassificationContext(
  tenantId: string
): Promise<{
  industry: string;
  product_indicators: string[];
  service_indicators: string[];
  ambiguous_cases: Array<{ term: string; interpretation: string }>;
} | null> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return null;
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  const { data, error } = await supabase
    .from('tenant_rag_metadata')
    .select('industry, rag_config')
    .eq('tenant_id', tenantId)
    .single();

  if (error || !data) {
    return null;
  }

  return {
    industry: data.industry,
    product_indicators: data.rag_config?.product_indicators || [],
    service_indicators: data.rag_config?.service_indicators || [],
    ambiguous_cases: data.rag_config?.ambiguous_cases || [],
  };
}

/**
 * Helper: Extract keywords from text
 */
function extractKeywords(name: string, description: string): string[] {
  const text = `${name} ${description}`.toLowerCase();
  const words = text.split(/\W+/).filter(w => w.length > 3);

  // Remove common stop words
  const stopWords = new Set(['the', 'and', 'for', 'with', 'that', 'this', 'from', 'are', 'was', 'were', 'been', 'have', 'has', 'had', 'will', 'would', 'could', 'should']);

  const keywords = [...new Set(words.filter(w => !stopWords.has(w)))];

  return keywords.slice(0, 10); // Top 10 keywords
}

/**
 * Clear tenant RAG data (for re-training)
 */
export async function clearTenantRAG(tenantId: string): Promise<boolean> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase credentials');
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // Delete all RAG documents for this tenant
  const { error } = await supabase
    .from('rag_documents')
    .delete()
    .eq('system_id', tenantId)
    .eq('source', 'strategic_assessment');

  return !error;
}

export default {
  bootstrapTenantRAG,
  addToTenantRAG,
  getTenantClassificationContext,
  clearTenantRAG,
};
