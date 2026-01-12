/**
 * Portfolio Health Agent
 *
 * Analyzes portfolio health across 5 key dimensions:
 * - Coverage: Gap analysis vs maturity goals
 * - Balance: Core vs support, build vs buy ratios
 * - Risk: Vendor concentration, EOL, security gaps
 * - Alignment: Strategic fit with company goals
 * - Efficiency: Redundancy, cost optimization opportunities
 */

// Types
interface PortfolioItem {
  id: string;
  name: string;
  type: 'product' | 'service';
  category?: string;
  subcategory?: string;
  vendor?: string;
  status?: string;
  priority?: string;
  budget?: number;
  strategic_importance?: string;
  strategicAlignment?: number;
  businessValue?: number;
  riskLevel?: string;
  lifecycle_stage?: string;
  description?: string;
}

interface MaturityProfile {
  level?: number;
  strategicGoals?: StrategicGoal[];
  industry?: string;
  companySize?: string;
}

interface StrategicGoal {
  id: string;
  name: string;
  priority: number;
}

interface HealthDimension {
  name: string;
  score: number;        // 0-100
  status: 'critical' | 'warning' | 'good' | 'excellent';
  weight: number;       // For overall calculation
  findings: string[];
  recommendations: Recommendation[];
}

interface Recommendation {
  id: string;
  priority: 'high' | 'medium' | 'low';
  category: string;
  title: string;
  description: string;
  impact: string;
  effort: 'low' | 'medium' | 'high';
  relatedItems?: string[];
}

interface PortfolioHealthReport {
  overallScore: number;
  overallStatus: 'critical' | 'warning' | 'good' | 'excellent';
  dimensions: {
    coverage: HealthDimension;
    balance: HealthDimension;
    risk: HealthDimension;
    alignment: HealthDimension;
    efficiency: HealthDimension;
  };
  topRecommendations: Recommendation[];
  summary: {
    totalItems: number;
    products: number;
    services: number;
    totalBudget: number;
    avgStrategicAlignment: number;
  };
}

// Key IT domains for coverage analysis
const KEY_DOMAINS = [
  'Infrastructure',
  'Security',
  'Data & Analytics',
  'Applications',
  'Integration',
  'Collaboration',
  'Cloud Platform',
  'Development',
  'Networking',
];

// Category mappings to domains
const CATEGORY_DOMAIN_MAP: Record<string, string> = {
  'cloud_platform': 'Cloud Platform',
  'cloud': 'Cloud Platform',
  'security': 'Security',
  'cybersecurity': 'Security',
  'data_analytics': 'Data & Analytics',
  'data': 'Data & Analytics',
  'analytics': 'Data & Analytics',
  'bi': 'Data & Analytics',
  'infrastructure': 'Infrastructure',
  'compute': 'Infrastructure',
  'storage': 'Infrastructure',
  'applications': 'Applications',
  'erp': 'Applications',
  'crm': 'Applications',
  'integration': 'Integration',
  'api': 'Integration',
  'middleware': 'Integration',
  'collaboration': 'Collaboration',
  'communication': 'Collaboration',
  'development': 'Development',
  'devops': 'Development',
  'networking': 'Networking',
  'network': 'Networking',
};

/**
 * Get status from score
 */
function getStatusFromScore(score: number): 'critical' | 'warning' | 'good' | 'excellent' {
  if (score >= 80) return 'excellent';
  if (score >= 60) return 'good';
  if (score >= 40) return 'warning';
  return 'critical';
}

/**
 * Analyze coverage - how well does portfolio cover key IT domains
 */
function analyzeCoverage(items: PortfolioItem[], profile?: MaturityProfile): HealthDimension {
  const findings: string[] = [];
  const recommendations: Recommendation[] = [];

  // Map items to domains
  const domainCoverage: Record<string, PortfolioItem[]> = {};
  for (const domain of KEY_DOMAINS) {
    domainCoverage[domain] = [];
  }

  for (const item of items) {
    const category = (item.category || '').toLowerCase().replace(/[^a-z]/g, '_');
    const domain = CATEGORY_DOMAIN_MAP[category] || 'Applications';
    if (domainCoverage[domain]) {
      domainCoverage[domain].push(item);
    }
  }

  // Calculate coverage
  const coveredDomains = Object.entries(domainCoverage).filter(([_, items]) => items.length > 0);
  const coverageRatio = coveredDomains.length / KEY_DOMAINS.length;

  // Find gaps
  const gaps = Object.entries(domainCoverage)
    .filter(([_, items]) => items.length === 0)
    .map(([domain]) => domain);

  if (gaps.length > 0) {
    findings.push(`Missing coverage in ${gaps.length} key domain(s): ${gaps.join(', ')}`);

    for (const gap of gaps) {
      recommendations.push({
        id: `coverage-gap-${gap.toLowerCase().replace(/\s/g, '-')}`,
        priority: gap === 'Security' ? 'high' : 'medium',
        category: 'Coverage',
        title: `Add ${gap} solutions`,
        description: `Your portfolio lacks solutions in the ${gap} domain. Consider evaluating options to fill this gap.`,
        impact: `Improved IT capability coverage and reduced operational risk`,
        effort: 'medium',
      });
    }
  }

  // Check for single-item domains (weak coverage)
  const weakDomains = Object.entries(domainCoverage)
    .filter(([_, items]) => items.length === 1)
    .map(([domain]) => domain);

  if (weakDomains.length > 0) {
    findings.push(`Weak coverage (single item) in: ${weakDomains.join(', ')}`);
  }

  // Calculate score
  let score = coverageRatio * 100;

  // Penalty for critical gaps
  if (gaps.includes('Security')) score -= 15;
  if (gaps.includes('Infrastructure')) score -= 10;

  // Bonus for strong coverage
  const strongDomains = Object.entries(domainCoverage).filter(([_, items]) => items.length >= 3);
  score += strongDomains.length * 2;

  score = Math.max(0, Math.min(100, score));

  if (coverageRatio >= 0.8) {
    findings.push(`Strong coverage across ${coveredDomains.length} of ${KEY_DOMAINS.length} key domains`);
  }

  return {
    name: 'Coverage',
    score: Math.round(score),
    status: getStatusFromScore(score),
    weight: 0.20,
    findings,
    recommendations,
  };
}

/**
 * Analyze balance - product/service mix, build/buy, core/support
 */
function analyzeBalance(items: PortfolioItem[]): HealthDimension {
  const findings: string[] = [];
  const recommendations: Recommendation[] = [];

  const products = items.filter(i => i.type === 'product');
  const services = items.filter(i => i.type === 'service');

  const productRatio = items.length > 0 ? products.length / items.length : 0.5;

  // Analyze strategic importance distribution
  const coreItems = items.filter(i =>
    i.strategic_importance === 'core' ||
    (i.strategicAlignment && i.strategicAlignment >= 7)
  );
  const supportItems = items.filter(i =>
    i.strategic_importance === 'support' ||
    (i.strategicAlignment && i.strategicAlignment < 5)
  );

  const coreRatio = items.length > 0 ? coreItems.length / items.length : 0.5;

  findings.push(`Portfolio mix: ${products.length} products (${Math.round(productRatio * 100)}%), ${services.length} services (${Math.round((1 - productRatio) * 100)}%)`);
  findings.push(`Strategic mix: ${coreItems.length} core items (${Math.round(coreRatio * 100)}%), ${supportItems.length} support items`);

  let score = 70; // Base score

  // Product/service balance (ideal: 60-70% products for most orgs)
  if (productRatio < 0.4) {
    findings.push('Portfolio is service-heavy, may have high operational costs');
    recommendations.push({
      id: 'balance-product-heavy',
      priority: 'medium',
      category: 'Balance',
      title: 'Evaluate product alternatives',
      description: 'Consider replacing some managed services with products to reduce ongoing costs.',
      impact: 'Potential 20-30% cost reduction in covered areas',
      effort: 'high',
    });
    score -= 10;
  } else if (productRatio > 0.85) {
    findings.push('Portfolio is product-heavy, may lack managed support');
    score -= 5;
  }

  // Core/support balance (ideal: 50-60% core)
  if (coreRatio < 0.4) {
    findings.push('Low ratio of core strategic items');
    recommendations.push({
      id: 'balance-core-investment',
      priority: 'high',
      category: 'Balance',
      title: 'Increase core investment',
      description: 'Invest more in strategically aligned items to drive business value.',
      impact: 'Better strategic alignment and ROI',
      effort: 'medium',
    });
    score -= 15;
  } else if (coreRatio > 0.8) {
    findings.push('Most items marked as core - consider re-evaluating priorities');
    score -= 5;
  }

  // Budget distribution check
  const totalBudget = items.reduce((sum, i) => sum + (i.budget || 0), 0);
  const coreBudget = coreItems.reduce((sum, i) => sum + (i.budget || 0), 0);
  const coreBudgetRatio = totalBudget > 0 ? coreBudget / totalBudget : 0.5;

  if (coreBudgetRatio < 0.5 && totalBudget > 0) {
    findings.push(`Only ${Math.round(coreBudgetRatio * 100)}% of budget allocated to core items`);
    recommendations.push({
      id: 'balance-budget-realign',
      priority: 'medium',
      category: 'Balance',
      title: 'Realign budget to core items',
      description: 'Consider shifting budget from support items to core strategic investments.',
      impact: 'Better strategic alignment of IT spend',
      effort: 'low',
    });
    score -= 10;
  }

  score = Math.max(0, Math.min(100, score));

  return {
    name: 'Balance',
    score: Math.round(score),
    status: getStatusFromScore(score),
    weight: 0.15,
    findings,
    recommendations,
  };
}

/**
 * Analyze risk - vendor concentration, EOL, security
 */
function analyzeRisk(items: PortfolioItem[]): HealthDimension {
  const findings: string[] = [];
  const recommendations: Recommendation[] = [];

  let score = 100; // Start at perfect, subtract for issues

  // Vendor concentration
  const vendorCounts: Record<string, number> = {};
  for (const item of items) {
    const vendor = item.vendor || 'Unknown';
    vendorCounts[vendor] = (vendorCounts[vendor] || 0) + 1;
  }

  const topVendors = Object.entries(vendorCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  if (topVendors.length > 0 && items.length > 0) {
    const topVendorRatio = topVendors[0][1] / items.length;
    if (topVendorRatio > 0.4) {
      findings.push(`High vendor concentration: ${topVendors[0][0]} represents ${Math.round(topVendorRatio * 100)}% of portfolio`);
      recommendations.push({
        id: 'risk-vendor-diversify',
        priority: 'high',
        category: 'Risk',
        title: 'Diversify vendor portfolio',
        description: `Reduce dependency on ${topVendors[0][0]} by evaluating alternatives for non-critical items.`,
        impact: 'Reduced vendor lock-in risk and improved negotiation leverage',
        effort: 'high',
        relatedItems: items.filter(i => i.vendor === topVendors[0][0]).map(i => i.id),
      });
      score -= 20;
    } else if (topVendorRatio > 0.3) {
      findings.push(`Moderate vendor concentration: ${topVendors[0][0]} at ${Math.round(topVendorRatio * 100)}%`);
      score -= 10;
    }
  }

  // EOL/lifecycle risk
  const atRiskItems = items.filter(i =>
    i.lifecycle_stage === 'end_of_life' ||
    i.lifecycle_stage === 'deprecated' ||
    i.status === 'deprecated'
  );

  if (atRiskItems.length > 0) {
    findings.push(`${atRiskItems.length} item(s) at end-of-life or deprecated`);
    recommendations.push({
      id: 'risk-eol-migrate',
      priority: 'high',
      category: 'Risk',
      title: 'Address EOL/deprecated items',
      description: 'Create migration plans for items approaching or past end-of-life.',
      impact: 'Reduced security and support risk',
      effort: 'high',
      relatedItems: atRiskItems.map(i => i.id),
    });
    score -= atRiskItems.length * 5;
  }

  // High-risk items without mitigation
  const highRiskItems = items.filter(i => i.riskLevel === 'high' || i.riskLevel === 'critical');
  if (highRiskItems.length > 0) {
    findings.push(`${highRiskItems.length} high/critical risk item(s) identified`);
    score -= highRiskItems.length * 3;
  }

  // Security domain check
  const securityItems = items.filter(i =>
    (i.category || '').toLowerCase().includes('security') ||
    (i.subcategory || '').toLowerCase().includes('security')
  );

  if (securityItems.length === 0) {
    findings.push('No security solutions identified in portfolio');
    recommendations.push({
      id: 'risk-add-security',
      priority: 'high',
      category: 'Risk',
      title: 'Add security solutions',
      description: 'Implement security tools for identity, endpoint, network, and data protection.',
      impact: 'Critical for compliance and threat protection',
      effort: 'medium',
    });
    score -= 25;
  } else if (securityItems.length < 3) {
    findings.push(`Only ${securityItems.length} security solution(s) - may have gaps`);
    score -= 10;
  }

  // Single points of failure - critical items without alternatives
  const criticalItems = items.filter(i =>
    i.priority === 'critical' ||
    i.strategic_importance === 'core' ||
    (i.strategicAlignment && i.strategicAlignment >= 9)
  );

  const criticalCategories = new Set(criticalItems.map(i => i.category));
  for (const category of criticalCategories) {
    const categoryItems = items.filter(i => i.category === category);
    if (categoryItems.length === 1 && criticalItems.some(i => i.category === category)) {
      findings.push(`Single point of failure in ${category}`);
      score -= 5;
    }
  }

  score = Math.max(0, Math.min(100, score));

  return {
    name: 'Risk',
    score: Math.round(score),
    status: getStatusFromScore(score),
    weight: 0.30, // Risk weighted highest
    findings,
    recommendations,
  };
}

/**
 * Analyze alignment with strategic goals
 */
function analyzeAlignment(items: PortfolioItem[], goals?: StrategicGoal[]): HealthDimension {
  const findings: string[] = [];
  const recommendations: Recommendation[] = [];

  // Calculate average strategic alignment
  const itemsWithAlignment = items.filter(i => i.strategicAlignment !== undefined);
  const avgAlignment = itemsWithAlignment.length > 0
    ? itemsWithAlignment.reduce((sum, i) => sum + (i.strategicAlignment || 0), 0) / itemsWithAlignment.length
    : 5;

  findings.push(`Average strategic alignment: ${avgAlignment.toFixed(1)}/10`);

  // High alignment items
  const highAlignmentItems = items.filter(i => (i.strategicAlignment || 0) >= 7);
  const highAlignmentRatio = items.length > 0 ? highAlignmentItems.length / items.length : 0;

  findings.push(`${Math.round(highAlignmentRatio * 100)}% of items have high strategic alignment`);

  // Orphan items - low alignment, unclear purpose
  const orphanItems = items.filter(i =>
    (i.strategicAlignment || 5) < 4 &&
    !i.strategic_importance
  );

  if (orphanItems.length > 0) {
    findings.push(`${orphanItems.length} item(s) with low alignment - consider reviewing purpose`);
    recommendations.push({
      id: 'alignment-review-orphans',
      priority: 'medium',
      category: 'Alignment',
      title: 'Review low-alignment items',
      description: 'Evaluate items with low strategic alignment for potential retirement or repositioning.',
      impact: 'Clearer portfolio purpose and potential cost savings',
      effort: 'low',
      relatedItems: orphanItems.map(i => i.id),
    });
  }

  // Budget alignment
  const totalBudget = items.reduce((sum, i) => sum + (i.budget || 0), 0);
  const highAlignmentBudget = highAlignmentItems.reduce((sum, i) => sum + (i.budget || 0), 0);
  const budgetAlignmentRatio = totalBudget > 0 ? highAlignmentBudget / totalBudget : 0.5;

  if (totalBudget > 0) {
    findings.push(`${Math.round(budgetAlignmentRatio * 100)}% of budget in high-alignment items`);

    if (budgetAlignmentRatio < 0.5) {
      recommendations.push({
        id: 'alignment-budget-shift',
        priority: 'high',
        category: 'Alignment',
        title: 'Shift budget to strategic items',
        description: 'Reallocate budget from low-alignment to high-alignment items.',
        impact: 'Better ROI on IT investments',
        effort: 'medium',
      });
    }
  }

  // Calculate score
  let score = (avgAlignment / 10) * 50; // Base 50% from avg alignment
  score += highAlignmentRatio * 30; // Up to 30% from high alignment ratio
  score += budgetAlignmentRatio * 20; // Up to 20% from budget alignment

  // Penalties
  if (orphanItems.length > items.length * 0.2) {
    score -= 15; // More than 20% orphans
  }

  score = Math.max(0, Math.min(100, score));

  return {
    name: 'Alignment',
    score: Math.round(score),
    status: getStatusFromScore(score),
    weight: 0.25,
    findings,
    recommendations,
  };
}

/**
 * Analyze efficiency - redundancy, cost optimization
 */
function analyzeEfficiency(items: PortfolioItem[]): HealthDimension {
  const findings: string[] = [];
  const recommendations: Recommendation[] = [];

  let score = 80; // Start with good score

  // Check for potential duplicates (similar names)
  const potentialDuplicates: [PortfolioItem, PortfolioItem][] = [];
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const name1 = (items[i].name || '').toLowerCase();
      const name2 = (items[j].name || '').toLowerCase();

      // Simple similarity check
      if (
        name1.includes(name2) ||
        name2.includes(name1) ||
        (name1.split(' ').some(word => word.length > 3 && name2.includes(word)))
      ) {
        potentialDuplicates.push([items[i], items[j]]);
      }
    }
  }

  if (potentialDuplicates.length > 0) {
    findings.push(`${potentialDuplicates.length} potential duplicate/overlapping item(s) detected`);
    recommendations.push({
      id: 'efficiency-review-duplicates',
      priority: 'medium',
      category: 'Efficiency',
      title: 'Review potential duplicates',
      description: 'Items with similar names may have overlapping functionality. Consider consolidation.',
      impact: 'Reduced licensing costs and simplified management',
      effort: 'medium',
      relatedItems: [...new Set(potentialDuplicates.flatMap(([a, b]) => [a.id, b.id]))],
    });
    score -= potentialDuplicates.length * 5;
  }

  // Check for category overlap (multiple items in same category)
  const categoryItems: Record<string, PortfolioItem[]> = {};
  for (const item of items) {
    const cat = item.category || 'Other';
    if (!categoryItems[cat]) categoryItems[cat] = [];
    categoryItems[cat].push(item);
  }

  const overloadedCategories = Object.entries(categoryItems)
    .filter(([_, catItems]) => catItems.length >= 4)
    .map(([cat, catItems]) => ({ category: cat, count: catItems.length }));

  if (overloadedCategories.length > 0) {
    for (const { category, count } of overloadedCategories) {
      findings.push(`${count} items in ${category} - possible redundancy`);
    }
    score -= overloadedCategories.length * 3;
  }

  // Cost outliers
  const budgets = items.filter(i => i.budget && i.budget > 0).map(i => i.budget!);
  if (budgets.length > 0) {
    const avgBudget = budgets.reduce((a, b) => a + b, 0) / budgets.length;
    const costOutliers = items.filter(i => i.budget && i.budget > avgBudget * 3);

    if (costOutliers.length > 0) {
      findings.push(`${costOutliers.length} cost outlier(s) - items with 3x+ average budget`);
      recommendations.push({
        id: 'efficiency-review-outliers',
        priority: 'low',
        category: 'Efficiency',
        title: 'Review high-cost items',
        description: 'Validate that high-cost items deliver proportional value.',
        impact: 'Ensure cost-effective IT investments',
        effort: 'low',
        relatedItems: costOutliers.map(i => i.id),
      });
    }
  }

  // Low utilization indicators (if status indicates)
  const underutilized = items.filter(i =>
    i.status === 'underutilized' ||
    i.status === 'inactive' ||
    i.status === 'paused'
  );

  if (underutilized.length > 0) {
    findings.push(`${underutilized.length} item(s) appear underutilized or inactive`);
    recommendations.push({
      id: 'efficiency-retire-unused',
      priority: 'medium',
      category: 'Efficiency',
      title: 'Retire underutilized items',
      description: 'Consider retiring or consolidating items that are not actively used.',
      impact: 'Cost savings from unused licenses/services',
      effort: 'low',
      relatedItems: underutilized.map(i => i.id),
    });
    score -= underutilized.length * 4;
  }

  if (findings.length === 0) {
    findings.push('No significant efficiency issues detected');
  }

  score = Math.max(0, Math.min(100, score));

  return {
    name: 'Efficiency',
    score: Math.round(score),
    status: getStatusFromScore(score),
    weight: 0.10,
    findings,
    recommendations,
  };
}

/**
 * Calculate weighted overall score
 */
function calculateWeightedScore(dimensions: Record<string, HealthDimension>): number {
  let total = 0;
  let weightSum = 0;

  for (const dim of Object.values(dimensions)) {
    total += dim.score * dim.weight;
    weightSum += dim.weight;
  }

  return weightSum > 0 ? Math.round(total / weightSum) : 0;
}

/**
 * Prioritize recommendations
 */
function prioritizeRecommendations(recs: Recommendation[]): Recommendation[] {
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  const effortValue = { low: 3, medium: 2, high: 1 };

  return recs.sort((a, b) => {
    if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    }
    return effortValue[b.effort] - effortValue[a.effort];
  });
}

/**
 * Main function - Analyze portfolio health
 */
export async function analyzePortfolioHealth(
  tenantId: string,
  items: PortfolioItem[],
  maturityProfile?: MaturityProfile
): Promise<PortfolioHealthReport> {
  console.log(`\n📊 Analyzing portfolio health for tenant ${tenantId}...`);
  console.log(`   Items: ${items.length}`);

  // Analyze each dimension
  const coverage = analyzeCoverage(items, maturityProfile);
  const balance = analyzeBalance(items);
  const risk = analyzeRisk(items);
  const alignment = analyzeAlignment(items, maturityProfile?.strategicGoals);
  const efficiency = analyzeEfficiency(items);

  const dimensions = { coverage, balance, risk, alignment, efficiency };

  // Calculate overall score
  const overallScore = calculateWeightedScore(dimensions);
  const overallStatus = getStatusFromScore(overallScore);

  // Collect and prioritize all recommendations
  const allRecommendations = [
    ...coverage.recommendations,
    ...balance.recommendations,
    ...risk.recommendations,
    ...alignment.recommendations,
    ...efficiency.recommendations,
  ];
  const topRecommendations = prioritizeRecommendations(allRecommendations).slice(0, 5);

  // Calculate summary stats
  const products = items.filter(i => i.type === 'product').length;
  const services = items.filter(i => i.type === 'service').length;
  const totalBudget = items.reduce((sum, i) => sum + (i.budget || 0), 0);
  const itemsWithAlignment = items.filter(i => i.strategicAlignment !== undefined);
  const avgStrategicAlignment = itemsWithAlignment.length > 0
    ? itemsWithAlignment.reduce((sum, i) => sum + (i.strategicAlignment || 0), 0) / itemsWithAlignment.length
    : 0;

  console.log(`   Overall Score: ${overallScore} (${overallStatus})`);
  console.log(`   Top Recommendations: ${topRecommendations.length}`);

  return {
    overallScore,
    overallStatus,
    dimensions,
    topRecommendations,
    summary: {
      totalItems: items.length,
      products,
      services,
      totalBudget,
      avgStrategicAlignment,
    },
  };
}

export default analyzePortfolioHealth;
