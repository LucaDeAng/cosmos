/**
 * Standalone test for UNSPSC taxonomy source
 * Run with: npx tsx test-unspsc-standalone.ts
 */

import * as fs from 'fs';
import * as path from 'path';

// ========================================
// Types
// ========================================

interface UNSPSCEntry {
  segment: { code: string; name: string };
  family: { code: string; name: string };
  class: { code: string; name: string };
  commodity: { code: string; name: string };
  keywords: string[];
}

interface UNSPSCTaxonomyFile {
  version: string;
  source: string;
  last_updated: string;
  entries: UNSPSCEntry[];
}

interface UNSPSCCategory {
  segment_code: string;
  segment_name: string;
  family_code: string;
  family_name: string;
  class_code: string;
  class_name: string;
  commodity_code: string;
  commodity_name: string;
  full_path: string;
}

// ========================================
// UNSPSC Classifier (standalone)
// ========================================

class UNSPSCClassifier {
  private taxonomy: Map<string, UNSPSCEntry> = new Map();
  private keywordIndex: Map<string, Set<string>> = new Map();

  async initialize(): Promise<void> {
    const taxonomyPath = path.join(__dirname, 'src/data/taxonomies/unspsc_taxonomy.json');

    if (!fs.existsSync(taxonomyPath)) {
      console.error('UNSPSC taxonomy file not found:', taxonomyPath);
      return;
    }

    const taxonomyData: UNSPSCTaxonomyFile = JSON.parse(
      fs.readFileSync(taxonomyPath, 'utf-8')
    );

    for (const entry of taxonomyData.entries || []) {
      const id = entry.commodity.code;
      this.taxonomy.set(id, entry);

      // Build keyword index
      for (const keyword of entry.keywords) {
        const lowerKeyword = keyword.toLowerCase();
        if (!this.keywordIndex.has(lowerKeyword)) {
          this.keywordIndex.set(lowerKeyword, new Set());
        }
        this.keywordIndex.get(lowerKeyword)!.add(id);
      }

      // Also index the names
      const nameParts = [
        entry.commodity.name,
        entry.class.name,
        entry.family.name,
        entry.segment.name
      ].join(' ').toLowerCase().split(/\s+/);

      for (const part of nameParts) {
        if (part.length >= 3) {
          if (!this.keywordIndex.has(part)) {
            this.keywordIndex.set(part, new Set());
          }
          this.keywordIndex.get(part)!.add(id);
        }
      }
    }

    console.log(`Loaded ${this.taxonomy.size} UNSPSC categories`);
    console.log(`Indexed ${this.keywordIndex.size} keywords`);
  }

  classify(name: string, description?: string): { category: UNSPSCCategory | null; confidence: number } {
    const searchText = [name, description].filter(Boolean).join(' ').toLowerCase();
    const tokens = searchText.split(/[\s,.\-_/]+/).filter(t => t.length >= 3);

    const scores = new Map<string, number>();

    for (const token of tokens) {
      // Exact match
      if (this.keywordIndex.has(token)) {
        for (const id of this.keywordIndex.get(token)!) {
          scores.set(id, (scores.get(id) || 0) + 2);
        }
      }

      // Partial match
      for (const [keyword, ids] of this.keywordIndex.entries()) {
        if (keyword.startsWith(token) || token.startsWith(keyword)) {
          for (const id of ids) {
            scores.set(id, (scores.get(id) || 0) + 1);
          }
        }
      }
    }

    if (scores.size === 0) {
      return { category: null, confidence: 0 };
    }

    // Find best match
    let bestId = '';
    let bestScore = 0;
    for (const [id, score] of scores.entries()) {
      if (score > bestScore) {
        bestScore = score;
        bestId = id;
      }
    }

    const entry = this.taxonomy.get(bestId);
    if (!entry) {
      return { category: null, confidence: 0 };
    }

    const maxPossibleScore = tokens.length * 2;
    const confidence = Math.min(0.5 + (bestScore / maxPossibleScore) * 0.4, 0.9);

    const fullPath = `${entry.segment.name} > ${entry.family.name} > ${entry.class.name} > ${entry.commodity.name}`;

    return {
      category: {
        segment_code: entry.segment.code,
        segment_name: entry.segment.name,
        family_code: entry.family.code,
        family_name: entry.family.name,
        class_code: entry.class.code,
        class_name: entry.class.name,
        commodity_code: entry.commodity.code,
        commodity_name: entry.commodity.name,
        full_path: fullPath
      },
      confidence
    };
  }

  getStats() {
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
      keywords: this.keywordIndex.size
    };
  }
}

// ========================================
// Main Test
// ========================================

async function main() {
  console.log('========================================');
  console.log('  THEMIS UNSPSC Taxonomy Test');
  console.log('========================================\n');

  const classifier = new UNSPSCClassifier();
  await classifier.initialize();

  // Print stats
  console.log('\n=== Taxonomy Statistics ===\n');
  const stats = classifier.getStats();
  console.log(`Total Categories: ${stats.totalCategories}`);
  console.log(`Segments: ${stats.segments}`);
  console.log(`Families: ${stats.families}`);
  console.log(`Classes: ${stats.classes}`);
  console.log(`Keywords indexed: ${stats.keywords}`);

  // Test classifications
  console.log('\n=== Testing Classifications ===\n');
  const testItems = [
    { name: 'CNC Milling Machine', description: 'Industrial metal machining center' },
    { name: 'Forklift', description: 'Electric warehouse forklift' },
    { name: 'Ball Bearings SKF', description: 'Industrial rolling bearings' },
    { name: 'Cisco Router 4000', description: 'Enterprise network router' },
    { name: 'Solar Panel 400W', description: 'Photovoltaic module for power generation' },
    { name: 'Industrial Robot ABB', description: 'Articulated arm for manufacturing' },
    { name: 'Air Compressor', description: 'Compressed air system for factory' },
    { name: 'Fire Alarm System', description: 'Commercial fire detection' },
    { name: 'Bulldozer CAT', description: 'Heavy construction equipment' },
    { name: 'PLC Siemens S7', description: 'Programmable logic controller for automation' },
    { name: 'Servo Motor', description: 'Precision electric motor for CNC' },
    { name: 'Strategy Consulting', description: 'Management advisory services' },
  ];

  for (const item of testItems) {
    const result = classifier.classify(item.name, item.description);

    if (result.category) {
      console.log(`"${item.name}"`);
      console.log(`   UNSPSC: ${result.category.commodity_code}`);
      console.log(`   Path: ${result.category.full_path}`);
      console.log(`   Confidence: ${(result.confidence * 100).toFixed(0)}%`);
      console.log('');
    } else {
      console.log(`"${item.name}" => No match found\n`);
    }
  }

  console.log('========================================');
  console.log('  Test completed!');
  console.log('========================================\n');
}

main().catch(console.error);
