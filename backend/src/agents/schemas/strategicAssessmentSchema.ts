/**
 * Strategic Assessment Schema
 *
 * Complete schema for strategic company profiling that feeds:
 * - RAG training with industry-specific context
 * - Product/Service classification with examples
 * - Schema pre-filling with intelligent defaults
 * - Strategic Q&A generation
 * - Portfolio recommendations
 */

import { z } from 'zod';

// ============================================================
// SECTION A: COMPANY IDENTITY
// ============================================================

export const CompanyIdentitySchema = z.object({
  // A1: Industry and Positioning
  industry: z.string().describe('Primary industry/sector'),
  industry_vertical: z.string().optional().describe('Specific vertical within industry'),
  competitive_positioning: z.string().optional().describe('Market position description (2-3 sentences)'),

  // A2: Business Model and Revenue Streams
  business_model: z.enum([
    'b2b_enterprise',
    'b2b_smb',
    'b2c',
    'b2b2c',
    'platform_marketplace',
    'freemium_saas',
    'licensing',
    'hybrid'
  ]).describe('Primary business model'),

  product_service_mix: z.object({
    products_percentage: z.number().min(0).max(100).describe('% revenue from products'),
    services_percentage: z.number().min(0).max(100).describe('% revenue from services'),
  }).describe('Revenue split between products and services'),

  // A3: Scale and Operational Complexity
  operational_scale: z.enum([
    'startup',      // < 50 employees, < 3 years
    'scaleup',      // 50-500 employees, rapid growth
    'mid_market',   // 500-5000 employees
    'enterprise',   // > 5000 employees
    'conglomerate'  // Multiple business units
  ]).describe('Company phase/scale'),

  geographic_scope: z.enum([
    'single_country',
    '2_5_countries',
    '6_15_countries',
    'global'
  ]).describe('Geographic market reach'),

  // Derived for RAG context
  value_proposition: z.string().optional().describe('Core value proposition (1-2 sentences)'),
  industry_terminology: z.array(z.string()).optional().describe('Industry-specific terms'),
  common_product_categories: z.array(z.string()).optional().describe('Typical product categories in this industry'),
  common_service_types: z.array(z.string()).optional().describe('Typical service types in this industry'),
});

export type CompanyIdentity = z.infer<typeof CompanyIdentitySchema>;

// ============================================================
// SECTION B: PORTFOLIO COMPOSITION
// ============================================================

// Product Example Schema
export const ProductExampleSchema = z.object({
  name: z.string().describe('Product name'),
  category: z.string().describe('Product category/type'),
  description: z.string().describe('Brief description (1 sentence)'),

  pricing_model: z.enum([
    'subscription',
    'perpetual',
    'usage_based',
    'transaction_fee',
    'one_time',
    'freemium',
    'other'
  ]).describe('Pricing model'),

  target_customer: z.enum([
    'enterprise',
    'smb',
    'prosumer',
    'mass_market'
  ]).describe('Target customer segment'),

  // Schema inference hints
  inferred_tipo_offerta: z.enum(['saas', 'on_premise', 'hybrid', 'paas', 'managed_service']).optional(),
  inferred_linea_business: z.string().optional(),
  // Note: lifecycle stages aligned with lifecycle_distribution plus additional stages
  inferred_lifecycle_stage: z.enum([
    'concept',       // Early ideation
    'development',   // In development
    'beta',          // Beta/pilot phase
    'growth',        // Active growth phase (maps to lifecycle_distribution.growth)
    'ga',            // General availability
    'mature',        // Mature/stable
    'maintenance',   // Maintenance mode
    'decline',       // Declining (maps to lifecycle_distribution.decline)
    'deprecated',    // Deprecated
    'eol'            // End of life
  ]).optional(),
  keywords: z.array(z.string()).optional().describe('Keywords for RAG matching'),
});

export type ProductExample = z.infer<typeof ProductExampleSchema>;

// Service Example Schema
export const ServiceExampleSchema = z.object({
  name: z.string().describe('Service name'),

  service_type: z.enum([
    'managed_service',
    'professional_service',
    'support_helpdesk',
    'consulting_advisory',
    'training_education',
    'implementation_onboarding'
  ]).describe('Type of service'),

  description: z.string().describe('Brief description (1 sentence)'),

  delivery_model: z.enum([
    'fully_managed',
    'co_managed',
    'advisory_only',
    'onsite',
    'remote',
    'hybrid'
  ]).describe('Service delivery model'),

  sla_level: z.enum([
    'enterprise_sla',      // 99.9%+ uptime
    'standard_sla',        // 99% uptime
    'best_effort',         // No formal SLA
    'custom_sla'           // Custom per client
  ]).optional().describe('SLA commitment level'),

  // Schema inference hints
  inferred_tipo_servizio: z.enum(['managed_service', 'professional_service', 'support_service', 'consulting', 'training', 'implementation', 'managed_security']).optional(),
  inferred_delivery_model: z.enum(['fully_managed', 'co_managed', 'advisory', 'onsite', 'remote', 'hybrid']).optional(),
  keywords: z.array(z.string()).optional().describe('Keywords for RAG matching'),
});

export type ServiceExample = z.infer<typeof ServiceExampleSchema>;

// Portfolio Composition Schema
export const PortfolioCompositionSchema = z.object({
  // Product Portfolio
  product_portfolio: z.object({
    total_count: z.number().int().min(0).describe('Total number of products'),

    lifecycle_distribution: z.object({
      development: z.number().int().min(0).default(0),
      growth: z.number().int().min(0).default(0),
      mature: z.number().int().min(0).default(0),
      decline: z.number().int().min(0).default(0),
    }).optional().describe('Distribution across lifecycle stages'),

    top_products: z.array(ProductExampleSchema).min(1).max(5).describe('Top 3-5 most important products'),
  }).optional().describe('Product portfolio information'),

  // Service Portfolio
  service_portfolio: z.object({
    total_count: z.number().int().min(0).describe('Total number of services'),

    type_distribution: z.object({
      managed_services: z.number().int().min(0).default(0),
      professional_services: z.number().int().min(0).default(0),
      support: z.number().int().min(0).default(0),
      consulting: z.number().int().min(0).default(0),
      training: z.number().int().min(0).default(0),
      implementation: z.number().int().min(0).default(0),
    }).optional().describe('Distribution by service type'),

    top_services: z.array(ServiceExampleSchema).min(1).max(5).describe('Top 3-5 most important services'),
  }).optional().describe('Service portfolio information'),

  // Terminology Mapping (critical for RAG)
  terminology_mapping: z.object({
    product_naming_patterns: z.array(z.string()).optional().describe('Common patterns in product names'),
    service_naming_patterns: z.array(z.string()).optional().describe('Common patterns in service names'),

    category_vocabulary: z.object({
      products: z.array(z.string()).optional(),
      services: z.array(z.string()).optional(),
    }).optional().describe('Category taxonomy used by company'),
  }).optional().describe('Company-specific terminology'),
});

export type PortfolioComposition = z.infer<typeof PortfolioCompositionSchema>;

// ============================================================
// SECTION C: STRATEGIC CONTEXT
// ============================================================

export const StrategicGoalSchema = z.object({
  goal: z.enum([
    'growth',
    'innovation',
    'operational_excellence',
    'digital_transformation',
    'customer_experience',
    'market_expansion',
    'mergers_acquisitions',
    'sustainability_esg',
    'platform_strategy',
    'other'
  ]).describe('Strategic goal type'),

  priority: z.number().int().min(1).max(3).describe('Priority ranking (1=highest)'),
  description: z.string().optional().describe('Goal description'),
  relevance_to_portfolio: z.string().optional().describe('How this affects product/service decisions'),
});

export type StrategicGoal = z.infer<typeof StrategicGoalSchema>;

export const PrioritizationCriteriaSchema = z.object({
  roi_weight: z.number().int().min(1).max(5).default(3).describe('Financial return importance'),
  strategic_alignment_weight: z.number().int().min(1).max(5).default(3).describe('Strategy alignment importance'),
  market_size_weight: z.number().int().min(1).max(5).default(3).describe('Market opportunity importance'),
  competitive_advantage_weight: z.number().int().min(1).max(5).default(3).describe('Differentiation importance'),
  customer_demand_weight: z.number().int().min(1).max(5).default(3).describe('Customer need importance'),
  innovation_weight: z.number().int().min(1).max(5).default(3).describe('Innovation/technology fit importance'),
  resource_availability_weight: z.number().int().min(1).max(5).default(3).describe('Resource constraints importance'),
  risk_weight: z.number().int().min(1).max(5).default(3).describe('Risk/compliance importance'),
  time_to_market_weight: z.number().int().min(1).max(5).default(3).describe('Speed to market importance'),

  // Derived
  top_3_criteria: z.array(z.string()).optional().describe('Top 3 criteria by weight'),
});

export type PrioritizationCriteria = z.infer<typeof PrioritizationCriteriaSchema>;

export const SuccessMetricSchema = z.object({
  metric: z.enum([
    'revenue_arr_mrr',
    'profitability_margin',
    'market_share',
    'customer_acquisition_cost',
    'lifetime_value',
    'net_promoter_score',
    'customer_retention_churn',
    'time_to_market',
    'innovation_index',
    'strategic_alignment_score',
    'resource_utilization',
    'risk_compliance_score',
    'other'
  ]).describe('Success metric type'),

  category: z.enum(['financial', 'customer', 'operational', 'strategic']).describe('Metric category'),
  tracking_frequency: z.enum(['real_time', 'daily', 'weekly', 'monthly', 'quarterly', 'annual']).optional(),
  has_dashboard: z.boolean().optional().describe('Is this tracked in a dashboard?'),
});

export type SuccessMetric = z.infer<typeof SuccessMetricSchema>;

export const StrategicContextSchema = z.object({
  // Strategic Goals
  goals_2025_2027: z.array(StrategicGoalSchema).min(1).max(3).describe('Top 3 strategic goals'),
  vision_statement: z.string().optional().describe('Strategic vision (2-3 sentences)'),

  // Prioritization Framework
  prioritization_criteria: PrioritizationCriteriaSchema.describe('Weights for decision criteria'),

  // Pain Points
  primary_pain_point: z.enum([
    'lack_of_visibility',
    'decisions_without_data',
    'portfolio_bloat',
    'profitability_unknown',
    'difficult_prioritization',
    'data_silos',
    'compliance_audit_trail',
    'slow_time_to_market',
    'product_cannibalization',
    'difficult_sunset_decisions',
    'other'
  ]).describe('Main operational challenge'),

  pain_point_description: z.string().optional().describe('Detailed pain point description'),
  pain_point_impact: z.string().optional().describe('How this affects operations'),

  // Governance
  governance_model: z.enum([
    'ceo_centralized',
    'executive_committee',
    'product_council',
    'business_unit_autonomous',
    'data_driven_kpi',
    'approval_matrix',
    'agile_dynamic',
    'ad_hoc',
    'other'
  ]).describe('Decision-making structure'),

  decision_making_style: z.string().optional().describe('How decisions are made'),

  // Success Metrics
  success_metrics: z.array(SuccessMetricSchema).optional().describe('Key performance indicators'),
  has_consolidated_dashboard: z.boolean().optional().describe('Consolidated KPI dashboard exists?'),
  dashboard_tool: z.string().optional().describe('Tool used for dashboards (if any)'),
});

export type StrategicContext = z.infer<typeof StrategicContextSchema>;

// ============================================================
// SECTION D: THEMIS ONBOARDING CONTEXT
// ============================================================

export const ThemisContextSchema = z.object({
  census_scope: z.array(z.enum([
    'products_only',
    'services_only',
    'products_and_services',
    'projects_initiatives',
    'innovation_pipeline',
    'sunset_candidates'
  ])).min(1).describe('What to census in THEMIS'),

  initial_volume_estimate: z.enum([
    'less_than_10',
    '10_to_50',
    '50_to_100',
    '100_to_500',
    'more_than_500'
  ]).describe('Expected number of items to census'),

  data_sources: z.array(z.enum([
    'excel_sheets',
    'crm_salesforce_hubspot',
    'product_management_tool',
    'financial_erp',
    'project_management',
    'custom_database',
    'presentations_slides',
    'tribal_knowledge',
    'other'
  ])).optional().describe('Where data currently lives'),

  integration_requirements: z.array(z.string()).optional().describe('Tools to integrate with'),

  onboarding_timeline: z.enum([
    'immediate',
    '1_month',
    '2_3_months',
    'flexible'
  ]).optional().describe('Urgency for onboarding'),

  primary_use_case: z.string().optional().describe('Main reason for using THEMIS'),
});

export type ThemisContext = z.infer<typeof ThemisContextSchema>;

// ============================================================
// RAG TRAINING CONFIGURATION
// ============================================================

export const RAGTrainingConfigSchema = z.object({
  industry_context: z.string().describe('Detailed industry description for RAG context'),

  product_indicators: z.array(z.string()).describe('Keywords/patterns that indicate a product'),
  service_indicators: z.array(z.string()).describe('Keywords/patterns that indicate a service'),

  ambiguous_cases: z.array(z.object({
    term: z.string(),
    interpretation: z.string().describe('How to interpret this term in this industry'),
  })).optional().describe('Terms that could be product OR service'),

  reference_examples: z.object({
    products: z.array(z.object({
      name: z.string(),
      why_product: z.string().describe('Reasoning for classification'),
      category: z.string(),
    })).optional(),

    services: z.array(z.object({
      name: z.string(),
      why_service: z.string().describe('Reasoning for classification'),
      type: z.string(),
    })).optional(),
  }).describe('Gold standard examples for RAG training'),
});

export type RAGTrainingConfig = z.infer<typeof RAGTrainingConfigSchema>;

// ============================================================
// SCHEMA INFERENCE HINTS
// ============================================================

export const SchemaInferenceHintsSchema = z.object({
  // Default values for auto-filling product/service schemas
  default_linea_business: z.string().optional(),
  default_target_company_size: z.array(z.enum(['startup', 'smb', 'mid_market', 'enterprise', 'global_enterprise'])).optional(),
  default_target_industries: z.array(z.string()).optional(),
  default_target_regions: z.array(z.string()).optional(),
  default_currency: z.string().optional(),
  common_technologies: z.array(z.string()).optional(),
  common_integrations: z.array(z.string()).optional(),

  // Product-specific defaults
  typical_product_lifecycle: z.string().optional(),
  typical_pricing_model: z.string().optional(),

  // Service-specific defaults
  typical_service_type: z.string().optional(),
  typical_delivery_model: z.string().optional(),
  typical_sla_level: z.string().optional(),
});

export type SchemaInferenceHints = z.infer<typeof SchemaInferenceHintsSchema>;

// ============================================================
// Q&A GENERATION CONTEXT
// ============================================================

export const QAGenerationContextSchema = z.object({
  focus_areas: z.array(z.string()).describe('Areas to prioritize in Q&A'),
  strategic_questions_topics: z.array(z.string()).describe('Topics for strategic questions'),
  business_context_hints: z.array(z.string()).describe('Business context for question generation'),
});

export type QAGenerationContext = z.infer<typeof QAGenerationContextSchema>;

// ============================================================
// RECOMMENDATIONS
// ============================================================

export const RecommendationSchema = z.object({
  title: z.string().describe('Recommendation title'),
  category: z.enum([
    'onboarding',
    'data_quality',
    'strategic_alignment',
    'process_improvement',
    'quick_win',
    'integration',
    'governance'
  ]).describe('Recommendation category'),

  priority: z.enum(['immediate', 'short_term', 'medium_term']).describe('Priority timeline'),
  rationale: z.string().describe('Why this recommendation'),
  action_items: z.array(z.string()).min(1).describe('Concrete actions to take'),
  expected_impact: z.string().describe('Expected outcome/benefit'),
});

export type Recommendation = z.infer<typeof RecommendationSchema>;

// ============================================================
// COMPLETE STRATEGIC ASSESSMENT PROFILE
// ============================================================

export const StrategicAssessmentProfileSchema = z.object({
  // Core sections
  company_identity: CompanyIdentitySchema.describe('Company DNA and positioning'),
  portfolio_composition: PortfolioCompositionSchema.describe('Portfolio structure and examples'),
  strategic_context: StrategicContextSchema.describe('Strategy, priorities, and decision-making'),
  themis_context: ThemisContextSchema.describe('THEMIS-specific onboarding info'),

  // Derived configurations
  rag_training_config: RAGTrainingConfigSchema.describe('Configuration for RAG system training'),
  schema_inference_hints: SchemaInferenceHintsSchema.describe('Hints for intelligent schema pre-filling'),
  qa_generation_context: QAGenerationContextSchema.describe('Context for Q&A generation'),

  // Recommendations
  recommendations: z.array(RecommendationSchema).min(3).max(5).describe('Actionable recommendations'),

  // Executive Summary
  executive_summary: z.string().describe('2-3 paragraph summary in Italian'),

  // Metadata
  assessment_version: z.string().default('2.0').describe('Assessment schema version'),
  generated_at: z.string().datetime().optional(),
  confidence_score: z.number().min(0).max(1).optional().describe('Overall confidence in profile completeness'),
});

export type StrategicAssessmentProfile = z.infer<typeof StrategicAssessmentProfileSchema>;

// ============================================================
// ASSESSMENT ANSWERS INPUT
// ============================================================

export const AssessmentAnswersSchema = z.object({
  // Section A: Company Identity
  a1_industry: z.string().describe('Primary industry'),
  a1_vertical: z.string().optional(),
  a1_positioning: z.string().optional(),

  a2_business_model: z.string(),
  a2_product_percentage: z.number().min(0).max(100),
  a2_service_percentage: z.number().min(0).max(100),

  a3_operational_scale: z.string(),
  a3_geographic_scope: z.string(),

  // Section B: Portfolio Composition
  b1_product_count: z.number().int().min(0).optional(),
  b1_lifecycle_dev: z.number().int().min(0).optional(),
  b1_lifecycle_growth: z.number().int().min(0).optional(),
  b1_lifecycle_mature: z.number().int().min(0).optional(),
  b1_lifecycle_decline: z.number().int().min(0).optional(),

  b2_top_products: z.array(z.object({
    name: z.string(),
    category: z.string(),
    description: z.string(),
    pricing_model: z.string(),
    target_customer: z.string(),
  })).optional(),

  b3_service_count: z.number().int().min(0).optional(),
  b3_type_managed: z.number().int().min(0).optional(),
  b3_type_professional: z.number().int().min(0).optional(),
  b3_type_support: z.number().int().min(0).optional(),
  b3_type_consulting: z.number().int().min(0).optional(),
  b3_type_training: z.number().int().min(0).optional(),
  b3_type_implementation: z.number().int().min(0).optional(),

  b4_top_services: z.array(z.object({
    name: z.string(),
    service_type: z.string(),
    description: z.string(),
    delivery_model: z.string(),
    sla_level: z.string().optional(),
  })).optional(),

  // NEW: Portfolio examples for RAG context (from assessment questions 8 & 9)
  product_types: z.array(z.string()).optional().describe('Selected product categories'),
  service_types: z.array(z.string()).optional().describe('Selected service categories'),

  // Section C: Strategic Context
  c1_strategic_goals: z.array(z.object({
    goal: z.string(),
    priority: z.number(),
    description: z.string().optional(),
  })),
  c1_vision: z.string().optional(),

  c2_criteria_weights: z.object({
    roi: z.number().int().min(1).max(5),
    strategic_alignment: z.number().int().min(1).max(5),
    market_size: z.number().int().min(1).max(5),
    competitive_advantage: z.number().int().min(1).max(5),
    customer_demand: z.number().int().min(1).max(5),
    innovation: z.number().int().min(1).max(5),
    resource_availability: z.number().int().min(1).max(5),
    risk: z.number().int().min(1).max(5),
    time_to_market: z.number().int().min(1).max(5),
  }),

  c3_pain_point: z.string(),
  c3_pain_description: z.string().optional(),

  c4_governance: z.string(),

  c5_success_metrics: z.array(z.string()).optional(),
  c5_has_dashboard: z.boolean().optional(),
  c5_dashboard_tool: z.string().optional(),

  // Section D: THEMIS Context
  d1_census_scope: z.array(z.string()),
  d1_volume_estimate: z.string(),
  d2_data_sources: z.array(z.string()).optional(),
  d2_integrations: z.array(z.string()).optional(),
  d2_timeline: z.string().optional(),
  d2_primary_use_case: z.string().optional(),
});

export type AssessmentAnswers = z.infer<typeof AssessmentAnswersSchema>;

// Export all schemas
export default {
  StrategicAssessmentProfileSchema,
  AssessmentAnswersSchema,
  CompanyIdentitySchema,
  PortfolioCompositionSchema,
  StrategicContextSchema,
  ThemisContextSchema,
  RAGTrainingConfigSchema,
  SchemaInferenceHintsSchema,
  ProductExampleSchema,
  ServiceExampleSchema,
  StrategicGoalSchema,
  PrioritizationCriteriaSchema,
  SuccessMetricSchema,
  RecommendationSchema,
};
