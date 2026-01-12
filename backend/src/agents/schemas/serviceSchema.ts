/**
 * Service Schema - Complete Service Card Structure
 *
 * Three-section schema for comprehensive service data:
 * A. Identity & Classification (REQUIRED)
 * B. Service Delivery & Value (REQUIRED)
 * C. Pricing & SLA (ALMOST ALWAYS NECESSARY)
 */

import { z } from 'zod';

/**
 * A. IDENTITY & CLASSIFICATION (Required)
 */
export const ServiceIdentitySchema = z.object({
  // Core Identity
  service_id: z.string().uuid().describe('Unique identifier for the service'),
  nome_servizio: z.string().min(3).describe('Service name'),

  // Classification
  categoria_servizio: z.string().describe('Main service category (e.g., "Managed Services", "Consulting", "Support")'),
  sottocategoria_servizio: z.string().optional().describe('Service subcategory for more specific classification'),

  tipo_servizio: z.enum([
    'managed_service',      // Ongoing managed service
    'professional_service', // One-time or project-based
    'support_service',      // Product support service
    'consulting',           // Consulting/advisory
    'training',            // Training services
    'implementation',      // Implementation services
    'managed_security',    // Managed security services
  ]).describe('Type of service'),

  delivery_model: z.enum([
    'fully_managed',    // Provider manages everything
    'co_managed',       // Shared responsibility
    'advisory',         // Guidance only
    'onsite',          // On-site delivery
    'remote',          // Fully remote
    'hybrid',          // Combination
  ]).describe('Service delivery model'),

  linea_di_business: z.string().describe('Business line this service belongs to'),

  // Ownership & Status
  owner: z.string().describe('Service owner or responsible team'),

  stato_lifecycle: z.enum([
    'concept',        // In ideation phase
    'pilot',         // Pilot program
    'ga',            // Generally available
    'mature',        // Mature service offering
    'limited',       // Limited availability
    'deprecated',    // Being phased out
    'eol'           // End of life
  ]).describe('Service lifecycle stage'),

  // Target Market
  target: z.object({
    company_size: z.array(z.enum(['startup', 'smb', 'mid_market', 'enterprise', 'global_enterprise'])).describe('Target company sizes'),
    industries: z.array(z.string()).optional().describe('Target industries'),
    regions: z.array(z.string()).optional().describe('Target geographic regions'),
  }).describe('Target market definition'),

  // Service Characteristics
  availability: z.object({
    hours: z.enum(['8x5', '12x5', '16x5', '24x5', '24x7', 'business_hours', 'custom']).describe('Service availability hours'),
    timezone_coverage: z.array(z.string()).optional().describe('Timezone coverage (e.g., "CET", "EST", "PST")'),
    holidays_coverage: z.boolean().optional(),
  }).describe('Service availability'),

  // Metadata
  created_date: z.string().datetime().optional(),
  last_updated: z.string().datetime().optional(),
});

/**
 * B. SERVICE DELIVERY & VALUE (Required)
 */
export const ServiceDeliverySchema = z.object({
  // Target Segments
  segmenti_target: z.array(z.object({
    segment_name: z.string().describe('Name of the segment'),
    description: z.string().describe('Description of this segment'),
    typical_size: z.string().optional().describe('Typical size/scale for this segment'),
    priority: z.enum(['primary', 'secondary', 'tertiary']).describe('Priority of this segment'),
  })).min(1).describe('Target customer segments'),

  // Problem & Need
  problema_principale: z.object({
    pain_point: z.string().describe('Main pain point this service addresses'),
    current_state: z.string().optional().describe('How customers handle this today'),
    urgency: z.enum(['critical', 'high', 'medium', 'low']).optional(),
  }).describe('Primary problem the service solves'),

  // Value Proposition
  value_proposition: z.object({
    headline: z.string().describe('One-line value proposition'),
    key_benefits: z.array(z.string()).min(3).describe('Top 3-5 key benefits'),
    differentiators: z.array(z.string()).describe('What makes this service unique'),
    business_outcomes: z.array(z.string()).describe('Expected business outcomes'),
  }).describe('Core value proposition'),

  // Service Scope
  scope: z.object({
    included_activities: z.array(z.string()).describe('Activities included in the service'),
    excluded_activities: z.array(z.string()).optional().describe('Explicitly excluded activities'),
    deliverables: z.array(z.object({
      name: z.string(),
      description: z.string(),
      frequency: z.string().optional().describe('How often delivered (e.g., "monthly", "quarterly", "on-demand")'),
    })).describe('Service deliverables'),
  }).describe('Service scope definition'),

  // Use Cases
  use_case_chiave: z.array(z.object({
    name: z.string().describe('Use case name'),
    description: z.string().describe('Detailed description'),
    typical_duration: z.string().optional().describe('How long this use case typically takes'),
    outcome: z.string().describe('Expected outcome'),
    priority: z.enum(['critical', 'high', 'medium', 'low']).optional(),
  })).min(1).describe('Key use cases'),

  // Service Team
  team_structure: z.object({
    roles: z.array(z.object({
      role_name: z.string(),
      responsibilities: z.string(),
      quantity: z.number().optional(),
    })).optional().describe('Team roles involved in service delivery'),
    escalation_path: z.string().optional().describe('Escalation process'),
  }).optional().describe('Service delivery team structure'),

  // Success Metrics
  success_metrics: z.array(z.object({
    metric_name: z.string(),
    target_value: z.string(),
    measurement_frequency: z.enum(['real_time', 'daily', 'weekly', 'monthly', 'quarterly']).optional(),
  })).optional().describe('How service success is measured'),
});

/**
 * C. PRICING & SLA (Almost Always Necessary)
 */
export const ServicePricingSLASchema = z.object({
  // Pricing Model
  modello_prezzo: z.object({
    pricing_type: z.enum([
      'fixed_fee',        // Fixed monthly/annual fee
      'time_materials',   // Hourly/daily rate
      'retainer',        // Retainer model
      'consumption',     // Based on usage/consumption
      'outcome_based',   // Based on outcomes achieved
      'hybrid',          // Combination
    ]),

    billing_frequency: z.enum(['hourly', 'daily', 'weekly', 'monthly', 'quarterly', 'annual', 'project_based', 'milestone_based']),

    currency: z.string().default('EUR'),

    pricing_structure: z.object({
      base_fee: z.number().optional().describe('Base monthly/annual fee'),
      variable_component: z.object({
        unit: z.string().optional().describe('Unit of measurement (e.g., "hour", "user", "GB")'),
        price_per_unit: z.number().optional(),
      }).optional(),
      minimum_commitment: z.number().optional().describe('Minimum monthly/annual commitment'),
    }).describe('Detailed pricing structure'),

    pricing_tiers: z.array(z.object({
      tier_name: z.string(),
      target_segment: z.string(),
      pricing_details: z.string(),
      included_scope: z.string(),
    })).optional(),
  }).describe('Pricing model'),

  // SLA (Service Level Agreement)
  sla: z.object({
    response_times: z.object({
      critical: z.string().optional().describe('Response time for critical issues (e.g., "15 minutes")'),
      high: z.string().optional().describe('Response time for high priority issues'),
      medium: z.string().optional(),
      low: z.string().optional(),
    }).describe('SLA response times by priority'),

    resolution_times: z.object({
      critical: z.string().optional(),
      high: z.string().optional(),
      medium: z.string().optional(),
      low: z.string().optional(),
    }).optional().describe('Target resolution times'),

    availability_target: z.number().min(0).max(100).optional().describe('Availability % target (e.g., 99.9)'),

    uptime_guarantee: z.string().optional().describe('Uptime guarantee (e.g., "99.99% monthly uptime")'),

    penalties: z.object({
      sla_breach_credits: z.boolean().optional().describe('Are credits offered for SLA breaches?'),
      credit_structure: z.string().optional().describe('How credits are calculated'),
    }).optional(),

    exclusions: z.array(z.string()).optional().describe('Exclusions from SLA (e.g., "scheduled maintenance", "force majeure")'),
  }).describe('Service Level Agreement'),

  // Contract Terms
  contract_terms: z.object({
    minimum_term: z.string().describe('Minimum contract term (e.g., "12 months", "36 months")'),
    renewal_terms: z.string().optional().describe('Auto-renewal or manual renewal?'),
    termination_notice: z.string().optional().describe('Notice period for termination'),
    payment_terms: z.string().optional().describe('Payment terms (e.g., "Net 30", "Monthly in advance")'),
  }).describe('Standard contract terms'),

  // Support Channels
  support_channels: z.array(z.object({
    channel: z.enum(['phone', 'email', 'chat', 'portal', 'onsite', 'slack', 'teams']),
    availability: z.string().describe('When this channel is available'),
    response_time: z.string().optional(),
  })).describe('Available support channels'),

  // Service Catalog Options
  packaging: z.object({
    service_tiers: z.array(z.object({
      tier_name: z.string(),
      description: z.string(),
      included_services: z.array(z.string()),
      optional_addons: z.array(z.string()).optional(),
    })).optional().describe('Different service tier offerings'),

    add_ons: z.array(z.object({
      name: z.string(),
      description: z.string(),
      pricing: z.string().optional(),
    })).optional().describe('Available service add-ons'),
  }).optional(),
});

/**
 * COMPLETE SERVICE SCHEMA
 * Combines all three sections
 */
export const CompleteServiceSchema = z.object({
  // Section A: Identity & Classification (REQUIRED)
  identity: ServiceIdentitySchema,

  // Section B: Service Delivery & Value (REQUIRED)
  delivery: ServiceDeliverySchema,

  // Section C: Pricing & SLA (ALMOST ALWAYS NECESSARY)
  pricing_sla: ServicePricingSLASchema.optional(),

  // Additional Metadata
  metadata: z.object({
    confidence_score: z.number().min(0).max(1).describe('Overall confidence in data completeness'),
    missing_fields: z.array(z.string()).optional().describe('List of important missing fields'),
    last_reviewed: z.string().datetime().optional(),
    data_sources: z.array(z.string()).optional().describe('Sources of this data'),
  }).optional(),
});

export type ServiceIdentity = z.infer<typeof ServiceIdentitySchema>;
export type ServiceDelivery = z.infer<typeof ServiceDeliverySchema>;
export type ServicePricingSLA = z.infer<typeof ServicePricingSLASchema>;
export type CompleteService = z.infer<typeof CompleteServiceSchema>;

/**
 * Helper function to identify missing required fields
 */
export function identifyMissingFields(service: Partial<CompleteService>): string[] {
  const missing: string[] = [];

  // Check Section A (Identity) - REQUIRED
  if (!service.identity) {
    missing.push('Section A: Complete Identity & Classification section is missing');
  } else {
    if (!service.identity.service_id) missing.push('A.service_id');
    if (!service.identity.nome_servizio) missing.push('A.nome_servizio');
    if (!service.identity.categoria_servizio) missing.push('A.categoria_servizio');
    if (!service.identity.tipo_servizio) missing.push('A.tipo_servizio');
    if (!service.identity.delivery_model) missing.push('A.delivery_model');
    if (!service.identity.linea_di_business) missing.push('A.linea_di_business');
    if (!service.identity.owner) missing.push('A.owner');
    if (!service.identity.stato_lifecycle) missing.push('A.stato_lifecycle');
    if (!service.identity.target) missing.push('A.target');
    if (!service.identity.availability) missing.push('A.availability');
  }

  // Check Section B (Delivery) - REQUIRED
  if (!service.delivery) {
    missing.push('Section B: Complete Service Delivery section is missing');
  } else {
    if (!service.delivery.segmenti_target || service.delivery.segmenti_target.length === 0) {
      missing.push('B.segmenti_target');
    }
    if (!service.delivery.problema_principale) missing.push('B.problema_principale');
    if (!service.delivery.value_proposition) missing.push('B.value_proposition');
    if (!service.delivery.scope) missing.push('B.scope');
    if (!service.delivery.use_case_chiave || service.delivery.use_case_chiave.length === 0) {
      missing.push('B.use_case_chiave');
    }
  }

  // Check Section C (Pricing & SLA) - ALMOST ALWAYS NECESSARY
  if (!service.pricing_sla) {
    missing.push('Section C: Pricing & SLA section is missing (recommended)');
  } else {
    if (!service.pricing_sla.modello_prezzo) missing.push('C.modello_prezzo');
    if (!service.pricing_sla.sla) missing.push('C.sla');
    if (!service.pricing_sla.contract_terms) missing.push('C.contract_terms');
    if (!service.pricing_sla.support_channels || service.pricing_sla.support_channels.length === 0) {
      missing.push('C.support_channels');
    }
  }

  return missing;
}

/**
 * Helper function to calculate data completeness score
 */
export function calculateCompletenessScore(service: Partial<CompleteService>): number {
  let totalFields = 0;
  let filledFields = 0;

  // Section A fields (weight: 35%)
  const sectionAFields = [
    'service_id', 'nome_servizio', 'categoria_servizio', 'tipo_servizio',
    'delivery_model', 'linea_di_business', 'owner', 'stato_lifecycle', 'target', 'availability'
  ];
  totalFields += sectionAFields.length;
  if (service.identity) {
    sectionAFields.forEach(field => {
      if ((service.identity as any)[field]) filledFields++;
    });
  }

  // Section B fields (weight: 40%)
  const sectionBFields = [
    'segmenti_target', 'problema_principale', 'value_proposition', 'scope', 'use_case_chiave'
  ];
  totalFields += sectionBFields.length;
  if (service.delivery) {
    sectionBFields.forEach(field => {
      const value = (service.delivery as any)[field];
      if (value && (Array.isArray(value) ? value.length > 0 : true)) {
        filledFields++;
      }
    });
  }

  // Section C fields (weight: 25%)
  const sectionCFields = ['modello_prezzo', 'sla', 'contract_terms', 'support_channels'];
  totalFields += sectionCFields.length;
  if (service.pricing_sla) {
    sectionCFields.forEach(field => {
      const value = (service.pricing_sla as any)[field];
      if (value && (Array.isArray(value) ? value.length > 0 : true)) {
        filledFields++;
      }
    });
  }

  return totalFields > 0 ? filledFields / totalFields : 0;
}

export default {
  ServiceIdentitySchema,
  ServiceDeliverySchema,
  ServicePricingSLASchema,
  CompleteServiceSchema,
  identifyMissingFields,
  calculateCompletenessScore,
};
