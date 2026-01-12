/**
 * Risk Assessment Agent
 *
 * Comprehensive risk assessment with 8 risk dimensions:
 * 1. Vendor Concentration - Dependency on single vendors
 * 2. End of Life - EOL/deprecated products
 * 3. Security Gaps - Missing security coverage
 * 4. Technical Debt - Legacy systems, outdated versions
 * 5. Compliance Risk - GDPR, SOC2, HIPAA exposure
 * 6. Integration Complexity - Critical paths, dependencies
 * 7. License Risk - Audit exposure, over-deployment
 * 8. Business Continuity - Recovery capabilities, critical dependencies
 */

import { SubAgent, SubAgentResult } from '../types';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// ============================================================================
// Types
// ============================================================================

export interface PortfolioItem {
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
  version?: string;
  deployment_type?: string;
  license_type?: string;
  user_count?: number;
  integrations?: string[];
  data_classification?: string;
  compliance_requirements?: string[];
  last_updated?: string;
  support_end_date?: string;
  recovery_time_objective?: string;
  recovery_point_objective?: string;
}

export interface RiskScore {
  score: number;           // 0-100 (0 = no risk, 100 = critical risk)
  level: 'low' | 'medium' | 'high' | 'critical';
  factors: RiskFactor[];
  affectedItems: string[];
}

export interface RiskFactor {
  id: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  category: string;
  mitigationSuggestion: string;
}

export interface MitigationRecommendation {
  id: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  description: string;
  riskDimension: string;
  effort: 'low' | 'medium' | 'high';
  impact: 'low' | 'medium' | 'high';
  affectedItems: string[];
  estimatedCost?: string;
}

export interface ComprehensiveRiskAssessment {
  // Overall
  overallRiskScore: number;
  riskCategory: 'low' | 'medium' | 'high' | 'critical';
  assessmentDate: Date;

  // Risk Dimensions
  vendorConcentration: RiskScore;
  endOfLife: RiskScore;
  securityGaps: RiskScore;
  technicalDebt: RiskScore;
  complianceRisk: RiskScore;
  integrationComplexity: RiskScore;
  licenseRisk: RiskScore;
  businessContinuity: RiskScore;

  // Aggregated Insights
  topRisks: RiskFactor[];
  mitigationPriorities: MitigationRecommendation[];
  riskTrends?: RiskTrend[];

  // Summary
  summary: string;
  criticalIssueCount: number;
  highIssueCount: number;
}

export interface RiskTrend {
  dimension: string;
  previousScore: number;
  currentScore: number;
  trend: 'improving' | 'stable' | 'worsening';
}

// ============================================================================
// Known Risk Databases
// ============================================================================

// Known EOL products (simplified - in production, use endoflife.date API)
const EOL_PRODUCTS: Record<string, string> = {
  'windows server 2012': '2023-10-10',
  'windows server 2016': '2027-01-12',
  'oracle 11g': '2020-12-31',
  'oracle 12c': '2022-03-01',
  'sql server 2014': '2024-07-09',
  'java 8': '2030-12-31', // Extended support
  'java 11': '2026-09-30',
  'python 2': '2020-01-01',
  'python 3.7': '2023-06-27',
  'php 7.4': '2022-11-28',
  'php 8.0': '2023-11-26',
  'dotnet framework 4.5': '2022-04-26',
  'centos 7': '2024-06-30',
  'centos 8': '2021-12-31',
  'ubuntu 18.04': '2028-04-01',
  'rhel 7': '2024-06-30',
};

// Compliance frameworks and data types
const COMPLIANCE_FRAMEWORKS: Record<string, { dataTypes: string[]; requirements: string[] }> = {
  'GDPR': {
    dataTypes: ['personal', 'pii', 'customer', 'user', 'employee'],
    requirements: ['data encryption', 'access control', 'audit logging', 'data retention', 'consent management']
  },
  'HIPAA': {
    dataTypes: ['health', 'medical', 'patient', 'phi', 'healthcare'],
    requirements: ['encryption at rest', 'encryption in transit', 'access audit', 'baa', 'security risk assessment']
  },
  'SOC2': {
    dataTypes: ['customer', 'financial', 'business'],
    requirements: ['security controls', 'availability monitoring', 'processing integrity', 'confidentiality', 'privacy']
  },
  'PCI-DSS': {
    dataTypes: ['payment', 'card', 'credit', 'transaction', 'cardholder'],
    requirements: ['network segmentation', 'encryption', 'access control', 'vulnerability management', 'monitoring']
  },
  'SOX': {
    dataTypes: ['financial', 'accounting', 'audit', 'reporting'],
    requirements: ['access control', 'audit trail', 'segregation of duties', 'change management']
  }
};

// License types with audit risk
const HIGH_AUDIT_RISK_LICENSES = [
  'oracle', 'sap', 'ibm', 'microsoft enterprise', 'adobe enterprise',
  'vmware', 'citrix', 'red hat', 'autodesk'
];

// ============================================================================
// Risk Assessment Functions
// ============================================================================

function getRiskLevel(score: number): 'low' | 'medium' | 'high' | 'critical' {
  if (score >= 75) return 'critical';
  if (score >= 50) return 'high';
  if (score >= 25) return 'medium';
  return 'low';
}

function createRiskScore(score: number, factors: RiskFactor[], affectedItems: string[]): RiskScore {
  return {
    score: Math.round(Math.max(0, Math.min(100, score))),
    level: getRiskLevel(score),
    factors,
    affectedItems
  };
}

/**
 * Assess vendor concentration risk
 */
function assessVendorConcentration(items: PortfolioItem[]): RiskScore {
  const factors: RiskFactor[] = [];
  const affectedItems: string[] = [];
  let score = 0;

  // Count items per vendor
  const vendorCounts: Record<string, PortfolioItem[]> = {};
  for (const item of items) {
    const vendor = (item.vendor || 'Unknown').toLowerCase();
    if (!vendorCounts[vendor]) vendorCounts[vendor] = [];
    vendorCounts[vendor].push(item);
  }

  // Analyze concentration
  const sortedVendors = Object.entries(vendorCounts)
    .sort((a, b) => b[1].length - a[1].length);

  if (sortedVendors.length > 0 && items.length > 0) {
    const topVendor = sortedVendors[0];
    const topVendorRatio = topVendor[1].length / items.length;

    if (topVendorRatio > 0.5) {
      score += 40;
      factors.push({
        id: 'vendor-critical-concentration',
        description: `Critical concentration: ${topVendor[0]} represents ${Math.round(topVendorRatio * 100)}% of portfolio`,
        severity: 'critical',
        category: 'Vendor Concentration',
        mitigationSuggestion: 'Develop vendor diversification strategy and evaluate alternatives'
      });
      affectedItems.push(...topVendor[1].map(i => i.id));
    } else if (topVendorRatio > 0.35) {
      score += 25;
      factors.push({
        id: 'vendor-high-concentration',
        description: `High concentration: ${topVendor[0]} at ${Math.round(topVendorRatio * 100)}%`,
        severity: 'high',
        category: 'Vendor Concentration',
        mitigationSuggestion: 'Monitor vendor dependency and identify alternatives for critical items'
      });
      affectedItems.push(...topVendor[1].map(i => i.id));
    }

    // Check for single-vendor categories
    const categories: Record<string, Set<string>> = {};
    for (const item of items) {
      const cat = item.category || 'Other';
      if (!categories[cat]) categories[cat] = new Set();
      if (item.vendor) categories[cat].add(item.vendor.toLowerCase());
    }

    for (const [cat, vendors] of Object.entries(categories)) {
      if (vendors.size === 1 && items.filter(i => i.category === cat).length > 2) {
        score += 10;
        factors.push({
          id: `vendor-single-${cat}`,
          description: `Single vendor for ${cat} category`,
          severity: 'medium',
          category: 'Vendor Concentration',
          mitigationSuggestion: `Evaluate alternative vendors for ${cat}`
        });
      }
    }
  }

  // Check for strategic vendor dependency
  const criticalItems = items.filter(i =>
    i.priority === 'critical' ||
    i.strategic_importance === 'core'
  );
  const criticalVendors = new Set(criticalItems.map(i => i.vendor?.toLowerCase()));

  if (criticalVendors.size === 1 && criticalItems.length > 3) {
    score += 15;
    factors.push({
      id: 'vendor-critical-single',
      description: 'All critical items depend on single vendor',
      severity: 'high',
      category: 'Vendor Concentration',
      mitigationSuggestion: 'Diversify critical infrastructure across multiple vendors'
    });
  }

  return createRiskScore(score, factors, [...new Set(affectedItems)]);
}

/**
 * Assess end-of-life risk
 */
function assessEndOfLife(items: PortfolioItem[]): RiskScore {
  const factors: RiskFactor[] = [];
  const affectedItems: string[] = [];
  let score = 0;
  const today = new Date();

  for (const item of items) {
    // Check lifecycle stage
    if (item.lifecycle_stage === 'end_of_life' || item.status === 'deprecated') {
      score += 15;
      affectedItems.push(item.id);
      factors.push({
        id: `eol-${item.id}`,
        description: `${item.name} is end-of-life or deprecated`,
        severity: 'critical',
        category: 'End of Life',
        mitigationSuggestion: `Create migration plan for ${item.name}`
      });
      continue;
    }

    // Check support end date
    if (item.support_end_date) {
      const endDate = new Date(item.support_end_date);
      const monthsUntilEOL = (endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24 * 30);

      if (monthsUntilEOL < 0) {
        score += 12;
        affectedItems.push(item.id);
        factors.push({
          id: `eol-past-${item.id}`,
          description: `${item.name} support ended on ${item.support_end_date}`,
          severity: 'critical',
          category: 'End of Life',
          mitigationSuggestion: 'Immediate migration required'
        });
      } else if (monthsUntilEOL < 6) {
        score += 8;
        affectedItems.push(item.id);
        factors.push({
          id: `eol-soon-${item.id}`,
          description: `${item.name} support ends in ${Math.round(monthsUntilEOL)} months`,
          severity: 'high',
          category: 'End of Life',
          mitigationSuggestion: 'Begin migration planning'
        });
      } else if (monthsUntilEOL < 12) {
        score += 4;
        affectedItems.push(item.id);
        factors.push({
          id: `eol-approaching-${item.id}`,
          description: `${item.name} support ends within a year`,
          severity: 'medium',
          category: 'End of Life',
          mitigationSuggestion: 'Include in next budget cycle for upgrade'
        });
      }
    }

    // Check against known EOL database
    const itemNameLower = item.name.toLowerCase();
    for (const [product, eolDate] of Object.entries(EOL_PRODUCTS)) {
      if (itemNameLower.includes(product)) {
        const endDate = new Date(eolDate);
        if (endDate < today) {
          score += 10;
          affectedItems.push(item.id);
          factors.push({
            id: `eol-known-${item.id}`,
            description: `${item.name} contains EOL technology (${product})`,
            severity: 'high',
            category: 'End of Life',
            mitigationSuggestion: 'Upgrade to supported version'
          });
        }
        break;
      }
    }
  }

  return createRiskScore(score, factors, [...new Set(affectedItems)]);
}

/**
 * Assess security gaps
 */
function assessSecurityGaps(items: PortfolioItem[]): RiskScore {
  const factors: RiskFactor[] = [];
  const affectedItems: string[] = [];
  let score = 0;

  // Check security coverage
  const securityCategories = ['security', 'cybersecurity', 'identity', 'access management', 'encryption'];
  const securityItems = items.filter(i =>
    securityCategories.some(cat =>
      (i.category || '').toLowerCase().includes(cat) ||
      (i.subcategory || '').toLowerCase().includes(cat)
    )
  );

  if (securityItems.length === 0) {
    score += 35;
    factors.push({
      id: 'security-no-solutions',
      description: 'No security solutions identified in portfolio',
      severity: 'critical',
      category: 'Security Gaps',
      mitigationSuggestion: 'Implement essential security stack: identity, endpoint, network, data protection'
    });
  } else if (securityItems.length < 3) {
    score += 20;
    factors.push({
      id: 'security-limited',
      description: `Only ${securityItems.length} security solution(s) - likely gaps exist`,
      severity: 'high',
      category: 'Security Gaps',
      mitigationSuggestion: 'Review security coverage across all attack vectors'
    });
    affectedItems.push(...securityItems.map(i => i.id));
  }

  // Check for critical security capabilities
  const securityCapabilities = {
    identity: ['identity', 'iam', 'sso', 'oauth', 'saml', 'authentication'],
    endpoint: ['endpoint', 'edr', 'antivirus', 'anti-malware'],
    network: ['firewall', 'waf', 'ids', 'ips', 'network security'],
    data: ['dlp', 'encryption', 'data protection', 'backup'],
    monitoring: ['siem', 'monitoring', 'logging', 'threat detection']
  };

  for (const [capability, keywords] of Object.entries(securityCapabilities)) {
    const hasCapability = items.some(i =>
      keywords.some(kw =>
        (i.name || '').toLowerCase().includes(kw) ||
        (i.description || '').toLowerCase().includes(kw)
      )
    );

    if (!hasCapability) {
      score += 8;
      factors.push({
        id: `security-gap-${capability}`,
        description: `No ${capability} security solution detected`,
        severity: capability === 'identity' || capability === 'endpoint' ? 'high' : 'medium',
        category: 'Security Gaps',
        mitigationSuggestion: `Implement ${capability} security solution`
      });
    }
  }

  return createRiskScore(score, factors, [...new Set(affectedItems)]);
}

/**
 * Assess technical debt
 */
function assessTechnicalDebt(items: PortfolioItem[]): RiskScore {
  const factors: RiskFactor[] = [];
  const affectedItems: string[] = [];
  let score = 0;

  const today = new Date();

  for (const item of items) {
    // Check for outdated versions
    const version = (item.version || '').toLowerCase();
    if (version) {
      // Legacy version indicators
      if (version.match(/^[01]\./)) {
        score += 5;
        affectedItems.push(item.id);
        factors.push({
          id: `debt-legacy-${item.id}`,
          description: `${item.name} running legacy version (${item.version})`,
          severity: 'medium',
          category: 'Technical Debt',
          mitigationSuggestion: 'Plan upgrade to current major version'
        });
      }
    }

    // Check last update date
    if (item.last_updated) {
      const lastUpdate = new Date(item.last_updated);
      const monthsSinceUpdate = (today.getTime() - lastUpdate.getTime()) / (1000 * 60 * 60 * 24 * 30);

      if (monthsSinceUpdate > 24) {
        score += 8;
        affectedItems.push(item.id);
        factors.push({
          id: `debt-stale-${item.id}`,
          description: `${item.name} not updated in ${Math.round(monthsSinceUpdate)} months`,
          severity: 'high',
          category: 'Technical Debt',
          mitigationSuggestion: 'Review and update or replace'
        });
      } else if (monthsSinceUpdate > 12) {
        score += 4;
        affectedItems.push(item.id);
        factors.push({
          id: `debt-aging-${item.id}`,
          description: `${item.name} not updated in over a year`,
          severity: 'medium',
          category: 'Technical Debt',
          mitigationSuggestion: 'Schedule maintenance review'
        });
      }
    }

    // Check for on-premise legacy deployments
    if (item.deployment_type === 'on_premise' || item.deployment_type === 'legacy') {
      const hasCloudPath = items.some(i =>
        i.category === item.category &&
        (i.deployment_type === 'cloud' || i.deployment_type === 'saas')
      );

      if (!hasCloudPath) {
        score += 3;
        affectedItems.push(item.id);
        factors.push({
          id: `debt-onprem-${item.id}`,
          description: `${item.name} is on-premise with no cloud alternative`,
          severity: 'low',
          category: 'Technical Debt',
          mitigationSuggestion: 'Evaluate cloud migration options'
        });
      }
    }
  }

  // Check overall modernization ratio
  const modernItems = items.filter(i =>
    i.deployment_type === 'saas' ||
    i.deployment_type === 'cloud' ||
    i.lifecycle_stage === 'growth' ||
    i.lifecycle_stage === 'maturity'
  );

  const modernRatio = items.length > 0 ? modernItems.length / items.length : 0.5;
  if (modernRatio < 0.4) {
    score += 15;
    factors.push({
      id: 'debt-low-modernization',
      description: `Only ${Math.round(modernRatio * 100)}% of portfolio is modernized`,
      severity: 'high',
      category: 'Technical Debt',
      mitigationSuggestion: 'Develop comprehensive modernization roadmap'
    });
  }

  return createRiskScore(score, factors, [...new Set(affectedItems)]);
}

/**
 * Assess compliance risk
 */
function assessComplianceRisk(items: PortfolioItem[]): RiskScore {
  const factors: RiskFactor[] = [];
  const affectedItems: string[] = [];
  let score = 0;

  // Determine applicable frameworks based on data types
  const applicableFrameworks: Set<string> = new Set();

  for (const item of items) {
    const dataClass = (item.data_classification || '').toLowerCase();
    const description = (item.description || '').toLowerCase();
    const name = (item.name || '').toLowerCase();
    const textToAnalyze = `${dataClass} ${description} ${name}`;

    for (const [framework, config] of Object.entries(COMPLIANCE_FRAMEWORKS)) {
      if (config.dataTypes.some(dt => textToAnalyze.includes(dt))) {
        applicableFrameworks.add(framework);
      }
    }

    // Check explicit compliance requirements
    if (item.compliance_requirements) {
      for (const req of item.compliance_requirements) {
        if (Object.keys(COMPLIANCE_FRAMEWORKS).includes(req.toUpperCase())) {
          applicableFrameworks.add(req.toUpperCase());
        }
      }
    }
  }

  // For each applicable framework, check compliance gaps
  for (const framework of applicableFrameworks) {
    const config = COMPLIANCE_FRAMEWORKS[framework];
    const frameworkItems = items.filter(i =>
      config.dataTypes.some(dt =>
        (i.data_classification || '').toLowerCase().includes(dt) ||
        (i.description || '').toLowerCase().includes(dt)
      )
    );

    // Check for encryption
    const hasEncryption = items.some(i =>
      (i.name || '').toLowerCase().includes('encrypt') ||
      (i.description || '').toLowerCase().includes('encryption')
    );

    if (!hasEncryption && config.requirements.some(r => r.includes('encrypt'))) {
      score += 12;
      factors.push({
        id: `compliance-${framework}-encryption`,
        description: `${framework}: No encryption solution detected`,
        severity: 'high',
        category: 'Compliance Risk',
        mitigationSuggestion: `Implement encryption for ${framework} compliance`
      });
    }

    // Check for audit logging
    const hasAuditLogging = items.some(i =>
      (i.name || '').toLowerCase().includes('audit') ||
      (i.name || '').toLowerCase().includes('siem') ||
      (i.description || '').toLowerCase().includes('audit log')
    );

    if (!hasAuditLogging && config.requirements.some(r => r.includes('audit'))) {
      score += 10;
      factors.push({
        id: `compliance-${framework}-audit`,
        description: `${framework}: No audit logging solution detected`,
        severity: 'high',
        category: 'Compliance Risk',
        mitigationSuggestion: 'Implement comprehensive audit logging'
      });
    }

    // Add framework exposure
    if (frameworkItems.length > 0) {
      affectedItems.push(...frameworkItems.map(i => i.id));
      factors.push({
        id: `compliance-${framework}-scope`,
        description: `${framework} applies to ${frameworkItems.length} items in portfolio`,
        severity: 'medium',
        category: 'Compliance Risk',
        mitigationSuggestion: `Ensure all ${framework} requirements are met`
      });
    }
  }

  if (applicableFrameworks.size === 0) {
    // No compliance detected - might be a gap
    factors.push({
      id: 'compliance-unassessed',
      description: 'No compliance requirements identified - may need review',
      severity: 'low',
      category: 'Compliance Risk',
      mitigationSuggestion: 'Review data handling for applicable regulations'
    });
  }

  return createRiskScore(score, factors, [...new Set(affectedItems)]);
}

/**
 * Assess integration complexity risk
 */
function assessIntegrationComplexity(items: PortfolioItem[]): RiskScore {
  const factors: RiskFactor[] = [];
  const affectedItems: string[] = [];
  let score = 0;

  // Build integration graph
  const integrationCounts: Record<string, number> = {};
  const criticalPaths: string[] = [];

  for (const item of items) {
    if (item.integrations && item.integrations.length > 0) {
      integrationCounts[item.id] = item.integrations.length;

      // High integration count = potential single point of failure
      if (item.integrations.length > 5) {
        score += 8;
        affectedItems.push(item.id);
        factors.push({
          id: `integration-hub-${item.id}`,
          description: `${item.name} has ${item.integrations.length} integrations - potential SPOF`,
          severity: 'high',
          category: 'Integration Complexity',
          mitigationSuggestion: 'Ensure high availability and consider decoupling'
        });
        criticalPaths.push(item.name);
      } else if (item.integrations.length > 3) {
        score += 3;
        affectedItems.push(item.id);
      }
    }
  }

  // Check for integration middleware
  const hasMiddleware = items.some(i =>
    (i.category || '').toLowerCase().includes('integration') ||
    (i.subcategory || '').toLowerCase().includes('api') ||
    (i.name || '').toLowerCase().includes('middleware') ||
    (i.name || '').toLowerCase().includes('mulesoft') ||
    (i.name || '').toLowerCase().includes('boomi') ||
    (i.name || '').toLowerCase().includes('zapier')
  );

  if (!hasMiddleware && Object.keys(integrationCounts).length > 5) {
    score += 15;
    factors.push({
      id: 'integration-no-middleware',
      description: 'Multiple integrations without dedicated integration platform',
      severity: 'medium',
      category: 'Integration Complexity',
      mitigationSuggestion: 'Consider implementing integration middleware for better management'
    });
  }

  // Single points of failure in critical paths
  const criticalItems = items.filter(i =>
    i.priority === 'critical' ||
    i.strategic_importance === 'core'
  );

  for (const item of criticalItems) {
    const dependencies = item.integrations || [];
    if (dependencies.length === 1) {
      score += 5;
      affectedItems.push(item.id);
      factors.push({
        id: `integration-spof-${item.id}`,
        description: `Critical item ${item.name} has single dependency`,
        severity: 'medium',
        category: 'Integration Complexity',
        mitigationSuggestion: 'Add redundancy for critical integrations'
      });
    }
  }

  return createRiskScore(score, factors, [...new Set(affectedItems)]);
}

/**
 * Assess license risk
 */
function assessLicenseRisk(items: PortfolioItem[]): RiskScore {
  const factors: RiskFactor[] = [];
  const affectedItems: string[] = [];
  let score = 0;

  for (const item of items) {
    const vendor = (item.vendor || '').toLowerCase();
    const name = (item.name || '').toLowerCase();
    const licenseType = (item.license_type || '').toLowerCase();

    // Check for high-audit-risk vendors
    for (const riskyVendor of HIGH_AUDIT_RISK_LICENSES) {
      if (vendor.includes(riskyVendor) || name.includes(riskyVendor)) {
        score += 5;
        affectedItems.push(item.id);
        factors.push({
          id: `license-audit-${item.id}`,
          description: `${item.name} uses ${riskyVendor} licensing (high audit risk)`,
          severity: 'medium',
          category: 'License Risk',
          mitigationSuggestion: 'Ensure license compliance documentation is current'
        });
        break;
      }
    }

    // Check for enterprise license complexity
    if (licenseType.includes('enterprise') || licenseType.includes('unlimited')) {
      score += 3;
      affectedItems.push(item.id);
      factors.push({
        id: `license-complex-${item.id}`,
        description: `${item.name} has complex enterprise licensing`,
        severity: 'low',
        category: 'License Risk',
        mitigationSuggestion: 'Review usage against license terms'
      });
    }

    // Check user count vs budget (over-deployment risk)
    if (item.user_count && item.budget) {
      const costPerUser = item.budget / item.user_count;
      // Very low cost per user might indicate under-licensing
      if (costPerUser < 10 && item.user_count > 100) {
        score += 8;
        affectedItems.push(item.id);
        factors.push({
          id: `license-under-${item.id}`,
          description: `${item.name} may be under-licensed (${item.user_count} users)`,
          severity: 'high',
          category: 'License Risk',
          mitigationSuggestion: 'Verify license count matches actual usage'
        });
      }
    }
  }

  // Check for license management tool
  const hasLicenseManagement = items.some(i =>
    (i.name || '').toLowerCase().includes('license') ||
    (i.subcategory || '').toLowerCase().includes('sam') ||
    (i.description || '').toLowerCase().includes('software asset')
  );

  if (!hasLicenseManagement && items.length > 20) {
    score += 10;
    factors.push({
      id: 'license-no-sam',
      description: 'No software asset management solution detected',
      severity: 'medium',
      category: 'License Risk',
      mitigationSuggestion: 'Implement SAM tool for license compliance tracking'
    });
  }

  return createRiskScore(score, factors, [...new Set(affectedItems)]);
}

/**
 * Assess business continuity risk
 */
function assessBusinessContinuity(items: PortfolioItem[]): RiskScore {
  const factors: RiskFactor[] = [];
  const affectedItems: string[] = [];
  let score = 0;

  // Check for backup solutions
  const hasBackup = items.some(i =>
    (i.name || '').toLowerCase().includes('backup') ||
    (i.category || '').toLowerCase().includes('backup') ||
    (i.description || '').toLowerCase().includes('disaster recovery')
  );

  if (!hasBackup) {
    score += 20;
    factors.push({
      id: 'bc-no-backup',
      description: 'No backup or disaster recovery solution detected',
      severity: 'critical',
      category: 'Business Continuity',
      mitigationSuggestion: 'Implement comprehensive backup and DR strategy'
    });
  }

  // Check critical items for RTO/RPO
  const criticalItems = items.filter(i =>
    i.priority === 'critical' ||
    i.strategic_importance === 'core'
  );

  let criticalWithoutRTO = 0;
  for (const item of criticalItems) {
    if (!item.recovery_time_objective && !item.recovery_point_objective) {
      criticalWithoutRTO++;
      affectedItems.push(item.id);
    }
  }

  if (criticalWithoutRTO > 0) {
    score += 10;
    factors.push({
      id: 'bc-undefined-rto',
      description: `${criticalWithoutRTO} critical items without defined RTO/RPO`,
      severity: 'high',
      category: 'Business Continuity',
      mitigationSuggestion: 'Define RTO/RPO for all critical systems'
    });
  }

  // Check for redundancy in critical systems
  const criticalCategories = new Map<string, PortfolioItem[]>();
  for (const item of criticalItems) {
    const cat = item.category || 'Other';
    if (!criticalCategories.has(cat)) criticalCategories.set(cat, []);
    criticalCategories.get(cat)!.push(item);
  }

  for (const [category, categoryItems] of criticalCategories) {
    if (categoryItems.length === 1) {
      score += 5;
      affectedItems.push(categoryItems[0].id);
      factors.push({
        id: `bc-spof-${category}`,
        description: `Single point of failure: only one critical item in ${category}`,
        severity: 'medium',
        category: 'Business Continuity',
        mitigationSuggestion: `Add redundancy or failover for ${category}`
      });
    }
  }

  // Check for cloud distribution (single region risk)
  const cloudItems = items.filter(i =>
    i.deployment_type === 'cloud' ||
    i.deployment_type === 'saas'
  );

  if (cloudItems.length > 5) {
    // Simplified check - in production would verify actual regions
    factors.push({
      id: 'bc-region-review',
      description: 'Review cloud deployments for multi-region resilience',
      severity: 'low',
      category: 'Business Continuity',
      mitigationSuggestion: 'Ensure critical workloads are deployed across regions'
    });
  }

  return createRiskScore(score, factors, [...new Set(affectedItems)]);
}

// ============================================================================
// Main Assessment Function
// ============================================================================

/**
 * Perform comprehensive risk assessment
 */
export async function performRiskAssessment(
  tenantId: string,
  items: PortfolioItem[]
): Promise<ComprehensiveRiskAssessment> {
  console.log(`\n🛡️ Performing comprehensive risk assessment for tenant ${tenantId}...`);
  console.log(`   Items: ${items.length}`);

  // Assess all dimensions
  const vendorConcentration = assessVendorConcentration(items);
  const endOfLife = assessEndOfLife(items);
  const securityGaps = assessSecurityGaps(items);
  const technicalDebt = assessTechnicalDebt(items);
  const complianceRisk = assessComplianceRisk(items);
  const integrationComplexity = assessIntegrationComplexity(items);
  const licenseRisk = assessLicenseRisk(items);
  const businessContinuity = assessBusinessContinuity(items);

  // Calculate weighted overall score
  const weights = {
    vendorConcentration: 0.10,
    endOfLife: 0.15,
    securityGaps: 0.20,
    technicalDebt: 0.10,
    complianceRisk: 0.15,
    integrationComplexity: 0.10,
    licenseRisk: 0.10,
    businessContinuity: 0.10
  };

  const overallRiskScore = Math.round(
    vendorConcentration.score * weights.vendorConcentration +
    endOfLife.score * weights.endOfLife +
    securityGaps.score * weights.securityGaps +
    technicalDebt.score * weights.technicalDebt +
    complianceRisk.score * weights.complianceRisk +
    integrationComplexity.score * weights.integrationComplexity +
    licenseRisk.score * weights.licenseRisk +
    businessContinuity.score * weights.businessContinuity
  );

  // Collect top risks
  const allFactors = [
    ...vendorConcentration.factors,
    ...endOfLife.factors,
    ...securityGaps.factors,
    ...technicalDebt.factors,
    ...complianceRisk.factors,
    ...integrationComplexity.factors,
    ...licenseRisk.factors,
    ...businessContinuity.factors
  ];

  const topRisks = allFactors
    .filter(f => f.severity === 'critical' || f.severity === 'high')
    .slice(0, 10);

  // Generate mitigation priorities
  const mitigationPriorities: MitigationRecommendation[] = topRisks.map((risk, index) => ({
    id: `mitigation-${index}`,
    priority: risk.severity === 'critical' ? 'critical' : 'high',
    title: risk.description,
    description: risk.mitigationSuggestion,
    riskDimension: risk.category,
    effort: 'medium',
    impact: risk.severity === 'critical' ? 'high' : 'medium',
    affectedItems: []
  }));

  // Count issues
  const criticalIssueCount = allFactors.filter(f => f.severity === 'critical').length;
  const highIssueCount = allFactors.filter(f => f.severity === 'high').length;

  // Generate summary
  const summary = generateSummary(overallRiskScore, criticalIssueCount, highIssueCount, allFactors.length);

  console.log(`   Overall Risk Score: ${overallRiskScore} (${getRiskLevel(overallRiskScore)})`);
  console.log(`   Critical Issues: ${criticalIssueCount}, High Issues: ${highIssueCount}`);

  return {
    overallRiskScore,
    riskCategory: getRiskLevel(overallRiskScore),
    assessmentDate: new Date(),
    vendorConcentration,
    endOfLife,
    securityGaps,
    technicalDebt,
    complianceRisk,
    integrationComplexity,
    licenseRisk,
    businessContinuity,
    topRisks,
    mitigationPriorities,
    summary,
    criticalIssueCount,
    highIssueCount
  };
}

function generateSummary(
  score: number,
  criticalCount: number,
  highCount: number,
  totalCount: number
): string {
  const level = getRiskLevel(score);

  if (level === 'critical') {
    return `Critical risk level detected. ${criticalCount} critical and ${highCount} high-priority issues require immediate attention.`;
  } else if (level === 'high') {
    return `High risk level detected. Focus on addressing ${criticalCount + highCount} priority issues to reduce exposure.`;
  } else if (level === 'medium') {
    return `Moderate risk level. ${totalCount} total findings identified with ${highCount} requiring attention.`;
  } else {
    return `Low overall risk. Continue monitoring and address ${totalCount} minor findings as resources allow.`;
  }
}

// ============================================================================
// Sub-Agent Implementation
// ============================================================================

export const riskAssessmentAgent: SubAgent = {
  name: 'VALIDATOR', // Using existing slot - can be updated to RISK_ASSESSMENT

  async run(args: Record<string, unknown>): Promise<SubAgentResult> {
    const tenantId = args.tenantId as string;
    const items = args.items as PortfolioItem[] || [];

    if (!tenantId) {
      return {
        content: 'Tenant ID is required for risk assessment.',
        metadata: { error: 'Missing tenantId' }
      };
    }

    try {
      const assessment = await performRiskAssessment(tenantId, items);

      const contentParts = [
        `## Comprehensive Risk Assessment`,
        ``,
        `**Overall Risk Score:** ${assessment.overallRiskScore}/100 (${assessment.riskCategory.toUpperCase()})`,
        ``,
        `### Risk Dimensions`,
        `| Dimension | Score | Level |`,
        `|-----------|-------|-------|`,
        `| Vendor Concentration | ${assessment.vendorConcentration.score} | ${assessment.vendorConcentration.level} |`,
        `| End of Life | ${assessment.endOfLife.score} | ${assessment.endOfLife.level} |`,
        `| Security Gaps | ${assessment.securityGaps.score} | ${assessment.securityGaps.level} |`,
        `| Technical Debt | ${assessment.technicalDebt.score} | ${assessment.technicalDebt.level} |`,
        `| Compliance Risk | ${assessment.complianceRisk.score} | ${assessment.complianceRisk.level} |`,
        `| Integration Complexity | ${assessment.integrationComplexity.score} | ${assessment.integrationComplexity.level} |`,
        `| License Risk | ${assessment.licenseRisk.score} | ${assessment.licenseRisk.level} |`,
        `| Business Continuity | ${assessment.businessContinuity.score} | ${assessment.businessContinuity.level} |`,
        ``,
        `### Summary`,
        assessment.summary,
        ``,
        `**Critical Issues:** ${assessment.criticalIssueCount}`,
        `**High Priority Issues:** ${assessment.highIssueCount}`,
      ];

      if (assessment.topRisks.length > 0) {
        contentParts.push(``, `### Top Risks`);
        for (const risk of assessment.topRisks.slice(0, 5)) {
          contentParts.push(`- **[${risk.severity.toUpperCase()}]** ${risk.description}`);
        }
      }

      return {
        content: contentParts.join('\n'),
        metadata: { assessment }
      };
    } catch (error) {
      console.error('[RiskAssessmentAgent] Error:', error);
      return {
        content: `Error performing risk assessment: ${error instanceof Error ? error.message : 'Unknown error'}`,
        metadata: { error: String(error) }
      };
    }
  }
};

export default performRiskAssessment;
