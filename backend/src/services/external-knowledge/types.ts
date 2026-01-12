/**
 * External Knowledge Types
 *
 * Types for fetching and caching external knowledge from cloud providers.
 */

export type ExternalKnowledgeSource = 'aws' | 'azure' | 'gcp' | 'wikidata';

export interface ExternalKnowledgeItem {
  id: string;
  source: ExternalKnowledgeSource;
  name_en: string;
  name_it?: string;
  category: string;
  subcategory?: string;
  description_en: string;
  description_it?: string;
  keywords: string[];
  vendor: string;
  pricing_model?: string;
  service_family?: string;
  fetched_at: Date;
  raw_data?: Record<string, unknown>;
}

export interface FetchResult {
  items: ExternalKnowledgeItem[];
  source: ExternalKnowledgeSource;
  fetched_at: Date;
  item_count: number;
  duration_ms: number;
  errors?: string[];
}

export interface CachedCatalog {
  items: ExternalKnowledgeItem[];
  fetched_at: Date;
  expires_at: Date;
  source_counts: Record<ExternalKnowledgeSource, number>;
}

export interface ExternalKnowledgeConfig {
  enableAWS: boolean;
  enableAzure: boolean;
  enableGCP: boolean;
  enableWikidata: boolean;
  cacheTTLHours: number;
  maxItemsPerSource: number;
  gcpApiKey?: string;
}

export const DEFAULT_CONFIG: ExternalKnowledgeConfig = {
  enableAWS: true,
  enableAzure: true,
  enableGCP: false, // Requires API key
  enableWikidata: false, // Optional
  cacheTTLHours: 24 * 7, // 1 week
  maxItemsPerSource: 2000,
};

// AWS Service Categories mapping
export const AWS_SERVICE_CATEGORIES: Record<string, string> = {
  'AmazonEC2': 'Compute',
  'AmazonS3': 'Storage',
  'AmazonRDS': 'Database',
  'AWSLambda': 'Compute',
  'AmazonDynamoDB': 'Database',
  'AmazonCloudFront': 'Networking',
  'AmazonVPC': 'Networking',
  'AmazonSNS': 'Application Integration',
  'AmazonSQS': 'Application Integration',
  'AWSCloudFormation': 'Management',
  'AmazonCloudWatch': 'Management',
  'AWSIAM': 'Security',
  'AWSKms': 'Security',
  'AmazonECS': 'Containers',
  'AmazonEKS': 'Containers',
  'AmazonSageMaker': 'AI & ML',
  'AmazonBedrock': 'AI & ML',
  'AWSGlue': 'Analytics',
  'AmazonRedshift': 'Analytics',
  'AmazonKinesis': 'Analytics',
  'AmazonElastiCache': 'Database',
  'AmazonElasticSearch': 'Analytics',
  'AWSStep Functions': 'Application Integration',
  'AWSAppSync': 'Application Integration',
  'AWSAmplify': 'Frontend Web & Mobile',
  'AWSCognito': 'Security',
  'AWSSecretsMana': 'Security',
  'AWSCodeBuild': 'Developer Tools',
  'AWSCodePipeline': 'Developer Tools',
  'AWSCodeDeploy': 'Developer Tools',
};

// Azure Service Families
export const AZURE_SERVICE_FAMILIES: Record<string, string> = {
  'Compute': 'Compute',
  'Networking': 'Networking',
  'Storage': 'Storage',
  'Databases': 'Database',
  'AI + Machine Learning': 'AI & ML',
  'Analytics': 'Analytics',
  'Integration': 'Application Integration',
  'Identity': 'Security',
  'Security': 'Security',
  'DevOps': 'Developer Tools',
  'Management and Governance': 'Management',
  'Containers': 'Containers',
  'Web': 'Web',
  'Internet of Things': 'IoT',
};

// Utility to generate slug from service name
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
}

// Format AWS service name for display
export function formatAWSServiceName(serviceCode: string): string {
  // Remove "Amazon" or "AWS" prefix and add spaces before capitals
  return serviceCode
    .replace(/^(Amazon|AWS)/, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .trim();
}
