/**
 * Company Sector Detector
 *
 * Auto-detects company sector for intelligent source selection:
 * 1. From company assessment data
 * 2. From portfolio item analysis
 * 3. Semantic analysis fallback
 */

import type { SectorCode } from '../types';

// ============================================================================
// TYPES
// ============================================================================

export interface CompanySectorProfile {
  companyId: string;
  primarySector: SectorCode;
  secondarySectors: SectorCode[];
  sectorConfidence: number;
  detectedFrom: 'assessment' | 'portfolio_analysis' | 'manual' | 'inferred';
  lastUpdated: Date;
}

export interface PortfolioItem {
  name: string;
  description?: string;
  category?: string;
  vendor?: string;
}

// ============================================================================
// SECTOR KEYWORDS
// ============================================================================

const SECTOR_KEYWORDS: Record<SectorCode, Array<{ keyword: string; weight: number }>> = {
  it_software: [
    { keyword: 'software', weight: 1.5 },
    { keyword: 'cloud', weight: 1.3 },
    { keyword: 'saas', weight: 1.5 },
    { keyword: 'api', weight: 1.2 },
    { keyword: 'platform', weight: 1.1 },
    { keyword: 'application', weight: 1.0 },
    { keyword: 'devops', weight: 1.3 },
    { keyword: 'database', weight: 1.2 },
    { keyword: 'microsoft', weight: 0.9 },
    { keyword: 'oracle', weight: 0.9 },
    { keyword: 'aws', weight: 1.0 },
  ],
  hr_payroll: [
    { keyword: 'payroll', weight: 1.8 },
    { keyword: 'hris', weight: 1.7 },
    { keyword: 'workday', weight: 1.5 },
    { keyword: 'talent', weight: 1.3 },
    { keyword: 'recruiting', weight: 1.4 },
    { keyword: 'benefits', weight: 1.2 },
    { keyword: 'employee', weight: 1.0 },
    { keyword: 'human resources', weight: 1.6 },
    { keyword: 'learning management', weight: 1.3 },
  ],
  retail_ecommerce: [
    { keyword: 'ecommerce', weight: 1.8 },
    { keyword: 'shopify', weight: 1.6 },
    { keyword: 'retail', weight: 1.5 },
    { keyword: 'pos', weight: 1.6 },
    { keyword: 'point of sale', weight: 1.6 },
    { keyword: 'inventory', weight: 1.3 },
    { keyword: 'marketplace', weight: 1.4 },
    { keyword: 'store', weight: 1.1 },
  ],
  supply_chain_logistics: [
    { keyword: 'supply chain', weight: 1.8 },
    { keyword: 'logistics', weight: 1.7 },
    { keyword: 'procurement', weight: 1.6 },
    { keyword: 'warehouse', weight: 1.5 },
    { keyword: 'transportation', weight: 1.4 },
    { keyword: 'shipping', weight: 1.3 },
    { keyword: 'fulfillment', weight: 1.4 },
    { keyword: 'wms', weight: 1.6 },
    { keyword: 'tms', weight: 1.6 },
  ],
  real_estate: [
    { keyword: 'real estate', weight: 1.8 },
    { keyword: 'property', weight: 1.6 },
    { keyword: 'facility', weight: 1.5 },
    { keyword: 'building', weight: 1.2 },
    { keyword: 'lease', weight: 1.4 },
    { keyword: 'cafm', weight: 1.7 },
    { keyword: 'iwms', weight: 1.7 },
  ],
  banking: [
    { keyword: 'banking', weight: 1.8 },
    { keyword: 'core banking', weight: 1.9 },
    { keyword: 'payment', weight: 1.5 },
    { keyword: 'lending', weight: 1.6 },
    { keyword: 'wealth', weight: 1.4 },
    { keyword: 'treasury', weight: 1.5 },
    { keyword: 'swift', weight: 1.3 },
  ],
  insurance: [
    { keyword: 'insurance', weight: 1.8 },
    { keyword: 'policy', weight: 1.4 },
    { keyword: 'claims', weight: 1.6 },
    { keyword: 'underwriting', weight: 1.7 },
    { keyword: 'actuarial', weight: 1.8 },
    { keyword: 'guidewire', weight: 1.6 },
  ],
  food_beverage: [
    { keyword: 'food', weight: 1.6 },
    { keyword: 'beverage', weight: 1.6 },
    { keyword: 'organic', weight: 1.3 },
    { keyword: 'restaurant', weight: 1.4 },
  ],
  consumer_goods: [
    { keyword: 'consumer', weight: 1.3 },
    { keyword: 'cosmetic', weight: 1.5 },
    { keyword: 'beauty', weight: 1.5 },
    { keyword: 'personal care', weight: 1.4 },
  ],
  healthcare_pharma: [
    { keyword: 'healthcare', weight: 1.6 },
    { keyword: 'pharmaceutical', weight: 1.7 },
    { keyword: 'medical', weight: 1.5 },
    { keyword: 'hospital', weight: 1.4 },
  ],
  industrial: [
    { keyword: 'industrial', weight: 1.5 },
    { keyword: 'manufacturing', weight: 1.6 },
    { keyword: 'machinery', weight: 1.5 },
  ],
  financial_services: [
    { keyword: 'financial', weight: 1.4 },
    { keyword: 'investment', weight: 1.5 },
    { keyword: 'fintech', weight: 1.6 },
  ],
  professional_services: [
    { keyword: 'consulting', weight: 1.5 },
    { keyword: 'professional services', weight: 1.6 },
    { keyword: 'audit', weight: 1.4 },
  ],
  automotive: [
    { keyword: 'automotive', weight: 1.7 },
    { keyword: 'vehicle', weight: 1.5 },
    { keyword: 'electric', weight: 1.3 },
  ],
  unknown: [],
};

// ============================================================================
// MAIN FUNCTIONS
// ============================================================================

/**
 * Detects company sector from portfolio items
 */
export async function detectCompanySector(
  companyId: string,
  portfolioItems?: PortfolioItem[]
): Promise<CompanySectorProfile> {
  // Strategy 1: Analyze portfolio items if available
  if (portfolioItems && portfolioItems.length >= 3) {
    const analysis = analyzePortfolioSectors(portfolioItems);
    return {
      companyId,
      primarySector: analysis.primary,
      secondarySectors: analysis.secondary,
      sectorConfidence: analysis.confidence,
      detectedFrom: 'portfolio_analysis',
      lastUpdated: new Date(),
    };
  }

  // Strategy 2: Default to unknown (will use universal sources)
  return {
    companyId,
    primarySector: 'unknown',
    secondarySectors: [],
    sectorConfidence: 0.3,
    detectedFrom: 'inferred',
    lastUpdated: new Date(),
  };
}

/**
 * Analyzes portfolio items to determine sector distribution
 */
function analyzePortfolioSectors(items: PortfolioItem[]): {
  primary: SectorCode;
  secondary: SectorCode[];
  confidence: number;
} {
  const sectorScores: Record<SectorCode, number> = {} as Record<SectorCode, number>;

  // Initialize scores
  Object.keys(SECTOR_KEYWORDS).forEach(sector => {
    sectorScores[sector as SectorCode] = 0;
  });

  // Score each item
  for (const item of items) {
    const text = `${item.name} ${item.description || ''} ${item.category || ''} ${item.vendor || ''}`.toLowerCase();

    for (const [sector, keywords] of Object.entries(SECTOR_KEYWORDS)) {
      for (const { keyword, weight } of keywords) {
        if (text.includes(keyword.toLowerCase())) {
          sectorScores[sector as SectorCode] += weight;
        }
      }
    }
  }

  // Sort sectors by score
  const sortedSectors = (Object.entries(sectorScores) as Array<[SectorCode, number]>)
    .filter(([sector]) => sector !== 'unknown')
    .sort((a, b) => b[1] - a[1]);

  if (sortedSectors.length === 0 || sortedSectors[0][1] === 0) {
    return {
      primary: 'unknown',
      secondary: [],
      confidence: 0.3,
    };
  }

  const primary = sortedSectors[0][0];
  const primaryScore = sortedSectors[0][1];

  // Determine secondary sectors (score >= 30% of primary)
  const secondary = sortedSectors
    .slice(1)
    .filter(([, score]) => score >= primaryScore * 0.3)
    .slice(0, 2) // Max 2 secondary sectors
    .map(([sector]) => sector);

  // Calculate confidence based on score distribution
  const totalScore = Object.values(sectorScores).reduce((sum, score) => sum + score, 0);
  const confidence = totalScore > 0
    ? Math.min(0.95, primaryScore / totalScore + 0.3)
    : 0.3;

  return {
    primary,
    secondary,
    confidence,
  };
}

/**
 * Gets recommended sources for a sector profile
 */
export function getRecommendedSourcesForSector(sector: SectorCode): string[] {
  const sourceMap: Record<SectorCode, string[]> = {
    it_software: ['icecat', 'company_catalog', 'google_taxonomy'],
    hr_payroll: ['hr_payroll', 'company_catalog'],
    retail_ecommerce: ['retail_ecommerce', 'company_catalog', 'google_taxonomy'],
    supply_chain_logistics: ['supply_chain', 'company_catalog', 'unspsc'],
    real_estate: ['real_estate', 'company_catalog'],
    banking: ['banking', 'company_catalog', 'gleif'],
    insurance: ['insurance', 'company_catalog'],
    food_beverage: ['open_food_facts', 'company_catalog', 'gs1_taxonomy'],
    consumer_goods: ['open_beauty_facts', 'company_catalog', 'google_taxonomy'],
    healthcare_pharma: ['openfda', 'rxnorm', 'company_catalog'],
    industrial: ['unspsc', 'company_catalog', 'google_taxonomy'],
    financial_services: ['company_catalog', 'gleif', 'google_taxonomy'],
    professional_services: ['company_catalog', 'google_taxonomy'],
    automotive: ['company_catalog', 'nhtsa', 'google_taxonomy'],
    unknown: ['company_catalog', 'google_taxonomy', 'schema_org'],
  };

  return sourceMap[sector] || ['company_catalog'];
}

// ============================================================================
// EXPORT
// ============================================================================

export default {
  detectCompanySector,
  analyzePortfolioSectors,
  getRecommendedSourcesForSector,
};
