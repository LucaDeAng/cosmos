/**
 * Pinecone Configuration
 * Initialize Pinecone client for vector storage
 */

import { Pinecone } from '@pinecone-database/pinecone';

const apiKey = process.env.PINECONE_API_KEY;

if (!apiKey) {
  console.warn('⚠️  PINECONE_API_KEY not set - vector persistence disabled');
}

// Create Pinecone client (lazy initialization)
let pineconeClient: Pinecone | null = null;

export function getPinecone(): Pinecone | null {
  if (!apiKey) {
    return null;
  }

  if (!pineconeClient) {
    pineconeClient = new Pinecone({
      apiKey
    });
  }

  return pineconeClient;
}

// Index names
export const PINECONE_INDICES = {
  COMPANY_HISTORY: process.env.PINECONE_INDEX_NAME || 'themis-company-history',
  PRODUCT_CATALOG: 'themis-product-catalog'
} as const;

// Namespace prefix for company-specific vectors
export const COMPANY_NAMESPACE_PREFIX = 'company_';

/**
 * Get namespace for a specific company
 */
export function getCompanyNamespace(companyId: string): string {
  return `${COMPANY_NAMESPACE_PREFIX}${companyId}`;
}

export default getPinecone;
