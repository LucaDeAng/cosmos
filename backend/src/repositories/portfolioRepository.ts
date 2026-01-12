import { supabase } from '../config/supabase';
import type { PortfolioAssessmentResult, PortfolioItem } from '../agents/schemas/portfolioAssessmentSchema';

/**
 * Salva o aggiorna un portfolio assessment
 */
export async function savePortfolioAssessment(assessment: PortfolioAssessmentResult) {
  try {
    const { data, error } = await supabase
      .from('portfolio_assessments')
      .upsert({
        assessment_id: assessment.assessmentId,
        tenant_id: assessment.tenantId,
        company_id: assessment.companyId,
        portfolio_type: assessment.portfolioType,
        total_items: assessment.totalItems,
        assessed_items: assessment.assessedItems,
        portfolio_health: assessment.portfolioHealth,
        recommendation_distribution: assessment.recommendationDistribution,
        executive_summary: assessment.executiveSummary,
        result: assessment,
        created_at: assessment.createdAt,
      }, { onConflict: 'assessment_id' })
      .select();

    if (error) {
      console.error('Error saving portfolio assessment:', error);
      return null;
    }

    return data;
  } catch (err) {
    console.error('Exception saving portfolio assessment:', err);
    return null;
  }
}

/**
 * Recupera un portfolio assessment per ID
 */
export async function getPortfolioAssessment(assessmentId: string) {
  try {
    const { data, error } = await supabase
      .from('portfolio_assessments')
      .select('*')
      .eq('assessment_id', assessmentId)
      .maybeSingle();

    if (error) {
      console.error('Error fetching portfolio assessment:', error);
      return null;
    }

    return data?.result as PortfolioAssessmentResult | null;
  } catch (err) {
    console.error('Exception fetching portfolio assessment:', err);
    return null;
  }
}

/**
 * Recupera l'ultimo portfolio assessment per tenant
 */
export async function getLatestPortfolioAssessment(tenantId: string) {
  try {
    const { data, error } = await supabase
      .from('portfolio_assessments')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('Error fetching latest portfolio assessment:', error);
      return null;
    }

    return data?.result as PortfolioAssessmentResult | null;
  } catch (err) {
    console.error('Exception fetching latest portfolio assessment:', err);
    return null;
  }
}

/**
 * Lista tutti i portfolio assessments per tenant
 */
export async function listPortfolioAssessments(tenantId: string, limit = 10) {
  try {
    const { data, error } = await supabase
      .from('portfolio_assessments')
      .select('assessment_id, portfolio_type, total_items, portfolio_health, created_at')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Error listing portfolio assessments:', error);
      return [];
    }

    return data || [];
  } catch (err) {
    console.error('Exception listing portfolio assessments:', err);
    return [];
  }
}

/**
 * Salva items del portfolio (prodotti, servizi)
 */
export async function savePortfolioItems(
  items: PortfolioItem[],
  tenantId: string,
  tableName: 'products' | 'services'
) {
  // Mappa ai nomi tabella corretti
  const tableNameMap: Record<string, string> = {
    products: 'portfolio_products',
    services: 'portfolio_services',
  };
  const actualTable = tableNameMap[tableName] || tableName;
  
  console.log(`💾 savePortfolioItems: table=${actualTable}, items=${items.length}, tenantId=${tenantId}`);
  
  try {
    // Base fields common to all tables
    const baseFields = {
      id: (item: PortfolioItem) => item.id,
      tenant_id: () => tenantId,
      name: (item: PortfolioItem) => item.name,
      description: (item: PortfolioItem) => item.description,
      status: (item: PortfolioItem) => item.status,
      budget: (item: PortfolioItem) => item.budget,
      risk_level: (item: PortfolioItem) => item.riskLevel,
      complexity: (item: PortfolioItem) => item.complexity,
      tags: (item: PortfolioItem) => item.tags,
      owner: (item: PortfolioItem) => item.owner,
      category: (item: PortfolioItem) => item.category,
      actual_cost: (item: PortfolioItem) => item.actualCost,
      // IMPORTANT: strategic_alignment and business_value are now in all 3 tables
      strategic_alignment: (item: PortfolioItem) => item.strategicAlignment,
      business_value: (item: PortfolioItem) => item.businessValue,
      resource_requirement: (item: PortfolioItem) => item.resourceRequirement,
      time_to_value: (item: PortfolioItem) => item.timeToValue,
      roi: (item: PortfolioItem) => item.roi,
    };

    const mappedItems = items.map(item => {
      const mapped: any = {};

      // Apply base fields (includes strategic_alignment and business_value for all types)
      Object.entries(baseFields).forEach(([key, getter]) => {
        mapped[key] = getter(item);
      });

      return mapped;
    });

    console.log(`💾 Mapped items:`, JSON.stringify(mappedItems, null, 2));

    const { data, error } = await supabase
      .from(actualTable)
      .upsert(mappedItems, { onConflict: 'id' })
      .select();

    if (error) {
      console.error(`❌ Error saving ${actualTable}:`, error);
      return null;
    }

    console.log(`✅ Saved to ${actualTable}:`, data?.length, 'items');
    return data;
  } catch (err) {
    console.error(`Exception saving ${actualTable}:`, err);
    return null;
  }
}

/**
 * Recupera items del portfolio per tenant
 */
export async function getPortfolioItems(
  tenantId: string,
  tableName: 'products' | 'services',
  filters?: {
    status?: string;
    category?: string;
    limit?: number;
  }
) {
  // Mappa ai nomi tabella corretti
  const tableNameMap: Record<string, string> = {
    products: 'portfolio_products',
    services: 'portfolio_services',
  };
  const actualTable = tableNameMap[tableName] || tableName;
  
  try {
    let query = supabase
      .from(actualTable)
      .select('*')
      .eq('tenant_id', tenantId);

    if (filters?.status) {
      query = query.eq('status', filters.status);
    }
    if (filters?.category) {
      query = query.eq('category', filters.category);
    }

    const { data, error } = await query
      .order('created_at', { ascending: false })
      .limit(filters?.limit || 100);

    if (error) {
      console.error(`Error fetching ${tableName}:`, error);
      return [];
    }

    // Map snake_case database fields to camelCase for API response
    const mappedData = (data || []).map(item => ({
      id: item.id,
      name: item.name,
      type: tableName === 'products' ? 'product' : 'service',
      description: item.description,
      status: item.status,
      owner: item.owner,
      startDate: item.start_date,
      endDate: item.end_date,
      budget: item.budget,
      actualCost: item.actual_cost,
      strategicAlignment: item.strategic_alignment,
      businessValue: item.business_value,
      riskLevel: item.risk_level,
      complexity: item.complexity,
      resourceRequirement: item.resource_requirement,
      timeToValue: item.time_to_value,
      roi: item.roi,
      category: item.category,
      tags: item.tags,
      dependencies: item.dependencies,
      kpis: item.kpis,
      createdAt: item.created_at,
      updatedAt: item.updated_at,
    }));

    return mappedData;
  } catch (err) {
    console.error(`Exception fetching ${tableName}:`, err);
    return [];
  }
}

/**
 * Salva la cronologia di un'estrazione documento
 */
export interface DocumentExtractionRecord {
  tenantId: string;
  fileName: string;
  fileType: string;
  fileSize?: number;
  totalExtracted: number;
  itemsByType: {
    products: number;
    services: number;
  };
  confidence: 'high' | 'medium' | 'low';
  warnings: string[];
  modelUsed: string;
  processingTimeMs: number;
  extractedItems: unknown[];
  status: 'processing' | 'completed' | 'failed' | 'partial';
  errorMessage?: string;
}

export async function saveDocumentExtraction(extraction: DocumentExtractionRecord) {
  try {
    const { data, error } = await supabase
      .from('document_extractions')
      .insert({
        tenant_id: extraction.tenantId,
        file_name: extraction.fileName,
        file_type: extraction.fileType,
        file_size: extraction.fileSize,
        total_extracted: extraction.totalExtracted,
        items_by_type: extraction.itemsByType,
        confidence: extraction.confidence,
        warnings: extraction.warnings,
        model_used: extraction.modelUsed,
        processing_time_ms: extraction.processingTimeMs,
        extracted_items: extraction.extractedItems,
        status: extraction.status,
        error_message: extraction.errorMessage,
      })
      .select()
      .single();

    if (error) {
      console.error('Error saving document extraction:', error);
      return null;
    }

    return data;
  } catch (err) {
    console.error('Exception saving document extraction:', err);
    return null;
  }
}

/**
 * Recupera le estrazioni documenti per tenant
 */
export async function getDocumentExtractions(tenantId: string, limit = 20) {
  try {
    const { data, error } = await supabase
      .from('document_extractions')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Error fetching document extractions:', error);
      return [];
    }

    return data || [];
  } catch (err) {
    console.error('Exception fetching document extractions:', err);
    return [];
  }
}

/**
 * Recupera statistiche estrazioni per tenant
 */
export async function getExtractionStats(tenantId: string) {
  try {
    const { data, error } = await supabase
      .from('document_extractions')
      .select('total_extracted, items_by_type, confidence, status')
      .eq('tenant_id', tenantId);

    if (error) {
      console.error('Error fetching extraction stats:', error);
      return null;
    }

    if (!data || data.length === 0) {
      return {
        totalDocuments: 0,
        totalItemsExtracted: 0,
        byType: { products: 0, services: 0 },
        avgConfidence: 'medium',
        successRate: 0,
      };
    }

    const stats = data.reduce((acc, doc) => {
      acc.totalDocuments++;
      acc.totalItemsExtracted += doc.total_extracted || 0;
      if (doc.items_by_type) {
        acc.byType.products += doc.items_by_type.products || 0;
        acc.byType.services += doc.items_by_type.services || 0;
      }
      if (doc.status === 'completed') acc.completed++;
      return acc;
    }, {
      totalDocuments: 0,
      totalItemsExtracted: 0,
      byType: { products: 0, services: 0 },
      completed: 0,
    });

    return {
      totalDocuments: stats.totalDocuments,
      totalItemsExtracted: stats.totalItemsExtracted,
      byType: stats.byType,
      avgConfidence: 'medium', // Simplified
      successRate: stats.totalDocuments > 0 ? (stats.completed / stats.totalDocuments) * 100 : 0,
    };
  } catch (err) {
    console.error('Exception fetching extraction stats:', err);
    return null;
  }
}

export default {
  savePortfolioAssessment,
  getPortfolioAssessment,
  getLatestPortfolioAssessment,
  listPortfolioAssessments,
  savePortfolioItems,
  getPortfolioItems,
  saveDocumentExtraction,
  getDocumentExtractions,
  getExtractionStats,
};
