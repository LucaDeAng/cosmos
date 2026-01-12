/**
 * External Knowledge Routes
 *
 * API endpoints for managing external knowledge from cloud providers.
 * Provides admin controls for cache refresh, statistics, and search.
 */

import { Router, Request, Response } from 'express';
import {
  getExternalKnowledge,
  refreshExternalKnowledge,
  searchExternalKnowledge,
  getExternalKnowledgeStats,
  clearCache,
  getCacheStats,
} from '../services/external-knowledge';

const router = Router();

/**
 * GET /api/external-knowledge/stats
 * Get external knowledge cache statistics
 *
 * Response:
 * - cached: boolean - whether cache exists
 * - itemCount: number - total items in cache
 * - sourceCounts: { aws, azure, gcp } - counts by source
 * - lastFetched: Date | null
 * - cacheExpires: Date | null
 */
router.get('/stats', async (_req: Request, res: Response) => {
  console.log('\n GET /api/external-knowledge/stats');

  try {
    const stats = await getExternalKnowledgeStats();

    res.json({
      success: true,
      ...stats,
    });

  } catch (error) {
    console.error('   Error fetching external knowledge stats:', error);
    res.status(500).json({
      error: 'Errore nel recupero delle statistiche',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/external-knowledge/items
 * Get all cached external knowledge items
 *
 * Query params:
 * - source: Filter by source (aws, azure, gcp)
 * - category: Filter by category
 * - limit: Max items to return (default 100)
 *
 * Response:
 * - items: Array of ExternalKnowledgeItem
 * - count: number
 * - fromCache: boolean
 */
router.get('/items', async (req: Request, res: Response) => {
  console.log('\n GET /api/external-knowledge/items');

  try {
    const { source, category, limit = '100' } = req.query;

    // Get items (from cache or fresh fetch)
    let items = await getExternalKnowledge();

    // Filter by source if specified
    if (source && typeof source === 'string') {
      items = items.filter(item => item.source === source);
    }

    // Filter by category if specified
    if (category && typeof category === 'string') {
      items = items.filter(item =>
        item.category.toLowerCase().includes(category.toLowerCase())
      );
    }

    // Apply limit
    const maxItems = parseInt(limit as string) || 100;
    items = items.slice(0, maxItems);

    res.json({
      success: true,
      items,
      count: items.length,
      fromCache: true, // getExternalKnowledge uses cache by default
    });

  } catch (error) {
    console.error('   Error fetching external knowledge items:', error);
    res.status(500).json({
      error: 'Errore nel recupero degli item',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/external-knowledge/search
 * Search external knowledge by query
 *
 * Query params:
 * - q: Search query (required)
 * - source: Filter by source
 * - category: Filter by category
 * - limit: Max results (default 20)
 *
 * Response:
 * - results: Array of matching items
 * - count: number
 * - query: string
 */
router.get('/search', async (req: Request, res: Response) => {
  console.log('\n GET /api/external-knowledge/search');

  try {
    const { q, source, category, limit = '20' } = req.query;

    if (!q || typeof q !== 'string') {
      return res.status(400).json({
        error: 'Query parameter "q" is required',
      });
    }

    // Get items from cache
    const allItems = await getExternalKnowledge();

    // Search with filters
    const results = searchExternalKnowledge(allItems, q, {
      source: source as string | undefined,
      category: category as string | undefined,
      limit: parseInt(limit as string) || 20,
    });

    res.json({
      success: true,
      results,
      count: results.length,
      query: q,
    });

  } catch (error) {
    console.error('   Error searching external knowledge:', error);
    res.status(500).json({
      error: 'Errore nella ricerca',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/external-knowledge/refresh
 * Force refresh external knowledge from all sources
 * Admin endpoint - triggers fresh fetch from AWS, Azure, GCP
 *
 * Body params (optional):
 * - enableAWS: boolean (default true)
 * - enableAzure: boolean (default true)
 * - enableGCP: boolean (default true)
 * - maxItemsPerSource: number (default 100)
 *
 * Response:
 * - itemCount: number - total items fetched
 * - sourceCounts: { aws, azure, gcp }
 * - duration_ms: number
 */
router.post('/refresh', async (req: Request, res: Response) => {
  console.log('\n POST /api/external-knowledge/refresh');

  try {
    const {
      enableAWS = true,
      enableAzure = true,
      enableGCP = true,
      maxItemsPerSource = 100,
    } = req.body || {};

    const startTime = Date.now();

    // Force refresh
    const items = await refreshExternalKnowledge({
      force: true,
      enableAWS,
      enableAzure,
      enableGCP,
      maxItemsPerSource,
    });

    const duration_ms = Date.now() - startTime;

    // Count by source
    const sourceCounts: Record<string, number> = {};
    for (const item of items) {
      sourceCounts[item.source] = (sourceCounts[item.source] || 0) + 1;
    }

    res.json({
      success: true,
      message: `Refresh completato: ${items.length} items fetched`,
      itemCount: items.length,
      sourceCounts,
      duration_ms,
    });

  } catch (error) {
    console.error('   Error refreshing external knowledge:', error);
    res.status(500).json({
      error: 'Errore durante il refresh',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * DELETE /api/external-knowledge/cache
 * Clear the external knowledge cache
 * Admin endpoint - forces next request to fetch fresh data
 *
 * Response:
 * - success: boolean
 * - message: string
 */
router.delete('/cache', async (_req: Request, res: Response) => {
  console.log('\n DELETE /api/external-knowledge/cache');

  try {
    await clearCache();

    res.json({
      success: true,
      message: 'Cache svuotata con successo',
    });

  } catch (error) {
    console.error('   Error clearing cache:', error);
    res.status(500).json({
      error: 'Errore nella pulizia della cache',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/external-knowledge/cache/stats
 * Get detailed cache statistics
 *
 * Response:
 * - hasCache: boolean
 * - itemCount: number
 * - sourceCounts: Record<string, number>
 * - fetchedAt: Date | null
 * - expiresAt: Date | null
 * - isExpired: boolean
 */
router.get('/cache/stats', async (_req: Request, res: Response) => {
  console.log('\n GET /api/external-knowledge/cache/stats');

  try {
    const stats = await getCacheStats();

    res.json({
      success: true,
      ...stats,
      isExpired: stats.expiresAt ? new Date(stats.expiresAt) < new Date() : true,
    });

  } catch (error) {
    console.error('   Error fetching cache stats:', error);
    res.status(500).json({
      error: 'Errore nel recupero delle statistiche cache',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/external-knowledge/health
 * Health check for external knowledge service
 */
router.get('/health', async (_req: Request, res: Response) => {
  console.log('\n GET /api/external-knowledge/health');

  try {
    const stats = await getCacheStats();

    let status: 'healthy' | 'stale' | 'empty' = 'empty';
    let message = 'Nessun dato in cache';

    if (stats.hasCache) {
      const isExpired = stats.expiresAt ? new Date(stats.expiresAt) < new Date() : true;
      if (isExpired) {
        status = 'stale';
        message = `Cache scaduta (${stats.itemCount} items)`;
      } else {
        status = 'healthy';
        message = `Cache attiva con ${stats.itemCount} items`;
      }
    }

    res.json({
      success: true,
      status,
      message,
      itemCount: stats.itemCount,
      sourceCounts: stats.sourceCounts,
      lastFetched: stats.fetchedAt,
      expiresAt: stats.expiresAt,
    });

  } catch (error) {
    console.error('   Error checking health:', error);
    res.status(500).json({
      error: 'Errore nel controllo dello stato',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
