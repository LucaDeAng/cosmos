/**
 * 🧪 Catalog Downloader
 *
 * Downloads test catalogs from public sources and manages local cache.
 * Supports PDF, CSV, XLSX from various public APIs and datasets.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';
import { CatalogSource, DownloadResult, DEFAULT_CONFIG } from './types';

// ============================================================================
// Public Catalog Sources
// ============================================================================

export const PUBLIC_SOURCES: CatalogSource[] = [
  // ==========================================================================
  // Synthetic Sources (generated locally - reliable for testing)
  // ==========================================================================
  {
    id: 'synthetic-automotive-100',
    name: 'Synthetic Automotive Catalog',
    url: 'local://synthetic/automotive-100.csv',
    type: 'csv',
    expectedItems: 100,
    category: 'automotive',
    description: 'Generated catalog with 100 automotive products',
    isPublic: true,
  },
  {
    id: 'synthetic-tech-50',
    name: 'Synthetic Tech Products',
    url: 'local://synthetic/tech-products-50.csv',
    type: 'csv',
    expectedItems: 50,
    category: 'tech',
    description: 'Generated catalog with 50 tech products',
    isPublic: true,
  },
  {
    id: 'synthetic-services-30',
    name: 'Synthetic IT Services',
    url: 'local://synthetic/it-services-30.csv',
    type: 'csv',
    expectedItems: 30,
    category: 'services',
    description: 'Generated catalog with 30 IT services',
    isPublic: true,
  },
  {
    id: 'synthetic-mixed-200',
    name: 'Synthetic Mixed Catalog',
    url: 'local://synthetic/mixed-200.csv',
    type: 'csv',
    expectedItems: 200,
    category: 'mixed',
    description: 'Generated catalog with 200 mixed products and services',
    isPublic: true,
  },

  // ==========================================================================
  // Additional Synthetic Sources (edge cases)
  // ==========================================================================
  {
    id: 'synthetic-large-500',
    name: 'Synthetic Large Catalog',
    url: 'local://synthetic/large-500.csv',
    type: 'csv',
    expectedItems: 500,
    category: 'mixed',
    description: 'Large catalog for stress testing',
    isPublic: true,
  },
  {
    id: 'synthetic-minimal-10',
    name: 'Synthetic Minimal Catalog',
    url: 'local://synthetic/minimal-10.csv',
    type: 'csv',
    expectedItems: 10,
    category: 'tech',
    description: 'Minimal catalog for edge case testing',
    isPublic: true,
  },

  // ==========================================================================
  // Stress Test Sources (large catalogs for performance testing)
  // ==========================================================================
  {
    id: 'stress-1000',
    name: 'Stress Test 1000 Items',
    url: 'local://synthetic/stress-1000.csv',
    type: 'csv',
    expectedItems: 1000,
    category: 'mixed',
    description: 'Stress test with 1000 items for performance benchmarking',
    isPublic: true,
  },
  {
    id: 'stress-2000',
    name: 'Stress Test 2000 Items',
    url: 'local://synthetic/stress-2000.csv',
    type: 'csv',
    expectedItems: 2000,
    category: 'mixed',
    description: 'Stress test with 2000 items for performance benchmarking',
    isPublic: true,
  },
  {
    id: 'stress-5000',
    name: 'Stress Test 5000 Items',
    url: 'local://synthetic/stress-5000.csv',
    type: 'csv',
    expectedItems: 5000,
    category: 'mixed',
    description: 'Stress test with 5000 items for performance benchmarking',
    isPublic: true,
  },
  // ==========================================================================
  // Local CSV Catalogs (from codebase)
  // ==========================================================================
  {
    id: 'csv-saas-software',
    name: 'SaaS Software Catalog',
    url: 'local://catalogs/csv/saas_software.csv',
    type: 'csv',
    expectedItems: 15,
    category: 'tech',
    description: 'SaaS software catalog from internal CSV',
    isPublic: true,
  },
  {
    id: 'csv-electronics-products',
    name: 'Electronics Products Catalog',
    url: 'local://catalogs/csv/electronics_products.csv',
    type: 'csv',
    expectedItems: 15,
    category: 'tech',
    description: 'Electronics products catalog from internal CSV',
    isPublic: true,
  },
  {
    id: 'csv-cloud-services',
    name: 'Cloud Services Catalog',
    url: 'local://catalogs/csv/cloud_services.csv',
    type: 'csv',
    expectedItems: 15,
    category: 'services',
    description: 'Cloud services catalog from internal CSV',
    isPublic: true,
  },

  // ==========================================================================
  // JSON Catalogs (from codebase)
  // ==========================================================================
  {
    id: 'json-apple',
    name: 'Apple Products',
    url: 'local://catalogs/tech_products/apple_catalog.json',
    type: 'json',
    expectedItems: 8,
    category: 'tech',
    description: 'Apple products from internal catalog',
    isPublic: true,
  },
  {
    id: 'json-microsoft',
    name: 'Microsoft Products',
    url: 'local://catalogs/tech_products/microsoft_catalog.json',
    type: 'json',
    expectedItems: 12,
    category: 'tech',
    description: 'Microsoft products from internal catalog',
    isPublic: true,
  },
  {
    id: 'json-stellantis',
    name: 'Stellantis Vehicles',
    url: 'local://catalogs/automotive/stellantis_catalog.json',
    type: 'json',
    expectedItems: 15,
    category: 'automotive',
    description: 'Stellantis vehicles from internal catalog',
    isPublic: true,
  },
  {
    id: 'json-consulting-services',
    name: 'Consulting Services',
    url: 'local://catalogs/it_services/consulting_services.json',
    type: 'json',
    expectedItems: 17,
    category: 'services',
    description: 'Consulting services from internal catalog',
    isPublic: true,
  },

  // ==========================================================================
  // PDF Catalogs (from codebase)
  // ==========================================================================
  {
    id: 'pdf-tech-products-2026',
    name: 'Tech Products Catalog 2026',
    url: 'local://catalogs/pdf/Tech_Products_Catalog_2026.pdf',
    type: 'pdf',
    expectedItems: 7,
    category: 'tech',
    description: 'Technology products catalog with pricing table',
    isPublic: true,
  },
  {
    id: 'pdf-cloud-services-2026',
    name: 'Cloud Services Pricing 2026',
    url: 'local://catalogs/pdf/Cloud_Services_Pricing_2026.pdf',
    type: 'pdf',
    expectedItems: 7,
    category: 'services',
    description: 'Cloud services pricing guide with service table',
    isPublic: true,
  },
  {
    id: 'pdf-enterprise-software-licenses',
    name: 'Enterprise Software Licenses',
    url: 'local://catalogs/pdf/Enterprise_Software_Licenses.pdf',
    type: 'pdf',
    expectedItems: 8,
    category: 'tech',
    description: 'Enterprise software license catalog table',
    isPublic: true,
  },
  {
    id: 'pdf-saas-analytics-2026',
    name: 'SaaS Analytics Products 2026',
    url: 'local://catalogs/pdf/SaaS_Analytics_Products.pdf',
    type: 'pdf',
    expectedItems: 7,
    category: 'tech',
    description: 'SaaS analytics and monitoring product table',
    isPublic: true,
  },
];

// ============================================================================
// Downloader Class
// ============================================================================

export class CatalogDownloader {
  private cacheDir: string;
  private fixturesDir: string;

  constructor(config = DEFAULT_CONFIG) {
    this.cacheDir = path.resolve(config.cacheDir);
    this.fixturesDir = path.resolve(config.fixturesDir);
  }

  /**
   * Download all catalogs that aren't already cached
   */
  async downloadAll(sources: CatalogSource[] = PUBLIC_SOURCES): Promise<DownloadResult[]> {
    const results: DownloadResult[] = [];

    for (const source of sources) {
      try {
        const result = await this.downloadCatalog(source);
        results.push(result);
      } catch (error) {
        results.push({
          source,
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return results;
  }

  /**
   * Download a single catalog
   */
  async downloadCatalog(source: CatalogSource): Promise<DownloadResult> {
    console.log(`  📥 Downloading: ${source.name}...`);

    // Handle local sources
    if (source.url.startsWith('local://')) {
      return this.handleLocalSource(source);
    }

    // Check cache first
    const cachePath = this.getCachePath(source);
    if (fs.existsSync(cachePath)) {
      console.log(`    ✓ Using cached: ${cachePath}`);
      return {
        source,
        success: true,
        localPath: cachePath,
        downloadedAt: fs.statSync(cachePath).mtime,
        fileSize: fs.statSync(cachePath).size,
      };
    }

    // Download from URL
    try {
      await this.ensureDir(path.dirname(cachePath));
      await this.downloadFile(source.url, cachePath);

      const stats = fs.statSync(cachePath);
      console.log(`    ✓ Downloaded: ${(stats.size / 1024).toFixed(1)} KB`);

      return {
        source,
        success: true,
        localPath: cachePath,
        downloadedAt: new Date(),
        fileSize: stats.size,
      };
    } catch (error) {
      console.log(`    ✗ Failed: ${error instanceof Error ? error.message : error}`);
      return {
        source,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Handle local synthetic/JSON sources
   */
  private async handleLocalSource(source: CatalogSource): Promise<DownloadResult> {
    const localPath = source.url.replace('local://', '');

    // Synthetic sources - generate if not exists
    if (localPath.startsWith('synthetic/')) {
      const syntheticPath = path.join(this.fixturesDir, localPath);
      await this.generateSyntheticCatalog(source, syntheticPath);
      return {
        source,
        success: true,
        localPath: syntheticPath,
        downloadedAt: fs.statSync(syntheticPath).mtime,
        fileSize: fs.statSync(syntheticPath).size,
      };
    }

    // JSON catalogs from codebase
    if (localPath.startsWith('catalogs/')) {
      const catalogPath = path.join(__dirname, '../../../src/data', localPath);
      if (fs.existsSync(catalogPath)) {
        return {
          source,
          success: true,
          localPath: catalogPath,
          downloadedAt: fs.statSync(catalogPath).mtime,
          fileSize: fs.statSync(catalogPath).size,
        };
      } else {
        return {
          source,
          success: false,
          error: `Local catalog not found: ${catalogPath}`,
        };
      }
    }

    return {
      source,
      success: false,
      error: `Unknown local source: ${source.url}`,
    };
  }

  /**
   * Generate synthetic catalog for testing
   */
  private async generateSyntheticCatalog(source: CatalogSource, outputPath: string): Promise<void> {
    await this.ensureDir(path.dirname(outputPath));

    let content = '';

    switch (source.id) {
      case 'synthetic-automotive-100':
        content = this.generateAutomotiveCatalog(100);
        break;
      case 'synthetic-tech-50':
        content = this.generateTechCatalog(50);
        break;
      case 'synthetic-services-30':
        content = this.generateServicesCatalog(30);
        break;
      case 'synthetic-mixed-200':
        content = this.generateMixedCatalog(200);
        break;
      case 'synthetic-large-500':
        content = this.generateMixedCatalog(500);
        break;
      case 'synthetic-minimal-10':
        content = this.generateTechCatalog(10);
        break;
      case 'stress-1000':
        content = this.generateMixedCatalog(1000);
        break;
      case 'stress-2000':
        content = this.generateMixedCatalog(2000);
        break;
      case 'stress-5000':
        content = this.generateMixedCatalog(5000);
        break;
      default:
        throw new Error(`Unknown synthetic source: ${source.id}`);
    }

    fs.writeFileSync(outputPath, content, 'utf8');
    console.log(`    ✓ Generated synthetic catalog: ${source.name}`);
  }

  /**
   * Generate automotive catalog CSV with unique realistic names
   */
  private generateAutomotiveCatalog(count: number): string {
    // Real-ish model names for each brand
    const brandModels: Record<string, string[]> = {
      'Fiat': ['500', 'Panda', 'Tipo', '500X', '500L', 'Punto', 'Bravo', 'Doblo'],
      'Jeep': ['Wrangler', 'Cherokee', 'Compass', 'Renegade', 'Grand Cherokee', 'Gladiator'],
      'Alfa Romeo': ['Giulia', 'Stelvio', 'Tonale', 'Giulietta', '4C', 'MiTo'],
      'Lancia': ['Ypsilon', 'Delta', 'Thema', 'Flavia', 'Voyager'],
      'Maserati': ['Ghibli', 'Levante', 'Quattroporte', 'GranTurismo', 'MC20'],
      'Peugeot': ['208', '308', '408', '508', '2008', '3008', '5008'],
      'Citroen': ['C3', 'C4', 'C5 X', 'Berlingo', 'C3 Aircross', 'C5 Aircross'],
      'Opel': ['Corsa', 'Astra', 'Mokka', 'Crossland', 'Grandland', 'Combo'],
    };
    const brands = Object.keys(brandModels);
    const trims = ['Base', 'Sport', 'Elegance', 'Business', 'Premium', 'GT Line', 'RS'];
    const fuels = ['Benzina', 'Diesel', 'Hybrid', 'PHEV', 'EV', 'Metano', 'GPL'];

    const headers = 'name,description,category,type,vendor,price,year,fuel,power_kw';
    const rows: string[] = [headers];

    for (let i = 1; i <= count; i++) {
      const brand = brands[i % brands.length];
      const models = brandModels[brand];
      const model = models[i % models.length];
      const trim = trims[i % trims.length];
      const fuel = fuels[i % fuels.length];
      const year = 2021 + (i % 4);
      const power = 70 + ((i * 7) % 250);
      const price = 18000 + (i * 350) + ((i * 17) % 5000);
      // Unique name: Brand Model Trim Year
      const name = `${brand} ${model} ${trim} ${year}`;
      const category = power > 150 ? 'SUV' : power > 100 ? 'Berlina' : 'City Car';

      rows.push(`"${name}","${brand} ${model} ${fuel} ${power}kW MY${year}","${category}","product","${brand}",${price},${year},"${fuel}",${power}`);
    }

    return rows.join('\n');
  }

  /**
   * Generate tech products catalog CSV with unique realistic names
   */
  private generateTechCatalog(count: number): string {
    // Real-ish product names for each vendor
    const vendorProducts: Record<string, string[]> = {
      'Apple': ['macOS', 'iOS Enterprise', 'iCloud for Business', 'Apple Business Manager', 'Final Cut Pro', 'Logic Pro'],
      'Microsoft': ['Azure DevOps', 'Power BI', 'Dynamics 365', 'Intune', 'Defender', 'Teams Premium', 'Copilot'],
      'Google': ['Workspace', 'Cloud Platform', 'BigQuery', 'Vertex AI', 'Chronicle', 'Looker', 'Anthos'],
      'Adobe': ['Creative Cloud', 'Experience Cloud', 'Document Cloud', 'Acrobat Pro', 'Premiere Pro', 'After Effects'],
      'Salesforce': ['Sales Cloud', 'Service Cloud', 'Marketing Cloud', 'Commerce Cloud', 'Tableau', 'MuleSoft'],
      'SAP': ['S/4HANA', 'SuccessFactors', 'Ariba', 'Concur', 'Business One', 'Analytics Cloud'],
      'Oracle': ['Cloud Infrastructure', 'NetSuite', 'Fusion ERP', 'HCM Cloud', 'Database Cloud'],
      'IBM': ['Watson', 'Cloud Pak', 'Maximo', 'Cognos', 'Planning Analytics', 'SPSS'],
    };
    const vendors = Object.keys(vendorProducts);
    const editions = ['Starter', 'Professional', 'Enterprise', 'Ultimate', 'Premium', 'Plus'];
    const categories = ['Software', 'Cloud Services', 'Security', 'Analytics', 'Collaboration', 'CRM', 'ERP'];

    const headers = 'name,description,category,type,vendor,price_monthly,users_included,features';
    const rows: string[] = [headers];

    for (let i = 1; i <= count; i++) {
      const vendor = vendors[i % vendors.length];
      const products = vendorProducts[vendor];
      const product = products[i % products.length];
      const edition = editions[i % editions.length];
      const category = categories[i % categories.length];
      const price = 15 + ((i * 13) % 500);
      const users = 5 * (1 + ((i * 3) % 20));
      // Unique name: Vendor Product Edition
      const name = `${vendor} ${product} ${edition}`;
      const features = `${category} features; API access; Support ${edition === 'Enterprise' ? '24/7' : 'Business hours'}`;

      rows.push(`"${name}","${vendor} ${product} - ${edition} edition for ${category.toLowerCase()}","${category}","product","${vendor}",${price},${users},"${features}"`);
    }

    return rows.join('\n');
  }

  /**
   * Generate IT services catalog CSV with unique realistic names
   */
  private generateServicesCatalog(count: number): string {
    // Real-ish service packages for each provider
    const providerServices: Record<string, string[]> = {
      'Accenture': ['Strategy & Consulting', 'Technology Advisory', 'Operations Excellence', 'Industry X.0'],
      'Deloitte': ['Risk Advisory', 'Tax Services', 'Audit & Assurance', 'Financial Advisory'],
      'Capgemini': ['Intelligent Industry', 'Customer First', 'Enterprise Management', 'Cloud Transformation'],
      'IBM Consulting': ['Garage Method', 'iX Design', 'Data & AI', 'Security Services'],
      'TCS': ['Cognitive Business Ops', 'Machine First', 'Enterprise Agility', 'Cyber Defense'],
      'Wipro': ['FullStride Cloud', 'Engineering Edge', 'Data Discovery', 'Connected Enterprise'],
      'McKinsey': ['Digital Leap', 'Operations Practice', 'Strategy & Corporate Finance', 'Sustainability'],
    };
    const providers = Object.keys(providerServices);
    const tiers = ['Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond'];
    const deliveryModes = ['On-site', 'Remote', 'Hybrid', 'Near-shore', 'Off-shore'];

    const headers = 'name,description,category,type,vendor,daily_rate,min_duration_days,delivery_model';
    const rows: string[] = [headers];

    for (let i = 1; i <= count; i++) {
      const provider = providers[i % providers.length];
      const services = providerServices[provider];
      const service = services[i % services.length];
      const tier = tiers[i % tiers.length];
      const deliveryModel = deliveryModes[i % deliveryModes.length];
      const rate = 900 + ((i * 17) % 1500);
      const duration = 10 + ((i * 7) % 90);
      // Unique name: Provider Service Tier
      const name = `${provider} ${service} ${tier}`;
      const category = service.includes('Advisory') || service.includes('Consulting') ? 'Consulting' : 'Implementation';

      rows.push(`"${name}","${provider} ${service} - ${tier} tier engagement with ${deliveryModel.toLowerCase()} delivery","${category}","service","${provider}",${rate},${duration},"${deliveryModel}"`);
    }

    return rows.join('\n');
  }

  /**
   * Generate mixed catalog CSV (products + services) with unique realistic names
   * Uses unique sequential numbering to avoid duplicates
   */
  private generateMixedCatalog(count: number): string {
    const headers = 'name,description,category,item_type,vendor,price,unit,sku';
    const rows: string[] = [headers];

    // 60% products, 40% services
    const productCount = Math.floor(count * 0.6);
    const serviceCount = count - productCount;

    // Product catalog - use sequential SKUs for uniqueness
    const productLines = [
      { vendor: 'Dell', products: ['PowerEdge', 'Precision', 'Latitude', 'OptiPlex', 'PowerStore'] },
      { vendor: 'HP', products: ['ProLiant', 'ZBook', 'EliteBook', 'Z Workstation', 'StoreServ'] },
      { vendor: 'Lenovo', products: ['ThinkPad', 'ThinkStation', 'ThinkCentre', 'ThinkSystem'] },
      { vendor: 'Cisco', products: ['Catalyst', 'Nexus', 'UCS', 'Meraki', 'ISR'] },
      { vendor: 'NetApp', products: ['AFF', 'FAS', 'StorageGRID', 'E-Series', 'ONTAP'] },
      { vendor: 'VMware', products: ['vSphere', 'NSX', 'vSAN', 'Tanzu', 'Aria'] },
      { vendor: 'Nutanix', products: ['NX', 'AOS', 'Prism', 'Flow', 'Calm'] },
    ];
    const specs = ['8GB', '16GB', '32GB', '64GB', '128GB', '256GB', '512GB', '1TB'];

    for (let i = 1; i <= productCount; i++) {
      const line = productLines[i % productLines.length];
      const product = line.products[Math.floor(i / productLines.length) % line.products.length];
      const spec = specs[i % specs.length];
      const modelNum = 1000 + i; // Unique model number
      const price = 1500 + ((i * 23) % 8000);
      const category = product.includes('Book') || product.includes('Pad') ? 'Endpoint' :
                       product.includes('Catalyst') || product.includes('Nexus') || product.includes('NSX') ? 'Network' : 'Infrastructure';
      // Unique name with SKU
      const name = `${line.vendor} ${product} ${modelNum} ${spec}`;
      const sku = `${line.vendor.substring(0, 3).toUpperCase()}-${product.substring(0, 3).toUpperCase()}-${modelNum}`;

      rows.push(`"${name}","${line.vendor} ${product} Series - ${spec} configuration","${category}","product","${line.vendor}",${price},"unit","${sku}"`);
    }

    // Service catalog - use unique engagement IDs
    const serviceLines = [
      { vendor: 'Accenture', services: ['Strategy', 'Technology', 'Operations', 'Industry X', 'Song'] },
      { vendor: 'Deloitte', services: ['Consulting', 'Risk', 'Tax', 'Audit', 'Financial'] },
      { vendor: 'EY', services: ['Assurance', 'Consulting', 'Strategy', 'Tax', 'Transactions'] },
      { vendor: 'PwC', services: ['Advisory', 'Assurance', 'Tax', 'Deals', 'Digital'] },
      { vendor: 'KPMG', services: ['Advisory', 'Audit', 'Tax', 'Legal', 'Lighthouse'] },
      { vendor: 'BCG', services: ['Strategy', 'Digital', 'M&A', 'Operations', 'Sustainability'] },
    ];
    const durations = ['2-week', '4-week', '8-week', '12-week', 'Ongoing'];

    for (let i = 1; i <= serviceCount; i++) {
      const line = serviceLines[i % serviceLines.length];
      const service = line.services[Math.floor(i / serviceLines.length) % line.services.length];
      const duration = durations[i % durations.length];
      const engagementId = 5000 + i; // Unique engagement ID
      const price = 1200 + ((i * 19) % 3000);
      const category = service.includes('Audit') || service.includes('Tax') || service.includes('Assurance') ? 'Assurance' :
                       service.includes('Digital') || service.includes('Technology') ? 'Technology' : 'Advisory';
      // Unique name with engagement ID
      const name = `${line.vendor} ${service} Engagement ${engagementId}`;
      const sku = `${line.vendor.substring(0, 3).toUpperCase()}-SVC-${engagementId}`;

      rows.push(`"${name}","${line.vendor} ${service} - ${duration} engagement","${category}","service","${line.vendor}",${price},"day","${sku}"`);
    }

    return rows.join('\n');
  }

  /**
   * Download a file from URL
   */
  private downloadFile(url: string, destPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const protocol = url.startsWith('https') ? https : http;
      const file = fs.createWriteStream(destPath);

      const request = protocol.get(url, { timeout: 30000 }, (response) => {
        // Handle redirects
        if (response.statusCode === 301 || response.statusCode === 302) {
          const redirectUrl = response.headers.location;
          if (redirectUrl) {
            file.close();
            fs.unlinkSync(destPath);
            return this.downloadFile(redirectUrl, destPath).then(resolve).catch(reject);
          }
        }

        if (response.statusCode !== 200) {
          file.close();
          fs.unlinkSync(destPath);
          reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
          return;
        }

        response.pipe(file);

        file.on('finish', () => {
          file.close();
          resolve();
        });
      });

      request.on('error', (err) => {
        file.close();
        if (fs.existsSync(destPath)) {
          fs.unlinkSync(destPath);
        }
        reject(err);
      });

      request.on('timeout', () => {
        request.destroy();
        file.close();
        if (fs.existsSync(destPath)) {
          fs.unlinkSync(destPath);
        }
        reject(new Error('Download timeout'));
      });
    });
  }

  /**
   * Get cache path for a source
   */
  private getCachePath(source: CatalogSource): string {
    const ext = source.type === 'xlsx' ? 'xlsx' : source.type;
    return path.join(this.cacheDir, `${source.id}.${ext}`);
  }

  /**
   * Ensure directory exists
   */
  private async ensureDir(dir: string): Promise<void> {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    if (fs.existsSync(this.cacheDir)) {
      fs.rmSync(this.cacheDir, { recursive: true, force: true });
    }
  }

  /**
   * Get available sources
   */
  getSources(): CatalogSource[] {
    return PUBLIC_SOURCES;
  }
}

// ============================================================================
// CLI
// ============================================================================

if (require.main === module) {
  const downloader = new CatalogDownloader();

  console.log('📥 Downloading catalogs for battery tests...\n');

  downloader.downloadAll().then((results) => {
    const successful = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    console.log('\n📊 Download Summary:');
    console.log(`  ✓ Successful: ${successful}`);
    console.log(`  ✗ Failed: ${failed}`);

    if (failed > 0) {
      console.log('\nFailed downloads:');
      results
        .filter((r) => !r.success)
        .forEach((r) => {
          console.log(`  - ${r.source.name}: ${r.error}`);
        });
    }

    process.exit(failed > 0 ? 1 : 0);
  });
}
