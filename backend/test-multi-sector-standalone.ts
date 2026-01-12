/**
 * Standalone test for multi-sector sources (no Supabase required)
 * Run with: npx tsx test-multi-sector-standalone.ts
 */

// ========================================
// Sector Detector (standalone)
// ========================================

type SectorCode =
  | 'it_software'
  | 'food_beverage'
  | 'consumer_goods'
  | 'healthcare_pharma'
  | 'industrial'
  | 'financial_services'
  | 'professional_services'
  | 'automotive'
  | 'unknown';

const SECTOR_KEYWORDS: Record<SectorCode, string[]> = {
  it_software: ['software', 'saas', 'cloud', 'api', 'database', 'erp', 'crm', 'microsoft', 'oracle', 'sap', 'aws', 'azure'],
  food_beverage: ['food', 'beverage', 'organic', 'calories', 'nutritional', 'ingredient', 'dairy', 'coffee', 'wine', 'beer'],
  consumer_goods: ['cosmetic', 'beauty', 'shampoo', 'soap', 'cream', 'skincare', 'makeup', 'household', 'cleaning'],
  healthcare_pharma: ['pharmaceutical', 'drug', 'medicine', 'medical', 'healthcare', 'therapy', 'fda', 'prescription'],
  industrial: ['machinery', 'equipment', 'industrial', 'manufacturing', 'component', 'spare part', 'tool'],
  financial_services: ['bank', 'insurance', 'investment', 'loan', 'credit', 'fintech', 'payment'],
  professional_services: ['consulting', 'advisory', 'audit', 'legal', 'accounting', 'training'],
  automotive: ['vehicle', 'car', 'automotive', 'engine', 'ev', 'electric vehicle', 'powertrain'],
  unknown: [],
};

function detectSector(name: string, description?: string): { sector: SectorCode; confidence: number } {
  const text = `${name} ${description || ''}`.toLowerCase();

  const scores: Record<SectorCode, number> = {} as Record<SectorCode, number>;

  for (const [sector, keywords] of Object.entries(SECTOR_KEYWORDS)) {
    let score = 0;
    for (const kw of keywords) {
      if (text.includes(kw)) score++;
    }
    scores[sector as SectorCode] = score;
  }

  let bestSector: SectorCode = 'unknown';
  let bestScore = 0;
  for (const [sector, score] of Object.entries(scores)) {
    if (score > bestScore) {
      bestScore = score;
      bestSector = sector as SectorCode;
    }
  }

  const confidence = Math.min(bestScore / 3, 1); // Normalize
  return { sector: bestSector, confidence };
}

// ========================================
// Open Food Facts API Test
// ========================================

interface OpenFoodFactsProduct {
  code: string;
  product_name: string;
  brands?: string;
  categories_tags?: string[];
  ingredients_text?: string;
  nutriscore_grade?: string;
}

async function testOpenFoodFacts() {
  console.log('\n=== Testing Open Food Facts API ===\n');

  const baseUrl = 'https://world.openfoodfacts.org/api/v2';

  // Test 1: Barcode lookup (Nutella)
  console.log('1. Barcode lookup (Nutella - 3017620422003)...');
  try {
    const response = await fetch(`${baseUrl}/product/3017620422003`, {
      headers: { 'User-Agent': 'THEMIS-Test/1.0' },
    });

    if (response.ok) {
      const data = await response.json() as { status: number; product?: OpenFoodFactsProduct };
      if (data.status === 1 && data.product) {
        console.log(`   ✅ Found: ${data.product.product_name}`);
        console.log(`   Brand: ${data.product.brands}`);
        console.log(`   Nutriscore: ${data.product.nutriscore_grade?.toUpperCase() || 'N/A'}`);
      } else {
        console.log('   ❌ Product not found in database');
      }
    } else {
      console.log(`   ❌ API error: ${response.status}`);
    }
  } catch (error) {
    console.log(`   ❌ Network error: ${error}`);
  }

  // Test 2: Search
  console.log('\n2. Search "pasta barilla"...');
  try {
    const url = new URL(`${baseUrl}/search`);
    url.searchParams.set('search_terms', 'pasta barilla');
    url.searchParams.set('page_size', '3');
    url.searchParams.set('json', 'true');

    const response = await fetch(url.toString(), {
      headers: { 'User-Agent': 'THEMIS-Test/1.0' },
    });

    if (response.ok) {
      const data = await response.json() as { products: OpenFoodFactsProduct[] };
      console.log(`   ✅ Found ${data.products?.length || 0} products`);
      for (const p of (data.products || []).slice(0, 2)) {
        console.log(`   - ${p.product_name} (${p.brands || 'Unknown'})`);
      }
    } else {
      console.log(`   ❌ API error: ${response.status}`);
    }
  } catch (error) {
    console.log(`   ❌ Network error: ${error}`);
  }
}

// ========================================
// Open Beauty Facts API Test
// ========================================

interface OpenBeautyFactsProduct {
  code: string;
  product_name: string;
  brands?: string;
  categories_tags?: string[];
  ingredients_text?: string;
}

async function testOpenBeautyFacts() {
  console.log('\n=== Testing Open Beauty Facts API ===\n');

  const baseUrl = 'https://world.openbeautyfacts.org/api/v2';

  // Test: Search
  console.log('1. Search "shampoo"...');
  try {
    const url = new URL(`${baseUrl}/search`);
    url.searchParams.set('search_terms', 'shampoo');
    url.searchParams.set('page_size', '5');
    url.searchParams.set('json', 'true');

    const response = await fetch(url.toString(), {
      headers: { 'User-Agent': 'THEMIS-Test/1.0' },
    });

    if (response.ok) {
      const data = await response.json() as { products: OpenBeautyFactsProduct[] };
      console.log(`   ✅ Found ${data.products?.length || 0} products`);
      for (const p of (data.products || []).slice(0, 3)) {
        console.log(`   - ${p.product_name || 'Unnamed'} (${p.brands || 'Unknown brand'})`);
      }
    } else {
      console.log(`   ❌ API error: ${response.status}`);
    }
  } catch (error) {
    console.log(`   ❌ Network error: ${error}`);
  }

  // Test 2: Search Nivea
  console.log('\n2. Search "nivea cream"...');
  try {
    const url = new URL(`${baseUrl}/search`);
    url.searchParams.set('search_terms', 'nivea cream');
    url.searchParams.set('page_size', '3');
    url.searchParams.set('json', 'true');

    const response = await fetch(url.toString(), {
      headers: { 'User-Agent': 'THEMIS-Test/1.0' },
    });

    if (response.ok) {
      const data = await response.json() as { products: OpenBeautyFactsProduct[] };
      console.log(`   ✅ Found ${data.products?.length || 0} products`);
      for (const p of (data.products || []).slice(0, 2)) {
        console.log(`   - ${p.product_name || 'Unnamed'} (${p.brands || 'Unknown'})`);
      }
    } else {
      console.log(`   ❌ API error: ${response.status}`);
    }
  } catch (error) {
    console.log(`   ❌ Network error: ${error}`);
  }
}

// ========================================
// Main
// ========================================

async function main() {
  console.log('========================================');
  console.log('  THEMIS Multi-Sector Standalone Test');
  console.log('========================================');

  // Test sector detection
  console.log('\n=== Testing Sector Detection ===\n');
  const testItems = [
    { name: 'Microsoft Office 365', description: 'Cloud productivity SaaS' },
    { name: 'Nutella', description: 'Hazelnut spread food product' },
    { name: "L'Oreal Shampoo", description: 'Hair care beauty product' },
    { name: 'Aspirin 500mg', description: 'Pharmaceutical pain relief drug' },
    { name: 'Tesla Model 3', description: 'Electric vehicle car' },
  ];

  for (const item of testItems) {
    const result = detectSector(item.name, item.description);
    console.log(`"${item.name}" => ${result.sector} (${(result.confidence * 100).toFixed(0)}%)`);
  }

  // Test APIs
  await testOpenFoodFacts();
  await testOpenBeautyFacts();

  console.log('\n========================================');
  console.log('  All tests completed!');
  console.log('========================================\n');
}

main().catch(console.error);
