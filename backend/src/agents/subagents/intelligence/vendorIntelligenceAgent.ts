/**
 * Vendor Intelligence Agent
 *
 * Aggregates vendor risk, pricing benchmarks, and market intelligence.
 *
 * Capabilities:
 * 1. Vendor Profile - Company info, size, stability
 * 2. Risk Assessment - Financial health, support quality, lock-in
 * 3. Pricing Intelligence - Benchmarks, negotiation leverage
 * 4. Market Position - Competitive landscape, alternatives
 * 5. Consolidation Opportunities - Multi-vendor optimization
 */

import { SubAgent, SubAgentResult } from '../types';

// ============================================================================
// Types
// ============================================================================

export interface PortfolioItem {
  id: string;
  name: string;
  type: 'product' | 'service';
  category?: string;
  vendor?: string;
  budget?: number;
  pricing_model?: string;
  license_type?: string;
  user_count?: number;
  contract_end_date?: string;
  description?: string;
}

export interface VendorProfile {
  name: string;
  normalizedName: string;
  headquarters?: string;
  founded?: number;
  size: 'startup' | 'smb' | 'enterprise' | 'global';
  publicCompany: boolean;
  revenue?: string;
  employeeCount?: string;
  industries: string[];
  productCount: number;
  marketPresence: 'niche' | 'regional' | 'national' | 'global';
  portfolioSpend: number;
  portfolioItemCount: number;
}

export interface VendorRisk {
  overallScore: number;  // 0-100, higher = riskier
  financialHealth: number;
  marketStability: number;
  supportQuality: number;
  securityPosture: number;
  lockInRisk: number;
  concentrationRisk: number;
  factors: VendorRiskFactor[];
}

export interface VendorRiskFactor {
  category: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  mitigation?: string;
}

export interface PricingIntelligence {
  pricingModel: 'subscription' | 'perpetual' | 'usage' | 'hybrid' | 'unknown';
  benchmarkPosition: 'below_market' | 'at_market' | 'above_market' | 'unknown';
  negotiationLeverage: 'low' | 'medium' | 'high';
  renewalRisk: number;  // 0-100
  volumeDiscount: boolean;
  competitivePressure: number;  // 0-100
  suggestedActions: string[];
}

export interface AlternativeVendor {
  name: string;
  matchScore: number;  // 0-100
  advantages: string[];
  disadvantages: string[];
  migrationComplexity: 'low' | 'medium' | 'high';
  estimatedSavings?: string;
  category: string;
}

export interface ConsolidationOpportunity {
  currentVendors: string[];
  targetVendor: string;
  products: string[];
  rationale: string;
  estimatedSavings: string;
  effort: 'low' | 'medium' | 'high';
  risk: 'low' | 'medium' | 'high';
}

export interface VendorIntelligence {
  vendorProfiles: VendorProfile[];
  riskAssessments: Map<string, VendorRisk>;
  pricingIntelligence: Map<string, PricingIntelligence>;
  alternatives: AlternativeVendor[];
  consolidationOpportunities: ConsolidationOpportunity[];
  topVendorsBySpend: { vendor: string; spend: number; percentage: number }[];
  summary: string;
  recommendations: string[];
}

// ============================================================================
// Known Vendor Database
// ============================================================================

interface VendorData {
  name: string;
  headquarters: string;
  founded: number;
  size: 'startup' | 'smb' | 'enterprise' | 'global';
  publicCompany: boolean;
  revenue?: string;
  employeeCount?: string;
  industries: string[];
  marketPresence: 'niche' | 'regional' | 'national' | 'global';
  pricingModel: 'subscription' | 'perpetual' | 'usage' | 'hybrid';
  competitivePosition: number;  // 1-5 (5 = market leader)
  alternatives: string[];
  riskFactors: string[];
  strengths: string[];
}

const VENDOR_DATABASE: Record<string, VendorData> = {
  'microsoft': {
    name: 'Microsoft',
    headquarters: 'Redmond, WA, USA',
    founded: 1975,
    size: 'global',
    publicCompany: true,
    revenue: '$211B+',
    employeeCount: '220,000+',
    industries: ['Technology', 'Cloud', 'Enterprise Software'],
    marketPresence: 'global',
    pricingModel: 'subscription',
    competitivePosition: 5,
    alternatives: ['Google Workspace', 'Salesforce', 'AWS'],
    riskFactors: ['Vendor lock-in', 'Complex licensing'],
    strengths: ['Integrated suite', 'Enterprise support', 'Market leader']
  },
  'salesforce': {
    name: 'Salesforce',
    headquarters: 'San Francisco, CA, USA',
    founded: 1999,
    size: 'global',
    publicCompany: true,
    revenue: '$31B+',
    employeeCount: '73,000+',
    industries: ['CRM', 'Cloud', 'Enterprise Software'],
    marketPresence: 'global',
    pricingModel: 'subscription',
    competitivePosition: 5,
    alternatives: ['Microsoft Dynamics', 'HubSpot', 'Zoho CRM'],
    riskFactors: ['High cost', 'Complex implementation'],
    strengths: ['CRM leader', 'Ecosystem', 'Innovation']
  },
  'aws': {
    name: 'Amazon Web Services',
    headquarters: 'Seattle, WA, USA',
    founded: 2006,
    size: 'global',
    publicCompany: true,
    revenue: '$80B+',
    employeeCount: '100,000+',
    industries: ['Cloud Infrastructure', 'Technology'],
    marketPresence: 'global',
    pricingModel: 'usage',
    competitivePosition: 5,
    alternatives: ['Microsoft Azure', 'Google Cloud', 'Oracle Cloud'],
    riskFactors: ['Vendor lock-in', 'Cost complexity'],
    strengths: ['Market leader', 'Service breadth', 'Global infrastructure']
  },
  'oracle': {
    name: 'Oracle',
    headquarters: 'Austin, TX, USA',
    founded: 1977,
    size: 'global',
    publicCompany: true,
    revenue: '$50B+',
    employeeCount: '140,000+',
    industries: ['Database', 'Enterprise Software', 'Cloud'],
    marketPresence: 'global',
    pricingModel: 'hybrid',
    competitivePosition: 4,
    alternatives: ['Microsoft SQL Server', 'PostgreSQL', 'MySQL'],
    riskFactors: ['High cost', 'Aggressive licensing', 'Audit risk'],
    strengths: ['Database leader', 'Enterprise features', 'Comprehensive stack']
  },
  'sap': {
    name: 'SAP',
    headquarters: 'Walldorf, Germany',
    founded: 1972,
    size: 'global',
    publicCompany: true,
    revenue: '$32B+',
    employeeCount: '110,000+',
    industries: ['ERP', 'Enterprise Software', 'Cloud'],
    marketPresence: 'global',
    pricingModel: 'hybrid',
    competitivePosition: 5,
    alternatives: ['Oracle ERP', 'Microsoft Dynamics', 'Workday'],
    riskFactors: ['Complex implementation', 'High TCO'],
    strengths: ['ERP leader', 'Industry solutions', 'Global presence']
  },
  'google': {
    name: 'Google',
    headquarters: 'Mountain View, CA, USA',
    founded: 1998,
    size: 'global',
    publicCompany: true,
    revenue: '$280B+',
    employeeCount: '180,000+',
    industries: ['Cloud', 'Technology', 'Advertising'],
    marketPresence: 'global',
    pricingModel: 'subscription',
    competitivePosition: 4,
    alternatives: ['Microsoft 365', 'AWS', 'Azure'],
    riskFactors: ['Product discontinuation history'],
    strengths: ['Innovation', 'AI/ML', 'Developer friendly']
  },
  'servicenow': {
    name: 'ServiceNow',
    headquarters: 'Santa Clara, CA, USA',
    founded: 2004,
    size: 'enterprise',
    publicCompany: true,
    revenue: '$7B+',
    employeeCount: '20,000+',
    industries: ['ITSM', 'Enterprise Software'],
    marketPresence: 'global',
    pricingModel: 'subscription',
    competitivePosition: 5,
    alternatives: ['Jira Service Management', 'BMC Helix', 'Freshservice'],
    riskFactors: ['High cost per user', 'Implementation complexity'],
    strengths: ['ITSM leader', 'Workflow automation', 'Platform approach']
  },
  'vmware': {
    name: 'VMware (Broadcom)',
    headquarters: 'Palo Alto, CA, USA',
    founded: 1998,
    size: 'global',
    publicCompany: false,  // Now part of Broadcom
    revenue: '$13B+',
    employeeCount: '35,000+',
    industries: ['Virtualization', 'Cloud Infrastructure'],
    marketPresence: 'global',
    pricingModel: 'subscription',
    competitivePosition: 4,
    alternatives: ['Microsoft Hyper-V', 'Nutanix', 'Proxmox'],
    riskFactors: ['Broadcom acquisition uncertainty', 'Licensing changes'],
    strengths: ['Virtualization leader', 'Mature platform']
  },
  'atlassian': {
    name: 'Atlassian',
    headquarters: 'Sydney, Australia',
    founded: 2002,
    size: 'enterprise',
    publicCompany: true,
    revenue: '$3.5B+',
    employeeCount: '10,000+',
    industries: ['DevOps', 'Collaboration'],
    marketPresence: 'global',
    pricingModel: 'subscription',
    competitivePosition: 4,
    alternatives: ['GitHub', 'GitLab', 'Monday.com'],
    riskFactors: ['Cloud-only future', 'Price increases'],
    strengths: ['Developer tools', 'Integration ecosystem']
  },
  'ibm': {
    name: 'IBM',
    headquarters: 'Armonk, NY, USA',
    founded: 1911,
    size: 'global',
    publicCompany: true,
    revenue: '$60B+',
    employeeCount: '280,000+',
    industries: ['Technology', 'Consulting', 'Cloud'],
    marketPresence: 'global',
    pricingModel: 'hybrid',
    competitivePosition: 3,
    alternatives: ['AWS', 'Microsoft', 'Red Hat'],
    riskFactors: ['Legacy perception', 'Complex pricing'],
    strengths: ['Enterprise relationships', 'Hybrid cloud', 'AI/Watson']
  }
};

// Vendor name normalizations
const VENDOR_ALIASES: Record<string, string> = {
  'ms': 'microsoft',
  'msft': 'microsoft',
  'microsoft corporation': 'microsoft',
  'microsoft corp': 'microsoft',
  'amazon web services': 'aws',
  'amazon': 'aws',
  'google cloud': 'google',
  'gcp': 'google',
  'google cloud platform': 'google',
  'salesforce.com': 'salesforce',
  'sfdc': 'salesforce',
  'service now': 'servicenow',
  'vmware inc': 'vmware',
  'atlassian corp': 'atlassian',
  'oracle corporation': 'oracle',
  'sap se': 'sap',
  'sap ag': 'sap',
  'international business machines': 'ibm'
};

// ============================================================================
// Analysis Functions
// ============================================================================

/**
 * Normalize vendor name
 */
function normalizeVendorName(vendor: string): string {
  const lower = vendor.toLowerCase().trim();
  return VENDOR_ALIASES[lower] || lower;
}

/**
 * Get vendor data from database
 */
function getVendorData(vendor: string): VendorData | undefined {
  const normalized = normalizeVendorName(vendor);
  return VENDOR_DATABASE[normalized];
}

/**
 * Build vendor profile from portfolio items
 */
function buildVendorProfile(
  vendor: string,
  items: PortfolioItem[]
): VendorProfile {
  const vendorData = getVendorData(vendor);
  const normalizedName = normalizeVendorName(vendor);

  const totalSpend = items.reduce((sum, i) => sum + (i.budget || 0), 0);

  if (vendorData) {
    return {
      name: vendorData.name,
      normalizedName,
      headquarters: vendorData.headquarters,
      founded: vendorData.founded,
      size: vendorData.size,
      publicCompany: vendorData.publicCompany,
      revenue: vendorData.revenue,
      employeeCount: vendorData.employeeCount,
      industries: vendorData.industries,
      productCount: items.length,
      marketPresence: vendorData.marketPresence,
      portfolioSpend: totalSpend,
      portfolioItemCount: items.length
    };
  }

  // Unknown vendor - estimate based on portfolio
  return {
    name: vendor,
    normalizedName,
    size: totalSpend > 100000 ? 'enterprise' : 'smb',
    publicCompany: false,
    industries: [...new Set(items.map(i => i.category).filter(Boolean))] as string[],
    productCount: items.length,
    marketPresence: 'regional',
    portfolioSpend: totalSpend,
    portfolioItemCount: items.length
  };
}

/**
 * Assess vendor risk
 */
function assessVendorRisk(
  vendor: string,
  items: PortfolioItem[],
  totalPortfolioSpend: number
): VendorRisk {
  const vendorData = getVendorData(vendor);
  const factors: VendorRiskFactor[] = [];

  let financialHealth = 70;
  let marketStability = 70;
  let supportQuality = 70;
  let securityPosture = 70;
  let lockInRisk = 50;

  // Calculate concentration risk
  const vendorSpend = items.reduce((sum, i) => sum + (i.budget || 0), 0);
  const concentrationRatio = totalPortfolioSpend > 0 ? vendorSpend / totalPortfolioSpend : 0;
  const concentrationRisk = Math.round(concentrationRatio * 100);

  if (concentrationRatio > 0.4) {
    factors.push({
      category: 'Concentration',
      description: `High concentration: ${Math.round(concentrationRatio * 100)}% of portfolio spend`,
      severity: 'high',
      mitigation: 'Evaluate alternatives and diversification strategy'
    });
  }

  if (vendorData) {
    // Known vendor - use data
    if (vendorData.publicCompany) {
      financialHealth = 85;
    }

    if (vendorData.size === 'global') {
      marketStability = 85;
      supportQuality = 80;
    } else if (vendorData.size === 'startup') {
      financialHealth = 50;
      marketStability = 40;
      factors.push({
        category: 'Financial',
        description: 'Startup vendor - financial stability uncertain',
        severity: 'medium',
        mitigation: 'Monitor vendor health and have contingency plans'
      });
    }

    if (vendorData.competitivePosition >= 4) {
      marketStability += 10;
    }

    // Check for known risk factors
    for (const risk of vendorData.riskFactors) {
      if (risk.includes('lock-in')) {
        lockInRisk += 20;
        factors.push({
          category: 'Lock-in',
          description: `Vendor lock-in risk: ${risk}`,
          severity: 'medium',
          mitigation: 'Evaluate portability and migration options'
        });
      }
      if (risk.includes('cost') || risk.includes('licensing')) {
        factors.push({
          category: 'Cost',
          description: risk,
          severity: 'medium',
          mitigation: 'Negotiate terms and track usage carefully'
        });
      }
    }

    // VMware/Broadcom specific warning
    if (vendorData.name === 'VMware (Broadcom)') {
      factors.push({
        category: 'Strategic',
        description: 'Recent acquisition by Broadcom - pricing and strategy changes expected',
        severity: 'high',
        mitigation: 'Evaluate alternatives and plan for potential cost increases'
      });
      marketStability -= 15;
    }

  } else {
    // Unknown vendor - higher risk
    financialHealth = 50;
    marketStability = 50;
    supportQuality = 50;

    factors.push({
      category: 'Unknown',
      description: 'Limited vendor information available',
      severity: 'medium',
      mitigation: 'Request vendor references and financial information'
    });
  }

  // Number of products affects lock-in
  if (items.length > 3) {
    lockInRisk += items.length * 5;
    factors.push({
      category: 'Lock-in',
      description: `${items.length} products from this vendor increases switching costs`,
      severity: items.length > 5 ? 'high' : 'medium',
      mitigation: 'Document dependencies and maintain portability'
    });
  }

  // Calculate overall score
  const overallScore = Math.round(
    (100 - financialHealth) * 0.2 +
    (100 - marketStability) * 0.2 +
    (100 - supportQuality) * 0.1 +
    (100 - securityPosture) * 0.15 +
    lockInRisk * 0.2 +
    concentrationRisk * 0.15
  );

  return {
    overallScore: Math.min(100, overallScore),
    financialHealth,
    marketStability,
    supportQuality,
    securityPosture,
    lockInRisk: Math.min(100, lockInRisk),
    concentrationRisk,
    factors
  };
}

/**
 * Analyze pricing intelligence
 */
function analyzePricing(
  vendor: string,
  items: PortfolioItem[]
): PricingIntelligence {
  const vendorData = getVendorData(vendor);
  const suggestedActions: string[] = [];

  // Determine pricing model
  const pricingModels = items
    .map(i => i.pricing_model?.toLowerCase())
    .filter(Boolean);

  let pricingModel: PricingIntelligence['pricingModel'] = 'unknown';
  if (pricingModels.includes('subscription')) pricingModel = 'subscription';
  else if (pricingModels.includes('perpetual')) pricingModel = 'perpetual';
  else if (pricingModels.includes('usage')) pricingModel = 'usage';
  else if (vendorData) pricingModel = vendorData.pricingModel;

  // Determine negotiation leverage
  let negotiationLeverage: PricingIntelligence['negotiationLeverage'] = 'medium';
  const totalSpend = items.reduce((sum, i) => sum + (i.budget || 0), 0);

  if (totalSpend > 500000) {
    negotiationLeverage = 'high';
    suggestedActions.push('Leverage significant spend for enterprise discounts');
  } else if (totalSpend < 50000) {
    negotiationLeverage = 'low';
  }

  if (items.length >= 3) {
    suggestedActions.push('Bundle products for volume discount');
  }

  // Benchmark position (would use real market data in production)
  let benchmarkPosition: PricingIntelligence['benchmarkPosition'] = 'unknown';
  if (vendorData) {
    if (['oracle', 'sap', 'servicenow'].includes(normalizeVendorName(vendor))) {
      benchmarkPosition = 'above_market';
      suggestedActions.push('Consider competitive alternatives for price pressure');
    } else if (['atlassian', 'google'].includes(normalizeVendorName(vendor))) {
      benchmarkPosition = 'at_market';
    }
  }

  // Renewal risk
  let renewalRisk = 30;
  const contractEnding = items.filter(i => {
    if (!i.contract_end_date) return false;
    const endDate = new Date(i.contract_end_date);
    const monthsUntil = (endDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24 * 30);
    return monthsUntil < 6;
  });

  if (contractEnding.length > 0) {
    renewalRisk = 70;
    suggestedActions.push(`${contractEnding.length} contract(s) ending soon - start renewal negotiations`);
  }

  // Competitive pressure
  let competitivePressure = 50;
  if (vendorData && vendorData.alternatives.length >= 3) {
    competitivePressure = 70;
    suggestedActions.push(`Evaluate alternatives: ${vendorData.alternatives.slice(0, 3).join(', ')}`);
  }

  // Volume discount potential
  const volumeDiscount = items.length >= 3 || totalSpend > 100000;

  return {
    pricingModel,
    benchmarkPosition,
    negotiationLeverage,
    renewalRisk,
    volumeDiscount,
    competitivePressure,
    suggestedActions
  };
}

/**
 * Find alternative vendors
 */
function findAlternatives(
  vendor: string,
  items: PortfolioItem[]
): AlternativeVendor[] {
  const alternatives: AlternativeVendor[] = [];
  const vendorData = getVendorData(vendor);

  if (!vendorData) return alternatives;

  for (const altName of vendorData.alternatives) {
    const altData = getVendorData(altName);

    alternatives.push({
      name: altName,
      matchScore: Math.round(60 + Math.random() * 30),  // Would use real matching in production
      advantages: altData?.strengths || ['Potential cost savings'],
      disadvantages: ['Migration effort required', 'Learning curve'],
      migrationComplexity: items.length > 3 ? 'high' : items.length > 1 ? 'medium' : 'low',
      estimatedSavings: '10-30%',
      category: vendorData.industries[0] || 'Technology'
    });
  }

  return alternatives.sort((a, b) => b.matchScore - a.matchScore);
}

/**
 * Find consolidation opportunities
 */
function findConsolidationOpportunities(
  vendorItems: Map<string, PortfolioItem[]>
): ConsolidationOpportunity[] {
  const opportunities: ConsolidationOpportunity[] = [];

  // Find vendors with overlapping categories
  const categoryVendors = new Map<string, Set<string>>();

  for (const [vendor, items] of vendorItems) {
    for (const item of items) {
      const category = item.category || 'Other';
      if (!categoryVendors.has(category)) {
        categoryVendors.set(category, new Set());
      }
      categoryVendors.get(category)!.add(vendor);
    }
  }

  // Identify consolidation opportunities
  for (const [category, vendors] of categoryVendors) {
    if (vendors.size > 1) {
      const vendorList = Array.from(vendors);

      // Find the best vendor to consolidate to
      let targetVendor = vendorList[0];
      let maxItems = 0;

      for (const vendor of vendorList) {
        const items = vendorItems.get(vendor) || [];
        if (items.length > maxItems) {
          maxItems = items.length;
          targetVendor = vendor;
        }
      }

      const otherVendors = vendorList.filter(v => v !== targetVendor);
      const productsToMigrate: string[] = [];

      for (const vendor of otherVendors) {
        const items = vendorItems.get(vendor) || [];
        productsToMigrate.push(...items.filter(i => i.category === category).map(i => i.name));
      }

      if (productsToMigrate.length > 0) {
        opportunities.push({
          currentVendors: otherVendors,
          targetVendor,
          products: productsToMigrate,
          rationale: `Consolidate ${category} solutions to single vendor`,
          estimatedSavings: '15-25%',
          effort: productsToMigrate.length > 3 ? 'high' : 'medium',
          risk: 'medium'
        });
      }
    }
  }

  return opportunities;
}

// ============================================================================
// Main Analysis Function
// ============================================================================

/**
 * Analyze vendor intelligence
 */
export async function analyzeVendorIntelligence(
  tenantId: string,
  items: PortfolioItem[]
): Promise<VendorIntelligence> {
  console.log(`\n📊 Analyzing vendor intelligence for tenant ${tenantId}...`);
  console.log(`   Items: ${items.length}`);

  // Group items by vendor
  const vendorItems = new Map<string, PortfolioItem[]>();
  for (const item of items) {
    const vendor = item.vendor || 'Unknown';
    if (!vendorItems.has(vendor)) vendorItems.set(vendor, []);
    vendorItems.get(vendor)!.push(item);
  }

  const totalPortfolioSpend = items.reduce((sum, i) => sum + (i.budget || 0), 0);

  // Build vendor profiles
  const vendorProfiles: VendorProfile[] = [];
  const riskAssessments = new Map<string, VendorRisk>();
  const pricingIntelligence = new Map<string, PricingIntelligence>();
  const allAlternatives: AlternativeVendor[] = [];

  for (const [vendor, vendorItemList] of vendorItems) {
    // Build profile
    const profile = buildVendorProfile(vendor, vendorItemList);
    vendorProfiles.push(profile);

    // Assess risk
    const risk = assessVendorRisk(vendor, vendorItemList, totalPortfolioSpend);
    riskAssessments.set(vendor, risk);

    // Analyze pricing
    const pricing = analyzePricing(vendor, vendorItemList);
    pricingIntelligence.set(vendor, pricing);

    // Find alternatives
    const alternatives = findAlternatives(vendor, vendorItemList);
    allAlternatives.push(...alternatives);
  }

  // Find consolidation opportunities
  const consolidationOpportunities = findConsolidationOpportunities(vendorItems);

  // Top vendors by spend
  const topVendorsBySpend = vendorProfiles
    .map(p => ({
      vendor: p.name,
      spend: p.portfolioSpend,
      percentage: Math.round((p.portfolioSpend / Math.max(totalPortfolioSpend, 1)) * 100)
    }))
    .sort((a, b) => b.spend - a.spend)
    .slice(0, 10);

  // Generate recommendations
  const recommendations: string[] = [];

  // High concentration warnings
  for (const [vendor, risk] of riskAssessments) {
    if (risk.concentrationRisk > 30) {
      recommendations.push(`Reduce ${vendor} concentration (currently ${risk.concentrationRisk}%)`);
    }
    if (risk.overallScore > 60) {
      recommendations.push(`Address high risk score for ${vendor} (${risk.overallScore}/100)`);
    }
  }

  // Consolidation recommendations
  if (consolidationOpportunities.length > 0) {
    recommendations.push(`${consolidationOpportunities.length} vendor consolidation opportunities identified`);
  }

  // Negotiation recommendations
  for (const [vendor, pricing] of pricingIntelligence) {
    if (pricing.renewalRisk > 50) {
      recommendations.push(`Start renewal negotiations for ${vendor} contracts`);
    }
  }

  // Generate summary
  const highRiskVendors = Array.from(riskAssessments.entries())
    .filter(([_, r]) => r.overallScore > 50)
    .length;

  const summary = [
    `Analyzed ${vendorItems.size} vendors across ${items.length} portfolio items.`,
    `Total portfolio spend: €${totalPortfolioSpend.toLocaleString()}.`,
    highRiskVendors > 0 ? `${highRiskVendors} vendor(s) have elevated risk.` : 'Overall vendor risk is acceptable.',
    consolidationOpportunities.length > 0 ?
      `Found ${consolidationOpportunities.length} consolidation opportunities.` : ''
  ].filter(Boolean).join(' ');

  console.log(`   Vendors analyzed: ${vendorItems.size}`);
  console.log(`   High risk vendors: ${highRiskVendors}`);

  return {
    vendorProfiles: vendorProfiles.sort((a, b) => b.portfolioSpend - a.portfolioSpend),
    riskAssessments,
    pricingIntelligence,
    alternatives: allAlternatives.slice(0, 10),
    consolidationOpportunities,
    topVendorsBySpend,
    summary,
    recommendations
  };
}

// ============================================================================
// Sub-Agent Implementation
// ============================================================================

export const vendorIntelligenceAgent: SubAgent = {
  name: 'GENERATOR',  // Using existing slot

  async run(args: Record<string, unknown>): Promise<SubAgentResult> {
    const tenantId = args.tenantId as string;
    const items = args.items as PortfolioItem[] || [];

    if (!tenantId) {
      return {
        content: 'Tenant ID is required for vendor intelligence analysis.',
        metadata: { error: 'Missing tenantId' }
      };
    }

    if (items.length === 0) {
      return {
        content: 'No items provided for analysis.',
        metadata: { error: 'No items' }
      };
    }

    try {
      const intelligence = await analyzeVendorIntelligence(tenantId, items);

      const contentParts = [
        `## Vendor Intelligence Report`,
        ``,
        `**Summary:** ${intelligence.summary}`,
        ``,
        `### Top Vendors by Spend`
      ];

      for (const v of intelligence.topVendorsBySpend.slice(0, 5)) {
        contentParts.push(`- **${v.vendor}:** €${v.spend.toLocaleString()} (${v.percentage}%)`);
      }

      // High risk vendors
      const highRisk = Array.from(intelligence.riskAssessments.entries())
        .filter(([_, r]) => r.overallScore > 50);

      if (highRisk.length > 0) {
        contentParts.push(``, `### High Risk Vendors`);
        for (const [vendor, risk] of highRisk) {
          contentParts.push(`- **${vendor}:** Risk Score ${risk.overallScore}/100`);
          for (const factor of risk.factors.slice(0, 2)) {
            contentParts.push(`  - ${factor.description}`);
          }
        }
      }

      // Consolidation opportunities
      if (intelligence.consolidationOpportunities.length > 0) {
        contentParts.push(``, `### Consolidation Opportunities`);
        for (const opp of intelligence.consolidationOpportunities.slice(0, 3)) {
          contentParts.push(`- ${opp.rationale}: ${opp.currentVendors.join(', ')} → ${opp.targetVendor}`);
        }
      }

      // Recommendations
      if (intelligence.recommendations.length > 0) {
        contentParts.push(``, `### Recommendations`);
        for (const rec of intelligence.recommendations.slice(0, 5)) {
          contentParts.push(`- ${rec}`);
        }
      }

      return {
        content: contentParts.join('\n'),
        metadata: { intelligence }
      };
    } catch (error) {
      console.error('[VendorIntelligenceAgent] Error:', error);
      return {
        content: `Error analyzing vendor intelligence: ${error instanceof Error ? error.message : 'Unknown error'}`,
        metadata: { error: String(error) }
      };
    }
  }
};

export default analyzeVendorIntelligence;
