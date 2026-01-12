/**
 * Azure Catalog Fetcher
 *
 * Fetches Azure service catalog from the public Azure Retail Prices API.
 * No authentication required.
 */

import {
  ExternalKnowledgeItem,
  FetchResult,
  AZURE_SERVICE_FAMILIES,
  slugify,
} from './types';

const AZURE_PRICES_API = 'https://prices.azure.com/api/retail/prices';

interface AzurePriceItem {
  currencyCode: string;
  tierMinimumUnits: number;
  retailPrice: number;
  unitPrice: number;
  armRegionName: string;
  location: string;
  effectiveStartDate: string;
  meterId: string;
  meterName: string;
  productId: string;
  skuId: string;
  productName: string;
  skuName: string;
  serviceName: string;
  serviceId: string;
  serviceFamily: string;
  unitOfMeasure: string;
  type: string;
  isPrimaryMeterRegion: boolean;
  armSkuName: string;
}

interface AzurePricesResponse {
  BillingCurrency: string;
  CustomerEntityId: string;
  CustomerEntityType: string;
  Items: AzurePriceItem[];
  NextPageLink: string | null;
  Count: number;
}

/**
 * Fetch Azure service catalog from Retail Prices API
 */
export async function fetchAzureCatalog(maxItems = 2000): Promise<FetchResult> {
  const startTime = Date.now();
  const items: ExternalKnowledgeItem[] = [];
  const errors: string[] = [];
  const seenServices = new Map<string, ExternalKnowledgeItem>();

  try {
    console.log('   Fetching Azure prices...');

    let nextPageLink: string | null = AZURE_PRICES_API;
    let pageCount = 0;
    const maxPages = 20; // Limit pages to avoid too long fetches

    while (nextPageLink && pageCount < maxPages && seenServices.size < maxItems) {
      try {
        const response = await fetch(nextPageLink, {
          headers: {
            'Accept': 'application/json',
          },
        });

        if (!response.ok) {
          throw new Error(`Azure API returned ${response.status}: ${response.statusText}`);
        }

        const data = (await response.json()) as AzurePricesResponse;
        pageCount++;

        console.log(`   Page ${pageCount}: ${data.Items.length} items (total unique: ${seenServices.size})`);

        // Process items - deduplicate by serviceName + productName
        for (const priceItem of data.Items) {
          const serviceKey = `${priceItem.serviceName}`;

          // Skip if we already have this service
          if (seenServices.has(serviceKey)) {
            continue;
          }

          const category = AZURE_SERVICE_FAMILIES[priceItem.serviceFamily] || priceItem.serviceFamily || 'Other';

          const item: ExternalKnowledgeItem = {
            id: `azure-${slugify(serviceKey)}`,
            source: 'azure',
            name_en: priceItem.serviceName,
            name_it: translateAzureService(priceItem.serviceName),
            category: category,
            subcategory: priceItem.serviceFamily,
            description_en: `Microsoft Azure ${priceItem.serviceName} - Cloud ${category.toLowerCase()} service`,
            description_it: `Microsoft Azure ${priceItem.serviceName} - Servizio cloud ${translateCategoryToItalian(category)}`,
            keywords: extractAzureKeywords(priceItem),
            vendor: 'Microsoft Azure',
            pricing_model: mapAzurePricingType(priceItem.type),
            service_family: priceItem.serviceFamily,
            fetched_at: new Date(),
            raw_data: {
              serviceId: priceItem.serviceId,
              serviceFamily: priceItem.serviceFamily,
              type: priceItem.type,
            },
          };

          seenServices.set(serviceKey, item);
        }

        nextPageLink = data.NextPageLink;

        // Small delay to be nice to the API
        if (nextPageLink) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error';
        errors.push(`Page ${pageCount} failed: ${errorMsg}`);
        break;
      }
    }

    // Convert map to array
    items.push(...seenServices.values());

    console.log(`   Processed ${items.length} unique Azure services`);

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    errors.push(`Azure fetch failed: ${errorMsg}`);
    console.error('   Azure fetch error:', errorMsg);
  }

  return {
    items,
    source: 'azure',
    fetched_at: new Date(),
    item_count: items.length,
    duration_ms: Date.now() - startTime,
    errors: errors.length > 0 ? errors : undefined,
  };
}

/**
 * Extract keywords from Azure price item
 */
function extractAzureKeywords(item: AzurePriceItem): string[] {
  const keywords = [
    'azure',
    'microsoft',
    'cloud',
    item.serviceName.toLowerCase(),
    item.serviceFamily?.toLowerCase() || '',
  ];

  // Add category-specific keywords
  const family = item.serviceFamily?.toLowerCase() || '';
  if (family.includes('compute')) {
    keywords.push('vm', 'virtual machine', 'compute', 'server');
  }
  if (family.includes('storage')) {
    keywords.push('storage', 'blob', 'files', 'backup');
  }
  if (family.includes('database')) {
    keywords.push('database', 'db', 'sql', 'cosmos');
  }
  if (family.includes('ai') || family.includes('machine learning')) {
    keywords.push('ai', 'ml', 'machine learning', 'cognitive');
  }
  if (family.includes('analytics')) {
    keywords.push('analytics', 'data', 'synapse', 'stream');
  }
  if (family.includes('networking')) {
    keywords.push('network', 'cdn', 'vpn', 'load balancer');
  }
  if (family.includes('security') || family.includes('identity')) {
    keywords.push('security', 'identity', 'iam', 'entra');
  }
  if (family.includes('container')) {
    keywords.push('container', 'kubernetes', 'aks', 'docker');
  }
  if (family.includes('devops')) {
    keywords.push('devops', 'ci/cd', 'pipeline', 'deployment');
  }

  return [...new Set(keywords.filter(Boolean))];
}

/**
 * Map Azure pricing type to standard model
 */
function mapAzurePricingType(type: string): string {
  switch (type?.toLowerCase()) {
    case 'consumption':
      return 'usage_based';
    case 'reservation':
      return 'subscription';
    case 'devtestconsumption':
      return 'usage_based';
    default:
      return 'usage_based';
  }
}

/**
 * Simple translation for Azure services
 */
function translateAzureService(name: string): string {
  // Keep English names as they are widely recognized
  return name;
}

/**
 * Simple translation for category names
 */
function translateCategoryToItalian(category: string): string {
  const translations: Record<string, string> = {
    'Compute': 'di calcolo',
    'Storage': 'di archiviazione',
    'Database': 'database',
    'Networking': 'di rete',
    'Security': 'di sicurezza',
    'AI & ML': 'di intelligenza artificiale',
    'Analytics': 'di analisi',
    'Containers': 'container',
    'Application Integration': 'di integrazione',
    'Management': 'di gestione',
    'Developer Tools': 'per sviluppatori',
    'IoT': 'IoT',
    'Web': 'web',
    'Other': 'generico',
  };
  return translations[category] || category.toLowerCase();
}

export default { fetchAzureCatalog };
