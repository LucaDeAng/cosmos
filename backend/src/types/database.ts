/**
 * Database Type Definitions
 *
 * TypeScript types for Supabase tables with Product/Service schema enhancements
 */

import { CompleteProduct, ProductIdentity, ProductValueProposition, ProductGTM } from '../agents/schemas/productSchema';
import { CompleteService, ServiceIdentity, ServiceDelivery, ServicePricingSLA } from '../agents/schemas/serviceSchema';

// ========================================
// PRODUCTS TABLE
// ========================================

export interface ProductRow {
  // Primary key
  id: string; // UUID

  // Tenant reference
  tenant_id: string | null; // UUID

  // Legacy fields (maintained for backward compatibility)
  name: string;
  description: string | null;
  status: 'active' | 'paused' | 'completed' | 'cancelled' | 'proposed';
  owner: string | null;
  launch_date: string | null; // DATE
  end_of_life_date: string | null; // DATE
  budget: number | null; // DECIMAL
  actual_cost: number | null; // DECIMAL
  strategic_alignment: number | null; // 1-10
  business_value: number | null; // 1-10
  risk_level: 'low' | 'medium' | 'high' | 'critical' | null;
  complexity: 'low' | 'medium' | 'high' | null;
  resource_requirement: number | null; // 1-10
  time_to_value: number | null;
  roi: number | null; // DECIMAL
  category: string | null;
  tags: any[]; // JSONB
  dependencies: any[]; // JSONB
  kpis: any[]; // JSONB
  lifecycle_stage: 'concept' | 'development' | 'beta' | 'ga' | 'mature' | 'maintenance' | 'deprecated' | 'eol' | null;
  revenue: number | null; // DECIMAL
  market_share: number | null; // DECIMAL

  // New schema enhancement fields
  schema_version: number;
  item_type: 'product';
  completeness_score: number; // DECIMAL 0-1

  // Structured data (3-section schema)
  identity_data: Partial<ProductIdentity>; // JSONB - Section A
  value_proposition_data: Partial<ProductValueProposition>; // JSONB - Section B
  go_to_market_data: Partial<ProductGTM>; // JSONB - Section C

  // Metadata
  missing_fields: string[]; // JSONB - Array of missing field paths
  data_sources: string[]; // JSONB - Array of data source identifiers
  last_reviewed: string | null; // TIMESTAMPTZ

  // Denormalized fields for quick access
  tipo_offerta: 'saas' | 'on_premise' | 'hybrid' | 'paas' | 'managed_service' | null;
  linea_di_business: string | null;
  target_market: {
    company_size: string[];
    industries?: string[];
    regions?: string[];
  } | null; // JSONB
  technologies: string[] | null; // JSONB
  integrations: string[] | null; // JSONB

  // Timestamps
  created_at: string; // TIMESTAMPTZ
  updated_at: string; // TIMESTAMPTZ
}

export interface ProductInsert extends Omit<ProductRow, 'id' | 'created_at' | 'updated_at'> {
  id?: string;
  created_at?: string;
  updated_at?: string;
}

export interface ProductUpdate extends Partial<ProductInsert> {}

// ========================================
// SERVICES TABLE
// ========================================

export interface ServiceRow {
  // Primary key
  id: string; // UUID

  // Tenant reference
  tenant_id: string | null; // UUID

  // Legacy fields (maintained for backward compatibility)
  name: string;
  description: string | null;
  status: 'active' | 'paused' | 'completed' | 'cancelled' | 'proposed';
  owner: string | null;
  start_date: string | null; // DATE
  end_date: string | null; // DATE
  budget: number | null; // DECIMAL
  actual_cost: number | null; // DECIMAL
  strategic_alignment: number | null; // 1-10
  business_value: number | null; // 1-10
  risk_level: 'low' | 'medium' | 'high' | 'critical' | null;
  complexity: 'low' | 'medium' | 'high' | null;
  resource_requirement: number | null; // 1-10
  time_to_value: number | null;
  roi: number | null; // DECIMAL
  category: string | null;
  tags: any[]; // JSONB
  dependencies: any[]; // JSONB
  kpis: any[]; // JSONB
  sla_compliance: number | null; // DECIMAL
  customer_satisfaction: number | null; // DECIMAL
  utilization_rate: number | null; // DECIMAL

  // New schema enhancement fields
  schema_version: number;
  item_type: 'service';
  completeness_score: number; // DECIMAL 0-1

  // Structured data (3-section schema)
  identity_data: Partial<ServiceIdentity>; // JSONB - Section A
  delivery_data: Partial<ServiceDelivery>; // JSONB - Section B
  pricing_sla_data: Partial<ServicePricingSLA>; // JSONB - Section C

  // Metadata
  missing_fields: string[]; // JSONB - Array of missing field paths
  data_sources: string[]; // JSONB - Array of data source identifiers
  last_reviewed: string | null; // TIMESTAMPTZ

  // Denormalized fields for quick access
  tipo_servizio: 'managed_service' | 'professional_service' | 'support_service' | 'consulting' | 'training' | 'implementation' | 'managed_security' | null;
  delivery_model: 'fully_managed' | 'co_managed' | 'advisory' | 'onsite' | 'remote' | 'hybrid' | null;
  linea_di_business: string | null;
  target_market: {
    company_size: string[];
    industries?: string[];
    regions?: string[];
  } | null; // JSONB
  availability: {
    hours: '8x5' | '12x5' | '16x5' | '24x5' | '24x7' | 'business_hours' | 'custom';
    timezone_coverage?: string[];
    holidays_coverage?: boolean;
  } | null; // JSONB
  sla_data: any | null; // JSONB - SLA details
  contract_terms: any | null; // JSONB - Contract terms
  support_channels: Array<{
    channel: 'phone' | 'email' | 'chat' | 'portal' | 'onsite' | 'slack' | 'teams';
    availability: string;
    response_time?: string;
  }> | null; // JSONB

  // Timestamps
  created_at: string; // TIMESTAMPTZ
  updated_at: string; // TIMESTAMPTZ
}

export interface ServiceInsert extends Omit<ServiceRow, 'id' | 'created_at' | 'updated_at'> {
  id?: string;
  created_at?: string;
  updated_at?: string;
}

export interface ServiceUpdate extends Partial<ServiceInsert> {}

// ========================================
// QA SESSIONS TABLE
// ========================================

export interface QASessionRow {
  // Primary key
  id: string; // UUID
  session_id: string; // Unique session identifier

  // Tenant reference
  tenant_id: string | null; // UUID

  // Link to product or service
  item_type: 'product' | 'service';
  item_id: string; // UUID
  item_name: string;

  // Session data
  current_data: Partial<CompleteProduct | CompleteService>; // JSONB
  missing_fields: string[]; // JSONB
  completeness_score: number; // DECIMAL 0-1

  // Questions and answers
  questions_asked: Array<{
    question_id: string;
    field_name: string;
    section: 'A' | 'B' | 'C';
    question_text: string;
    question_type: 'open_ended' | 'multiple_choice' | 'yes_no' | 'numeric' | 'list';
    options?: string[];
    context?: string;
    priority: 'critical' | 'high' | 'medium' | 'low';
    asked_at: string;
  }>; // JSONB

  answers_received: Array<{
    question_id: string;
    answer_text: string;
    confidence: number;
    parsed_value: any;
    answered_at: string;
  }>; // JSONB

  // Session status
  status: 'active' | 'completed' | 'abandoned';

  // Timestamps
  created_at: string; // TIMESTAMPTZ
  updated_at: string; // TIMESTAMPTZ
  completed_at: string | null; // TIMESTAMPTZ
}

export interface QASessionInsert extends Omit<QASessionRow, 'id' | 'created_at' | 'updated_at'> {
  id?: string;
  created_at?: string;
  updated_at?: string;
}

export interface QASessionUpdate extends Partial<QASessionInsert> {}

// ========================================
// DATABASE TYPE (all tables)
// ========================================

export interface Database {
  public: {
    Tables: {
      products: {
        Row: ProductRow;
        Insert: ProductInsert;
        Update: ProductUpdate;
      };
      services: {
        Row: ServiceRow;
        Insert: ServiceInsert;
        Update: ServiceUpdate;
      };
      qa_sessions: {
        Row: QASessionRow;
        Insert: QASessionInsert;
        Update: QASessionUpdate;
      };
      // Add other tables as needed
    };
  };
}

// ========================================
// HELPER TYPES
// ========================================

/**
 * Union type for product or service
 */
export type ProductOrService = ProductRow | ServiceRow;

/**
 * Type guard to check if item is a product
 */
export function isProduct(item: ProductOrService): item is ProductRow {
  return item.item_type === 'product';
}

/**
 * Type guard to check if item is a service
 */
export function isService(item: ProductOrService): item is ServiceRow {
  return item.item_type === 'service';
}

/**
 * Extract structured data from product/service row
 */
export type ExtractedProductData = {
  identity: Partial<ProductIdentity>;
  value_proposition: Partial<ProductValueProposition>;
  go_to_market: Partial<ProductGTM>;
};

export type ExtractedServiceData = {
  identity: Partial<ServiceIdentity>;
  delivery: Partial<ServiceDelivery>;
  pricing_sla: Partial<ServicePricingSLA>;
};

export default Database;
