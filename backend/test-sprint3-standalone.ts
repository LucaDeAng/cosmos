/**
 * Standalone test for Sprint 3 sources (OpenFDA, Wikidata, DBpedia)
 * Run with: npx tsx test-sprint3-standalone.ts
 */

// ========================================
// OpenFDA Test
// ========================================

interface OpenFDADrugResult {
  openfda?: {
    brand_name?: string[];
    generic_name?: string[];
    manufacturer_name?: string[];
    product_ndc?: string[];
    product_type?: string[];
    route?: string[];
  };
  purpose?: string[];
  indications_and_usage?: string[];
}

interface OpenFDASearchResponse {
  meta?: { results?: { total: number } };
  results?: OpenFDADrugResult[];
  error?: { code: string; message: string };
}

async function testOpenFDA() {
  console.log('\n=== Testing OpenFDA API ===\n');

  const baseUrl = 'https://api.fda.gov';

  // Test 1: Search for Aspirin
  console.log('1. Search for "Aspirin"...');
  try {
    const url = new URL(`${baseUrl}/drug/label.json`);
    url.searchParams.set('search', 'openfda.brand_name:"aspirin"');
    url.searchParams.set('limit', '3');

    const response = await fetch(url.toString(), {
      headers: { 'User-Agent': 'THEMIS-Test/1.0' },
    });

    if (response.ok) {
      const data = await response.json() as OpenFDASearchResponse;
      if (data.results && data.results.length > 0) {
        console.log(`   ✅ Found ${data.meta?.results?.total || data.results.length} results`);
        const first = data.results[0];
        console.log(`   Brand: ${first.openfda?.brand_name?.[0] || 'N/A'}`);
        console.log(`   Generic: ${first.openfda?.generic_name?.[0] || 'N/A'}`);
        console.log(`   Manufacturer: ${first.openfda?.manufacturer_name?.[0] || 'N/A'}`);
        console.log(`   Type: ${first.openfda?.product_type?.[0] || 'N/A'}`);
      } else {
        console.log('   ⚠️ No results found');
      }
    } else {
      console.log(`   ❌ API error: ${response.status}`);
    }
  } catch (error) {
    console.log(`   ❌ Network error: ${error}`);
  }

  // Test 2: Search for Ibuprofen
  console.log('\n2. Search for "Ibuprofen"...');
  try {
    const url = new URL(`${baseUrl}/drug/label.json`);
    url.searchParams.set('search', 'openfda.generic_name:"ibuprofen"');
    url.searchParams.set('limit', '2');

    const response = await fetch(url.toString(), {
      headers: { 'User-Agent': 'THEMIS-Test/1.0' },
    });

    if (response.ok) {
      const data = await response.json() as OpenFDASearchResponse;
      if (data.results && data.results.length > 0) {
        console.log(`   ✅ Found ${data.meta?.results?.total || data.results.length} results`);
        for (const drug of data.results.slice(0, 2)) {
          console.log(`   - ${drug.openfda?.brand_name?.[0] || 'Unknown'} (${drug.openfda?.manufacturer_name?.[0] || 'Unknown mfr'})`);
        }
      }
    } else {
      console.log(`   ❌ API error: ${response.status}`);
    }
  } catch (error) {
    console.log(`   ❌ Network error: ${error}`);
  }
}

// ========================================
// Wikidata Test
// ========================================

interface WikidataSearchResult {
  id: string;
  label: string;
  description?: string;
}

interface WikidataSearchResponse {
  search?: WikidataSearchResult[];
}

async function testWikidata() {
  console.log('\n=== Testing Wikidata API ===\n');

  const apiUrl = 'https://www.wikidata.org/w/api.php';

  // Test 1: Search for Microsoft
  console.log('1. Search for "Microsoft"...');
  try {
    const url = new URL(apiUrl);
    url.searchParams.set('action', 'wbsearchentities');
    url.searchParams.set('search', 'Microsoft');
    url.searchParams.set('language', 'en');
    url.searchParams.set('format', 'json');
    url.searchParams.set('limit', '5');
    url.searchParams.set('origin', '*');

    const response = await fetch(url.toString(), {
      headers: { 'User-Agent': 'THEMIS-Test/1.0' },
    });

    if (response.ok) {
      const data = await response.json() as WikidataSearchResponse;
      if (data.search && data.search.length > 0) {
        console.log(`   ✅ Found ${data.search.length} results`);
        for (const entity of data.search.slice(0, 3)) {
          console.log(`   - ${entity.label} (${entity.id}): ${entity.description || 'No description'}`);
        }
      }
    } else {
      console.log(`   ❌ API error: ${response.status}`);
    }
  } catch (error) {
    console.log(`   ❌ Network error: ${error}`);
  }

  // Test 2: Search for Tesla
  console.log('\n2. Search for "Tesla"...');
  try {
    const url = new URL(apiUrl);
    url.searchParams.set('action', 'wbsearchentities');
    url.searchParams.set('search', 'Tesla');
    url.searchParams.set('language', 'en');
    url.searchParams.set('format', 'json');
    url.searchParams.set('limit', '5');
    url.searchParams.set('origin', '*');

    const response = await fetch(url.toString(), {
      headers: { 'User-Agent': 'THEMIS-Test/1.0' },
    });

    if (response.ok) {
      const data = await response.json() as WikidataSearchResponse;
      if (data.search && data.search.length > 0) {
        console.log(`   ✅ Found ${data.search.length} results`);
        for (const entity of data.search.slice(0, 3)) {
          console.log(`   - ${entity.label} (${entity.id}): ${entity.description || 'No description'}`);
        }
      }
    } else {
      console.log(`   ❌ API error: ${response.status}`);
    }
  } catch (error) {
    console.log(`   ❌ Network error: ${error}`);
  }

  // Test 3: Search for Nutella (product)
  console.log('\n3. Search for "Nutella"...');
  try {
    const url = new URL(apiUrl);
    url.searchParams.set('action', 'wbsearchentities');
    url.searchParams.set('search', 'Nutella');
    url.searchParams.set('language', 'en');
    url.searchParams.set('format', 'json');
    url.searchParams.set('limit', '3');
    url.searchParams.set('origin', '*');

    const response = await fetch(url.toString(), {
      headers: { 'User-Agent': 'THEMIS-Test/1.0' },
    });

    if (response.ok) {
      const data = await response.json() as WikidataSearchResponse;
      if (data.search && data.search.length > 0) {
        console.log(`   ✅ Found ${data.search.length} results`);
        for (const entity of data.search) {
          console.log(`   - ${entity.label} (${entity.id}): ${entity.description || 'No description'}`);
        }
      }
    } else {
      console.log(`   ❌ API error: ${response.status}`);
    }
  } catch (error) {
    console.log(`   ❌ Network error: ${error}`);
  }
}

// ========================================
// DBpedia Test
// ========================================

interface DBpediaLookupResult {
  resource: string[];
  label: string[];
  description?: string[];
  typeName?: string[];
  refCount?: string[];
}

interface DBpediaLookupResponse {
  docs?: DBpediaLookupResult[];
}

async function testDBpedia() {
  console.log('\n=== Testing DBpedia Lookup API ===\n');

  const lookupUrl = 'https://lookup.dbpedia.org/api/search';

  // Test 1: Search for SAP
  console.log('1. Search for "SAP"...');
  try {
    const url = new URL(lookupUrl);
    url.searchParams.set('query', 'SAP software');
    url.searchParams.set('format', 'json');
    url.searchParams.set('maxResults', '5');

    const response = await fetch(url.toString(), {
      headers: {
        'User-Agent': 'THEMIS-Test/1.0',
        'Accept': 'application/json',
      },
    });

    if (response.ok) {
      const data = await response.json() as DBpediaLookupResponse;
      if (data.docs && data.docs.length > 0) {
        console.log(`   ✅ Found ${data.docs.length} results`);
        for (const doc of data.docs.slice(0, 3)) {
          const label = doc.label?.[0] || 'Unknown';
          const desc = doc.description?.[0]?.substring(0, 80) || 'No description';
          const types = doc.typeName?.slice(0, 2).join(', ') || 'No types';
          console.log(`   - ${label}`);
          console.log(`     Type: ${types}`);
          console.log(`     Desc: ${desc}...`);
        }
      }
    } else {
      console.log(`   ❌ API error: ${response.status}`);
    }
  } catch (error) {
    console.log(`   ❌ Network error: ${error}`);
  }

  // Test 2: Search for Pfizer
  console.log('\n2. Search for "Pfizer"...');
  try {
    const url = new URL(lookupUrl);
    url.searchParams.set('query', 'Pfizer');
    url.searchParams.set('format', 'json');
    url.searchParams.set('maxResults', '3');

    const response = await fetch(url.toString(), {
      headers: {
        'User-Agent': 'THEMIS-Test/1.0',
        'Accept': 'application/json',
      },
    });

    if (response.ok) {
      const data = await response.json() as DBpediaLookupResponse;
      if (data.docs && data.docs.length > 0) {
        console.log(`   ✅ Found ${data.docs.length} results`);
        for (const doc of data.docs.slice(0, 2)) {
          const label = doc.label?.[0] || 'Unknown';
          const refCount = doc.refCount?.[0] || '0';
          console.log(`   - ${label} (refs: ${refCount})`);
        }
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
  console.log('  THEMIS Sprint 3 Sources Test');
  console.log('  (OpenFDA, Wikidata, DBpedia)');
  console.log('========================================');

  await testOpenFDA();
  await testWikidata();
  await testDBpedia();

  console.log('\n========================================');
  console.log('  All Sprint 3 tests completed!');
  console.log('========================================\n');
}

main().catch(console.error);
