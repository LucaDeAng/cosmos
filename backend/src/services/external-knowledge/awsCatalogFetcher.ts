/**
 * AWS Catalog Fetcher
 *
 * Fetches AWS service catalog from the public AWS Price List API.
 * No authentication required.
 */

import {
  ExternalKnowledgeItem,
  FetchResult,
  AWS_SERVICE_CATEGORIES,
  formatAWSServiceName,
} from './types';

const AWS_OFFERS_INDEX = 'https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/index.json';

interface AWSOfferIndex {
  formatVersion: string;
  publicationDate: string;
  offers: Record<string, {
    offerCode: string;
    versionIndexUrl: string;
    currentVersionUrl: string;
    currentRegionIndexUrl?: string;
  }>;
}

/**
 * Fetch AWS service catalog from Price List API
 */
export async function fetchAWSCatalog(): Promise<FetchResult> {
  const startTime = Date.now();
  const items: ExternalKnowledgeItem[] = [];
  const errors: string[] = [];

  try {
    console.log('   Fetching AWS offers index...');

    const response = await fetch(AWS_OFFERS_INDEX, {
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`AWS API returned ${response.status}: ${response.statusText}`);
    }

    const index = (await response.json()) as AWSOfferIndex;

    console.log(`   Found ${Object.keys(index.offers).length} AWS services`);

    // Process each offer
    for (const [offerCode, offerData] of Object.entries(index.offers)) {
      try {
        const displayName = formatAWSServiceName(offerCode);
        const category = AWS_SERVICE_CATEGORIES[offerCode] || categorizeAWSService(offerCode);

        const item: ExternalKnowledgeItem = {
          id: `aws-${offerCode.toLowerCase()}`,
          source: 'aws',
          name_en: displayName || offerCode,
          name_it: translateToItalian(displayName),
          category: category,
          subcategory: offerCode,
          description_en: `Amazon Web Services ${displayName} - Cloud ${category.toLowerCase()} service`,
          description_it: `Amazon Web Services ${displayName} - Servizio cloud ${translateCategoryToItalian(category)}`,
          keywords: extractAWSKeywords(offerCode, displayName, category),
          vendor: 'Amazon Web Services',
          pricing_model: 'usage_based',
          service_family: 'Cloud Services',
          fetched_at: new Date(),
          raw_data: {
            offerCode: offerData.offerCode,
            currentVersionUrl: offerData.currentVersionUrl,
            publicationDate: index.publicationDate,
          },
        };

        items.push(item);
      } catch (err) {
        errors.push(`Failed to process ${offerCode}: ${err}`);
      }
    }

    console.log(`   Processed ${items.length} AWS services`);

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    errors.push(`AWS fetch failed: ${errorMsg}`);
    console.error('   AWS fetch error:', errorMsg);
  }

  return {
    items,
    source: 'aws',
    fetched_at: new Date(),
    item_count: items.length,
    duration_ms: Date.now() - startTime,
    errors: errors.length > 0 ? errors : undefined,
  };
}

/**
 * Categorize AWS service by name pattern
 */
function categorizeAWSService(serviceCode: string): string {
  const code = serviceCode.toLowerCase();

  if (code.includes('lambda') || code.includes('ec2') || code.includes('batch') || code.includes('lightsail')) {
    return 'Compute';
  }
  if (code.includes('s3') || code.includes('efs') || code.includes('glacier') || code.includes('backup')) {
    return 'Storage';
  }
  if (code.includes('rds') || code.includes('dynamo') || code.includes('aurora') || code.includes('neptune') || code.includes('documentdb') || code.includes('elasticache')) {
    return 'Database';
  }
  if (code.includes('vpc') || code.includes('cloudfront') || code.includes('route53') || code.includes('directconnect') || code.includes('apigateway')) {
    return 'Networking';
  }
  if (code.includes('iam') || code.includes('cognito') || code.includes('kms') || code.includes('secrets') || code.includes('guard') || code.includes('inspector') || code.includes('macie')) {
    return 'Security';
  }
  if (code.includes('sagemaker') || code.includes('rekognition') || code.includes('comprehend') || code.includes('lex') || code.includes('polly') || code.includes('bedrock') || code.includes('textract')) {
    return 'AI & ML';
  }
  if (code.includes('redshift') || code.includes('athena') || code.includes('glue') || code.includes('kinesis') || code.includes('quicksight') || code.includes('elasticsearch') || code.includes('opensearch')) {
    return 'Analytics';
  }
  if (code.includes('ecs') || code.includes('eks') || code.includes('fargate') || code.includes('ecr')) {
    return 'Containers';
  }
  if (code.includes('sns') || code.includes('sqs') || code.includes('step') || code.includes('eventbridge') || code.includes('mq')) {
    return 'Application Integration';
  }
  if (code.includes('cloudwatch') || code.includes('cloudtrail') || code.includes('config') || code.includes('systems')) {
    return 'Management';
  }
  if (code.includes('codebuild') || code.includes('codepipeline') || code.includes('codedeploy') || code.includes('codecommit') || code.includes('cloud9')) {
    return 'Developer Tools';
  }
  if (code.includes('iot')) {
    return 'IoT';
  }

  return 'Other';
}

/**
 * Extract keywords from AWS service
 */
function extractAWSKeywords(code: string, name: string, category: string): string[] {
  const keywords = [
    'aws',
    'amazon',
    'cloud',
    code.toLowerCase(),
    name.toLowerCase(),
    category.toLowerCase(),
    'iaas',
    'paas',
  ];

  // Add specific keywords based on category
  if (category === 'Compute') {
    keywords.push('compute', 'server', 'vm', 'virtual machine', 'instance');
  }
  if (category === 'Storage') {
    keywords.push('storage', 'backup', 'object storage', 'file storage');
  }
  if (category === 'Database') {
    keywords.push('database', 'db', 'sql', 'nosql', 'data');
  }
  if (category === 'AI & ML') {
    keywords.push('ai', 'ml', 'machine learning', 'artificial intelligence', 'llm');
  }

  return [...new Set(keywords)];
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
    'Other': 'generico',
  };
  return translations[category] || category.toLowerCase();
}

/**
 * Simple translation for service names (basic)
 */
function translateToItalian(name: string): string {
  // For now, keep English names as they are widely used
  return name;
}

export default { fetchAWSCatalog };
