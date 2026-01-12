/**
 * Synthetic Catalog Generator
 *
 * Generates enriched product/service catalogs from various sources:
 * - CSV/Excel imports
 * - Web scraping (public sources)
 * - Manual entries with alias expansion
 * - LLM-based enrichment
 *
 * Usage:
 *   npx tsx scripts/generateSyntheticCatalogs.ts --source csv --input products.csv --output tech_products
 *   npx tsx scripts/generateSyntheticCatalogs.ts --expand-aliases
 *   npx tsx scripts/generateSyntheticCatalogs.ts --enrich-existing --catalog microsoft_catalog.json
 */

import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'csv-parse/sync';

// Types
interface CatalogProduct {
  id: string;
  vendor: string;
  name: string;
  category: string;
  subcategory?: string;
  description?: string;
  pricing_model?: string;
  deployment?: string;
  target_segment?: string;
  segment?: string;
  use_cases?: string[];
  industry_tags?: string[];
  integrations?: string[];
  aliases?: string[];  // Alternative names for matching
  keywords?: string[]; // Additional search keywords
}

interface CatalogFile {
  catalog_info?: {
    name: string;
    version: string;
    last_updated: string;
    source?: string;
    description?: string;
  };
  vendor?: string;
  last_updated?: string;
  version?: string;
  products: CatalogProduct[];
}

// Common product name aliases for better matching
const PRODUCT_ALIASES: Record<string, string[]> = {
  // Microsoft
  'Microsoft 365': ['M365', 'Office 365', 'O365', 'MS365', 'Microsoft Office 365'],
  'Microsoft Teams': ['MS Teams', 'Teams', 'Microsoft Team'],
  'Microsoft Azure': ['Azure', 'MS Azure', 'Azure Cloud'],
  'Microsoft Dynamics 365': ['Dynamics 365', 'D365', 'MS Dynamics', 'Dynamics CRM'],
  'Microsoft Power Platform': ['Power Platform', 'PowerApps', 'Power Apps', 'Power Automate'],
  'Microsoft Copilot': ['Copilot', 'M365 Copilot', 'GitHub Copilot'],
  'Microsoft SharePoint': ['SharePoint', 'SP Online', 'SharePoint Online'],
  'Microsoft OneDrive': ['OneDrive', 'OneDrive for Business'],
  'Microsoft Exchange': ['Exchange Online', 'Exchange', 'MS Exchange'],
  'Microsoft Intune': ['Intune', 'MS Intune', 'Endpoint Manager'],
  'Microsoft Defender': ['Defender', 'MS Defender', 'Windows Defender', 'Defender for Endpoint'],
  'Microsoft Sentinel': ['Sentinel', 'Azure Sentinel', 'MS Sentinel'],
  'Visual Studio': ['VS', 'Visual Studio Code', 'VS Code', 'VSCode'],
  'SQL Server': ['MSSQL', 'MS SQL', 'Microsoft SQL Server', 'SQL Server 2022'],
  'Windows Server': ['Win Server', 'Windows Server 2022', 'WS2022'],

  // Google
  'Google Workspace': ['G Suite', 'GSuite', 'Google Apps', 'Google Apps for Work'],
  'Google Cloud Platform': ['GCP', 'Google Cloud', 'GCloud'],
  'Google BigQuery': ['BigQuery', 'BQ'],
  'Google Kubernetes Engine': ['GKE', 'Google Kubernetes'],
  'Google Cloud Storage': ['GCS', 'Cloud Storage'],

  // AWS
  'Amazon Web Services': ['AWS', 'Amazon AWS'],
  'Amazon EC2': ['EC2', 'Elastic Compute Cloud'],
  'Amazon S3': ['S3', 'Simple Storage Service'],
  'Amazon RDS': ['RDS', 'Relational Database Service'],
  'Amazon Lambda': ['Lambda', 'AWS Lambda'],
  'Amazon EKS': ['EKS', 'Elastic Kubernetes Service'],
  'Amazon CloudWatch': ['CloudWatch', 'CW'],
  'Amazon DynamoDB': ['DynamoDB', 'Dynamo'],

  // Salesforce
  'Salesforce Sales Cloud': ['Sales Cloud', 'Salesforce CRM', 'SFDC'],
  'Salesforce Service Cloud': ['Service Cloud'],
  'Salesforce Marketing Cloud': ['Marketing Cloud', 'SFMC', 'ExactTarget'],
  'Salesforce Pardot': ['Pardot', 'Marketing Cloud Account Engagement'],

  // SAP
  'SAP S/4HANA': ['S4HANA', 'S/4', 'SAP S4', 'S4 HANA'],
  'SAP Business One': ['SAP B1', 'Business One', 'SBO'],
  'SAP Business ByDesign': ['ByDesign', 'SAP ByD'],
  'SAP SuccessFactors': ['SuccessFactors', 'SF', 'SAP SF'],
  'SAP Ariba': ['Ariba', 'SAP Ariba Procurement'],
  'SAP Concur': ['Concur', 'SAP Concur Travel'],

  // Oracle
  'Oracle Cloud Infrastructure': ['OCI', 'Oracle Cloud'],
  'Oracle Database': ['Oracle DB', 'OracleDB', 'Oracle 19c', 'Oracle 21c'],
  'Oracle NetSuite': ['NetSuite', 'NS'],
  'Oracle Fusion': ['Fusion', 'Oracle Fusion Cloud', 'Oracle ERP Cloud'],

  // IBM
  'IBM Cloud': ['Bluemix', 'IBM Bluemix'],
  'IBM Watson': ['Watson', 'Watson AI'],
  'IBM Db2': ['Db2', 'DB2'],

  // ServiceNow
  'ServiceNow': ['SNOW', 'Service Now', 'SN'],
  'ServiceNow ITSM': ['ITSM', 'IT Service Management'],
  'ServiceNow ITOM': ['ITOM', 'IT Operations Management'],

  // Atlassian
  'Atlassian Jira': ['Jira', 'JIRA', 'Jira Software'],
  'Atlassian Confluence': ['Confluence', 'Wiki'],
  'Atlassian Bitbucket': ['Bitbucket', 'BB'],

  // Security
  'CrowdStrike Falcon': ['CrowdStrike', 'Falcon', 'CS Falcon'],
  'Palo Alto Prisma': ['Prisma', 'Prisma Cloud', 'PANW'],
  'Fortinet FortiGate': ['FortiGate', 'Fortinet', 'FG'],
  'Cisco SecureX': ['SecureX', 'Cisco Security'],
  'Splunk Enterprise': ['Splunk', 'Splunk SIEM'],

  // Networking
  'Cisco Meraki': ['Meraki', 'Cisco SD-WAN'],
  'Cisco Webex': ['Webex', 'WebEx', 'Cisco Webex Teams'],
  'Cisco Umbrella': ['Umbrella', 'OpenDNS'],

  // VMware
  'VMware vSphere': ['vSphere', 'ESXi', 'VMware ESXi'],
  'VMware vCenter': ['vCenter', 'vCenter Server'],
  'VMware NSX': ['NSX', 'NSX-T'],
  'VMware Horizon': ['Horizon', 'VMware VDI'],
  'VMware Tanzu': ['Tanzu', 'PKS'],

  // Other Popular
  'Slack': ['Slack Enterprise', 'Slack Business+'],
  'Zoom': ['Zoom Meetings', 'Zoom Video', 'Zoom One'],
  'Dropbox Business': ['Dropbox', 'DBX'],
  'Box': ['Box Enterprise', 'Box Drive'],
  'DocuSign': ['DocuSign eSignature', 'DS'],
  'Adobe Creative Cloud': ['Creative Cloud', 'CC', 'Adobe CC'],
  'Adobe Acrobat': ['Acrobat', 'Acrobat Pro', 'Adobe PDF'],
  'Okta': ['Okta Identity', 'Okta SSO'],
  'Auth0': ['Auth0 Identity'],
  'Snowflake': ['Snowflake Data Cloud', 'SF Data'],
  'Databricks': ['Databricks Lakehouse'],
  'MongoDB Atlas': ['MongoDB', 'Mongo', 'Atlas'],
  'Redis Enterprise': ['Redis', 'Redis Cloud'],
  'Elastic Cloud': ['Elasticsearch', 'ELK Stack', 'Elastic'],
  'Datadog': ['DD', 'Datadog APM'],
  'New Relic': ['NewRelic', 'NR'],
  'PagerDuty': ['PD', 'Pager Duty'],
  'Zendesk': ['Zendesk Support', 'ZD'],
  'Freshdesk': ['Freshworks', 'FD'],
  'HubSpot': ['HubSpot CRM', 'HS'],
  'Workday': ['Workday HCM', 'WD'],
  'Kronos': ['UKG', 'Ultimate Kronos Group'],
};

// Category mappings for normalization
const CATEGORY_MAPPINGS: Record<string, { category: string; subcategory: string }> = {
  // Cloud & Infrastructure
  'cloud': { category: 'Cloud Computing', subcategory: 'Cloud Platform' },
  'iaas': { category: 'Cloud Computing', subcategory: 'IaaS' },
  'paas': { category: 'Cloud Computing', subcategory: 'PaaS' },
  'saas': { category: 'Cloud Computing', subcategory: 'SaaS' },
  'hosting': { category: 'Cloud Computing', subcategory: 'Hosting' },
  'virtualization': { category: 'Infrastructure', subcategory: 'Virtualization' },
  'container': { category: 'Infrastructure', subcategory: 'Containers' },
  'kubernetes': { category: 'Infrastructure', subcategory: 'Container Orchestration' },

  // Security
  'security': { category: 'Security Software', subcategory: 'Security' },
  'antivirus': { category: 'Security Software', subcategory: 'Endpoint Protection' },
  'firewall': { category: 'Security Software', subcategory: 'Network Security' },
  'siem': { category: 'Security Software', subcategory: 'SIEM' },
  'identity': { category: 'Security Software', subcategory: 'Identity & Access' },
  'sso': { category: 'Security Software', subcategory: 'Single Sign-On' },
  'mfa': { category: 'Security Software', subcategory: 'Authentication' },

  // Productivity
  'office': { category: 'Productivity Software', subcategory: 'Office Suite' },
  'email': { category: 'Productivity Software', subcategory: 'Email' },
  'collaboration': { category: 'Productivity Software', subcategory: 'Collaboration' },
  'project': { category: 'Project Management', subcategory: 'Project Management' },
  'task': { category: 'Project Management', subcategory: 'Task Management' },

  // Business Apps
  'crm': { category: 'Customer Relationship Management', subcategory: 'CRM' },
  'erp': { category: 'Enterprise Resource Planning', subcategory: 'ERP' },
  'hr': { category: 'Human Capital Management', subcategory: 'HR Software' },
  'hcm': { category: 'Human Capital Management', subcategory: 'HCM' },
  'payroll': { category: 'Human Capital Management', subcategory: 'Payroll' },
  'accounting': { category: 'Finance Software', subcategory: 'Accounting' },
  'finance': { category: 'Finance Software', subcategory: 'Financial Management' },

  // Development
  'development': { category: 'Development Tools', subcategory: 'IDE' },
  'devops': { category: 'Development Tools', subcategory: 'DevOps' },
  'ci/cd': { category: 'Development Tools', subcategory: 'CI/CD' },
  'git': { category: 'Development Tools', subcategory: 'Version Control' },
  'api': { category: 'Development Tools', subcategory: 'API Platform' },

  // Data
  'database': { category: 'Database', subcategory: 'Database' },
  'analytics': { category: 'Business Intelligence', subcategory: 'Analytics' },
  'bi': { category: 'Business Intelligence', subcategory: 'BI Platform' },
  'data warehouse': { category: 'Data Platform', subcategory: 'Data Warehouse' },
  'etl': { category: 'Data Platform', subcategory: 'ETL' },

  // Marketing
  'marketing': { category: 'Marketing Software', subcategory: 'Marketing Automation' },
  'email marketing': { category: 'Marketing Software', subcategory: 'Email Marketing' },
  'seo': { category: 'Marketing Software', subcategory: 'SEO Tools' },

  // Support
  'helpdesk': { category: 'Customer Service', subcategory: 'Help Desk' },
  'ticketing': { category: 'Customer Service', subcategory: 'Ticketing' },
  'support': { category: 'Customer Service', subcategory: 'Customer Support' },
};

class SyntheticCatalogGenerator {
  private outputDir: string;

  constructor(outputDir: string = 'src/data/catalogs') {
    this.outputDir = path.resolve(process.cwd(), outputDir);
  }

  /**
   * Import products from CSV file
   */
  async importFromCSV(csvPath: string, outputCatalog: string): Promise<number> {
    console.log(`📥 Importing from CSV: ${csvPath}`);

    const content = fs.readFileSync(csvPath, 'utf-8');
    const records = parse(content, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });

    const products: CatalogProduct[] = [];

    for (const record of records) {
      const product = this.normalizeCSVRecord(record);
      if (product) {
        products.push(product);
      }
    }

    // Enrich with aliases
    const enrichedProducts = products.map(p => this.enrichWithAliases(p));

    // Save catalog
    await this.saveCatalog(outputCatalog, enrichedProducts, `Imported from ${path.basename(csvPath)}`);

    console.log(`✅ Imported ${enrichedProducts.length} products`);
    return enrichedProducts.length;
  }

  /**
   * Normalize a CSV record into a CatalogProduct
   */
  private normalizeCSVRecord(record: Record<string, string>): CatalogProduct | null {
    // Support various column names
    const name = record.name || record.Name || record.product_name || record.ProductName || record.prodotto;
    const vendor = record.vendor || record.Vendor || record.brand || record.Brand || record.fornitore || record.Fornitore;

    if (!name) {
      console.warn('   ⚠️  Skipping record without name:', record);
      return null;
    }

    // Generate ID
    const id = this.generateId(vendor, name);

    // Detect category from keywords
    const categoryInfo = this.detectCategory(record);

    return {
      id,
      vendor: vendor || 'Unknown',
      name,
      category: record.category || record.Category || record.categoria || categoryInfo.category || 'Software',
      subcategory: record.subcategory || record.Subcategory || record.sottocategoria || categoryInfo.subcategory,
      description: record.description || record.Description || record.descrizione,
      pricing_model: record.pricing_model || record.pricing || record.modello_prezzo || 'subscription',
      deployment: record.deployment || record.Deployment || record.tipo || 'saas',
      target_segment: record.target_segment || record.segment || record.segmento || 'enterprise',
      segment: record.industry || record.Industry || record.settore || 'Information Technology',
      use_cases: this.parseArray(record.use_cases || record.UseCases || record.casi_uso),
      industry_tags: this.parseArray(record.tags || record.Tags || record.etichette),
      integrations: this.parseArray(record.integrations || record.Integrations || record.integrazioni),
    };
  }

  /**
   * Detect category from product name/description
   */
  private detectCategory(record: Record<string, string>): { category: string; subcategory?: string } {
    const text = [
      record.name,
      record.description,
      record.category,
      record.tags,
    ].filter(Boolean).join(' ').toLowerCase();

    for (const [keyword, mapping] of Object.entries(CATEGORY_MAPPINGS)) {
      if (text.includes(keyword)) {
        return mapping;
      }
    }

    return { category: 'Software' };
  }

  /**
   * Parse array from string (comma or semicolon separated)
   */
  private parseArray(value: string | undefined): string[] | undefined {
    if (!value) return undefined;
    return value.split(/[,;]/).map(s => s.trim()).filter(Boolean);
  }

  /**
   * Enrich product with aliases from the known mappings
   */
  private enrichWithAliases(product: CatalogProduct): CatalogProduct {
    const aliases: string[] = [];
    const keywords: string[] = [];

    // Check if this product matches any known aliases
    for (const [canonical, productAliases] of Object.entries(PRODUCT_ALIASES)) {
      const productNameLower = product.name.toLowerCase();
      const canonicalLower = canonical.toLowerCase();

      // Direct match
      if (productNameLower === canonicalLower ||
          productNameLower.includes(canonicalLower) ||
          canonicalLower.includes(productNameLower)) {
        aliases.push(...productAliases.filter(a => a.toLowerCase() !== productNameLower));
      }

      // Check if product name matches any alias
      for (const alias of productAliases) {
        if (productNameLower === alias.toLowerCase() ||
            productNameLower.includes(alias.toLowerCase())) {
          aliases.push(canonical);
          aliases.push(...productAliases.filter(a => a.toLowerCase() !== productNameLower));
          break;
        }
      }
    }

    // Add vendor variations as keywords
    if (product.vendor) {
      keywords.push(product.vendor);
      keywords.push(`${product.vendor} ${product.name}`);
    }

    // Add common abbreviations
    const words = product.name.split(/\s+/);
    if (words.length > 1) {
      const acronym = words.map(w => w[0]).join('').toUpperCase();
      if (acronym.length >= 2 && acronym.length <= 5) {
        keywords.push(acronym);
      }
    }

    return {
      ...product,
      aliases: aliases.length > 0 ? [...new Set(aliases)] : undefined,
      keywords: keywords.length > 0 ? [...new Set(keywords)] : undefined,
    };
  }

  /**
   * Generate a unique ID for a product
   */
  private generateId(vendor: string | undefined, name: string): string {
    const vendorPart = vendor ? vendor.toLowerCase().replace(/[^a-z0-9]+/g, '-') : 'generic';
    const namePart = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    return `${vendorPart}-${namePart}`.replace(/-+/g, '-').replace(/^-|-$/g, '');
  }

  /**
   * Generate an aliases-only catalog from the known mappings
   */
  async generateAliasesCatalog(): Promise<number> {
    console.log('🔤 Generating aliases catalog...');

    const products: CatalogProduct[] = [];

    for (const [canonical, aliases] of Object.entries(PRODUCT_ALIASES)) {
      // Extract vendor from canonical name
      const vendorMatch = canonical.match(/^(Microsoft|Google|Amazon|AWS|Salesforce|SAP|Oracle|IBM|ServiceNow|Atlassian|Cisco|VMware|Adobe|Okta|Snowflake|Databricks|MongoDB|Redis|Elastic|Datadog|New Relic|PagerDuty|Zendesk|Freshdesk|HubSpot|Workday|Kronos|CrowdStrike|Palo Alto|Fortinet|Splunk)/i);
      const vendor = vendorMatch ? vendorMatch[1] : 'Unknown';

      // Clean product name (remove vendor prefix if present)
      let name = canonical;
      if (vendorMatch && canonical.toLowerCase().startsWith(vendorMatch[1].toLowerCase())) {
        name = canonical.slice(vendorMatch[1].length).trim();
        if (!name) name = canonical;
      }

      const categoryInfo = this.detectCategory({ name: canonical, description: aliases.join(' ') });

      products.push({
        id: this.generateId(vendor, name),
        vendor,
        name: canonical,
        category: categoryInfo.category,
        subcategory: categoryInfo.subcategory,
        description: `${canonical} - Known aliases: ${aliases.join(', ')}`,
        aliases,
        keywords: [vendor, ...aliases.map(a => a.toLowerCase())],
        segment: 'Information Technology',
        pricing_model: 'subscription',
        deployment: 'saas',
        target_segment: 'enterprise',
      });
    }

    await this.saveCatalog('product_aliases', products, 'Product aliases and synonyms for improved matching');

    console.log(`✅ Generated aliases catalog with ${products.length} entries`);
    return products.length;
  }

  /**
   * Expand an existing catalog with aliases
   */
  async expandCatalogWithAliases(catalogPath: string): Promise<number> {
    console.log(`🔧 Expanding catalog: ${catalogPath}`);

    const fullPath = path.resolve(this.outputDir, catalogPath);
    if (!fs.existsSync(fullPath)) {
      throw new Error(`Catalog not found: ${fullPath}`);
    }

    const catalog: CatalogFile = JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
    let enrichedCount = 0;

    catalog.products = catalog.products.map(product => {
      const enriched = this.enrichWithAliases(product);
      if (enriched.aliases && enriched.aliases.length > 0) {
        enrichedCount++;
      }
      return enriched;
    });

    // Update metadata
    if (catalog.catalog_info) {
      catalog.catalog_info.last_updated = new Date().toISOString().split('T')[0];
    } else if (catalog.last_updated) {
      catalog.last_updated = new Date().toISOString().split('T')[0];
    }

    fs.writeFileSync(fullPath, JSON.stringify(catalog, null, 2));

    console.log(`✅ Expanded ${enrichedCount} products with aliases`);
    return enrichedCount;
  }

  /**
   * Save catalog to file
   */
  private async saveCatalog(
    name: string,
    products: CatalogProduct[],
    description: string
  ): Promise<void> {
    const catalog: CatalogFile = {
      catalog_info: {
        name,
        version: '1.0',
        last_updated: new Date().toISOString().split('T')[0],
        source: 'Synthetic Generator',
        description,
      },
      products,
    };

    // Determine output path
    const outputPath = path.join(this.outputDir, 'synthetic', `${name}.json`);
    const outputDir = path.dirname(outputPath);

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    fs.writeFileSync(outputPath, JSON.stringify(catalog, null, 2));
    console.log(`   💾 Saved to: ${outputPath}`);
  }

  /**
   * Get statistics about existing catalogs
   */
  async getCatalogStats(): Promise<void> {
    console.log('\n📊 Catalog Statistics\n');

    const dirs = ['tech_products', 'it_services', 'automotive', 'electronics',
                  'food_beverage', 'fashion', 'industrial', 'healthcare',
                  'fintech', 'logistics', 'telecom', 'energy', 'synthetic'];

    let totalProducts = 0;
    let totalWithAliases = 0;

    for (const dir of dirs) {
      const dirPath = path.join(this.outputDir, dir);
      if (!fs.existsSync(dirPath)) continue;

      const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.json'));
      let dirProducts = 0;
      let dirAliases = 0;

      for (const file of files) {
        try {
          const catalog: CatalogFile = JSON.parse(
            fs.readFileSync(path.join(dirPath, file), 'utf-8')
          );
          const count = catalog.products?.length || 0;
          const withAliases = catalog.products?.filter(p => p.aliases && p.aliases.length > 0).length || 0;
          dirProducts += count;
          dirAliases += withAliases;
        } catch (e) {
          // Skip invalid files
        }
      }

      if (dirProducts > 0) {
        console.log(`   ${dir}: ${dirProducts} products (${dirAliases} with aliases)`);
        totalProducts += dirProducts;
        totalWithAliases += dirAliases;
      }
    }

    console.log(`\n   Total: ${totalProducts} products (${totalWithAliases} with aliases)`);
    console.log(`   Alias coverage: ${((totalWithAliases / totalProducts) * 100).toFixed(1)}%\n`);
  }
}

// CLI
async function main() {
  const args = process.argv.slice(2);
  const generator = new SyntheticCatalogGenerator();

  if (args.includes('--help') || args.length === 0) {
    console.log(`
Synthetic Catalog Generator

Usage:
  npx tsx scripts/generateSyntheticCatalogs.ts [options]

Options:
  --csv <file> --output <name>  Import products from CSV
  --expand-aliases              Generate aliases-only catalog
  --enrich <catalog.json>       Add aliases to existing catalog
  --stats                       Show catalog statistics

Examples:
  npx tsx scripts/generateSyntheticCatalogs.ts --csv products.csv --output my_products
  npx tsx scripts/generateSyntheticCatalogs.ts --expand-aliases
  npx tsx scripts/generateSyntheticCatalogs.ts --enrich tech_products/microsoft_catalog.json
  npx tsx scripts/generateSyntheticCatalogs.ts --stats
`);
    return;
  }

  try {
    if (args.includes('--csv')) {
      const csvIndex = args.indexOf('--csv');
      const outputIndex = args.indexOf('--output');

      if (csvIndex < 0 || !args[csvIndex + 1]) {
        throw new Error('Please provide CSV file path: --csv <file>');
      }

      const csvPath = args[csvIndex + 1];
      const outputName = outputIndex >= 0 && args[outputIndex + 1]
        ? args[outputIndex + 1]
        : path.basename(csvPath, '.csv');

      await generator.importFromCSV(csvPath, outputName);
    }

    if (args.includes('--expand-aliases')) {
      await generator.generateAliasesCatalog();
    }

    if (args.includes('--enrich')) {
      const enrichIndex = args.indexOf('--enrich');
      const catalogPath = args[enrichIndex + 1];

      if (!catalogPath) {
        throw new Error('Please provide catalog path: --enrich <catalog.json>');
      }

      await generator.expandCatalogWithAliases(catalogPath);
    }

    if (args.includes('--stats')) {
      await generator.getCatalogStats();
    }

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

main();

export { SyntheticCatalogGenerator, PRODUCT_ALIASES, CATEGORY_MAPPINGS };
