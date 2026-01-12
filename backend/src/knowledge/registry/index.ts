/**
 * Source Registry Module
 *
 * Exports registry and configuration utilities for enrichment sources.
 */

export {
  SourceRegistry,
  getSourceRegistry,
  type EnrichmentSource,
} from './sourceRegistry';

export {
  SOURCE_CONFIGS,
  getSourceConfig,
  getSourcesForSector,
  getSectorSpecificSources,
  getUniversalFallbackSources,
} from './sourceConfig';
