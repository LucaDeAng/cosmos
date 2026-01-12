/**
 * GS1 Taxonomy Source
 *
 * Provides product classification using GS1 Global Product Classification (GPC).
 * GPC is the global standard for product categorization, using a 4-level hierarchy:
 *
 * Segment → Family → Class → Brick
 *
 * This source classifies products into standard GS1 categories for:
 * - Consistent categorization across vendors
 * - Industry-standard reporting
 * - Integration with external systems
 */

import { OpenAIEmbeddings } from '@langchain/openai';
import { MemoryVectorStore } from '@langchain/classic/vectorstores/memory';
import * as fs from 'fs';
import * as path from 'path';
import type { GS1Category, GS1Entry, EnrichmentResult, GS1TaxonomyFile } from '../types';

interface EnrichmentResultWithGS1 extends EnrichmentResult {
  gs1Category: GS1Category | null;
}

export class GS1TaxonomySource {
  private vectorStore: MemoryVectorStore | null = null;
  private embeddings: OpenAIEmbeddings;
  private taxonomy: Map<string, GS1Entry> = new Map();
  private initialized = false;

  constructor() {
    this.embeddings = new OpenAIEmbeddings({
      modelName: 'text-embedding-3-small'
    });
  }

  /**
   * Check if source is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Load GS1 GPC taxonomy and build search index
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    console.log('🏷️  Initializing GS1 Taxonomy Source...');

    const taxonomyDir = path.join(__dirname, '../../data/catalogs/taxonomy');
    const taxonomyPath = path.join(taxonomyDir, 'gs1_gpc_taxonomy.json');

    // Ensure directory exists
    if (!fs.existsSync(taxonomyDir)) {
      fs.mkdirSync(taxonomyDir, { recursive: true });
    }

    // Create default taxonomy if not exists
    if (!fs.existsSync(taxonomyPath)) {
      console.log('   📝 Creating default GS1 taxonomy for IT sector...');
      await this.createDefaultTaxonomy(taxonomyPath);
    }

    // Load taxonomy
    const taxonomyData: GS1TaxonomyFile = JSON.parse(
      fs.readFileSync(taxonomyPath, 'utf-8')
    );

    const documents: { pageContent: string; metadata: Record<string, unknown> }[] = [];

    for (const entry of taxonomyData.entries || []) {
      const fullPath = `${entry.segment.name} > ${entry.family.name} > ${entry.class.name} > ${entry.brick.name}`;
      const id = entry.brick.code;

      this.taxonomy.set(id, entry);

      documents.push({
        pageContent: [
          entry.segment.name,
          entry.family.name,
          entry.class.name,
          entry.brick.name,
          ...(entry.keywords || [])
        ].join(' '),
        metadata: { id, fullPath }
      });
    }

    // Build vector store
    if (documents.length > 0) {
      this.vectorStore = await MemoryVectorStore.fromDocuments(
        documents,
        this.embeddings
      );
      console.log(`   ✅ Indexed ${this.taxonomy.size} GS1 categories`);
    } else {
      this.vectorStore = new MemoryVectorStore(this.embeddings);
      console.log('   ⚠️  No GS1 taxonomy entries loaded');
    }

    this.initialized = true;
  }

  /**
   * Classify product/service into GS1 category
   */
  async classify(
    name: string,
    description?: string,
    category?: string,
    minSimilarity = 0.55
  ): Promise<GS1Category | null> {
    if (!this.initialized) {
      await this.initialize();
    }

    // Build search query
    const searchQuery = [name, description, category].filter(Boolean).join(' ');

    const results = await this.vectorStore!.similaritySearchWithScore(searchQuery, 1);

    if (results.length === 0) {
      return null;
    }

    const [doc, distance] = results[0];
    const similarity = 1 - distance;

    if (similarity < minSimilarity) {
      return null;
    }

    const entry = this.taxonomy.get(doc.metadata.id as string);
    if (!entry) return null;

    return {
      segment_code: entry.segment.code,
      segment_name: entry.segment.name,
      family_code: entry.family.code,
      family_name: entry.family.name,
      class_code: entry.class.code,
      class_name: entry.class.name,
      brick_code: entry.brick.code,
      brick_name: entry.brick.name,
      full_path: doc.metadata.fullPath as string
    };
  }

  /**
   * Get multiple classification suggestions
   */
  async getSuggestions(
    name: string,
    description?: string,
    topK = 3
  ): Promise<Array<{ category: GS1Category; confidence: number }>> {
    if (!this.initialized) {
      await this.initialize();
    }

    const searchQuery = [name, description].filter(Boolean).join(' ');
    const results = await this.vectorStore!.similaritySearchWithScore(searchQuery, topK);

    return results
      .map(([doc, distance]) => {
        const entry = this.taxonomy.get(doc.metadata.id as string);
        if (!entry) return null;

        return {
          category: {
            segment_code: entry.segment.code,
            segment_name: entry.segment.name,
            family_code: entry.family.code,
            family_name: entry.family.name,
            class_code: entry.class.code,
            class_name: entry.class.name,
            brick_code: entry.brick.code,
            brick_name: entry.brick.name,
            full_path: doc.metadata.fullPath as string
          },
          confidence: 1 - distance
        };
      })
      .filter((r): r is { category: GS1Category; confidence: number } => r !== null);
  }

  /**
   * Enrich with GS1 classification
   */
  async enrich(
    extracted: { name: string; description?: string; category?: string }
  ): Promise<EnrichmentResultWithGS1> {
    if (!this.initialized) {
      await this.initialize();
    }

    const gs1Category = await this.classify(
      extracted.name,
      extracted.description,
      extracted.category
    );

    if (!gs1Category) {
      return {
        source: 'gs1_taxonomy',
        confidence: 0,
        fields_enriched: [],
        reasoning: ['Could not classify into GS1 taxonomy (no match above threshold)'],
        gs1Category: null
      };
    }

    return {
      source: 'gs1_taxonomy',
      confidence: 0.85,
      fields_enriched: ['gs1_classification'],
      reasoning: [
        `GS1 Classification: ${gs1Category.full_path}`,
        `Segment: ${gs1Category.segment_name} (${gs1Category.segment_code})`,
        `Family: ${gs1Category.family_name} (${gs1Category.family_code})`,
        `Class: ${gs1Category.class_name} (${gs1Category.class_code})`,
        `Brick: ${gs1Category.brick_name} (${gs1Category.brick_code})`
      ],
      gs1Category
    };
  }

  /**
   * Get category by brick code
   */
  getByBrickCode(brickCode: string): GS1Category | null {
    const entry = this.taxonomy.get(brickCode);
    if (!entry) return null;

    return {
      segment_code: entry.segment.code,
      segment_name: entry.segment.name,
      family_code: entry.family.code,
      family_name: entry.family.name,
      class_code: entry.class.code,
      class_name: entry.class.name,
      brick_code: entry.brick.code,
      brick_name: entry.brick.name,
      full_path: `${entry.segment.name} > ${entry.family.name} > ${entry.class.name} > ${entry.brick.name}`
    };
  }

  /**
   * Get taxonomy statistics
   */
  getStats(): {
    totalCategories: number;
    segments: number;
    families: number;
    classes: number;
    bricks: number;
  } {
    const segments = new Set<string>();
    const families = new Set<string>();
    const classes = new Set<string>();

    for (const entry of this.taxonomy.values()) {
      segments.add(entry.segment.code);
      families.add(entry.family.code);
      classes.add(entry.class.code);
    }

    return {
      totalCategories: this.taxonomy.size,
      segments: segments.size,
      families: families.size,
      classes: classes.size,
      bricks: this.taxonomy.size
    };
  }

  /**
   * Create default GS1 taxonomy for IT sector
   */
  private async createDefaultTaxonomy(filePath: string): Promise<void> {
    const taxonomy: GS1TaxonomyFile = {
      version: '1.0',
      source: 'GS1 GPC IT Subset (Themis)',
      last_updated: new Date().toISOString().split('T')[0],
      entries: [
        // ==================== SOFTWARE ====================
        // Enterprise Software
        {
          segment: { code: '86', name: 'Information Technology' },
          family: { code: '8610', name: 'Software' },
          class: { code: '861010', name: 'Enterprise Software' },
          brick: { code: '86101010', name: 'ERP Systems' },
          keywords: ['erp', 'enterprise resource planning', 'sap', 'oracle', 'dynamics', 'business software']
        },
        {
          segment: { code: '86', name: 'Information Technology' },
          family: { code: '8610', name: 'Software' },
          class: { code: '861010', name: 'Enterprise Software' },
          brick: { code: '86101020', name: 'CRM Systems' },
          keywords: ['crm', 'customer relationship', 'salesforce', 'hubspot', 'dynamics crm']
        },
        {
          segment: { code: '86', name: 'Information Technology' },
          family: { code: '8610', name: 'Software' },
          class: { code: '861010', name: 'Enterprise Software' },
          brick: { code: '86101030', name: 'HCM Systems' },
          keywords: ['hcm', 'hr', 'human resources', 'workday', 'successfactors', 'payroll']
        },
        // Productivity Software
        {
          segment: { code: '86', name: 'Information Technology' },
          family: { code: '8610', name: 'Software' },
          class: { code: '861020', name: 'Productivity Software' },
          brick: { code: '86102010', name: 'Office Suites' },
          keywords: ['office', 'productivity', 'microsoft 365', 'google workspace', 'document']
        },
        {
          segment: { code: '86', name: 'Information Technology' },
          family: { code: '8610', name: 'Software' },
          class: { code: '861020', name: 'Productivity Software' },
          brick: { code: '86102020', name: 'Collaboration Tools' },
          keywords: ['collaboration', 'teams', 'slack', 'zoom', 'video conferencing', 'chat']
        },
        {
          segment: { code: '86', name: 'Information Technology' },
          family: { code: '8610', name: 'Software' },
          class: { code: '861020', name: 'Productivity Software' },
          brick: { code: '86102030', name: 'Project Management' },
          keywords: ['project', 'task', 'jira', 'asana', 'monday', 'trello', 'agile']
        },
        // Security Software
        {
          segment: { code: '86', name: 'Information Technology' },
          family: { code: '8610', name: 'Software' },
          class: { code: '861030', name: 'Security Software' },
          brick: { code: '86103010', name: 'Endpoint Security' },
          keywords: ['antivirus', 'endpoint', 'edr', 'protection', 'malware', 'crowdstrike']
        },
        {
          segment: { code: '86', name: 'Information Technology' },
          family: { code: '8610', name: 'Software' },
          class: { code: '861030', name: 'Security Software' },
          brick: { code: '86103020', name: 'Identity Management' },
          keywords: ['identity', 'iam', 'sso', 'mfa', 'authentication', 'okta', 'azure ad']
        },
        {
          segment: { code: '86', name: 'Information Technology' },
          family: { code: '8610', name: 'Software' },
          class: { code: '861030', name: 'Security Software' },
          brick: { code: '86103030', name: 'SIEM & SOAR' },
          keywords: ['siem', 'soar', 'security operations', 'splunk', 'sentinel', 'qradar']
        },
        // Development Tools
        {
          segment: { code: '86', name: 'Information Technology' },
          family: { code: '8610', name: 'Software' },
          class: { code: '861040', name: 'Development Tools' },
          brick: { code: '86104010', name: 'IDE & Code Editors' },
          keywords: ['ide', 'development', 'visual studio', 'vscode', 'jetbrains', 'eclipse']
        },
        {
          segment: { code: '86', name: 'Information Technology' },
          family: { code: '8610', name: 'Software' },
          class: { code: '861040', name: 'Development Tools' },
          brick: { code: '86104020', name: 'DevOps & CI/CD' },
          keywords: ['devops', 'cicd', 'jenkins', 'github actions', 'gitlab', 'azure devops']
        },
        {
          segment: { code: '86', name: 'Information Technology' },
          family: { code: '8610', name: 'Software' },
          class: { code: '861040', name: 'Development Tools' },
          brick: { code: '86104030', name: 'Source Control' },
          keywords: ['git', 'source control', 'version control', 'github', 'gitlab', 'bitbucket']
        },
        // Database & Data
        {
          segment: { code: '86', name: 'Information Technology' },
          family: { code: '8610', name: 'Software' },
          class: { code: '861050', name: 'Database & Data' },
          brick: { code: '86105010', name: 'Relational Databases' },
          keywords: ['database', 'sql', 'oracle', 'postgresql', 'mysql', 'sql server']
        },
        {
          segment: { code: '86', name: 'Information Technology' },
          family: { code: '8610', name: 'Software' },
          class: { code: '861050', name: 'Database & Data' },
          brick: { code: '86105020', name: 'NoSQL Databases' },
          keywords: ['nosql', 'mongodb', 'cassandra', 'dynamodb', 'document database']
        },
        {
          segment: { code: '86', name: 'Information Technology' },
          family: { code: '8610', name: 'Software' },
          class: { code: '861050', name: 'Database & Data' },
          brick: { code: '86105030', name: 'Data Warehouses' },
          keywords: ['data warehouse', 'snowflake', 'redshift', 'bigquery', 'synapse']
        },
        // Analytics & BI
        {
          segment: { code: '86', name: 'Information Technology' },
          family: { code: '8610', name: 'Software' },
          class: { code: '861060', name: 'Analytics & BI' },
          brick: { code: '86106010', name: 'Business Intelligence' },
          keywords: ['bi', 'business intelligence', 'power bi', 'tableau', 'looker', 'reporting']
        },
        {
          segment: { code: '86', name: 'Information Technology' },
          family: { code: '8610', name: 'Software' },
          class: { code: '861060', name: 'Analytics & BI' },
          brick: { code: '86106020', name: 'Data Analytics Platforms' },
          keywords: ['analytics', 'data science', 'databricks', 'sas', 'alteryx']
        },
        // ==================== CLOUD SERVICES ====================
        {
          segment: { code: '86', name: 'Information Technology' },
          family: { code: '8620', name: 'Cloud Services' },
          class: { code: '862010', name: 'Infrastructure as a Service' },
          brick: { code: '86201010', name: 'Cloud Compute' },
          keywords: ['iaas', 'compute', 'ec2', 'azure vm', 'gce', 'virtual machine', 'cloud server']
        },
        {
          segment: { code: '86', name: 'Information Technology' },
          family: { code: '8620', name: 'Cloud Services' },
          class: { code: '862010', name: 'Infrastructure as a Service' },
          brick: { code: '86201020', name: 'Cloud Storage' },
          keywords: ['storage', 's3', 'blob', 'gcs', 'object storage', 'cloud storage']
        },
        {
          segment: { code: '86', name: 'Information Technology' },
          family: { code: '8620', name: 'Cloud Services' },
          class: { code: '862010', name: 'Infrastructure as a Service' },
          brick: { code: '86201030', name: 'Cloud Networking' },
          keywords: ['vpc', 'vnet', 'cloud network', 'cdn', 'load balancer', 'dns']
        },
        {
          segment: { code: '86', name: 'Information Technology' },
          family: { code: '8620', name: 'Cloud Services' },
          class: { code: '862020', name: 'Platform as a Service' },
          brick: { code: '86202010', name: 'Container Platforms' },
          keywords: ['kubernetes', 'container', 'aks', 'eks', 'gke', 'docker', 'openshift']
        },
        {
          segment: { code: '86', name: 'Information Technology' },
          family: { code: '8620', name: 'Cloud Services' },
          class: { code: '862020', name: 'Platform as a Service' },
          brick: { code: '86202020', name: 'Serverless Platforms' },
          keywords: ['serverless', 'lambda', 'functions', 'azure functions', 'cloud run']
        },
        {
          segment: { code: '86', name: 'Information Technology' },
          family: { code: '8620', name: 'Cloud Services' },
          class: { code: '862030', name: 'Software as a Service' },
          brick: { code: '86203010', name: 'SaaS Applications' },
          keywords: ['saas', 'subscription', 'hosted', 'cloud application', 'online']
        },
        // ==================== IT SERVICES ====================
        {
          segment: { code: '86', name: 'Information Technology' },
          family: { code: '8630', name: 'IT Services' },
          class: { code: '863010', name: 'Managed Services' },
          brick: { code: '86301010', name: 'Managed IT Infrastructure' },
          keywords: ['managed', 'msp', 'outsourcing', 'infrastructure management']
        },
        {
          segment: { code: '86', name: 'Information Technology' },
          family: { code: '8630', name: 'IT Services' },
          class: { code: '863010', name: 'Managed Services' },
          brick: { code: '86301020', name: 'Managed Security Services' },
          keywords: ['mssp', 'soc', 'security operations', 'mdr', 'managed detection']
        },
        {
          segment: { code: '86', name: 'Information Technology' },
          family: { code: '8630', name: 'IT Services' },
          class: { code: '863010', name: 'Managed Services' },
          brick: { code: '86301030', name: 'Managed Cloud Services' },
          keywords: ['cloud management', 'cloud ops', 'finops', 'cloud optimization']
        },
        {
          segment: { code: '86', name: 'Information Technology' },
          family: { code: '8630', name: 'IT Services' },
          class: { code: '863020', name: 'Professional Services' },
          brick: { code: '86302010', name: 'IT Consulting' },
          keywords: ['consulting', 'advisory', 'strategy', 'digital transformation']
        },
        {
          segment: { code: '86', name: 'Information Technology' },
          family: { code: '8630', name: 'IT Services' },
          class: { code: '863020', name: 'Professional Services' },
          brick: { code: '86302020', name: 'Implementation Services' },
          keywords: ['implementation', 'deployment', 'integration', 'migration']
        },
        {
          segment: { code: '86', name: 'Information Technology' },
          family: { code: '8630', name: 'IT Services' },
          class: { code: '863020', name: 'Professional Services' },
          brick: { code: '86302030', name: 'Custom Development' },
          keywords: ['development', 'custom software', 'application development', 'bespoke']
        },
        {
          segment: { code: '86', name: 'Information Technology' },
          family: { code: '8630', name: 'IT Services' },
          class: { code: '863030', name: 'Support Services' },
          brick: { code: '86303010', name: 'Help Desk & Support' },
          keywords: ['help desk', 'support', 'service desk', 'l1 l2 l3', 'technical support']
        },
        {
          segment: { code: '86', name: 'Information Technology' },
          family: { code: '8630', name: 'IT Services' },
          class: { code: '863030', name: 'Support Services' },
          brick: { code: '86303020', name: 'Maintenance & Support' },
          keywords: ['maintenance', 'sla', 'support contract', 'premier support']
        },
        // ==================== HARDWARE ====================
        {
          segment: { code: '86', name: 'Information Technology' },
          family: { code: '8640', name: 'Hardware' },
          class: { code: '864010', name: 'Servers' },
          brick: { code: '86401010', name: 'Rack Servers' },
          keywords: ['server', 'rack', 'dell', 'hpe', 'lenovo', 'data center']
        },
        {
          segment: { code: '86', name: 'Information Technology' },
          family: { code: '8640', name: 'Hardware' },
          class: { code: '864010', name: 'Servers' },
          brick: { code: '86401020', name: 'Blade Servers' },
          keywords: ['blade', 'chassis', 'blade server', 'modular']
        },
        {
          segment: { code: '86', name: 'Information Technology' },
          family: { code: '8640', name: 'Hardware' },
          class: { code: '864020', name: 'Networking' },
          brick: { code: '86402010', name: 'Network Switches' },
          keywords: ['switch', 'cisco', 'arista', 'juniper', 'network switch']
        },
        {
          segment: { code: '86', name: 'Information Technology' },
          family: { code: '8640', name: 'Hardware' },
          class: { code: '864020', name: 'Networking' },
          brick: { code: '86402020', name: 'Routers & Firewalls' },
          keywords: ['router', 'firewall', 'palo alto', 'fortinet', 'checkpoint']
        },
        {
          segment: { code: '86', name: 'Information Technology' },
          family: { code: '8640', name: 'Hardware' },
          class: { code: '864030', name: 'Storage' },
          brick: { code: '86403010', name: 'SAN Storage' },
          keywords: ['san', 'storage', 'netapp', 'pure storage', 'dell emc']
        },
        {
          segment: { code: '86', name: 'Information Technology' },
          family: { code: '8640', name: 'Hardware' },
          class: { code: '864030', name: 'Storage' },
          brick: { code: '86403020', name: 'NAS Storage' },
          keywords: ['nas', 'network storage', 'file storage', 'synology', 'qnap']
        },
        // ==================== AI & ML ====================
        {
          segment: { code: '86', name: 'Information Technology' },
          family: { code: '8650', name: 'AI & Machine Learning' },
          class: { code: '865010', name: 'AI Platforms' },
          brick: { code: '86501010', name: 'ML Platforms' },
          keywords: ['machine learning', 'ml', 'mlops', 'sagemaker', 'vertex ai', 'azure ml']
        },
        {
          segment: { code: '86', name: 'Information Technology' },
          family: { code: '8650', name: 'AI & Machine Learning' },
          class: { code: '865010', name: 'AI Platforms' },
          brick: { code: '86501020', name: 'Generative AI' },
          keywords: ['generative ai', 'gpt', 'llm', 'claude', 'openai', 'copilot']
        },
        {
          segment: { code: '86', name: 'Information Technology' },
          family: { code: '8650', name: 'AI & Machine Learning' },
          class: { code: '865020', name: 'AI Applications' },
          brick: { code: '86502010', name: 'Intelligent Automation' },
          keywords: ['rpa', 'automation', 'uipath', 'power automate', 'intelligent automation']
        },

        // ==================== AUTOMOTIVE ====================
        // Passenger Vehicles - ICE
        {
          segment: { code: '78', name: 'Automotive' },
          family: { code: '7810', name: 'Passenger Vehicles' },
          class: { code: '781010', name: 'Internal Combustion Vehicles' },
          brick: { code: '78101010', name: 'Compact Cars' },
          keywords: ['car', 'automobile', 'sedan', 'hatchback', 'compact', 'city car', 'panda', 'punto', '500', 'tipo', 'giulietta', '208', '308', 'clio', 'corsa', 'polo', 'golf', 'fiesta', 'focus', 'yaris', 'corolla', 'civic', 'jazz']
        },
        {
          segment: { code: '78', name: 'Automotive' },
          family: { code: '7810', name: 'Passenger Vehicles' },
          class: { code: '781010', name: 'Internal Combustion Vehicles' },
          brick: { code: '78101020', name: 'Mid-Size Cars' },
          keywords: ['sedan', 'berlina', 'mid-size', 'giulia', 'stelvio', '508', '3008', '5008', 'passat', 'mondeo', 'accord', 'camry', 'ds7', 'ds4', 'ds3']
        },
        {
          segment: { code: '78', name: 'Automotive' },
          family: { code: '7810', name: 'Passenger Vehicles' },
          class: { code: '781010', name: 'Internal Combustion Vehicles' },
          brick: { code: '78101030', name: 'SUV & Crossover' },
          keywords: ['suv', 'crossover', 'fuoristrada', 'jeep', 'wrangler', 'compass', 'renegade', 'avenger', 'tonale', 'stelvio', '3008', '5008', 'tiguan', 'rav4', 'cr-v', 'qashqai', 'tucson']
        },
        {
          segment: { code: '78', name: 'Automotive' },
          family: { code: '7810', name: 'Passenger Vehicles' },
          class: { code: '781010', name: 'Internal Combustion Vehicles' },
          brick: { code: '78101040', name: 'Sports Cars' },
          keywords: ['sports car', 'coupe', 'spider', 'cabriolet', 'roadster', 'abarth', '124', 'mx-5', 'z4', 'supra', '86', 'brz']
        },
        {
          segment: { code: '78', name: 'Automotive' },
          family: { code: '7810', name: 'Passenger Vehicles' },
          class: { code: '781010', name: 'Internal Combustion Vehicles' },
          brick: { code: '78101050', name: 'Premium & Luxury Cars' },
          keywords: ['premium', 'luxury', 'ds', 'alfa romeo', 'giulia', 'stelvio', 'maserati', 'ghibli', 'levante', 'quattroporte']
        },
        // Electric Vehicles
        {
          segment: { code: '78', name: 'Automotive' },
          family: { code: '7810', name: 'Passenger Vehicles' },
          class: { code: '781020', name: 'Electric Vehicles' },
          brick: { code: '78102010', name: 'Battery Electric Vehicles' },
          keywords: ['electric', 'bev', 'ev', 'elettrica', 'e-tense', '500e', 'e-208', 'e-308', 'e-2008', 'e-3008', 'e-5008', 'e-rifter', 'e-doblo', 'topolino', 'nuova 500']
        },
        {
          segment: { code: '78', name: 'Automotive' },
          family: { code: '7810', name: 'Passenger Vehicles' },
          class: { code: '781020', name: 'Electric Vehicles' },
          brick: { code: '78102020', name: 'Plug-in Hybrid Vehicles' },
          keywords: ['phev', 'plug-in', 'plugin', 'ibrida plug-in', 'ricaricabile', '4xe', 'compass 4xe', 'renegade 4xe', 'tonale phev']
        },
        // Hybrid Vehicles
        {
          segment: { code: '78', name: 'Automotive' },
          family: { code: '7810', name: 'Passenger Vehicles' },
          class: { code: '781030', name: 'Hybrid Vehicles' },
          brick: { code: '78103010', name: 'Mild Hybrid Vehicles' },
          keywords: ['mhev', 'mild hybrid', 'ibrido leggero', 'hybrid', 'ibrida', 'mildly', '48v', 'microibrido']
        },
        {
          segment: { code: '78', name: 'Automotive' },
          family: { code: '7810', name: 'Passenger Vehicles' },
          class: { code: '781030', name: 'Hybrid Vehicles' },
          brick: { code: '78103020', name: 'Full Hybrid Vehicles' },
          keywords: ['hev', 'full hybrid', 'ibrido completo', 'hybrid', 'ibrida', 'self-charging']
        },
        // Commercial Vehicles
        {
          segment: { code: '78', name: 'Automotive' },
          family: { code: '7820', name: 'Commercial Vehicles' },
          class: { code: '782010', name: 'Light Commercial Vehicles' },
          brick: { code: '78201010', name: 'Vans & MPV' },
          keywords: ['van', 'furgone', 'mpv', 'monovolume', 'doblo', 'doblò', 'rifter', 'berlingo', 'kangoo', 'partner', 'combo', 'caddy', 'traveller', 'expert', 'jumpy', 'scudo']
        },
        {
          segment: { code: '78', name: 'Automotive' },
          family: { code: '7820', name: 'Commercial Vehicles' },
          class: { code: '782010', name: 'Light Commercial Vehicles' },
          brick: { code: '78201020', name: 'Pickup Trucks' },
          keywords: ['pickup', 'pick-up', 'truck', 'furgone', 'fullback', 'l200', 'hilux', 'ranger', 'navara', 'amarok']
        },
        {
          segment: { code: '78', name: 'Automotive' },
          family: { code: '7820', name: 'Commercial Vehicles' },
          class: { code: '782020', name: 'Heavy Commercial Vehicles' },
          brick: { code: '78202010', name: 'Trucks & Lorries' },
          keywords: ['truck', 'lorry', 'camion', 'autocarro', 'daily', 'ducato', 'boxer', 'jumper', 'crafter', 'sprinter']
        },
        // Micromobility
        {
          segment: { code: '78', name: 'Automotive' },
          family: { code: '7830', name: 'Micromobility' },
          class: { code: '783010', name: 'Urban Microvehicles' },
          brick: { code: '78301010', name: 'Quadricycles & Microcars' },
          keywords: ['microcar', 'quadriciclo', 'quadricycle', 'minicar', 'topolino', 'ami', 'citroen ami', 'rocks-e', 'city transformer']
        },
        // Motorcycles
        {
          segment: { code: '78', name: 'Automotive' },
          family: { code: '7840', name: 'Motorcycles & Scooters' },
          class: { code: '784010', name: 'Two-Wheelers' },
          brick: { code: '78401010', name: 'Motorcycles' },
          keywords: ['moto', 'motorcycle', 'motocicletta', 'naked', 'sport', 'touring', 'adventure', 'enduro', 'cruiser']
        },
        {
          segment: { code: '78', name: 'Automotive' },
          family: { code: '7840', name: 'Motorcycles & Scooters' },
          class: { code: '784010', name: 'Two-Wheelers' },
          brick: { code: '78401020', name: 'Scooters' },
          keywords: ['scooter', 'motorino', 'vespa', 'liberty', 'medley', 'beverly', 'mp3', 'piaggio']
        },

        // ==================== MANUFACTURING ====================
        {
          segment: { code: '72', name: 'Industrial Manufacturing' },
          family: { code: '7210', name: 'Industrial Equipment' },
          class: { code: '721010', name: 'Production Equipment' },
          brick: { code: '72101010', name: 'Industrial Machinery' },
          keywords: ['machinery', 'machine', 'macchinario', 'industrial', 'production', 'manufacturing', 'assembly', 'robot', 'cnc']
        },
        {
          segment: { code: '72', name: 'Industrial Manufacturing' },
          family: { code: '7210', name: 'Industrial Equipment' },
          class: { code: '721010', name: 'Production Equipment' },
          brick: { code: '72101020', name: 'Automation Systems' },
          keywords: ['automation', 'automazione', 'plc', 'scada', 'industrial control', 'robot', 'cobot']
        },
        {
          segment: { code: '72', name: 'Industrial Manufacturing' },
          family: { code: '7220', name: 'Industrial Components' },
          class: { code: '722010', name: 'Parts & Components' },
          brick: { code: '72201010', name: 'Mechanical Components' },
          keywords: ['component', 'part', 'spare', 'ricambio', 'componente', 'mechanical', 'gear', 'bearing', 'valve']
        },

        // ==================== CONSUMER GOODS ====================
        {
          segment: { code: '50', name: 'Food & Beverage' },
          family: { code: '5010', name: 'Food Products' },
          class: { code: '501010', name: 'Confectionery' },
          brick: { code: '50101010', name: 'Chocolate & Candy' },
          keywords: ['chocolate', 'cioccolato', 'candy', 'dolci', 'confectionery', 'pernigotti', 'gianduia', 'praline', 'torroni']
        },
        {
          segment: { code: '50', name: 'Food & Beverage' },
          family: { code: '5020', name: 'Beverages' },
          class: { code: '502010', name: 'Non-Alcoholic Beverages' },
          brick: { code: '50201010', name: 'Soft Drinks' },
          keywords: ['beverage', 'drink', 'soft drink', 'soda', 'juice', 'water', 'acqua', 'succo']
        }
      ]
    };

    fs.writeFileSync(filePath, JSON.stringify(taxonomy, null, 2));
    console.log(`   ✅ Created GS1 taxonomy with ${taxonomy.entries.length} categories`);
  }
}

// Singleton instance
let instance: GS1TaxonomySource | null = null;

export function getGS1TaxonomySource(): GS1TaxonomySource {
  if (!instance) {
    instance = new GS1TaxonomySource();
  }
  return instance;
}

export default GS1TaxonomySource;
