/**
 * Knowledge Sources - Index
 *
 * Export all knowledge source implementations.
 */

export {
  CompanyCatalogSource,
  getCompanyCatalogSource
} from './companyCatalogSource';

export {
  IcecatMCPSource,
  getIcecatMCPSource
} from './icecatMCPSource';

export {
  GS1TaxonomySource,
  getGS1TaxonomySource
} from './gs1TaxonomySource';

export {
  CompanyHistorySource,
  getCompanyHistorySource
} from './companyHistorySource';

export {
  PineconeCompanyHistorySource,
  getPineconeCompanyHistorySource
} from './pineconeCompanyHistorySource';

export {
  LLMEnrichmentSource,
  getLLMEnrichmentSource
} from './llmEnrichmentSource';

// Multi-sector sources
export {
  OpenFoodFactsSource,
  getOpenFoodFactsSource
} from './openFoodFactsSource';

export {
  OpenBeautyFactsSource,
  getOpenBeautyFactsSource
} from './openBeautyFactsSource';

// Taxonomy sources (local)
export {
  UNSPSCSource,
  getUNSPSCSource,
  type UNSPSCCategory,
  type UNSPSCEntry
} from './unspscSource';

// Healthcare/Pharma sources
export {
  OpenFDASource,
  getOpenFDASource,
  type OpenFDADrugLabel,
  type OpenFDADevice510k
} from './openFdaSource';

// Cross-sector taxonomy sources
export {
  GoogleTaxonomySource,
  getGoogleTaxonomySource,
  type GoogleCategory
} from './googleTaxonomySource';

export {
  SchemaOrgSource,
  getSchemaOrgSource,
  type SchemaType
} from './schemaOrgSource';

// Universal fallback sources
export {
  WikidataSource,
  getWikidataSource
} from './wikidataSource';

export {
  DBpediaSource,
  getDBpediaSource
} from './dbpediaSource';

// Italian/EU classification sources
export {
  ATECOSource,
  getATECOSource,
  type ATECOCode
} from './atecoSource';

export {
  PRODCOMSource,
  getPRODCOMSource,
  type PRODCOMCode
} from './prodcomSource';

export {
  CPVSource,
  getCPVSource,
  type CPVCode
} from './cpvSource';

// Sector-specific sources
export {
  NHTSASource,
  getNHTSASource
} from './nhtsaSource';

export {
  GLEIFSource,
  getGLEIFSource
} from './gleifSource';
