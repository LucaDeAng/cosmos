/**
 * Semantic Deduplicator
 *
 * Detects and merges duplicate products/services based on:
 * 1. Hardcoded alias mappings (e.g., M365 -> Microsoft 365)
 * 2. Semantic similarity using embeddings
 * 3. Fuzzy string matching
 */

import { OpenAIEmbeddings } from '@langchain/openai';

// ============================================================================
// TYPES
// ============================================================================

export interface DuplicateCluster {
  canonical_name: string;
  canonical_id?: string;
  variants: Array<{
    name: string;
    id?: string;
    similarity: number;
    match_type: 'alias' | 'semantic' | 'fuzzy';
  }>;
  confidence: number;
}

export interface DeduplicationResult {
  clusters: DuplicateCluster[];
  merged_count: number;
  unique_count: number;
  processing_time_ms: number;
}

export interface DeduplicatableItem {
  id?: string;
  name: string;
  vendor?: string;
  category?: string;
  description?: string;
  [key: string]: unknown;
}

// ============================================================================
// KNOWN ALIASES DATABASE (50+ common aliases)
// ============================================================================

const PRODUCT_ALIASES: Map<string, string> = new Map([
  // Microsoft Products
  ['m365', 'Microsoft 365'],
  ['office 365', 'Microsoft 365'],
  ['o365', 'Microsoft 365'],
  ['office365', 'Microsoft 365'],
  ['ms 365', 'Microsoft 365'],
  ['microsoft office 365', 'Microsoft 365'],
  ['ms office', 'Microsoft Office'],
  ['ms word', 'Microsoft Word'],
  ['ms excel', 'Microsoft Excel'],
  ['ms powerpoint', 'Microsoft PowerPoint'],
  ['ms teams', 'Microsoft Teams'],
  ['azure ad', 'Microsoft Entra ID'],
  ['aad', 'Microsoft Entra ID'],
  ['azure active directory', 'Microsoft Entra ID'],
  ['dynamics 365', 'Microsoft Dynamics 365'],
  ['d365', 'Microsoft Dynamics 365'],
  ['power bi', 'Microsoft Power BI'],
  ['sharepoint online', 'Microsoft SharePoint'],
  ['spo', 'Microsoft SharePoint'],
  ['onedrive for business', 'Microsoft OneDrive'],
  ['exchange online', 'Microsoft Exchange Online'],
  ['exo', 'Microsoft Exchange Online'],
  ['intune', 'Microsoft Intune'],
  ['defender for endpoint', 'Microsoft Defender for Endpoint'],
  ['mde', 'Microsoft Defender for Endpoint'],
  ['vscode', 'Visual Studio Code'],
  ['vs code', 'Visual Studio Code'],

  // Cloud Providers
  ['aws', 'Amazon Web Services'],
  ['amazon aws', 'Amazon Web Services'],
  ['ec2', 'Amazon EC2'],
  ['amazon ec2', 'Amazon EC2'],
  ['s3', 'Amazon S3'],
  ['amazon s3', 'Amazon S3'],
  ['rds', 'Amazon RDS'],
  ['lambda', 'AWS Lambda'],
  ['gcp', 'Google Cloud Platform'],
  ['google cloud', 'Google Cloud Platform'],
  ['gce', 'Google Compute Engine'],
  ['gke', 'Google Kubernetes Engine'],
  ['bigquery', 'Google BigQuery'],
  ['bq', 'Google BigQuery'],
  ['azure', 'Microsoft Azure'],
  ['azure vm', 'Azure Virtual Machines'],
  ['azure sql', 'Azure SQL Database'],
  ['azure blob', 'Azure Blob Storage'],
  ['aks', 'Azure Kubernetes Service'],

  // Databases
  ['postgres', 'PostgreSQL'],
  ['postgresql', 'PostgreSQL'],
  ['pg', 'PostgreSQL'],
  ['mysql', 'MySQL'],
  ['mariadb', 'MariaDB'],
  ['mongo', 'MongoDB'],
  ['mongodb', 'MongoDB'],
  ['mssql', 'Microsoft SQL Server'],
  ['sql server', 'Microsoft SQL Server'],
  ['sqlserver', 'Microsoft SQL Server'],
  ['oracle db', 'Oracle Database'],
  ['oracledb', 'Oracle Database'],
  ['redis', 'Redis'],
  ['elasticsearch', 'Elasticsearch'],
  ['es', 'Elasticsearch'],
  ['opensearch', 'OpenSearch'],
  ['dynamodb', 'Amazon DynamoDB'],
  ['cosmos db', 'Azure Cosmos DB'],
  ['cosmosdb', 'Azure Cosmos DB'],

  // DevOps & Infrastructure
  ['k8s', 'Kubernetes'],
  ['kube', 'Kubernetes'],
  ['kubernetes', 'Kubernetes'],
  ['docker', 'Docker'],
  ['docker desktop', 'Docker Desktop'],
  ['terraform', 'HashiCorp Terraform'],
  ['tf', 'HashiCorp Terraform'],
  ['ansible', 'Red Hat Ansible'],
  ['jenkins', 'Jenkins'],
  ['gitlab', 'GitLab'],
  ['github', 'GitHub'],
  ['gh', 'GitHub'],
  ['github actions', 'GitHub Actions'],
  ['bitbucket', 'Atlassian Bitbucket'],
  ['azure devops', 'Azure DevOps'],
  ['ado', 'Azure DevOps'],
  ['tfs', 'Azure DevOps'],
  ['team foundation server', 'Azure DevOps'],

  // Collaboration & Productivity
  ['slack', 'Slack'],
  ['teams', 'Microsoft Teams'],
  ['zoom', 'Zoom'],
  ['webex', 'Cisco Webex'],
  ['cisco webex', 'Cisco Webex'],
  ['google meet', 'Google Meet'],
  ['gmeet', 'Google Meet'],
  ['google workspace', 'Google Workspace'],
  ['g suite', 'Google Workspace'],
  ['gsuite', 'Google Workspace'],
  ['google apps', 'Google Workspace'],
  ['notion', 'Notion'],
  ['confluence', 'Atlassian Confluence'],
  ['jira', 'Atlassian Jira'],
  ['trello', 'Atlassian Trello'],
  ['asana', 'Asana'],
  ['monday', 'Monday.com'],
  ['monday.com', 'Monday.com'],
  ['basecamp', 'Basecamp'],
  ['clickup', 'ClickUp'],

  // CRM & Sales
  ['salesforce', 'Salesforce'],
  ['sfdc', 'Salesforce'],
  ['sf', 'Salesforce'],
  ['hubspot', 'HubSpot'],
  ['hs', 'HubSpot'],
  ['zoho crm', 'Zoho CRM'],
  ['pipedrive', 'Pipedrive'],
  ['freshsales', 'Freshworks CRM'],

  // Security
  ['okta', 'Okta'],
  ['auth0', 'Auth0'],
  ['onelogin', 'OneLogin'],
  ['crowdstrike', 'CrowdStrike'],
  ['sentinelone', 'SentinelOne'],
  ['palo alto', 'Palo Alto Networks'],
  ['pan', 'Palo Alto Networks'],
  ['fortinet', 'Fortinet'],
  ['fortigate', 'Fortinet FortiGate'],
  ['zscaler', 'Zscaler'],
  ['cloudflare', 'Cloudflare'],
  ['cf', 'Cloudflare'],

  // Monitoring & Observability
  ['datadog', 'Datadog'],
  ['dd', 'Datadog'],
  ['splunk', 'Splunk'],
  ['new relic', 'New Relic'],
  ['newrelic', 'New Relic'],
  ['dynatrace', 'Dynatrace'],
  ['prometheus', 'Prometheus'],
  ['grafana', 'Grafana'],
  ['elk stack', 'Elastic Stack'],
  ['elk', 'Elastic Stack'],
  ['pagerduty', 'PagerDuty'],
  ['opsgenie', 'Atlassian Opsgenie'],

  // Data & Analytics
  ['snowflake', 'Snowflake'],
  ['databricks', 'Databricks'],
  ['tableau', 'Tableau'],
  ['looker', 'Looker'],
  ['metabase', 'Metabase'],
  ['apache spark', 'Apache Spark'],
  ['spark', 'Apache Spark'],
  ['kafka', 'Apache Kafka'],
  ['apache kafka', 'Apache Kafka'],
  ['airflow', 'Apache Airflow'],
  ['apache airflow', 'Apache Airflow'],

  // ERP & Business
  ['sap', 'SAP'],
  ['sap s4hana', 'SAP S/4HANA'],
  ['s4hana', 'SAP S/4HANA'],
  ['sap erp', 'SAP ERP'],
  ['oracle erp', 'Oracle ERP Cloud'],
  ['netsuite', 'Oracle NetSuite'],
  ['workday', 'Workday'],
  ['servicenow', 'ServiceNow'],
  ['snow', 'ServiceNow'],
]);

// Reverse map for quick lookup
const CANONICAL_TO_ALIASES: Map<string, string[]> = new Map();
for (const [alias, canonical] of PRODUCT_ALIASES.entries()) {
  if (!CANONICAL_TO_ALIASES.has(canonical)) {
    CANONICAL_TO_ALIASES.set(canonical, []);
  }
  CANONICAL_TO_ALIASES.get(canonical)!.push(alias);
}

// ============================================================================
// SEMANTIC DEDUPLICATOR CLASS
// ============================================================================

export class SemanticDeduplicator {
  private embeddings: OpenAIEmbeddings | null = null;
  private embeddingCache: Map<string, number[]> = new Map();

  constructor(private options: {
    semanticThreshold?: number;  // Default 0.92 (high similarity required)
    fuzzyThreshold?: number;     // Default 0.85
    enableSemanticSearch?: boolean;
  } = {}) {
    this.options.semanticThreshold ??= 0.92;
    this.options.fuzzyThreshold ??= 0.85;
    this.options.enableSemanticSearch ??= true;

    if (this.options.enableSemanticSearch && process.env.OPENAI_API_KEY) {
      this.embeddings = new OpenAIEmbeddings({
        modelName: 'text-embedding-3-small'
      });
    }
  }

  /**
   * Find duplicate clusters in a list of items
   */
  async findDuplicates(items: DeduplicatableItem[]): Promise<DuplicateCluster[]> {
    const clusters: DuplicateCluster[] = [];
    const processedIds = new Set<string>();

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const itemId = item.id || `item_${i}`;

      if (processedIds.has(itemId)) continue;

      const variants: DuplicateCluster['variants'] = [];

      // Check against all remaining items
      for (let j = i + 1; j < items.length; j++) {
        const otherItem = items[j];
        const otherId = otherItem.id || `item_${j}`;

        if (processedIds.has(otherId)) continue;

        // 1. Check hardcoded aliases
        const aliasMatch = this.checkAliasMatch(item.name, otherItem.name);
        if (aliasMatch) {
          variants.push({
            name: otherItem.name,
            id: otherId,
            similarity: 0.99,
            match_type: 'alias'
          });
          processedIds.add(otherId);
          continue;
        }

        // 2. Check fuzzy string match
        const fuzzyScore = this.calculateFuzzySimilarity(item.name, otherItem.name);
        if (fuzzyScore >= this.options.fuzzyThreshold!) {
          variants.push({
            name: otherItem.name,
            id: otherId,
            similarity: fuzzyScore,
            match_type: 'fuzzy'
          });
          processedIds.add(otherId);
          continue;
        }

        // 3. Check semantic similarity (if enabled)
        if (this.embeddings && this.options.enableSemanticSearch) {
          const semanticScore = await this.calculateSemanticSimilarity(
            `${item.name} ${item.vendor || ''} ${item.description || ''}`,
            `${otherItem.name} ${otherItem.vendor || ''} ${otherItem.description || ''}`
          );

          if (semanticScore >= this.options.semanticThreshold!) {
            variants.push({
              name: otherItem.name,
              id: otherId,
              similarity: semanticScore,
              match_type: 'semantic'
            });
            processedIds.add(otherId);
          }
        }
      }

      // Create cluster if duplicates found
      if (variants.length > 0) {
        // Determine canonical name (prefer known canonical over original)
        const canonical = this.getCanonicalName(item.name) || item.name;

        clusters.push({
          canonical_name: canonical,
          canonical_id: itemId,
          variants,
          confidence: Math.max(...variants.map(v => v.similarity))
        });
      }

      processedIds.add(itemId);
    }

    return clusters;
  }

  /**
   * Merge duplicate items based on clusters
   */
  mergeDuplicates<T extends DeduplicatableItem>(
    items: T[],
    clusters: DuplicateCluster[]
  ): { items: T[]; mergeLog: string[] } {
    const mergeLog: string[] = [];
    const itemsToRemove = new Set<string>();
    const itemMap = new Map<string, T>();

    // Index items by id
    items.forEach((item, idx) => {
      const id = item.id || `item_${idx}`;
      itemMap.set(id, item);
    });

    // Process each cluster
    for (const cluster of clusters) {
      const canonicalItem = itemMap.get(cluster.canonical_id!);
      if (!canonicalItem) continue;

      // Update canonical item name if different
      if (cluster.canonical_name !== canonicalItem.name) {
        mergeLog.push(`Renamed "${canonicalItem.name}" -> "${cluster.canonical_name}"`);
        (canonicalItem as any).original_name = canonicalItem.name;
        canonicalItem.name = cluster.canonical_name;
      }

      // Merge fields from variants
      for (const variant of cluster.variants) {
        const variantItem = itemMap.get(variant.id!);
        if (!variantItem) continue;

        // Merge non-null fields from variant
        for (const [key, value] of Object.entries(variantItem)) {
          if (
            value !== null &&
            value !== undefined &&
            value !== '' &&
            (canonicalItem[key] === null ||
             canonicalItem[key] === undefined ||
             canonicalItem[key] === '')
          ) {
            (canonicalItem as any)[key] = value;
          }
        }

        // Add merge note
        if (!Array.isArray((canonicalItem as any).normalizationNotes)) {
          (canonicalItem as any).normalizationNotes = [];
        }
        (canonicalItem as any).normalizationNotes.push(
          `Merged duplicate: "${variant.name}" (${variant.match_type}, similarity: ${(variant.similarity * 100).toFixed(1)}%)`
        );

        mergeLog.push(`Merged "${variant.name}" into "${cluster.canonical_name}"`);
        itemsToRemove.add(variant.id!);
      }
    }

    // Filter out merged items
    const resultItems = items.filter((item, idx) => {
      const id = item.id || `item_${idx}`;
      return !itemsToRemove.has(id);
    });

    return { items: resultItems, mergeLog };
  }

  /**
   * Full deduplication pipeline
   */
  async deduplicate<T extends DeduplicatableItem>(
    items: T[]
  ): Promise<{ items: T[]; result: DeduplicationResult }> {
    const startTime = Date.now();

    console.log(`\n   Deduplicating ${items.length} items...`);

    // Find duplicate clusters
    const clusters = await this.findDuplicates(items);

    // Merge duplicates
    const { items: mergedItems, mergeLog } = this.mergeDuplicates(items, clusters);

    const result: DeduplicationResult = {
      clusters,
      merged_count: items.length - mergedItems.length,
      unique_count: mergedItems.length,
      processing_time_ms: Date.now() - startTime
    };

    if (clusters.length > 0) {
      console.log(`   Found ${clusters.length} duplicate clusters`);
      console.log(`   Merged ${result.merged_count} items`);
      for (const log of mergeLog.slice(0, 5)) {
        console.log(`   - ${log}`);
      }
      if (mergeLog.length > 5) {
        console.log(`   ... and ${mergeLog.length - 5} more`);
      }
    } else {
      console.log(`   No duplicates found`);
    }

    return { items: mergedItems, result };
  }

  // ==========================================================================
  // HELPER METHODS
  // ==========================================================================

  /**
   * Normalize text for comparison
   */
  private normalize(text: string): string {
    return text
      .toLowerCase()
      .trim()
      .replace(/[^\w\s]/g, ' ')  // Remove special chars
      .replace(/\s+/g, ' ');     // Normalize whitespace
  }

  /**
   * Check if two names are aliases of each other
   */
  private checkAliasMatch(name1: string, name2: string): boolean {
    const norm1 = this.normalize(name1);
    const norm2 = this.normalize(name2);

    // Direct match
    if (norm1 === norm2) return true;

    // Both resolve to same canonical
    const canonical1 = PRODUCT_ALIASES.get(norm1);
    const canonical2 = PRODUCT_ALIASES.get(norm2);

    if (canonical1 && canonical2 && canonical1 === canonical2) return true;

    // One is alias of the other's canonical
    if (canonical1 && this.normalize(canonical1) === norm2) return true;
    if (canonical2 && this.normalize(canonical2) === norm1) return true;

    return false;
  }

  /**
   * Get canonical name for a product
   */
  getCanonicalName(name: string): string | null {
    const norm = this.normalize(name);
    return PRODUCT_ALIASES.get(norm) || null;
  }

  /**
   * Get all known aliases for a canonical product name
   */
  getAliases(canonicalName: string): string[] {
    return CANONICAL_TO_ALIASES.get(canonicalName) || [];
  }

  /**
   * Calculate fuzzy string similarity (Levenshtein-based)
   */
  private calculateFuzzySimilarity(str1: string, str2: string): number {
    const s1 = this.normalize(str1);
    const s2 = this.normalize(str2);

    if (s1 === s2) return 1;

    const len1 = s1.length;
    const len2 = s2.length;

    if (len1 === 0 || len2 === 0) return 0;

    // Levenshtein distance
    const matrix: number[][] = [];

    for (let i = 0; i <= len1; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= len2; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= len1; i++) {
      for (let j = 1; j <= len2; j++) {
        const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + cost
        );
      }
    }

    const distance = matrix[len1][len2];
    const maxLen = Math.max(len1, len2);

    return 1 - distance / maxLen;
  }

  /**
   * Calculate semantic similarity using embeddings
   */
  private async calculateSemanticSimilarity(
    text1: string,
    text2: string
  ): Promise<number> {
    if (!this.embeddings) return 0;

    try {
      // Check cache
      const cached1 = this.embeddingCache.get(text1);
      const cached2 = this.embeddingCache.get(text2);

      let embedding1: number[];
      let embedding2: number[];

      if (cached1) {
        embedding1 = cached1;
      } else {
        [embedding1] = await this.embeddings.embedDocuments([text1]);
        this.embeddingCache.set(text1, embedding1);
      }

      if (cached2) {
        embedding2 = cached2;
      } else {
        [embedding2] = await this.embeddings.embedDocuments([text2]);
        this.embeddingCache.set(text2, embedding2);
      }

      // Cosine similarity
      return this.cosineSimilarity(embedding1, embedding2);
    } catch (error) {
      console.warn('Semantic similarity calculation failed:', error);
      return 0;
    }
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  private cosineSimilarity(vec1: number[], vec2: number[]): number {
    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < vec1.length; i++) {
      dotProduct += vec1[i] * vec2[i];
      norm1 += vec1[i] * vec1[i];
      norm2 += vec2[i] * vec2[i];
    }

    norm1 = Math.sqrt(norm1);
    norm2 = Math.sqrt(norm2);

    if (norm1 === 0 || norm2 === 0) return 0;

    return dotProduct / (norm1 * norm2);
  }

  /**
   * Clear embedding cache
   */
  clearCache(): void {
    this.embeddingCache.clear();
  }
}

// Singleton
let deduplicatorInstance: SemanticDeduplicator | null = null;

export function getSemanticDeduplicator(
  options?: ConstructorParameters<typeof SemanticDeduplicator>[0]
): SemanticDeduplicator {
  if (!deduplicatorInstance) {
    deduplicatorInstance = new SemanticDeduplicator(options);
  }
  return deduplicatorInstance;
}

export default SemanticDeduplicator;
