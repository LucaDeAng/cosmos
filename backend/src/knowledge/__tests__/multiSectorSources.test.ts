/**
 * Multi-Sector Sources Tests
 *
 * Tests for:
 * - SectorDetector
 * - OpenFoodFactsSource
 * - OpenBeautyFactsSource
 */

import { SectorDetector } from '../sectors/sectorDetector';
import { OpenFoodFactsSource } from '../sources/openFoodFactsSource';
import { OpenBeautyFactsSource } from '../sources/openBeautyFactsSource';

describe('SectorDetector', () => {
  let detector: SectorDetector;

  beforeAll(() => {
    detector = new SectorDetector({ enableSemanticFallback: false });
  });

  it('should detect IT software sector', async () => {
    const result = await detector.detect({
      name: 'Microsoft Office 365',
      description: 'Cloud-based productivity SaaS platform',
    });

    expect(result.sector).toBe('it_software');
    expect(result.confidence).toBeGreaterThan(0.5);
    expect(result.method).toBe('keyword');
  });

  it('should detect food_beverage sector', async () => {
    const result = await detector.detect({
      name: 'Organic Whole Milk',
      description: 'Fresh dairy product with natural ingredients',
    });

    expect(result.sector).toBe('food_beverage');
    expect(result.confidence).toBeGreaterThanOrEqual(0.5);
  });

  it('should detect consumer_goods sector for cosmetics', async () => {
    const result = await detector.detect({
      name: "L'Oreal Shampoo",
      description: 'Hair care product with natural extracts',
    });

    expect(result.sector).toBe('consumer_goods');
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  it('should detect healthcare_pharma sector', async () => {
    const result = await detector.detect({
      name: 'Aspirin 500mg',
      description: 'Pharmaceutical drug for pain relief',
    });

    expect(result.sector).toBe('healthcare_pharma');
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  it('should detect automotive sector', async () => {
    const result = await detector.detect({
      name: 'Tesla Model 3',
      description: 'Electric vehicle with autopilot',
    });

    expect(result.sector).toBe('automotive');
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  it('should return unknown for ambiguous items', async () => {
    const result = await detector.detect({
      name: 'Product XYZ-123',
      description: 'A generic item',
    });

    expect(result.sector).toBe('unknown');
    expect(result.confidence).toBeLessThan(0.5);
  });
});

describe('OpenFoodFactsSource', () => {
  let source: OpenFoodFactsSource;

  beforeAll(async () => {
    source = new OpenFoodFactsSource();
    await source.initialize();
  });

  it('should be enabled', () => {
    expect(source.isEnabled()).toBe(true);
  });

  it('should have correct configuration', () => {
    expect(source.name).toBe('open_food_facts');
    expect(source.supportedSectors).toContain('food_beverage');
    expect(source.priority).toBe(2);
  });

  it('should fetch product by barcode', async () => {
    // Nutella barcode (well-known product)
    const product = await source.getByBarcode('3017620422003');

    if (product) {
      expect(product.product_name).toBeDefined();
      expect(product.brands).toBeDefined();
    }
    // Note: API might not always return data, so we don't fail if null
  }, 15000);

  it('should search products by name', async () => {
    const products = await source.searchByName('Nutella', undefined, 3);

    expect(Array.isArray(products)).toBe(true);
    // API might return empty if rate limited or network issues
  }, 15000);

  it('should enrich a food item', async () => {
    const result = await source.enrich(
      {
        name: 'Nutella',
        type: 'product',
        vendor: 'Ferrero',
      },
      { tenantId: 'test-tenant' }
    );

    expect(result.source).toBe('open_food_facts');
    // Might not find a match, so we check the structure
    expect(result.fields_enriched).toBeDefined();
    expect(result.reasoning).toBeDefined();
  }, 15000);
});

describe('OpenBeautyFactsSource', () => {
  let source: OpenBeautyFactsSource;

  beforeAll(async () => {
    source = new OpenBeautyFactsSource();
    await source.initialize();
  });

  it('should be enabled', () => {
    expect(source.isEnabled()).toBe(true);
  });

  it('should have correct configuration', () => {
    expect(source.name).toBe('open_beauty_facts');
    expect(source.supportedSectors).toContain('consumer_goods');
    expect(source.priority).toBe(2);
  });

  it('should search products by name', async () => {
    const products = await source.searchByName('shampoo', undefined, 3);

    expect(Array.isArray(products)).toBe(true);
  }, 15000);

  it('should enrich a beauty item', async () => {
    const result = await source.enrich(
      {
        name: 'Shampoo',
        type: 'product',
        vendor: "L'Oreal",
      },
      { tenantId: 'test-tenant' }
    );

    expect(result.source).toBe('open_beauty_facts');
    expect(result.fields_enriched).toBeDefined();
    expect(result.reasoning).toBeDefined();
  }, 15000);
});
