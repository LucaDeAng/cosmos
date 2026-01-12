/**
 * Enhanced Ingestion Routes
 *
 * API endpoints for advanced data ingestion features:
 * - Enhanced ingestion with all features
 * - Batch learning from corrections
 * - Confidence metrics and dashboard
 * - Pre-processing analysis
 */

import { Router, Request, Response } from 'express';
import multer from 'multer';
import * as path from 'path';
import * as fs from 'fs';
import { normalizeTenantId } from '../utils/tenant';
import {
  ingestDataEnhanced,
  processBatchLearning,
  type EnhancedIngestionInput,
} from '../agents/subagents/enhancedIngestionOrchestrator';
import { preprocessDocuments } from '../services/ingestion/documentPreProcessor';
import { ConfidenceMetricsService } from '../services/confidenceMetricsService';
import { accelerateIngestion, type AcceleratorOptions } from '../agents/subagents/ingestion';

const router = Router();

// Multer configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../../uploads/enhanced');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max
  fileFilter: (req, file, cb) => {
    const allowedMimes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'text/csv',
      'application/json',
      'application/pdf',
      'image/png',
      'image/jpeg',
    ];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Unsupported file type'));
    }
  },
});

// ============================================================================
// ROUTES
// ============================================================================

/**
 * POST /api/ingestion/enhanced
 * Enhanced ingestion with all advanced features
 */
router.post('/enhanced', upload.array('files', 10), async (req: Request, res: Response) => {
  console.log('🚀 POST /api/ingestion/enhanced');

  try {
    const { tenantId, userContext, language = 'it', options } = req.body;

    if (!tenantId) {
      return res.status(400).json({ error: 'tenantId is required' });
    }

    const safeTenantId = normalizeTenantId(tenantId);
    const files = req.files as Express.Multer.File[];

    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'At least one file is required' });
    }

    // Convert files to FileInput format
    const fileInputs = await Promise.all(
      files.map(async (file) => ({
        id: file.filename,
        buffer: fs.readFileSync(file.path),
        fileName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
      }))
    );

    // Parse options
    let parsedOptions = {};
    if (options) {
      parsedOptions = typeof options === 'string' ? JSON.parse(options) : options;
    }

    const input: EnhancedIngestionInput = {
      files: fileInputs,
      tenantId: safeTenantId,
      userContext,
      language,
      options: parsedOptions,
      enablePreProcessing: true,
      enableCrossItemValidation: true,
      enableConfidenceTracking: true,
    };

    // Execute enhanced ingestion
    const result = await ingestDataEnhanced(input);

    // Cleanup uploaded files
    files.forEach((file) => {
      try {
        fs.unlinkSync(file.path);
      } catch (err) {
        console.error('Error deleting file:', err);
      }
    });

    res.json({
      success: result.success,
      data: {
        requestId: result.requestId,
        summary: result.summary,
        parsing: result.parsing,
        normalization: {
          itemCount: result.normalization.items.length,
          stats: result.normalization.stats,
        },
        preProcessing: result.preProcessing
          ? {
              documentsAnalyzed: result.preProcessing.summary.totalDocuments,
              documentsWithTables: result.preProcessing.summary.documentsWithTables,
              documentsWithClearStructure: result.preProcessing.summary.documentsWithClearStructure,
            }
          : undefined,
        crossItemValidation: result.crossItemValidation,
        confidenceMetrics: result.confidenceMetrics,
      },
      errors: result.errors,
      warnings: result.warnings,
    });
  } catch (error: any) {
    console.error('❌ Enhanced ingestion error:', error);
    res.status(500).json({
      error: 'Enhanced ingestion failed',
      message: error.message,
    });
  }
});

/**
 * POST /api/ingestion/accelerated
 * High-performance ingestion with parallel processing, caching, and smart deduplication
 */
router.post('/accelerated', upload.array('files', 10), async (req: Request, res: Response) => {
  console.log('⚡ POST /api/ingestion/accelerated');

  try {
    const { tenantId, userContext, options } = req.body;

    if (!tenantId) {
      return res.status(400).json({ error: 'tenantId is required' });
    }

    const safeTenantId = normalizeTenantId(tenantId);
    const files = req.files as Express.Multer.File[];

    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'At least one file is required' });
    }

    // Parse accelerator options
    let acceleratorOptions: AcceleratorOptions = {
      enableParallelProcessing: true,
      enableCaching: true,
      enableBatching: true,
      enableSmartDedup: true,
    };
    if (options) {
      const parsedOptions = typeof options === 'string' ? JSON.parse(options) : options;
      acceleratorOptions = { ...acceleratorOptions, ...parsedOptions };
    }

    // Process all files with accelerator
    const results = [];
    let totalItems = 0;
    let totalProcessingTime = 0;
    let totalSpeedup = 0;

    for (const file of files) {
      const buffer = fs.readFileSync(file.path);
      const contentType = file.mimetype.includes('pdf') ? 'pdf' :
                          file.mimetype.includes('csv') ? 'csv' :
                          file.mimetype.includes('excel') || file.mimetype.includes('spreadsheet') ? 'excel' : 'text';

      const result = await accelerateIngestion({
        tenantId: safeTenantId,
        content: buffer.toString('utf-8'),
        contentType,
        fileName: file.originalname,
        options: acceleratorOptions,
      });

      results.push({
        fileName: file.originalname,
        itemsExtracted: result.items.length,
        metrics: result.metrics,
        cacheStats: result.cacheStats,
        dedupStats: result.dedupStats,
      });

      totalItems += result.items.length;
      totalProcessingTime += result.metrics.totalProcessingTime;
      totalSpeedup += result.metrics.parallelSpeedup;
    }

    // Cleanup uploaded files
    files.forEach((file) => {
      try {
        fs.unlinkSync(file.path);
      } catch (err) {
        console.error('Error deleting file:', err);
      }
    });

    const avgSpeedup = files.length > 0 ? totalSpeedup / files.length : 0;

    res.json({
      success: true,
      data: {
        totalFiles: files.length,
        totalItemsExtracted: totalItems,
        totalProcessingTime: `${totalProcessingTime}ms`,
        averageSpeedup: `${avgSpeedup.toFixed(2)}x`,
        fileResults: results,
      },
      performance: {
        estimatedSequentialTime: `${Math.round(totalProcessingTime * avgSpeedup)}ms`,
        actualTime: `${totalProcessingTime}ms`,
        timeSaved: `${Math.round(totalProcessingTime * (avgSpeedup - 1))}ms`,
      },
    });
  } catch (error: unknown) {
    console.error('❌ Accelerated ingestion error:', error);
    res.status(500).json({
      error: 'Accelerated ingestion failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/ingestion/preprocess
 * Pre-process documents without extraction
 */
router.post('/preprocess', upload.array('files', 10), async (req: Request, res: Response) => {
  console.log('📋 POST /api/ingestion/preprocess');

  try {
    const { tenantId } = req.body;

    if (!tenantId) {
      return res.status(400).json({ error: 'tenantId is required' });
    }

    const files = req.files as Express.Multer.File[];

    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'At least one file is required' });
    }

    const documents = files.map((file) => ({
      id: file.filename,
      filename: file.originalname,
      buffer: fs.readFileSync(file.path),
    }));

    const result = await preprocessDocuments({
      documents,
      tenantId: normalizeTenantId(tenantId),
    });

    // Cleanup
    files.forEach((file) => {
      try {
        fs.unlinkSync(file.path);
      } catch (err) {
        console.error('Error deleting file:', err);
      }
    });

    res.json({
      success: true,
      data: {
        results: result.results.map((r) => ({
          documentId: r.documentId,
          filename: r.filename,
          layout: r.layout,
          sectionCount: r.sections.length,
          extractionPlan: r.extractionPlan,
        })),
        relationships: result.relationships,
        summary: result.summary,
      },
    });
  } catch (error: any) {
    console.error('❌ Pre-processing error:', error);
    res.status(500).json({
      error: 'Pre-processing failed',
      message: error.message,
    });
  }
});

/**
 * POST /api/ingestion/batch-learning
 * Process batch learning from corrections
 */
router.post('/batch-learning', async (req: Request, res: Response) => {
  console.log('📚 POST /api/ingestion/batch-learning');

  try {
    const { tenantId, batchId, originalItems, correctedItems } = req.body;

    if (!tenantId || !batchId || !originalItems || !correctedItems) {
      return res.status(400).json({
        error: 'tenantId, batchId, originalItems, and correctedItems are required',
      });
    }

    await processBatchLearning(
      normalizeTenantId(tenantId),
      batchId,
      originalItems,
      correctedItems
    );

    res.json({
      success: true,
      message: 'Batch learning completed',
    });
  } catch (error: any) {
    console.error('❌ Batch learning error:', error);
    res.status(500).json({
      error: 'Batch learning failed',
      message: error.message,
    });
  }
});

/**
 * GET /api/ingestion/confidence-dashboard/:tenantId
 * Get confidence dashboard data
 */
router.get('/confidence-dashboard/:tenantId', async (req: Request, res: Response) => {
  console.log('📊 GET /api/ingestion/confidence-dashboard');

  try {
    const { tenantId } = req.params;
    const { days = '30' } = req.query;

    const metricsService = new ConfidenceMetricsService();
    const dashboardData = await metricsService.getConfidenceDashboard(
      normalizeTenantId(tenantId),
      parseInt(days as string, 10)
    );

    res.json({
      success: true,
      data: dashboardData,
    });
  } catch (error: any) {
    console.error('❌ Confidence dashboard error:', error);
    res.status(500).json({
      error: 'Failed to get confidence dashboard',
      message: error.message,
    });
  }
});

/**
 * GET /api/ingestion/confidence-trends/:tenantId
 * Get confidence trends over time
 */
router.get('/confidence-trends/:tenantId', async (req: Request, res: Response) => {
  console.log('📈 GET /api/ingestion/confidence-trends');

  try {
    const { tenantId } = req.params;
    const { days = '30' } = req.query;

    const metricsService = new ConfidenceMetricsService();
    const trends = await metricsService.getConfidenceTrends(
      normalizeTenantId(tenantId),
      parseInt(days as string, 10)
    );

    res.json({
      success: true,
      data: trends,
    });
  } catch (error: any) {
    console.error('❌ Confidence trends error:', error);
    res.status(500).json({
      error: 'Failed to get confidence trends',
      message: error.message,
    });
  }
});

/**
 * GET /api/ingestion/source-performance/:tenantId
 * Get enrichment source performance metrics
 */
router.get('/source-performance/:tenantId', async (req: Request, res: Response) => {
  console.log('🎯 GET /api/ingestion/source-performance');

  try {
    const { tenantId } = req.params;

    const metricsService = new ConfidenceMetricsService();
    const performance = await metricsService.getSourcePerformance(normalizeTenantId(tenantId));

    res.json({
      success: true,
      data: performance,
    });
  } catch (error: any) {
    console.error('❌ Source performance error:', error);
    res.status(500).json({
      error: 'Failed to get source performance',
      message: error.message,
    });
  }
});

// ============================================================================
// EXPORT
// ============================================================================

export default router;
