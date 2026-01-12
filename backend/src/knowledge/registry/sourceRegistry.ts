/**
 * Source Registry
 *
 * Dynamic registry for enrichment sources that enables:
 * - Pluggable source registration by sector
 * - Priority-based source selection
 * - Rate limit and cache configuration per source
 */

import type {
  SectorCode,
  KnowledgeSourceType,
  EnrichmentResult,
  EnrichmentContext,
  EnrichmentSourceConfig,
  RateLimitConfig,
} from '../types';
import type { ExtractedItem } from '../ProductKnowledgeOrchestrator';

/**
 * Interface that all enrichment sources must implement
 */
export interface EnrichmentSource {
  /** Unique name identifying this source */
  name: KnowledgeSourceType;

  /** Sectors this source can enrich */
  supportedSectors: SectorCode[];

  /** Priority (lower = higher priority, executed first) */
  priority: number;

  /** Confidence weight when merging results */
  confidenceWeight: number;

  /** Rate limit configuration */
  rateLimit?: RateLimitConfig;

  /** Cache TTL in seconds */
  cacheTTLSeconds?: number;

  /** Check if source is enabled and ready */
  isEnabled(): boolean;

  /** Initialize the source (called once) */
  initialize?(): Promise<void>;

  /** Enrich an item */
  enrich(item: ExtractedItem, context: EnrichmentContext): Promise<EnrichmentResult>;
}

interface SourceRegistration {
  source: EnrichmentSource;
  config: EnrichmentSourceConfig;
  initialized: boolean;
}

/**
 * Registry for managing enrichment sources
 */
export class SourceRegistry {
  private sources: Map<KnowledgeSourceType, SourceRegistration> = new Map();
  private sectorIndex: Map<SectorCode, KnowledgeSourceType[]> = new Map();
  private universalSources: KnowledgeSourceType[] = [];

  constructor() {
    // Initialize sector index
    const sectors: SectorCode[] = [
      'it_software',
      'food_beverage',
      'consumer_goods',
      'healthcare_pharma',
      'industrial',
      'financial_services',
      'professional_services',
      'automotive',
      'unknown',
    ];

    for (const sector of sectors) {
      this.sectorIndex.set(sector, []);
    }
  }

  /**
   * Register an enrichment source
   */
  register(source: EnrichmentSource): void {
    const config: EnrichmentSourceConfig = {
      name: source.name,
      supportedSectors: source.supportedSectors,
      priority: source.priority,
      confidenceWeight: source.confidenceWeight,
      rateLimit: source.rateLimit,
      cacheTTLSeconds: source.cacheTTLSeconds,
    };

    this.sources.set(source.name, {
      source,
      config,
      initialized: false,
    });

    // Add to sector index
    if (source.supportedSectors.includes('unknown')) {
      // Universal source - add to universal list
      this.universalSources.push(source.name);
    } else {
      // Sector-specific source
      for (const sector of source.supportedSectors) {
        const sectorSources = this.sectorIndex.get(sector) || [];
        sectorSources.push(source.name);
        this.sectorIndex.set(sector, sectorSources);
      }
    }

    console.log(`📦 Registered source: ${source.name} (sectors: ${source.supportedSectors.join(', ')})`);
  }

  /**
   * Unregister a source
   */
  unregister(name: KnowledgeSourceType): boolean {
    const registration = this.sources.get(name);
    if (!registration) return false;

    // Remove from sources
    this.sources.delete(name);

    // Remove from sector index
    for (const [sector, sources] of this.sectorIndex.entries()) {
      this.sectorIndex.set(
        sector,
        sources.filter(s => s !== name)
      );
    }

    // Remove from universal sources
    this.universalSources = this.universalSources.filter(s => s !== name);

    return true;
  }

  /**
   * Get all sources applicable for a sector, sorted by priority
   */
  getSourcesForSector(sector: SectorCode): EnrichmentSource[] {
    const sectorSourceNames = this.sectorIndex.get(sector) || [];
    const allSourceNames = [...sectorSourceNames, ...this.universalSources];

    // Get unique source registrations
    const registrations: SourceRegistration[] = [];
    const seen = new Set<KnowledgeSourceType>();

    for (const name of allSourceNames) {
      if (seen.has(name)) continue;
      seen.add(name);

      const reg = this.sources.get(name);
      if (reg && reg.source.isEnabled()) {
        registrations.push(reg);
      }
    }

    // Sort by priority (lower = higher priority)
    registrations.sort((a, b) => a.config.priority - b.config.priority);

    return registrations.map(r => r.source);
  }

  /**
   * Get universal sources (fallbacks that work for all sectors)
   */
  getUniversalSources(): EnrichmentSource[] {
    return this.universalSources
      .map(name => this.sources.get(name))
      .filter((reg): reg is SourceRegistration => !!reg && reg.source.isEnabled())
      .sort((a, b) => a.config.priority - b.config.priority)
      .map(reg => reg.source);
  }

  /**
   * Get a specific source by name
   */
  getSource(name: KnowledgeSourceType): EnrichmentSource | undefined {
    return this.sources.get(name)?.source;
  }

  /**
   * Get source configuration
   */
  getSourceConfig(name: KnowledgeSourceType): EnrichmentSourceConfig | undefined {
    return this.sources.get(name)?.config;
  }

  /**
   * Initialize all registered sources
   */
  async initializeAll(): Promise<void> {
    const initPromises: Promise<void>[] = [];

    for (const [name, registration] of this.sources.entries()) {
      if (!registration.initialized && registration.source.initialize) {
        initPromises.push(
          registration.source
            .initialize()
            .then(() => {
              registration.initialized = true;
              console.log(`✅ Initialized source: ${name}`);
            })
            .catch(err => {
              console.error(`❌ Failed to initialize source ${name}:`, err);
            })
        );
      }
    }

    await Promise.all(initPromises);
  }

  /**
   * Initialize a specific source
   */
  async initializeSource(name: KnowledgeSourceType): Promise<boolean> {
    const registration = this.sources.get(name);
    if (!registration) return false;

    if (registration.initialized) return true;

    if (registration.source.initialize) {
      try {
        await registration.source.initialize();
        registration.initialized = true;
        return true;
      } catch (error) {
        console.error(`Failed to initialize source ${name}:`, error);
        return false;
      }
    }

    registration.initialized = true;
    return true;
  }

  /**
   * Get all registered source names
   */
  getAllSourceNames(): KnowledgeSourceType[] {
    return Array.from(this.sources.keys());
  }

  /**
   * Get registry statistics
   */
  getStats(): {
    totalSources: number;
    enabledSources: number;
    sourcesBySector: Record<string, number>;
    universalSources: number;
  } {
    const enabledCount = Array.from(this.sources.values()).filter(r =>
      r.source.isEnabled()
    ).length;

    const sourcesBySector: Record<string, number> = {};
    for (const [sector, sources] of this.sectorIndex.entries()) {
      sourcesBySector[sector] = sources.filter(name => {
        const reg = this.sources.get(name);
        return reg && reg.source.isEnabled();
      }).length;
    }

    return {
      totalSources: this.sources.size,
      enabledSources: enabledCount,
      sourcesBySector,
      universalSources: this.universalSources.filter(name => {
        const reg = this.sources.get(name);
        return reg && reg.source.isEnabled();
      }).length,
    };
  }
}

// Singleton instance
let registryInstance: SourceRegistry | null = null;

export function getSourceRegistry(): SourceRegistry {
  if (!registryInstance) {
    registryInstance = new SourceRegistry();
  }
  return registryInstance;
}

export default SourceRegistry;
