/**
 * Data Migration Utility for Product/Service Schema Enhancement
 *
 * Transforms existing products and services to new 3-section schema format.
 * Uses RAG classification to ensure correct product/service type.
 * Calculates completeness scores and identifies missing fields.
 */

import { createClient } from '@supabase/supabase-js';
import { semanticSearch } from '../agents/utils/embeddingService';
import {
  identifyMissingFields as identifyProductMissing,
  calculateCompletenessScore as calculateProductCompleteness,
  CompleteProduct
} from '../agents/schemas/productSchema';
import {
  identifyMissingFields as identifyServiceMissing,
  calculateCompletenessScore as calculateServiceCompleteness,
  CompleteService
} from '../agents/schemas/serviceSchema';

const SYSTEM_ID = '00000000-0000-0000-0000-000000000000';

interface MigrationStats {
  productsProcessed: number;
  servicesProcessed: number;
  productsMigrated: number;
  servicesMigrated: number;
  errors: Array<{ id: string; error: string }>;
  typeChanges: Array<{ id: string; oldType: string; newType: string }>;
}

/**
 * Main migration function
 */
export async function migrateProductServiceData(options: {
  dryRun?: boolean;
  batchSize?: number;
  tenantId?: string;
}): Promise<MigrationStats> {
  const { dryRun = false, batchSize = 50, tenantId } = options;

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase credentials');
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  const stats: MigrationStats = {
    productsProcessed: 0,
    servicesProcessed: 0,
    productsMigrated: 0,
    servicesMigrated: 0,
    errors: [],
    typeChanges: [],
  };

  console.log('🚀 Starting Product/Service Data Migration...');
  console.log(`   Mode: ${dryRun ? 'DRY RUN (no changes will be saved)' : 'LIVE'}`);
  console.log(`   Batch Size: ${batchSize}`);
  if (tenantId) console.log(`   Tenant Filter: ${tenantId}`);
  console.log('');

  // ========================================
  // MIGRATE PRODUCTS
  // ========================================
  console.log('📦 Migrating Products...\n');

  const productsQuery = supabase.from('products').select('*');
  if (tenantId) productsQuery.eq('tenant_id', tenantId);

  const { data: products, error: productsError } = await productsQuery;

  if (productsError) {
    console.error('Error fetching products:', productsError);
    throw productsError;
  }

  if (products && products.length > 0) {
    for (let i = 0; i < products.length; i += batchSize) {
      const batch = products.slice(i, i + batchSize);

      for (const product of batch) {
        try {
          stats.productsProcessed++;

          // Verify this is actually a product using RAG
          const classification = await classifyItem(product.name, product.description || '');

          if (classification.type !== 'product') {
            stats.typeChanges.push({
              id: product.id,
              oldType: 'product',
              newType: classification.type,
            });
            console.log(`   ⚠️  Item "${product.name}" should be a ${classification.type}, not product (confidence: ${Math.round(classification.confidence * 100)}%)`);
          }

          // Transform to new schema format
          const migrated = await migrateProductRecord(product);

          if (!dryRun) {
            // Update database
            const { error: updateError } = await supabase
              .from('products')
              .update(migrated)
              .eq('id', product.id);

            if (updateError) {
              stats.errors.push({ id: product.id, error: updateError.message });
              console.error(`   ❌ Error updating product ${product.id}:`, updateError.message);
            } else {
              stats.productsMigrated++;
              console.log(`   ✅ Migrated product: "${product.name}" (${Math.round(migrated.completeness_score * 100)}% complete)`);
            }
          } else {
            stats.productsMigrated++;
            console.log(`   [DRY RUN] Would migrate product: "${product.name}" (${Math.round(migrated.completeness_score * 100)}% complete)`);
          }
        } catch (error: any) {
          stats.errors.push({ id: product.id, error: error.message });
          console.error(`   ❌ Error processing product ${product.id}:`, error.message);
        }
      }

      console.log(`   Processed ${Math.min(i + batchSize, products.length)}/${products.length} products\n`);
    }
  } else {
    console.log('   No products found to migrate.\n');
  }

  // ========================================
  // MIGRATE SERVICES
  // ========================================
  console.log('🔧 Migrating Services...\n');

  const servicesQuery = supabase.from('services').select('*');
  if (tenantId) servicesQuery.eq('tenant_id', tenantId);

  const { data: services, error: servicesError } = await servicesQuery;

  if (servicesError) {
    console.error('Error fetching services:', servicesError);
    throw servicesError;
  }

  if (services && services.length > 0) {
    for (let i = 0; i < services.length; i += batchSize) {
      const batch = services.slice(i, i + batchSize);

      for (const service of batch) {
        try {
          stats.servicesProcessed++;

          // Verify this is actually a service using RAG
          const classification = await classifyItem(service.name, service.description || '');

          if (classification.type !== 'service') {
            stats.typeChanges.push({
              id: service.id,
              oldType: 'service',
              newType: classification.type,
            });
            console.log(`   ⚠️  Item "${service.name}" should be a ${classification.type}, not service (confidence: ${Math.round(classification.confidence * 100)}%)`);
          }

          // Transform to new schema format
          const migrated = await migrateServiceRecord(service);

          if (!dryRun) {
            // Update database
            const { error: updateError } = await supabase
              .from('services')
              .update(migrated)
              .eq('id', service.id);

            if (updateError) {
              stats.errors.push({ id: service.id, error: updateError.message });
              console.error(`   ❌ Error updating service ${service.id}:`, updateError.message);
            } else {
              stats.servicesMigrated++;
              console.log(`   ✅ Migrated service: "${service.name}" (${Math.round(migrated.completeness_score * 100)}% complete)`);
            }
          } else {
            stats.servicesMigrated++;
            console.log(`   [DRY RUN] Would migrate service: "${service.name}" (${Math.round(migrated.completeness_score * 100)}% complete)`);
          }
        } catch (error: any) {
          stats.errors.push({ id: service.id, error: error.message });
          console.error(`   ❌ Error processing service ${service.id}:`, error.message);
        }
      }

      console.log(`   Processed ${Math.min(i + batchSize, services.length)}/${services.length} services\n`);
    }
  } else {
    console.log('   No services found to migrate.\n');
  }

  // ========================================
  // SUMMARY
  // ========================================
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║                    MIGRATION SUMMARY                          ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');
  console.log(`   Products Processed: ${stats.productsProcessed}`);
  console.log(`   Products Migrated: ${stats.productsMigrated}`);
  console.log(`   Services Processed: ${stats.servicesProcessed}`);
  console.log(`   Services Migrated: ${stats.servicesMigrated}`);
  console.log(`   Type Changes Detected: ${stats.typeChanges.length}`);
  console.log(`   Errors: ${stats.errors.length}`);
  console.log('');

  if (stats.typeChanges.length > 0) {
    console.log('⚠️  Type Changes Detected:');
    stats.typeChanges.forEach(change => {
      console.log(`   - ${change.id}: ${change.oldType} → ${change.newType}`);
    });
    console.log('');
  }

  if (stats.errors.length > 0) {
    console.log('❌ Errors:');
    stats.errors.forEach(error => {
      console.log(`   - ${error.id}: ${error.error}`);
    });
    console.log('');
  }

  if (dryRun) {
    console.log('✅ DRY RUN COMPLETE - No changes were made to the database.\n');
  } else {
    console.log('✅ MIGRATION COMPLETE\n');
  }

  return stats;
}

/**
 * Classify an item using RAG
 */
async function classifyItem(name: string, description: string): Promise<{ type: 'product' | 'service'; confidence: number }> {
  const results = await semanticSearch(SYSTEM_ID, `${name} ${description}`, {
    limit: 1,
    useHybridSearch: true,
    useQueryExpansion: true,
  });

  if (results.length > 0) {
    const match = results[0];
    return {
      type: match.metadata.type as 'product' | 'service',
      confidence: match.similarity,
    };
  }

  // Default to product if no match
  return { type: 'product', confidence: 0.3 };
}

/**
 * Migrate a product record to new schema format
 */
async function migrateProductRecord(product: any): Promise<any> {
  // Build partial product data structure
  const partialProduct: Partial<CompleteProduct> = {
    identity: {
      product_id: product.id,
      nome_prodotto: product.name,
      categoria_prodotto: product.category || 'Uncategorized',
      tipo_offerta: mapProductTypeToTipoOfferta(product.lifecycle_stage),
      linea_di_business: product.linea_di_business || 'Unknown',
      owner: product.owner || 'Unknown',
      stato_lifecycle: mapStatusToLifecycle(product.status, product.lifecycle_stage),
      target: product.target_market || {
        company_size: ['enterprise'],
        industries: [],
        regions: [],
      },
      technologies: product.technologies || [],
      integrations: product.integrations || [],
      created_date: product.created_at,
      last_updated: product.updated_at,
    } as any,
  };

  // Add value proposition data if available
  if (product.description || product.business_value || product.kpis) {
    partialProduct.value_proposition = {
      segmenti_target: [],
      problema_principale: {
        pain_point: product.description || 'Unknown',
      },
      value_proposition: {
        headline: product.description || product.name,
        key_benefits: [],
        differentiators: [],
      },
      use_case_chiave: [],
    } as any;
  }

  // Add GTM data if available
  if (product.budget || product.revenue) {
    partialProduct.go_to_market = {
      canali: [],
      modello_prezzo: {
        pricing_type: 'subscription',
        currency: 'EUR',
        pricing_structure: {
          base_fee: product.budget,
        },
      },
      packaging: {
        editions: [],
        deployment_options: ['cloud'],
      },
    } as any;
  }

  // Calculate missing fields and completeness
  const missingFields = identifyProductMissing(partialProduct);
  const completenessScore = calculateProductCompleteness(partialProduct);

  return {
    schema_version: 1,
    item_type: 'product',
    completeness_score: completenessScore,
    identity_data: partialProduct.identity || {},
    value_proposition_data: partialProduct.value_proposition || {},
    go_to_market_data: partialProduct.go_to_market || {},
    missing_fields: missingFields,
    data_sources: ['migration_from_legacy_schema'],
    last_reviewed: new Date().toISOString(),
    // Keep existing fields
    tipo_offerta: partialProduct.identity?.tipo_offerta,
    linea_di_business: partialProduct.identity?.linea_di_business,
    target_market: partialProduct.identity?.target,
    technologies: partialProduct.identity?.technologies,
    integrations: partialProduct.identity?.integrations,
  };
}

/**
 * Migrate a service record to new schema format
 */
async function migrateServiceRecord(service: any): Promise<any> {
  // Build partial service data structure
  const partialService: Partial<CompleteService> = {
    identity: {
      service_id: service.id,
      nome_servizio: service.name,
      categoria_servizio: service.category || 'Uncategorized',
      tipo_servizio: 'managed_service',
      delivery_model: service.delivery_model || 'fully_managed',
      linea_di_business: service.linea_di_business || 'Unknown',
      owner: service.owner || 'Unknown',
      stato_lifecycle: mapStatusToLifecycle(service.status),
      target: service.target_market || {
        company_size: ['enterprise'],
      },
      availability: service.availability || {
        hours: '24x7',
        timezone_coverage: [],
      },
      created_date: service.created_at,
      last_updated: service.updated_at,
    } as any,
  };

  // Add delivery data if available
  if (service.description || service.business_value) {
    partialService.delivery = {
      segmenti_target: [],
      problema_principale: {
        pain_point: service.description || 'Unknown',
      },
      value_proposition: {
        headline: service.description || service.name,
        key_benefits: [],
        differentiators: [],
        business_outcomes: [],
      },
      scope: {
        included_activities: [],
        deliverables: [],
      },
      use_case_chiave: [],
    } as any;
  }

  // Add pricing/SLA data if available
  if (service.budget || service.sla_compliance || service.sla_data) {
    partialService.pricing_sla = {
      modello_prezzo: {
        pricing_type: 'fixed_fee',
        billing_frequency: 'monthly',
        currency: 'EUR',
        pricing_structure: {
          base_fee: service.budget,
        },
      },
      sla: service.sla_data || {
        response_times: {},
      },
      contract_terms: service.contract_terms || {
        minimum_term: '12 months',
      },
      support_channels: service.support_channels || [],
    } as any;
  }

  // Calculate missing fields and completeness
  const missingFields = identifyServiceMissing(partialService);
  const completenessScore = calculateServiceCompleteness(partialService);

  return {
    schema_version: 1,
    item_type: 'service',
    completeness_score: completenessScore,
    identity_data: partialService.identity || {},
    delivery_data: partialService.delivery || {},
    pricing_sla_data: partialService.pricing_sla || {},
    missing_fields: missingFields,
    data_sources: ['migration_from_legacy_schema'],
    last_reviewed: new Date().toISOString(),
    // Keep existing fields
    tipo_servizio: partialService.identity?.tipo_servizio,
    delivery_model: partialService.identity?.delivery_model,
    linea_di_business: partialService.identity?.linea_di_business,
    target_market: partialService.identity?.target,
    availability: partialService.identity?.availability,
    sla_data: partialService.pricing_sla?.sla,
    contract_terms: partialService.pricing_sla?.contract_terms,
    support_channels: partialService.pricing_sla?.support_channels,
  };
}

/**
 * Helper: Map product lifecycle to tipo_offerta
 */
function mapProductTypeToTipoOfferta(lifecycle?: string): 'saas' | 'on_premise' | 'hybrid' | 'paas' | 'managed_service' {
  // Default to SaaS for modern products
  return 'saas';
}

/**
 * Helper: Map status to lifecycle stage
 */
function mapStatusToLifecycle(status?: string, lifecycle?: string): any {
  if (lifecycle) {
    const mapping: Record<string, string> = {
      'development': 'development',
      'introduction': 'beta',
      'growth': 'ga',
      'maturity': 'mature',
      'decline': 'deprecated',
    };
    return mapping[lifecycle] || 'ga';
  }

  if (status) {
    const mapping: Record<string, string> = {
      'proposed': 'concept',
      'active': 'ga',
      'paused': 'maintenance',
      'completed': 'mature',
      'cancelled': 'eol',
    };
    return mapping[status] || 'ga';
  }

  return 'ga';
}

export default {
  migrateProductServiceData,
};
