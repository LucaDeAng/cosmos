/**
 * Product Schema - Complete Product Card Structure
 *
 * Three-section schema for comprehensive product data:
 * A. Identity & Classification (REQUIRED)
 * B. Customer & Value Proposition (REQUIRED)
 * C. Go-to-market & Pricing (ALMOST ALWAYS NECESSARY)
 */

import { z } from 'zod';

/**
 * A. IDENTITY & CLASSIFICATION (Required)
 */
export const ProductIdentitySchema = z.object({
  // Core Identity
  product_id: z.string().uuid().describe('Unique identifier for the product'),
  nome_prodotto: z.string().min(3).describe('Product name'),

  // Classification
  categoria_prodotto: z.string().describe('Main product category (e.g., "CRM Platform", "Security Solution", "Analytics Tool")'),
  sottocategoria_prodotto: z.string().optional().describe('Product subcategory for more specific classification'),

  tipo_offerta: z.enum([
    'saas',           // Software-as-a-Service
    'on_premise',     // On-premise software
    'hybrid',         // Hybrid deployment
    'paas',           // Platform-as-a-Service
    'managed_service' // Fully managed solution
  ]).describe('Type of offering/delivery model'),

  linea_di_business: z.string().describe('Business line this product belongs to (e.g., "Enterprise Software", "Cloud Services", "Security")'),

  // Ownership & Status
  owner: z.string().describe('Product owner or responsible team'),

  stato_lifecycle: z.enum([
    'concept',        // In ideation phase
    'development',    // Under development
    'beta',          // Beta/preview release
    'ga',            // Generally available
    'mature',        // Mature product
    'maintenance',   // Maintenance mode only
    'deprecated',    // Being phased out
    'eol'            // End of life
  ]).describe('Product lifecycle stage'),

  // Target Market
  target: z.object({
    company_size: z.array(z.enum(['startup', 'smb', 'mid_market', 'enterprise', 'global_enterprise'])).describe('Target company sizes'),
    industries: z.array(z.string()).optional().describe('Target industries (e.g., "Financial Services", "Healthcare", "Manufacturing")'),
    regions: z.array(z.string()).optional().describe('Target geographic regions'),
  }).describe('Target market definition'),

  // Technical Details
  technologies: z.array(z.string()).optional().describe('Core technologies used (e.g., "React", "Kubernetes", "PostgreSQL")'),
  integrations: z.array(z.string()).optional().describe('Key integrations available'),

  // Metadata
  created_date: z.string().datetime().optional(),
  last_updated: z.string().datetime().optional(),
});

/**
 * B. CUSTOMER & VALUE PROPOSITION (Required)
 */
export const ProductValuePropositionSchema = z.object({
  // Target Segments
  segmenti_target: z.array(z.object({
    segment_name: z.string().describe('Name of the segment (e.g., "IT Directors", "Sales Leaders")'),
    description: z.string().describe('Description of this segment'),
    size_estimate: z.string().optional().describe('Estimated size of this segment'),
    priority: z.enum(['primary', 'secondary', 'tertiary']).describe('Priority of this segment'),
  })).min(1).describe('Target customer segments'),

  // Problem Statement
  problema_principale: z.object({
    pain_point: z.string().describe('Main pain point this product solves'),
    current_alternatives: z.array(z.string()).optional().describe('What customers do today without this product'),
    cost_of_problem: z.string().optional().describe('Estimated cost/impact of the problem'),
  }).describe('Primary problem the product solves'),

  // Value Proposition
  value_proposition: z.object({
    headline: z.string().describe('One-line value proposition'),
    key_benefits: z.array(z.string()).min(3).describe('Top 3-5 key benefits'),
    differentiators: z.array(z.string()).describe('What makes this product unique vs competitors'),
    quantified_value: z.string().optional().describe('Quantified business value (e.g., "30% cost reduction", "50% faster deployment")'),
  }).describe('Core value proposition'),

  // Use Cases
  use_case_chiave: z.array(z.object({
    name: z.string().describe('Use case name'),
    description: z.string().describe('Detailed description of the use case'),
    persona: z.string().describe('Primary persona for this use case'),
    outcome: z.string().describe('Expected outcome/result'),
    priority: z.enum(['critical', 'high', 'medium', 'low']).optional(),
  })).min(1).describe('Key use cases'),

  // Customer Success Metrics
  success_metrics: z.array(z.object({
    metric_name: z.string(),
    target_value: z.string(),
    measurement_method: z.string().optional(),
  })).optional().describe('How customers measure success with this product'),
});

/**
 * C. GO-TO-MARKET & PRICING (Almost Always Necessary)
 */
export const ProductGTMSchema = z.object({
  // Distribution Channels
  canali: z.array(z.object({
    channel_type: z.enum([
      'direct_sales',      // Direct sales team
      'inside_sales',      // Inside sales/telesales
      'partner',           // Channel partners
      'self_service',      // Self-service/website
      'marketplace',       // App marketplace (AWS, Azure, etc.)
      'reseller',          // Resellers/distributors
      'oem',              // OEM partnerships
    ]),
    description: z.string().optional(),
    revenue_contribution: z.number().min(0).max(100).optional().describe('% of revenue from this channel'),
    primary: z.boolean().optional().describe('Is this the primary channel?'),
  })).min(1).describe('Go-to-market channels'),

  // Pricing Model
  modello_prezzo: z.object({
    pricing_type: z.enum([
      'subscription',      // Recurring subscription
      'perpetual',        // One-time perpetual license
      'consumption',      // Usage-based/consumption
      'freemium',         // Free tier + paid upgrades
      'transaction',      // Per-transaction pricing
      'hybrid',           // Combination of models
    ]),

    billing_frequency: z.enum(['monthly', 'quarterly', 'annual', 'multi_year', 'one_time', 'usage_based']).optional(),

    currency: z.string().default('EUR').describe('Primary currency'),

    pricing_tiers: z.array(z.object({
      tier_name: z.string().describe('Name of the tier (e.g., "Starter", "Professional", "Enterprise")'),
      target_segment: z.string().describe('Which segment this tier targets'),
      base_price: z.number().optional().describe('Base price for this tier'),
      price_per_unit: z.number().optional().describe('Price per additional unit (user, GB, transaction, etc.)'),
      included_features: z.array(z.string()).describe('Features included in this tier'),
      limitations: z.string().optional().describe('Any limitations of this tier'),
    })).optional().describe('Pricing tiers if applicable'),

    discount_structure: z.object({
      volume_discounts: z.boolean().optional(),
      annual_discount: z.number().optional().describe('% discount for annual vs monthly'),
      enterprise_negotiable: z.boolean().optional(),
    }).optional(),
  }).describe('Pricing model and structure'),

  // Packaging
  packaging: z.object({
    editions: z.array(z.object({
      edition_name: z.string().describe('Edition name (e.g., "Standard", "Professional", "Enterprise")'),
      description: z.string(),
      target_audience: z.string(),
      core_features: z.array(z.string()),
      add_ons_available: z.array(z.string()).optional(),
    })).min(1).describe('Product editions/packages'),

    deployment_options: z.array(z.enum(['cloud', 'on_premise', 'hybrid', 'multi_cloud'])).describe('Available deployment options'),

    support_tiers: z.array(z.object({
      tier_name: z.string(),
      sla: z.string().optional().describe('SLA commitment'),
      response_time: z.string().optional(),
      channels: z.array(z.string()).optional().describe('Support channels (email, phone, chat, etc.)'),
      included_in_base: z.boolean().describe('Is this included in base price?'),
    })).optional().describe('Support tiers available'),
  }).describe('Product packaging and bundling'),

  // Sales Motion
  sales_motion: z.object({
    sales_cycle_length: z.string().optional().describe('Typical sales cycle (e.g., "30-60 days", "6-12 months")'),
    contract_length: z.string().optional().describe('Typical contract length'),
    minimum_contract_value: z.number().optional(),
    proof_of_concept_required: z.boolean().optional(),
    trial_available: z.boolean().optional(),
    trial_duration_days: z.number().optional(),
  }).optional().describe('Sales motion characteristics'),

  // Competitive Positioning
  competitive_positioning: z.object({
    main_competitors: z.array(z.string()).optional(),
    positioning_statement: z.string().optional().describe('How this product is positioned vs competitors'),
    win_rate: z.number().min(0).max(100).optional().describe('Win rate % in competitive deals'),
  }).optional(),
});

/**
 * COMPLETE PRODUCT SCHEMA
 * Combines all three sections
 */
export const CompleteProductSchema = z.object({
  // Section A: Identity & Classification (REQUIRED)
  identity: ProductIdentitySchema,

  // Section B: Customer & Value Proposition (REQUIRED)
  value_proposition: ProductValuePropositionSchema,

  // Section C: Go-to-market & Pricing (ALMOST ALWAYS NECESSARY)
  go_to_market: ProductGTMSchema.optional(),

  // Additional Metadata
  metadata: z.object({
    confidence_score: z.number().min(0).max(1).describe('Overall confidence in data completeness'),
    missing_fields: z.array(z.string()).optional().describe('List of important missing fields'),
    last_reviewed: z.string().datetime().optional(),
    data_sources: z.array(z.string()).optional().describe('Sources of this data'),
  }).optional(),
});

export type ProductIdentity = z.infer<typeof ProductIdentitySchema>;
export type ProductValueProposition = z.infer<typeof ProductValuePropositionSchema>;
export type ProductGTM = z.infer<typeof ProductGTMSchema>;
export type CompleteProduct = z.infer<typeof CompleteProductSchema>;

/**
 * Helper function to identify missing required fields
 */
export function identifyMissingFields(product: Partial<CompleteProduct>): string[] {
  const missing: string[] = [];

  // Check Section A (Identity) - REQUIRED
  if (!product.identity) {
    missing.push('Section A: Complete Identity & Classification section is missing');
  } else {
    if (!product.identity.product_id) missing.push('A.product_id');
    if (!product.identity.nome_prodotto) missing.push('A.nome_prodotto');
    if (!product.identity.categoria_prodotto) missing.push('A.categoria_prodotto');
    if (!product.identity.tipo_offerta) missing.push('A.tipo_offerta');
    if (!product.identity.linea_di_business) missing.push('A.linea_di_business');
    if (!product.identity.owner) missing.push('A.owner');
    if (!product.identity.stato_lifecycle) missing.push('A.stato_lifecycle');
    if (!product.identity.target) missing.push('A.target');
  }

  // Check Section B (Value Proposition) - REQUIRED
  if (!product.value_proposition) {
    missing.push('Section B: Complete Value Proposition section is missing');
  } else {
    if (!product.value_proposition.segmenti_target || product.value_proposition.segmenti_target.length === 0) {
      missing.push('B.segmenti_target');
    }
    if (!product.value_proposition.problema_principale) missing.push('B.problema_principale');
    if (!product.value_proposition.value_proposition) missing.push('B.value_proposition');
    if (!product.value_proposition.use_case_chiave || product.value_proposition.use_case_chiave.length === 0) {
      missing.push('B.use_case_chiave');
    }
  }

  // Check Section C (GTM) - ALMOST ALWAYS NECESSARY
  if (!product.go_to_market) {
    missing.push('Section C: Go-to-market & Pricing section is missing (recommended)');
  } else {
    if (!product.go_to_market.canali || product.go_to_market.canali.length === 0) {
      missing.push('C.canali');
    }
    if (!product.go_to_market.modello_prezzo) missing.push('C.modello_prezzo');
    if (!product.go_to_market.packaging) missing.push('C.packaging');
  }

  return missing;
}

/**
 * Helper function to calculate data completeness score
 */
export function calculateCompletenessScore(product: Partial<CompleteProduct>): number {
  let totalFields = 0;
  let filledFields = 0;

  // Section A fields (weight: 40%)
  const sectionAFields = [
    'product_id', 'nome_prodotto', 'categoria_prodotto', 'tipo_offerta',
    'linea_di_business', 'owner', 'stato_lifecycle', 'target'
  ];
  totalFields += sectionAFields.length;
  if (product.identity) {
    sectionAFields.forEach(field => {
      if ((product.identity as any)[field]) filledFields++;
    });
  }

  // Section B fields (weight: 40%)
  const sectionBFields = [
    'segmenti_target', 'problema_principale', 'value_proposition', 'use_case_chiave'
  ];
  totalFields += sectionBFields.length;
  if (product.value_proposition) {
    sectionBFields.forEach(field => {
      const value = (product.value_proposition as any)[field];
      if (value && (Array.isArray(value) ? value.length > 0 : true)) {
        filledFields++;
      }
    });
  }

  // Section C fields (weight: 20%)
  const sectionCFields = ['canali', 'modello_prezzo', 'packaging'];
  totalFields += sectionCFields.length;
  if (product.go_to_market) {
    sectionCFields.forEach(field => {
      const value = (product.go_to_market as any)[field];
      if (value && (Array.isArray(value) ? value.length > 0 : true)) {
        filledFields++;
      }
    });
  }

  return totalFields > 0 ? filledFields / totalFields : 0;
}

export default {
  ProductIdentitySchema,
  ProductValuePropositionSchema,
  ProductGTMSchema,
  CompleteProductSchema,
  identifyMissingFields,
  calculateCompletenessScore,
};
