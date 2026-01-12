/**
 * Technology Stack Analyzer
 *
 * Analyzes technology decisions, identifies rationalization opportunities,
 * and provides modernization recommendations.
 *
 * Capabilities:
 * 1. Layer Classification - Categorize into architectural tiers
 * 2. Redundancy Detection - Find overlapping capabilities
 * 3. Version Analysis - Identify outdated versions, EOL products
 * 4. Compatibility Matrix - Check integration compatibility
 * 5. Cloud Readiness - Score for cloud migration
 * 6. Vendor Lock-in - Assess proprietary vs open standards
 */

import { SubAgent, SubAgentResult } from '../types';

// ============================================================================
// Types
// ============================================================================

export type StackTier =
  | 'presentation'
  | 'business'
  | 'integration'
  | 'data'
  | 'infrastructure'
  | 'security'
  | 'devops'
  | 'monitoring';

export type ModernizationReason =
  | 'eol'
  | 'security'
  | 'performance'
  | 'cost'
  | 'capability'
  | 'cloud_native'
  | 'maintenance';

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
  description?: string;
  version?: string;
  deployment_type?: string;
  lifecycle_stage?: string;
  integrations?: string[];
  technology_tags?: string[];
}

export interface StackItem {
  id: string;
  name: string;
  vendor?: string;
  tier: StackTier;
  category: string;
  capabilities: string[];
  isModern: boolean;
  cloudReady: boolean;
  openStandards: boolean;
  version?: string;
  issues: string[];
}

export interface StackLayer {
  tier: StackTier;
  items: StackItem[];
  healthScore: number;
  issues: string[];
  recommendations: string[];
}

export interface RedundancyCluster {
  capability: string;
  items: string[];
  recommendedConsolidation: string;
  potentialSavings?: number;
  effort: 'low' | 'medium' | 'high';
}

export interface RationalizationItem {
  items: string[];
  targetItem: string;
  rationale: string;
  estimatedSavings?: number;
  effort: 'low' | 'medium' | 'high';
  risk: 'low' | 'medium' | 'high';
  category: string;
}

export interface ModernizationItem {
  currentItem: string;
  currentVersion?: string;
  recommendedReplacement: string;
  reason: ModernizationReason;
  priority: 'critical' | 'high' | 'medium' | 'low';
  migrationPath: string[];
  estimatedEffort: string;
  benefits: string[];
}

export interface TechnologyGap {
  tier: StackTier;
  capability: string;
  severity: 'critical' | 'medium' | 'low';
  recommendation: string;
}

export interface TechStackAnalysis {
  stackVisualization: StackLayer[];
  rationalizationOpportunities: RationalizationItem[];
  modernizationRecommendations: ModernizationItem[];
  technologyDebtScore: number;  // 0-100, higher = more debt
  stackHealthScore: number;     // 0-100, higher = healthier
  redundancies: RedundancyCluster[];
  gaps: TechnologyGap[];
  cloudReadinessScore: number;
  vendorLockInScore: number;
  mermaidDiagram: string;
  summary: string;
}

// ============================================================================
// Classification Rules
// ============================================================================

// Keywords for tier classification
const TIER_KEYWORDS: Record<StackTier, string[]> = {
  presentation: [
    'web', 'mobile', 'frontend', 'ui', 'ux', 'portal', 'app', 'client',
    'angular', 'react', 'vue', 'wordpress', 'sharepoint', 'intranet'
  ],
  business: [
    'erp', 'crm', 'hrm', 'scm', 'plm', 'workflow', 'bpm', 'salesforce',
    'sap', 'oracle ebs', 'dynamics', 'workday', 'servicenow'
  ],
  integration: [
    'api', 'middleware', 'esb', 'integration', 'etl', 'mq', 'kafka',
    'mulesoft', 'boomi', 'talend', 'informatica', 'tibco', 'webmethods'
  ],
  data: [
    'database', 'data warehouse', 'analytics', 'bi', 'reporting', 'sql',
    'oracle db', 'postgresql', 'mysql', 'mongodb', 'snowflake', 'databricks',
    'tableau', 'power bi', 'looker', 'qlik', 'elasticsearch'
  ],
  infrastructure: [
    'server', 'vm', 'container', 'kubernetes', 'docker', 'cloud', 'aws',
    'azure', 'gcp', 'vmware', 'citrix', 'storage', 'compute', 'network',
    'load balancer', 'cdn', 'dns'
  ],
  security: [
    'security', 'firewall', 'antivirus', 'identity', 'iam', 'sso', 'mfa',
    'encryption', 'vault', 'siem', 'endpoint', 'waf', 'dlp', 'pam'
  ],
  devops: [
    'devops', 'ci/cd', 'jenkins', 'gitlab', 'github', 'azure devops',
    'terraform', 'ansible', 'puppet', 'chef', 'helm', 'argocd'
  ],
  monitoring: [
    'monitoring', 'observability', 'apm', 'logging', 'alerting', 'metrics',
    'prometheus', 'grafana', 'datadog', 'splunk', 'new relic', 'dynatrace'
  ]
};

// Capability mappings for redundancy detection
const CAPABILITY_KEYWORDS: Record<string, string[]> = {
  'Email & Collaboration': ['email', 'outlook', 'gmail', 'teams', 'slack', 'zoom', 'collaboration'],
  'CRM': ['crm', 'salesforce', 'hubspot', 'dynamics crm', 'customer relationship'],
  'ERP': ['erp', 'sap', 'oracle ebs', 'dynamics 365', 'netsuite'],
  'Project Management': ['project', 'jira', 'asana', 'monday', 'trello', 'ms project'],
  'Cloud Compute': ['ec2', 'azure vm', 'compute engine', 'virtual machine'],
  'Cloud Storage': ['s3', 'blob', 'cloud storage', 'object storage'],
  'Container Platform': ['kubernetes', 'k8s', 'openshift', 'ecs', 'aks', 'gke'],
  'Database': ['database', 'sql', 'postgresql', 'mysql', 'oracle db', 'sql server'],
  'Data Warehouse': ['snowflake', 'redshift', 'bigquery', 'synapse', 'data warehouse'],
  'BI & Analytics': ['tableau', 'power bi', 'looker', 'qlik', 'analytics'],
  'Identity & Access': ['okta', 'azure ad', 'auth0', 'ping', 'iam', 'identity'],
  'SIEM': ['siem', 'splunk', 'sentinel', 'qradar', 'sumo logic'],
  'Endpoint Protection': ['endpoint', 'crowdstrike', 'carbon black', 'defender', 'antivirus'],
  'Backup & DR': ['backup', 'veeam', 'commvault', 'rubrik', 'disaster recovery'],
  'Service Desk': ['itsm', 'servicenow', 'jira service', 'freshservice', 'zendesk'],
  'API Gateway': ['api gateway', 'kong', 'apigee', 'aws api', 'azure api'],
  'Message Queue': ['kafka', 'rabbitmq', 'sqs', 'service bus', 'message queue'],
  'CI/CD': ['jenkins', 'gitlab ci', 'github actions', 'azure pipelines', 'ci/cd'],
  'Monitoring': ['prometheus', 'grafana', 'datadog', 'new relic', 'monitoring'],
  'Log Management': ['splunk', 'elk', 'elasticsearch', 'logstash', 'logging']
};

// Modern technology indicators
const MODERN_INDICATORS = [
  'cloud', 'saas', 'kubernetes', 'container', 'serverless', 'microservice',
  'api-first', 'graphql', 'react', 'vue', 'angular', 'typescript', 'go',
  'rust', 'python 3', 'node.js', 'spring boot', 'docker'
];

// Cloud-native indicators
const CLOUD_NATIVE_INDICATORS = [
  'aws', 'azure', 'gcp', 'cloud', 'saas', 'paas', 'serverless',
  'kubernetes', 'lambda', 'functions', 'managed', 'elastic'
];

// Open standards indicators
const OPEN_STANDARDS = [
  'rest', 'graphql', 'oauth', 'oidc', 'saml', 'openid', 'json', 'yaml',
  'kubernetes', 'docker', 'terraform', 'open source', 'linux', 'postgresql'
];

// EOL/Legacy products
const LEGACY_PRODUCTS: Record<string, { replacement: string; reason: ModernizationReason }> = {
  'windows server 2012': { replacement: 'Windows Server 2022', reason: 'eol' },
  'sql server 2014': { replacement: 'SQL Server 2022 or Azure SQL', reason: 'eol' },
  'oracle 11g': { replacement: 'Oracle 19c or PostgreSQL', reason: 'eol' },
  'sharepoint 2013': { replacement: 'SharePoint Online', reason: 'eol' },
  'exchange 2013': { replacement: 'Exchange Online', reason: 'eol' },
  'centos': { replacement: 'Rocky Linux or RHEL', reason: 'eol' },
  'java 8': { replacement: 'Java 17+ LTS', reason: 'maintenance' },
  'dotnet framework': { replacement: '.NET 8+', reason: 'capability' },
  'angular.js': { replacement: 'Angular 17+ or React', reason: 'maintenance' },
  'jquery': { replacement: 'Modern framework (React, Vue)', reason: 'capability' },
  'svn': { replacement: 'Git', reason: 'capability' },
  'jenkins': { replacement: 'GitHub Actions or GitLab CI', reason: 'maintenance' }
};

// ============================================================================
// Analysis Functions
// ============================================================================

/**
 * Classify item into stack tier
 */
function classifyTier(item: PortfolioItem): StackTier {
  const textToAnalyze = [
    item.name,
    item.category,
    item.subcategory,
    item.description,
    ...(item.technology_tags || [])
  ].filter(Boolean).join(' ').toLowerCase();

  // Score each tier
  const tierScores: Record<StackTier, number> = {
    presentation: 0,
    business: 0,
    integration: 0,
    data: 0,
    infrastructure: 0,
    security: 0,
    devops: 0,
    monitoring: 0
  };

  for (const [tier, keywords] of Object.entries(TIER_KEYWORDS)) {
    for (const keyword of keywords) {
      if (textToAnalyze.includes(keyword)) {
        tierScores[tier as StackTier] += 1;
      }
    }
  }

  // Find tier with highest score
  let maxTier: StackTier = 'infrastructure';
  let maxScore = 0;

  for (const [tier, score] of Object.entries(tierScores)) {
    if (score > maxScore) {
      maxScore = score;
      maxTier = tier as StackTier;
    }
  }

  // Default to business for applications if no clear match
  if (maxScore === 0 && (item.category || '').toLowerCase().includes('application')) {
    return 'business';
  }

  return maxTier;
}

/**
 * Identify capabilities of an item
 */
function identifyCapabilities(item: PortfolioItem): string[] {
  const capabilities: string[] = [];
  const textToAnalyze = [
    item.name,
    item.category,
    item.subcategory,
    item.description
  ].filter(Boolean).join(' ').toLowerCase();

  for (const [capability, keywords] of Object.entries(CAPABILITY_KEYWORDS)) {
    if (keywords.some(kw => textToAnalyze.includes(kw))) {
      capabilities.push(capability);
    }
  }

  return capabilities;
}

/**
 * Check if item is modern
 */
function isModernTech(item: PortfolioItem): boolean {
  const textToAnalyze = [
    item.name,
    item.description,
    item.deployment_type,
    ...(item.technology_tags || [])
  ].filter(Boolean).join(' ').toLowerCase();

  const modernMatches = MODERN_INDICATORS.filter(ind => textToAnalyze.includes(ind));

  // Check deployment type
  if (item.deployment_type === 'saas' || item.deployment_type === 'cloud') {
    return true;
  }

  // Check lifecycle stage
  if (item.lifecycle_stage === 'growth' || item.lifecycle_stage === 'introduction') {
    return true;
  }

  return modernMatches.length >= 2;
}

/**
 * Check cloud readiness
 */
function isCloudReady(item: PortfolioItem): boolean {
  const textToAnalyze = [
    item.name,
    item.description,
    item.deployment_type
  ].filter(Boolean).join(' ').toLowerCase();

  return CLOUD_NATIVE_INDICATORS.some(ind => textToAnalyze.includes(ind)) ||
         item.deployment_type === 'saas' ||
         item.deployment_type === 'cloud';
}

/**
 * Check for open standards
 */
function usesOpenStandards(item: PortfolioItem): boolean {
  const textToAnalyze = [
    item.name,
    item.description,
    ...(item.technology_tags || [])
  ].filter(Boolean).join(' ').toLowerCase();

  return OPEN_STANDARDS.filter(std => textToAnalyze.includes(std)).length >= 1;
}

/**
 * Identify issues with an item
 */
function identifyIssues(item: PortfolioItem): string[] {
  const issues: string[] = [];
  const nameLower = (item.name || '').toLowerCase();

  // Check for legacy products
  for (const [legacy, _] of Object.entries(LEGACY_PRODUCTS)) {
    if (nameLower.includes(legacy)) {
      issues.push(`Legacy technology: ${legacy}`);
    }
  }

  // Check lifecycle stage
  if (item.lifecycle_stage === 'end_of_life' || item.lifecycle_stage === 'decline') {
    issues.push('End of life or declining lifecycle stage');
  }

  // Check status
  if (item.status === 'deprecated') {
    issues.push('Deprecated status');
  }

  // Check deployment type for on-premise
  if (item.deployment_type === 'on_premise' || item.deployment_type === 'legacy') {
    issues.push('On-premise deployment - consider cloud migration');
  }

  return issues;
}

/**
 * Convert portfolio items to stack items
 */
function convertToStackItems(items: PortfolioItem[]): StackItem[] {
  return items.map(item => ({
    id: item.id,
    name: item.name,
    vendor: item.vendor,
    tier: classifyTier(item),
    category: item.category || 'Other',
    capabilities: identifyCapabilities(item),
    isModern: isModernTech(item),
    cloudReady: isCloudReady(item),
    openStandards: usesOpenStandards(item),
    version: item.version,
    issues: identifyIssues(item)
  }));
}

/**
 * Organize items by tier
 */
function organizeByTier(stackItems: StackItem[]): StackLayer[] {
  const tiers: StackTier[] = [
    'presentation', 'business', 'integration', 'data',
    'infrastructure', 'security', 'devops', 'monitoring'
  ];

  return tiers.map(tier => {
    const tierItems = stackItems.filter(i => i.tier === tier);

    // Calculate health score for tier
    let healthScore = 100;
    let issueCount = 0;

    for (const item of tierItems) {
      issueCount += item.issues.length;
      if (!item.isModern) healthScore -= 5;
      if (!item.cloudReady) healthScore -= 3;
      if (!item.openStandards) healthScore -= 2;
    }

    healthScore = Math.max(0, healthScore - (issueCount * 5));

    // Generate tier-level issues and recommendations
    const issues: string[] = [];
    const recommendations: string[] = [];

    if (tierItems.length === 0) {
      issues.push(`No ${tier} layer solutions detected`);
      recommendations.push(`Evaluate ${tier} layer requirements`);
    }

    const legacyItems = tierItems.filter(i => !i.isModern);
    if (legacyItems.length > tierItems.length / 2 && tierItems.length > 0) {
      issues.push(`High proportion of legacy items in ${tier} layer`);
      recommendations.push(`Modernize ${tier} layer solutions`);
    }

    return {
      tier,
      items: tierItems,
      healthScore: Math.max(0, Math.min(100, healthScore)),
      issues,
      recommendations
    };
  });
}

/**
 * Detect redundancies
 */
function detectRedundancies(stackItems: StackItem[]): RedundancyCluster[] {
  const redundancies: RedundancyCluster[] = [];
  const capabilityMap = new Map<string, StackItem[]>();

  // Group items by capability
  for (const item of stackItems) {
    for (const capability of item.capabilities) {
      if (!capabilityMap.has(capability)) {
        capabilityMap.set(capability, []);
      }
      capabilityMap.get(capability)!.push(item);
    }
  }

  // Find redundancies (multiple items for same capability)
  for (const [capability, items] of capabilityMap) {
    if (items.length > 1) {
      // Find the most modern item as recommended
      const recommended = items.reduce((best, current) => {
        if (current.isModern && current.cloudReady) return current;
        if (current.isModern && !best.isModern) return current;
        return best;
      }, items[0]);

      redundancies.push({
        capability,
        items: items.map(i => i.name),
        recommendedConsolidation: recommended.name,
        effort: items.length > 3 ? 'high' : items.length > 2 ? 'medium' : 'low'
      });
    }
  }

  return redundancies.sort((a, b) => b.items.length - a.items.length);
}

/**
 * Generate rationalization opportunities
 */
function generateRationalizations(
  stackItems: StackItem[],
  redundancies: RedundancyCluster[]
): RationalizationItem[] {
  const rationalizations: RationalizationItem[] = [];

  // From redundancies
  for (const redundancy of redundancies) {
    if (redundancy.items.length > 1) {
      const itemsToConsolidate = redundancy.items.filter(i => i !== redundancy.recommendedConsolidation);

      rationalizations.push({
        items: itemsToConsolidate,
        targetItem: redundancy.recommendedConsolidation,
        rationale: `Multiple solutions for ${redundancy.capability} capability`,
        effort: redundancy.effort,
        risk: redundancy.effort === 'high' ? 'medium' : 'low',
        category: redundancy.capability
      });
    }
  }

  // Find vendor consolidation opportunities
  const vendorItems = new Map<string, StackItem[]>();
  for (const item of stackItems) {
    const vendor = (item.vendor || 'Unknown').toLowerCase();
    if (!vendorItems.has(vendor)) vendorItems.set(vendor, []);
    vendorItems.get(vendor)!.push(item);
  }

  // Suggest vendor consolidation for similar capabilities
  for (const [vendor, items] of vendorItems) {
    if (items.length >= 3) {
      // Check if vendor offers integrated suite
      if (['microsoft', 'google', 'aws', 'salesforce', 'oracle'].includes(vendor)) {
        const nonVendorItems = stackItems.filter(i =>
          (i.vendor || '').toLowerCase() !== vendor &&
          items.some(vi => vi.capabilities.some(c => vi.capabilities.includes(c)))
        );

        if (nonVendorItems.length > 0) {
          rationalizations.push({
            items: nonVendorItems.map(i => i.name),
            targetItem: `${vendor.charAt(0).toUpperCase() + vendor.slice(1)} integrated suite`,
            rationale: `Opportunity to consolidate with existing ${vendor} investments`,
            effort: 'high',
            risk: 'medium',
            category: 'Vendor Consolidation'
          });
        }
      }
    }
  }

  return rationalizations.slice(0, 10);
}

/**
 * Generate modernization recommendations
 */
function generateModernizationRecs(stackItems: StackItem[]): ModernizationItem[] {
  const recommendations: ModernizationItem[] = [];

  for (const item of stackItems) {
    const nameLower = (item.name || '').toLowerCase();

    // Check against known legacy products
    for (const [legacy, { replacement, reason }] of Object.entries(LEGACY_PRODUCTS)) {
      if (nameLower.includes(legacy)) {
        recommendations.push({
          currentItem: item.name,
          currentVersion: item.version,
          recommendedReplacement: replacement,
          reason,
          priority: reason === 'eol' || reason === 'security' ? 'critical' : 'medium',
          migrationPath: [
            'Assess current state and dependencies',
            `Evaluate ${replacement}`,
            'Plan migration approach',
            'Execute phased migration',
            'Decommission legacy system'
          ],
          estimatedEffort: 'Medium to High',
          benefits: [
            'Improved security posture',
            'Better vendor support',
            'Modern features and capabilities',
            'Reduced technical debt'
          ]
        });
        break;
      }
    }

    // Recommend modernization for non-cloud items
    if (!item.cloudReady && item.tier !== 'security') {
      recommendations.push({
        currentItem: item.name,
        recommendedReplacement: `Cloud-native ${item.category || item.tier} solution`,
        reason: 'cloud_native',
        priority: 'medium',
        migrationPath: [
          'Evaluate cloud alternatives',
          'Assess migration complexity',
          'Plan hybrid or full migration'
        ],
        estimatedEffort: 'Variable',
        benefits: [
          'Improved scalability',
          'Reduced infrastructure management',
          'Better disaster recovery',
          'Consumption-based pricing'
        ]
      });
    }
  }

  // Sort by priority and deduplicate
  return recommendations
    .sort((a, b) => {
      const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    })
    .slice(0, 10);
}

/**
 * Identify technology gaps
 */
function identifyGaps(layers: StackLayer[]): TechnologyGap[] {
  const gaps: TechnologyGap[] = [];

  // Critical layers that should have coverage
  const criticalLayers: Record<StackTier, { capability: string; severity: 'critical' | 'medium' | 'low' }[]> = {
    security: [
      { capability: 'Identity & Access Management', severity: 'critical' },
      { capability: 'Endpoint Protection', severity: 'critical' },
      { capability: 'Network Security', severity: 'critical' }
    ],
    data: [
      { capability: 'Backup & Disaster Recovery', severity: 'critical' },
      { capability: 'Database Management', severity: 'medium' }
    ],
    monitoring: [
      { capability: 'Infrastructure Monitoring', severity: 'medium' },
      { capability: 'Application Performance', severity: 'medium' }
    ],
    devops: [
      { capability: 'CI/CD Pipeline', severity: 'medium' },
      { capability: 'Version Control', severity: 'critical' }
    ],
    integration: [
      { capability: 'API Management', severity: 'medium' }
    ],
    infrastructure: [],
    presentation: [],
    business: []
  };

  for (const layer of layers) {
    const requirements = criticalLayers[layer.tier] || [];

    for (const req of requirements) {
      const hasCapability = layer.items.some(item =>
        item.capabilities.some(c => c.toLowerCase().includes(req.capability.toLowerCase().split(' ')[0]))
      );

      if (!hasCapability && layer.items.length > 0) {
        gaps.push({
          tier: layer.tier,
          capability: req.capability,
          severity: req.severity,
          recommendation: `Implement ${req.capability} solution in ${layer.tier} layer`
        });
      }
    }
  }

  return gaps.sort((a, b) => {
    const severityOrder = { critical: 0, medium: 1, low: 2 };
    return severityOrder[a.severity] - severityOrder[b.severity];
  });
}

/**
 * Calculate aggregate scores
 */
function calculateScores(
  stackItems: StackItem[],
  layers: StackLayer[]
): { healthScore: number; debtScore: number; cloudScore: number; lockInScore: number } {
  // Stack health score
  const layerHealthSum = layers.reduce((sum, l) => sum + l.healthScore, 0);
  const healthScore = Math.round(layerHealthSum / layers.length);

  // Technical debt score (higher = more debt)
  let debtScore = 0;
  for (const item of stackItems) {
    if (!item.isModern) debtScore += 10;
    if (item.issues.length > 0) debtScore += item.issues.length * 5;
  }
  debtScore = Math.min(100, debtScore);

  // Cloud readiness score
  const cloudReadyItems = stackItems.filter(i => i.cloudReady).length;
  const cloudScore = Math.round((cloudReadyItems / Math.max(stackItems.length, 1)) * 100);

  // Vendor lock-in score (higher = more lock-in)
  const openItems = stackItems.filter(i => i.openStandards).length;
  const lockInScore = Math.round(100 - (openItems / Math.max(stackItems.length, 1)) * 100);

  return { healthScore, debtScore, cloudScore, lockInScore };
}

/**
 * Generate Mermaid diagram
 */
function generateMermaidDiagram(layers: StackLayer[]): string {
  const lines = ['graph TD'];
  const subgraphs: string[] = [];

  for (const layer of layers) {
    if (layer.items.length === 0) continue;

    subgraphs.push(`  subgraph ${layer.tier.charAt(0).toUpperCase() + layer.tier.slice(1)}`);

    for (const item of layer.items) {
      const nodeId = item.id.replace(/[^a-zA-Z0-9]/g, '_');
      const status = item.isModern ? ':::modern' : item.issues.length > 0 ? ':::legacy' : '';
      subgraphs.push(`    ${nodeId}["${item.name}"]${status}`);
    }

    subgraphs.push('  end');
  }

  lines.push(...subgraphs);

  // Add styling
  lines.push('');
  lines.push('  classDef modern fill:#90EE90');
  lines.push('  classDef legacy fill:#FFB6C1');

  return lines.join('\n');
}

/**
 * Generate summary
 */
function generateSummary(
  stackItems: StackItem[],
  scores: { healthScore: number; debtScore: number; cloudScore: number; lockInScore: number },
  redundancies: RedundancyCluster[],
  gaps: TechnologyGap[]
): string {
  const parts: string[] = [];

  parts.push(`Technology stack analysis of ${stackItems.length} items.`);

  if (scores.healthScore >= 70) {
    parts.push(`Stack health is good (${scores.healthScore}/100).`);
  } else if (scores.healthScore >= 50) {
    parts.push(`Stack health needs attention (${scores.healthScore}/100).`);
  } else {
    parts.push(`Stack health is concerning (${scores.healthScore}/100).`);
  }

  if (scores.debtScore >= 50) {
    parts.push(`Technical debt is high (${scores.debtScore}/100).`);
  }

  if (scores.cloudScore < 50) {
    parts.push(`Cloud readiness is low (${scores.cloudScore}%).`);
  }

  if (redundancies.length > 0) {
    parts.push(`Found ${redundancies.length} potential consolidation opportunities.`);
  }

  if (gaps.filter(g => g.severity === 'critical').length > 0) {
    parts.push(`Critical capability gaps identified.`);
  }

  return parts.join(' ');
}

// ============================================================================
// Main Analysis Function
// ============================================================================

/**
 * Analyze technology stack
 */
export async function analyzeTechStack(
  tenantId: string,
  items: PortfolioItem[]
): Promise<TechStackAnalysis> {
  console.log(`\n📊 Analyzing technology stack for tenant ${tenantId}...`);
  console.log(`   Items: ${items.length}`);

  // Convert and classify
  const stackItems = convertToStackItems(items);

  // Organize by tier
  const layers = organizeByTier(stackItems);

  // Detect redundancies
  const redundancies = detectRedundancies(stackItems);

  // Generate rationalizations
  const rationalizations = generateRationalizations(stackItems, redundancies);

  // Generate modernization recommendations
  const modernizationRecs = generateModernizationRecs(stackItems);

  // Identify gaps
  const gaps = identifyGaps(layers);

  // Calculate scores
  const scores = calculateScores(stackItems, layers);

  // Generate diagram
  const diagram = generateMermaidDiagram(layers);

  // Generate summary
  const summary = generateSummary(stackItems, scores, redundancies, gaps);

  console.log(`   Health Score: ${scores.healthScore}`);
  console.log(`   Technical Debt: ${scores.debtScore}`);
  console.log(`   Cloud Readiness: ${scores.cloudScore}%`);

  return {
    stackVisualization: layers,
    rationalizationOpportunities: rationalizations,
    modernizationRecommendations: modernizationRecs,
    technologyDebtScore: scores.debtScore,
    stackHealthScore: scores.healthScore,
    redundancies,
    gaps,
    cloudReadinessScore: scores.cloudScore,
    vendorLockInScore: scores.lockInScore,
    mermaidDiagram: diagram,
    summary
  };
}

// ============================================================================
// Sub-Agent Implementation
// ============================================================================

export const techStackAnalyzer: SubAgent = {
  name: 'EXPLORER',  // Using existing slot

  async run(args: Record<string, unknown>): Promise<SubAgentResult> {
    const tenantId = args.tenantId as string;
    const items = args.items as PortfolioItem[] || [];

    if (!tenantId) {
      return {
        content: 'Tenant ID is required for tech stack analysis.',
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
      const analysis = await analyzeTechStack(tenantId, items);

      const contentParts = [
        `## Technology Stack Analysis`,
        ``,
        `**Summary:** ${analysis.summary}`,
        ``,
        `### Scores`,
        `| Metric | Score |`,
        `|--------|-------|`,
        `| Stack Health | ${analysis.stackHealthScore}/100 |`,
        `| Technical Debt | ${analysis.technologyDebtScore}/100 |`,
        `| Cloud Readiness | ${analysis.cloudReadinessScore}% |`,
        `| Vendor Lock-in | ${analysis.vendorLockInScore}/100 |`,
      ];

      // Layer summary
      contentParts.push(``, `### Stack Layers`);
      for (const layer of analysis.stackVisualization) {
        if (layer.items.length > 0) {
          contentParts.push(`- **${layer.tier.charAt(0).toUpperCase() + layer.tier.slice(1)}:** ${layer.items.length} items (Health: ${layer.healthScore})`);
        }
      }

      // Redundancies
      if (analysis.redundancies.length > 0) {
        contentParts.push(``, `### Consolidation Opportunities`);
        for (const r of analysis.redundancies.slice(0, 5)) {
          contentParts.push(`- **${r.capability}:** ${r.items.join(', ')} → Consolidate to ${r.recommendedConsolidation}`);
        }
      }

      // Gaps
      const criticalGaps = analysis.gaps.filter(g => g.severity === 'critical');
      if (criticalGaps.length > 0) {
        contentParts.push(``, `### Critical Gaps`);
        for (const gap of criticalGaps) {
          contentParts.push(`- ${gap.capability} (${gap.tier}): ${gap.recommendation}`);
        }
      }

      // Modernization
      const urgentMod = analysis.modernizationRecommendations.filter(m => m.priority === 'critical');
      if (urgentMod.length > 0) {
        contentParts.push(``, `### Urgent Modernization`);
        for (const mod of urgentMod) {
          contentParts.push(`- **${mod.currentItem}** → ${mod.recommendedReplacement} (${mod.reason})`);
        }
      }

      return {
        content: contentParts.join('\n'),
        metadata: { analysis }
      };
    } catch (error) {
      console.error('[TechStackAnalyzer] Error:', error);
      return {
        content: `Error analyzing tech stack: ${error instanceof Error ? error.message : 'Unknown error'}`,
        metadata: { error: String(error) }
      };
    }
  }
};

export default analyzeTechStack;
