/**
 * Schema Inference Engine
 *
 * Intelligently pre-fills product/service schema fields based on:
 * - Strategic Assessment Profile (industry, business model, examples)
 * - Company-specific patterns learned from TOP products/services
 * - Industry defaults and best practices
 *
 * Goal: Reduce manual data entry by 40-50%
 */

import type { StrategicAssessmentProfile } from '../schemas/strategicAssessmentSchema';

export interface PartialProduct {
  name: string;
  description?: string;
  category?: string;
  [key: string]: any;
}

export interface PartialService {
  name: string;
  description?: string;
  service_type?: string;
  [key: string]: any;
}

export interface InferredProductSchema {
  // Sezione 1: Identificazione e Strategia
  tipo_offerta?: string;
  target_segment?: string;
  lifecycle_stage?: string;
  strategic_importance?: string;

  // Sezione 2: Commerciale e GTM
  pricing_model?: string;
  sales_cycle_length?: string;
  distribution_channel?: string[];

  // Sezione 3: Operations e Delivery
  delivery_model?: string;
  avg_project_duration?: string;
  resource_intensity?: string;

  // Metadata
  inferred_fields: string[];
  confidence_score: number;
  inference_reasoning: string[];
}

export interface InferredServiceSchema {
  // Sezione 1: Identificazione e Strategia
  tipo_servizio?: string;
  delivery_model?: string;
  target_segment?: string;
  strategic_importance?: string;

  // Sezione 2: Commerciale e GTM
  pricing_model?: string;
  sales_cycle_length?: string;
  engagement_model?: string;

  // Sezione 3: Operations e Delivery
  resource_requirements?: string;
  avg_duration?: string;
  recurring?: boolean;

  // Metadata
  inferred_fields: string[];
  confidence_score: number;
  inference_reasoning: string[];
}

/**
 * Infer product schema fields from strategic profile
 */
export function inferProductSchema(
  profile: StrategicAssessmentProfile,
  partialProduct: PartialProduct
): InferredProductSchema {
  const inferred: InferredProductSchema = {
    inferred_fields: [],
    confidence_score: 0,
    inference_reasoning: [],
  };

  const hints = profile.schema_inference_hints;
  const identity = profile.company_identity;
  const topProducts = profile.portfolio_composition.product_portfolio?.top_products || [];

  // ============================================================
  // INFERENCE RULE 1: Business Model → Default Fields
  // ============================================================

  if (identity.business_model === 'b2b_enterprise') {
    inferred.target_segment = 'enterprise';
    inferred.sales_cycle_length = 'long';
    inferred.inferred_fields.push('target_segment', 'sales_cycle_length');
    inferred.inference_reasoning.push('B2B Enterprise model → Enterprise segment, long sales cycle');
  } else if (identity.business_model === 'b2b_smb') {
    inferred.target_segment = 'smb';
    inferred.sales_cycle_length = 'medium';
    inferred.inferred_fields.push('target_segment', 'sales_cycle_length');
    inferred.inference_reasoning.push('B2B SMB model → SMB segment, medium sales cycle');
  } else if (identity.business_model === 'b2c') {
    inferred.target_segment = 'mass_market';
    inferred.sales_cycle_length = 'short';
    inferred.inferred_fields.push('target_segment', 'sales_cycle_length');
    inferred.inference_reasoning.push('B2C model → Mass market segment, short sales cycle');
  } else if (identity.business_model === 'freemium_saas') {
    inferred.tipo_offerta = 'saas';
    inferred.pricing_model = 'freemium';
    inferred.delivery_model = 'cloud';
    inferred.inferred_fields.push('tipo_offerta', 'pricing_model', 'delivery_model');
    inferred.inference_reasoning.push('Freemium SaaS model → SaaS offering, freemium pricing, cloud delivery');
  }

  // ============================================================
  // INFERENCE RULE 2: Operational Scale → Resource Intensity
  // ============================================================

  if (identity.operational_scale === 'startup' || identity.operational_scale === 'scaleup') {
    inferred.resource_intensity = 'low';
    inferred.inferred_fields.push('resource_intensity');
    inferred.inference_reasoning.push('Startup/Scaleup scale → Low resource intensity (lean operations)');
  } else if (identity.operational_scale === 'enterprise' || identity.operational_scale === 'conglomerate') {
    inferred.resource_intensity = 'medium';
    inferred.inferred_fields.push('resource_intensity');
    inferred.inference_reasoning.push('Enterprise scale → Medium resource intensity');
  }

  // ============================================================
  // INFERENCE RULE 3: TOP Products Pattern Matching
  // ============================================================

  // Check if all TOP products share common characteristics
  if (topProducts.length >= 2) {
    // Pattern 1: All SaaS?
    const allSaaS = topProducts.every(p =>
      p.inferred_tipo_offerta === 'saas' ||
      p.pricing_model === 'subscription' ||
      p.description?.toLowerCase().includes('saas') ||
      p.description?.toLowerCase().includes('cloud')
    );

    if (allSaaS) {
      inferred.tipo_offerta = 'saas';
      inferred.delivery_model = 'cloud';
      inferred.pricing_model = inferred.pricing_model || 'subscription';
      inferred.inferred_fields.push('tipo_offerta', 'delivery_model');
      if (!inferred.pricing_model) inferred.inferred_fields.push('pricing_model');
      inferred.inference_reasoning.push('All TOP products are SaaS → Inferring SaaS/cloud/subscription model');
    }

    // Pattern 2: Common pricing model?
    const pricingModels = topProducts
      .map(p => p.pricing_model)
      .filter(p => p);
    const mostCommonPricing = getMostCommon(pricingModels);
    if (mostCommonPricing && pricingModels.filter(p => p === mostCommonPricing).length >= 2) {
      if (!inferred.pricing_model) {
        inferred.pricing_model = mostCommonPricing;
        inferred.inferred_fields.push('pricing_model');
        inferred.inference_reasoning.push(`Most TOP products use ${mostCommonPricing} pricing`);
      }
    }

    // Pattern 3: Common target customer?
    const targetCustomers = topProducts
      .map(p => p.target_customer)
      .filter(t => t);
    const mostCommonTarget = getMostCommon(targetCustomers);
    if (mostCommonTarget && targetCustomers.filter(t => t === mostCommonTarget).length >= 2) {
      if (!inferred.target_segment) {
        inferred.target_segment = mostCommonTarget;
        inferred.inferred_fields.push('target_segment');
        inferred.inference_reasoning.push(`Most TOP products target ${mostCommonTarget} customers`);
      }
    }
  }

  // ============================================================
  // INFERENCE RULE 4: Industry-Specific Defaults
  // ============================================================

  const industry = identity.industry.toLowerCase();

  // Use schema inference hints from strategic profile
  if (hints.typical_pricing_model && !inferred.pricing_model) {
    inferred.pricing_model = hints.typical_pricing_model;
    inferred.inferred_fields.push('pricing_model');
    inferred.inference_reasoning.push(`Industry default → pricing_model: ${hints.typical_pricing_model}`);
  }

  if (hints.typical_product_lifecycle && !inferred.lifecycle_stage) {
    inferred.lifecycle_stage = hints.typical_product_lifecycle;
    inferred.inferred_fields.push('lifecycle_stage');
    inferred.inference_reasoning.push(`Industry default → lifecycle_stage: ${hints.typical_product_lifecycle}`);
  }

  // Hardcoded industry rules as fallback
  if (industry.includes('software') || industry.includes('saas') || industry.includes('technology')) {
    if (!inferred.tipo_offerta) {
      inferred.tipo_offerta = 'saas';
      inferred.delivery_model = 'cloud';
      inferred.inferred_fields.push('tipo_offerta', 'delivery_model');
      inferred.inference_reasoning.push('Software/SaaS/Technology industry → SaaS cloud delivery');
    }
  }

  if (industry.includes('financial') || industry.includes('banking')) {
    if (!inferred.strategic_importance) {
      inferred.strategic_importance = 'core';
      inferred.inferred_fields.push('strategic_importance');
      inferred.inference_reasoning.push('Financial/Banking industry → Core strategic importance (regulated)');
    }
  }

  if (industry.includes('consulting') || industry.includes('professional services')) {
    if (!inferred.delivery_model) {
      inferred.delivery_model = 'hybrid';
      inferred.inferred_fields.push('delivery_model');
      inferred.inference_reasoning.push('Consulting industry → Hybrid delivery model');
    }
  }

  // ============================================================
  // INFERENCE RULE 5: Name/Description Keyword Analysis
  // ============================================================

  const text = `${partialProduct.name} ${partialProduct.description || ''}`.toLowerCase();

  // SaaS indicators
  if ((text.includes('cloud') || text.includes('online') || text.includes('web-based')) && !inferred.tipo_offerta) {
    inferred.tipo_offerta = 'saas';
    inferred.delivery_model = 'cloud';
    inferred.inferred_fields.push('tipo_offerta', 'delivery_model');
    inferred.inference_reasoning.push('Product name/description contains cloud/online indicators → SaaS');
  }

  // On-premise indicators
  if ((text.includes('on-premise') || text.includes('on-prem') || text.includes('installed')) && !inferred.tipo_offerta) {
    inferred.tipo_offerta = 'on_premise';
    inferred.delivery_model = 'on_premise';
    inferred.inferred_fields.push('tipo_offerta', 'delivery_model');
    inferred.inference_reasoning.push('Product name/description contains on-premise indicators');
  }

  // Enterprise indicators
  if ((text.includes('enterprise') || text.includes('corporation')) && !inferred.target_segment) {
    inferred.target_segment = 'enterprise';
    inferred.inferred_fields.push('target_segment');
    inferred.inference_reasoning.push('Product name/description contains enterprise indicators');
  }

  // ============================================================
  // INFERENCE RULE 6: Geographic Scope → Distribution Channel
  // ============================================================

  if (identity.geographic_scope === '6_15_countries' || identity.geographic_scope === 'global') {
    inferred.distribution_channel = ['direct_sales', 'partners', 'online'];
    inferred.inferred_fields.push('distribution_channel');
    inferred.inference_reasoning.push('Multi-country/global scope → Multi-channel distribution');
  } else if (identity.geographic_scope === 'single_country') {
    inferred.distribution_channel = ['direct_sales'];
    inferred.inferred_fields.push('distribution_channel');
    inferred.inference_reasoning.push('Single country scope → Direct sales channel');
  } else if (identity.geographic_scope === '2_5_countries') {
    inferred.distribution_channel = ['direct_sales', 'partners'];
    inferred.inferred_fields.push('distribution_channel');
    inferred.inference_reasoning.push('2-5 countries scope → Direct sales + partners');
  }

  // ============================================================
  // INFERENCE RULE 7: Strategic Goals → Lifecycle Stage
  // ============================================================

  const goals = profile.strategic_context.goals_2025_2027;
  const hasGrowthGoal = goals.some(g =>
    g.goal.toLowerCase().includes('growth') ||
    g.goal.toLowerCase().includes('expand') ||
    g.goal.toLowerCase().includes('scale')
  );

  if (hasGrowthGoal && !inferred.lifecycle_stage) {
    inferred.lifecycle_stage = 'growth';
    inferred.inferred_fields.push('lifecycle_stage');
    inferred.inference_reasoning.push('Company has growth/expansion goals → Growth lifecycle stage');
  }

  // ============================================================
  // Calculate Confidence Score
  // ============================================================

  inferred.confidence_score = calculateConfidence(inferred.inferred_fields.length);

  return inferred;
}

/**
 * Infer service schema fields from strategic profile
 */
export function inferServiceSchema(
  profile: StrategicAssessmentProfile,
  partialService: PartialService
): InferredServiceSchema {
  const inferred: InferredServiceSchema = {
    inferred_fields: [],
    confidence_score: 0,
    inference_reasoning: [],
  };

  const hints = profile.schema_inference_hints;
  const identity = profile.company_identity;
  const topServices = profile.portfolio_composition.service_portfolio?.top_services || [];

  // ============================================================
  // INFERENCE RULE 1: Business Model → Default Fields
  // ============================================================

  if (identity.business_model === 'b2b_enterprise') {
    inferred.target_segment = 'enterprise';
    inferred.sales_cycle_length = 'long';
    inferred.inferred_fields.push('target_segment', 'sales_cycle_length');
    inferred.inference_reasoning.push('B2B Enterprise model → Enterprise segment, long sales cycle');
  } else if (identity.business_model === 'b2b_smb') {
    inferred.target_segment = 'smb';
    inferred.sales_cycle_length = 'medium';
    inferred.inferred_fields.push('target_segment', 'sales_cycle_length');
    inferred.inference_reasoning.push('B2B SMB model → SMB segment, medium sales cycle');
  }

  // ============================================================
  // INFERENCE RULE 2: TOP Services Pattern Matching
  // ============================================================

  if (topServices.length >= 2) {
    // Pattern 1: Common service type?
    const serviceTypes = topServices
      .map(s => s.service_type)
      .filter(t => t);
    const mostCommonType = getMostCommon(serviceTypes);
    if (mostCommonType && serviceTypes.filter(t => t === mostCommonType).length >= 2) {
      if (!inferred.tipo_servizio) {
        inferred.tipo_servizio = mostCommonType;
        inferred.inferred_fields.push('tipo_servizio');
        inferred.inference_reasoning.push(`Most TOP services are ${mostCommonType} type`);
      }
    }

    // Pattern 2: Common delivery model?
    const deliveryModels = topServices
      .map(s => s.delivery_model)
      .filter(d => d);
    const mostCommonDelivery = getMostCommon(deliveryModels);
    if (mostCommonDelivery && deliveryModels.filter(d => d === mostCommonDelivery).length >= 2) {
      if (!inferred.delivery_model) {
        inferred.delivery_model = mostCommonDelivery;
        inferred.inferred_fields.push('delivery_model');
        inferred.inference_reasoning.push(`Most TOP services use ${mostCommonDelivery} delivery`);
      }
    }

    // Pattern 3: Recurring pattern?
    const recurringCount = topServices.filter(s =>
      s.service_type?.includes('managed') ||
      s.service_type?.includes('subscription') ||
      s.delivery_model?.includes('ongoing')
    ).length;

    if (recurringCount >= 2) {
      inferred.recurring = true;
      inferred.inferred_fields.push('recurring');
      inferred.inference_reasoning.push('Most TOP services are recurring/managed → Recurring service model');
    }
  }

  // ============================================================
  // INFERENCE RULE 3: Industry-Specific Defaults
  // ============================================================

  const industry = identity.industry.toLowerCase();

  // Use schema inference hints from strategic profile
  if (hints.typical_delivery_model && !inferred.delivery_model) {
    inferred.delivery_model = hints.typical_delivery_model;
    inferred.inferred_fields.push('delivery_model');
    inferred.inference_reasoning.push(`Industry default → delivery_model: ${hints.typical_delivery_model}`);
  }

  if (hints.typical_service_type && !inferred.tipo_servizio) {
    inferred.tipo_servizio = hints.typical_service_type;
    inferred.inferred_fields.push('tipo_servizio');
    inferred.inference_reasoning.push(`Industry default → tipo_servizio: ${hints.typical_service_type}`);
  }

  if (industry.includes('consulting') || industry.includes('professional services')) {
    if (!inferred.tipo_servizio) {
      inferred.tipo_servizio = 'consulting';
      inferred.inferred_fields.push('tipo_servizio');
      inferred.inference_reasoning.push('Consulting/Professional Services industry → Consulting service type');
    }
    if (!inferred.engagement_model) {
      inferred.engagement_model = 'project_based';
      inferred.inferred_fields.push('engagement_model');
      inferred.inference_reasoning.push('Consulting industry → Project-based engagement');
    }
  }

  if (industry.includes('managed services') || industry.includes('msp')) {
    if (!inferred.tipo_servizio) {
      inferred.tipo_servizio = 'managed_service';
      inferred.recurring = true;
      inferred.inferred_fields.push('tipo_servizio', 'recurring');
      inferred.inference_reasoning.push('Managed Services industry → Managed service type, recurring');
    }
  }

  if (industry.includes('implementation') || industry.includes('integration')) {
    if (!inferred.tipo_servizio) {
      inferred.tipo_servizio = 'implementation';
      inferred.inferred_fields.push('tipo_servizio');
      inferred.inference_reasoning.push('Implementation/Integration industry → Implementation service type');
    }
    if (!inferred.avg_duration) {
      inferred.avg_duration = 'medium';
      inferred.inferred_fields.push('avg_duration');
      inferred.inference_reasoning.push('Implementation services → Medium average duration (3-6 months)');
    }
  }

  // ============================================================
  // INFERENCE RULE 4: Name/Description Keyword Analysis
  // ============================================================

  const text = `${partialService.name} ${partialService.description || ''}`.toLowerCase();

  // Consulting indicators
  if ((text.includes('consulting') || text.includes('advisory')) && !inferred.tipo_servizio) {
    inferred.tipo_servizio = 'consulting';
    inferred.engagement_model = 'project_based';
    inferred.inferred_fields.push('tipo_servizio', 'engagement_model');
    inferred.inference_reasoning.push('Service name contains consulting/advisory → Consulting service');
  }

  // Managed service indicators
  if ((text.includes('managed') || text.includes('outsourcing')) && !inferred.tipo_servizio) {
    inferred.tipo_servizio = 'managed_service';
    inferred.recurring = true;
    inferred.inferred_fields.push('tipo_servizio', 'recurring');
    inferred.inference_reasoning.push('Service name contains managed/outsourcing → Managed service, recurring');
  }

  // Training indicators
  if ((text.includes('training') || text.includes('education')) && !inferred.tipo_servizio) {
    inferred.tipo_servizio = 'training';
    inferred.delivery_model = 'onsite';
    inferred.inferred_fields.push('tipo_servizio', 'delivery_model');
    inferred.inference_reasoning.push('Service name contains training/education → Training service');
  }

  // Support indicators
  if ((text.includes('support') || text.includes('maintenance')) && !inferred.tipo_servizio) {
    inferred.tipo_servizio = 'support';
    inferred.recurring = true;
    inferred.inferred_fields.push('tipo_servizio', 'recurring');
    inferred.inference_reasoning.push('Service name contains support/maintenance → Support service, recurring');
  }

  // ============================================================
  // INFERENCE RULE 5: Operational Scale → Resource Requirements
  // ============================================================

  if (identity.operational_scale === 'startup' || identity.operational_scale === 'scaleup') {
    inferred.resource_requirements = 'low';
    inferred.inferred_fields.push('resource_requirements');
    inferred.inference_reasoning.push('Startup/Scaleup scale → Low resource requirements (lean delivery)');
  } else if (identity.operational_scale === 'enterprise' || identity.operational_scale === 'conglomerate') {
    inferred.resource_requirements = 'high';
    inferred.inferred_fields.push('resource_requirements');
    inferred.inference_reasoning.push('Enterprise scale → High resource requirements');
  }

  // ============================================================
  // INFERENCE RULE 6: Pricing Model Inference
  // ============================================================

  if (inferred.recurring && !inferred.pricing_model) {
    inferred.pricing_model = 'subscription';
    inferred.inferred_fields.push('pricing_model');
    inferred.inference_reasoning.push('Recurring service → Subscription pricing model');
  } else if (inferred.engagement_model === 'project_based' && !inferred.pricing_model) {
    inferred.pricing_model = 'fixed_price';
    inferred.inferred_fields.push('pricing_model');
    inferred.inference_reasoning.push('Project-based engagement → Fixed price model');
  }

  // ============================================================
  // Calculate Confidence Score
  // ============================================================

  inferred.confidence_score = calculateConfidence(inferred.inferred_fields.length);

  return inferred;
}

/**
 * Apply inferred schema to partial product (merge)
 */
export function applyProductInference(
  partialProduct: PartialProduct,
  inferred: InferredProductSchema
): any {
  const enriched = { ...partialProduct };

  // Only apply inferred values for fields that don't exist in partial
  for (const field of inferred.inferred_fields) {
    if (!(field in enriched) || enriched[field] === null || enriched[field] === undefined) {
      enriched[field] = (inferred as any)[field];
    }
  }

  // Add metadata about inference
  enriched._inference_metadata = {
    inferred_fields: inferred.inferred_fields,
    confidence_score: inferred.confidence_score,
    reasoning: inferred.inference_reasoning,
  };

  return enriched;
}

/**
 * Apply inferred schema to partial service (merge)
 */
export function applyServiceInference(
  partialService: PartialService,
  inferred: InferredServiceSchema
): any {
  const enriched = { ...partialService };

  // Only apply inferred values for fields that don't exist in partial
  for (const field of inferred.inferred_fields) {
    if (!(field in enriched) || enriched[field] === null || enriched[field] === undefined) {
      enriched[field] = (inferred as any)[field];
    }
  }

  // Add metadata about inference
  enriched._inference_metadata = {
    inferred_fields: inferred.inferred_fields,
    confidence_score: inferred.confidence_score,
    reasoning: inferred.inference_reasoning,
  };

  return enriched;
}

/**
 * Batch inference for multiple products
 */
export function inferProductSchemaBatch(
  profile: StrategicAssessmentProfile,
  products: PartialProduct[]
): Array<{ product: any; inference: InferredProductSchema }> {
  return products.map(product => ({
    product: applyProductInference(product, inferProductSchema(profile, product)),
    inference: inferProductSchema(profile, product),
  }));
}

/**
 * Batch inference for multiple services
 */
export function inferServiceSchemaBatch(
  profile: StrategicAssessmentProfile,
  services: PartialService[]
): Array<{ service: any; inference: InferredServiceSchema }> {
  return services.map(service => ({
    service: applyServiceInference(service, inferServiceSchema(profile, service)),
    inference: inferServiceSchema(profile, service),
  }));
}

// ============================================================
// HELPER FUNCTIONS
// ============================================================

function getMostCommon<T>(arr: T[]): T | null {
  if (arr.length === 0) return null;

  const counts: Record<string, number> = {};
  for (const item of arr) {
    const key = String(item);
    counts[key] = (counts[key] || 0) + 1;
  }

  let maxCount = 0;
  let mostCommon: string | null = null;
  for (const [key, count] of Object.entries(counts)) {
    if (count > maxCount) {
      maxCount = count;
      mostCommon = key;
    }
  }

  return mostCommon as any;
}

function calculateConfidence(inferredFieldsCount: number): number {
  // Confidence based on number of fields inferred
  // 0 fields = 0%, 1-2 = 30%, 3-4 = 50%, 5-6 = 70%, 7+ = 85%
  if (inferredFieldsCount === 0) return 0;
  if (inferredFieldsCount <= 2) return 0.3;
  if (inferredFieldsCount <= 4) return 0.5;
  if (inferredFieldsCount <= 6) return 0.7;
  return 0.85;
}

export default {
  inferProductSchema,
  inferServiceSchema,
  applyProductInference,
  applyServiceInference,
  inferProductSchemaBatch,
  inferServiceSchemaBatch,
};
