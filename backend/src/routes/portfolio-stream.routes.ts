/**
 * Portfolio Assessment Streaming Routes
 *
 * Provides real-time streaming updates for portfolio assessment
 * and HITL (Human-in-the-Loop) ingestion to improve perceived performance and UX
 */

import { Router, Request, Response } from 'express';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import { supabase } from '../config/supabase';
import { portfolioAssessmentAgent } from '../agents/subagents/portfolioAssessmentAgent';
import { getHITLIngestionService } from '../services/hitlIngestionService';
import { ingestDataStreaming, FileInput } from '../agents/subagents/dataIngestionOrchestrator';
import { savePortfolioItems } from '../repositories/portfolioRepository';
import { processBatchLearning } from '../agents/subagents/enhancedIngestionOrchestrator';
import { normalizeTenantId } from '../utils/tenant';
import { checkQualityGates } from '../services/qualityGatesInitializer';
import {
  HITLConfirmRequest,
  HITLRejectRequest,
  HITLSkipAllRequest,
  HITLBatchFeedback,
  HITLFeedback,
} from '../types/hitl';

const router = Router();

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
});

/**
 * POST /api/portfolio/assess/stream
 *
 * Streaming assessment endpoint that sends progress updates in real-time
 */
router.post('/assess/stream', async (req, res) => {
  console.log('📊 POST /api/portfolio/assess/stream');

  // Set up SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

  const sendEvent = (event: string, data: any) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const { tenantId, companyId, portfolioType = 'mixed', evaluationCriteria } = req.body;

    // Run assessment with progress hooks that stream updates
    const result = await portfolioAssessmentAgent.run({
      tenantId,
      companyId,
      portfolioType,
      evaluationCriteria,
      onProgress: (progressData: any) => {
        // Stream each progress update to the client
        sendEvent('progress', progressData);
      }
    });

    // Send final result
    sendEvent('result', result.metadata?.result || result);
    res.end();
  } catch (error) {
    console.error('❌ Streaming assessment error:', error);
    sendEvent('error', { message: error instanceof Error ? error.message : 'Errore sconosciuto' });
    res.end();
  }
});

/**
 * POST /api/portfolio/ingest/stream
 *
 * Streaming ingestion endpoint for file uploads with progress
 */
router.post('/ingest/stream', async (req, res) => {
  console.log('📂 POST /api/portfolio/ingest/stream');

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  const sendEvent = (event: string, data: any) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    // Implementation would stream file processing updates
    sendEvent('progress', { phase: 'uploading', message: 'Caricamento file...', progress: 0 });

    // Process files with progress updates
    // ... (to be implemented with actual file processing logic)

    sendEvent('progress', { phase: 'complete', message: 'Importazione completata!', progress: 100 });
    res.end();
  } catch (error) {
    console.error('❌ Streaming ingestion error:', error);
    sendEvent('error', { message: error instanceof Error ? error.message : 'Errore sconosciuto' });
    res.end();
  }
});

// ============================================================================
// HITL (Human-in-the-Loop) Endpoints
// ============================================================================

/**
 * POST /api/portfolio/ingest/hitl/stream
 *
 * HITL streaming ingestion - streams items in batches for real-time validation
 */
router.post('/ingest/hitl/stream', upload.array('files', 10), async (req: Request, res: Response) => {
  console.log('🎯 POST /api/portfolio/ingest/hitl/stream');

  // Set up SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  const sendEvent = (event: string, data: any) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const { tenantId, text, userContext, preferredType, batchSize, samplingThreshold, sampleSize } = req.body;
    const files = req.files as Express.Multer.File[];

    if (!tenantId) {
      sendEvent('error', { code: 'MISSING_TENANT', message: 'tenantId is required', recoverable: false });
      res.end();
      return;
    }

    // Create HITL session
    const hitlService = getHITLIngestionService();
    const session = hitlService.createSession(tenantId, {
      batchSize: parseInt(batchSize) || 5,
      samplingThreshold: parseInt(samplingThreshold) || 50,
      sampleSize: parseInt(sampleSize) || 15,
    });

    // Send session start event
    sendEvent('session_start', {
      sessionId: session.id,
      totalEstimated: 0, // Will be updated as we discover items
      batchSize: session.batchSize,
      mode: 'hitl',
      samplingMode: false,
    });

    // Convert uploaded files to FileInput format
    const fileInputs: FileInput[] = (files || []).map((file) => ({
      id: uuidv4(),
      buffer: file.buffer,
      fileName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
    }));

    // Stream ingestion with HITL context
    let batchIndex = 0;
    let totalProcessed = 0;

    for await (const event of ingestDataStreaming({
      files: fileInputs,
      text,
      tenantId,
      userContext,
      language: 'it',
      hitlContext: session.context,
      batchSize: session.batchSize,
    })) {
      if (event.type === 'progress') {
        sendEvent('progress', event.data);
      } else if (event.type === 'preview') {
        // ✨ NEW: Preview event - show items IMMEDIATELY after chunk completion
        // This gives user instant feedback without waiting for batch to fill
        const previewData = event.data;

        console.log(`   ✨ [STREAM] Sending preview: ${previewData.itemsInThisChunk} items from chunk ${previewData.chunkIndex + 1}/${previewData.totalChunks}`);

        sendEvent('preview', {
          items: previewData.items,
          chunkIndex: previewData.chunkIndex,
          totalChunks: previewData.totalChunks,
          itemsExtractedSoFar: previewData.itemsExtractedSoFar,
          itemsInThisChunk: previewData.itemsInThisChunk,
          categoriesDetected: previewData.categoriesDetected,
          message: previewData.message,
          notes: previewData.notes,
          autoConfirmedCount: previewData.autoConfirmedCount, // NEW: Auto-confirmation count
          patternsApplied: previewData.patternsApplied, // NEW: Applied patterns
        });

        // Update session estimate
        hitlService.addPendingItems(session.id, previewData.items);
      } else if (event.type === 'batch') {
        // Add items to session (if not already added by preview)
        const currentPending = hitlService.getSession(session.id)?.pendingItems.length || 0;

        // Only add if not already in pending (preview might have added them)
        if (currentPending === 0 || event.data.items.length > 0) {
          hitlService.addPendingItems(session.id, event.data.items);
        }

        // Get next batch for user review
        const batch = hitlService.getNextBatch(session.id);
        if (batch && batch.length > 0) {
          const stats = hitlService.getSessionStats(session.id);
          sendEvent('batch', {
            items: batch,
            batchIndex,
            totalBatches: Math.ceil((stats?.total || 0) / session.batchSize),
            processed: totalProcessed,
            total: stats?.total || 0,
          });
          batchIndex++;
          totalProcessed += batch.length;
        }

        // Check if we should propose sampling
        if (hitlService.shouldProposeSampling(session.id)) {
          const stats = hitlService.getSessionStats(session.id);
          sendEvent('sampling_proposal', {
            sampledItems: stats?.confirmed || 0,
            remainingItems: stats?.pending || 0,
            confirmedPatterns: session.context.confirmedPatterns,
            question: `Vuoi applicare i pattern appresi ai restanti ${stats?.pending} item?`,
          });
        }
      } else if (event.type === 'complete') {
        // Don't close yet - wait for user to finish reviewing
        sendEvent('progress', {
          phase: 'waiting_feedback',
          message: 'Estrazione completata. In attesa del tuo feedback...',
          percent: 100,
        });
      } else if (event.type === 'error') {
        sendEvent('error', {
          code: 'EXTRACTION_ERROR',
          message: event.data.message,
          recoverable: true,
        });
      }
    }

    // Keep connection open until session is completed
    // The client will close the connection when done

  } catch (error) {
    console.error('❌ HITL streaming error:', error);
    sendEvent('error', {
      code: 'STREAM_ERROR',
      message: error instanceof Error ? error.message : 'Errore sconosciuto',
      recoverable: false,
    });
    res.end();
  }
});

/**
 * POST /api/portfolio/ingest/hitl/:sessionId/confirm
 *
 * Confirm items in the current batch
 */
router.post('/ingest/hitl/:sessionId/confirm', async (req: Request, res: Response) => {
  console.log(`✅ POST /api/portfolio/ingest/hitl/${req.params.sessionId}/confirm`);

  try {
    const { sessionId } = req.params;
    const { itemIds, modifications } = req.body as HITLConfirmRequest;

    const hitlService = getHITLIngestionService();
    const session = hitlService.getSession(sessionId);

    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    // Build feedback batch
    const feedbacks: HITLFeedback[] = itemIds.map((itemId) => {
      const item = session.currentBatch.find((i) => i.id === itemId);
      if (!item) throw new Error(`Item ${itemId} not found in current batch`);

      return {
        id: uuidv4(),
        sessionId,
        itemId,
        action: modifications?.[itemId] ? 'modify' : 'confirm',
        originalItem: item,
        modifiedItem: modifications?.[itemId],
        responseTimeMs: Date.now() - session.updatedAt.getTime(),
        createdAt: new Date(),
      };
    });

    // Process feedback
    const updatedSession = await hitlService.processFeedback({
      sessionId,
      feedbacks,
      continueProcessing: true,
    });

    const stats = hitlService.getSessionStats(sessionId);

    res.json({
      success: true,
      session: {
        id: updatedSession?.id,
        status: updatedSession?.status,
        stats,
      },
      contextPrompt: updatedSession?.context.contextPrompt,
      message: `${itemIds.length} item confermati`,
    });
  } catch (error) {
    console.error('❌ HITL confirm error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Errore durante la conferma',
    });
  }
});

/**
 * POST /api/portfolio/ingest/hitl/:sessionId/reject
 *
 * Reject items in the current batch
 */
router.post('/ingest/hitl/:sessionId/reject', async (req: Request, res: Response) => {
  console.log(`❌ POST /api/portfolio/ingest/hitl/${req.params.sessionId}/reject`);

  try {
    const { sessionId } = req.params;
    const { itemIds, reasons } = req.body as HITLRejectRequest;

    const hitlService = getHITLIngestionService();
    const session = hitlService.getSession(sessionId);

    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    // Build feedback batch
    const feedbacks: HITLFeedback[] = itemIds.map((itemId) => {
      const item = session.currentBatch.find((i) => i.id === itemId);
      if (!item) throw new Error(`Item ${itemId} not found in current batch`);

      return {
        id: uuidv4(),
        sessionId,
        itemId,
        action: 'reject',
        originalItem: item,
        reason: reasons?.[itemId],
        responseTimeMs: Date.now() - session.updatedAt.getTime(),
        createdAt: new Date(),
      };
    });

    // Process feedback
    const updatedSession = await hitlService.processFeedback({
      sessionId,
      feedbacks,
      continueProcessing: true,
    });

    const stats = hitlService.getSessionStats(sessionId);

    res.json({
      success: true,
      session: {
        id: updatedSession?.id,
        status: updatedSession?.status,
        stats,
      },
      message: `${itemIds.length} item rifiutati`,
    });
  } catch (error) {
    console.error('❌ HITL reject error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Errore durante il rifiuto',
    });
  }
});

/**
 * POST /api/portfolio/ingest/hitl/:sessionId/early-feedback
 *
 * Receive early feedback on chunk 1 items DURING extraction.
 * Updates learning context to influence subsequent chunks.
 */
router.post('/ingest/hitl/:sessionId/early-feedback', async (req: Request, res: Response) => {
  console.log(`⚡ POST /api/portfolio/ingest/hitl/${req.params.sessionId}/early-feedback`);

  try {
    const { sessionId } = req.params;
    const { itemId, decision } = req.body as { itemId: string; decision: 'confirm' | 'reject' };

    const hitlService = getHITLIngestionService();
    const session = hitlService.getSession(sessionId);

    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    // Find item in pending items (preview items)
    const item = session.pendingItems.find((i) => i.id === itemId);
    if (!item) {
      res.status(404).json({ error: 'Item not found in session' });
      return;
    }

    // Create feedback
    const feedback: HITLFeedback = {
      id: uuidv4(),
      sessionId,
      itemId,
      action: decision,
      originalItem: item,
      responseTimeMs: Date.now() - session.updatedAt.getTime(),
      createdAt: new Date(),
    };

    // Process feedback to update learning context
    await hitlService.processFeedback({
      sessionId,
      feedbacks: [feedback],
      continueProcessing: true,
    });

    const stats = hitlService.getSessionStats(sessionId);
    const confirmedPatterns = session.context.confirmedPatterns.length;
    const rejectedPatterns = session.context.rejectedPatterns.length;

    console.log(`   ⚡ [EARLY FEEDBACK] ${decision} for "${item.name}" - Patterns: ${confirmedPatterns} confirmed, ${rejectedPatterns} rejected`);

    res.json({
      success: true,
      message: `Feedback "${decision}" salvato`,
      stats,
      learningContext: {
        confirmedPatterns: session.context.confirmedPatterns.length,
        rejectedPatterns: session.context.rejectedPatterns.length,
        contextPrompt: session.context.contextPrompt,
      },
    });
  } catch (error) {
    console.error('❌ Early feedback error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Errore durante il salvataggio feedback',
    });
  }
});

/**
 * POST /api/portfolio/ingest/hitl/:sessionId/skip-all
 *
 * Skip HITL mode and process remaining items with learned patterns
 */
router.post('/ingest/hitl/:sessionId/skip-all', async (req: Request, res: Response) => {
  console.log(`⏭️ POST /api/portfolio/ingest/hitl/${req.params.sessionId}/skip-all`);

  try {
    const { sessionId } = req.params;
    const { applyLearnedPatterns } = req.body as HITLSkipAllRequest;

    const hitlService = getHITLIngestionService();
    const session = hitlService.getSession(sessionId);

    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    let appliedItems: any[] = [];

    if (applyLearnedPatterns) {
      // Apply learned patterns to remaining items
      appliedItems = await hitlService.applyPatternsToRemaining(sessionId);
    } else {
      // Just mark session as batch mode
      hitlService.updateSessionStatus(sessionId, 'batch_mode');
    }

    const stats = hitlService.getSessionStats(sessionId);

    res.json({
      success: true,
      session: {
        id: session.id,
        status: session.status,
        stats,
      },
      appliedItems: appliedItems.length,
      message: applyLearnedPatterns
        ? `Pattern applicati a ${appliedItems.length} item rimanenti`
        : 'Passato a modalità batch',
    });
  } catch (error) {
    console.error('❌ HITL skip-all error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Errore durante lo skip',
    });
  }
});

/**
 * GET /api/portfolio/ingest/hitl/:sessionId/next-batch
 *
 * Get the next batch of items for review
 */
router.get('/ingest/hitl/:sessionId/next-batch', async (req: Request, res: Response) => {
  console.log(`📦 GET /api/portfolio/ingest/hitl/${req.params.sessionId}/next-batch`);

  try {
    const { sessionId } = req.params;

    const hitlService = getHITLIngestionService();
    const session = hitlService.getSession(sessionId);

    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    const batch = hitlService.getNextBatch(sessionId);
    const stats = hitlService.getSessionStats(sessionId);

    if (!batch || batch.length === 0) {
      res.json({
        success: true,
        batch: [],
        hasMore: false,
        stats,
        message: 'Tutti gli item sono stati processati',
      });
      return;
    }

    res.json({
      success: true,
      batch,
      hasMore: (stats?.pending || 0) > 0,
      stats,
    });
  } catch (error) {
    console.error('❌ HITL next-batch error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Errore nel recupero batch',
    });
  }
});

/**
 * GET /api/portfolio/ingest/hitl/:sessionId
 *
 * Get session status and stats
 */
router.get('/ingest/hitl/:sessionId', async (req: Request, res: Response) => {
  console.log(`📊 GET /api/portfolio/ingest/hitl/${req.params.sessionId}`);

  try {
    const { sessionId } = req.params;

    const hitlService = getHITLIngestionService();
    const session = hitlService.getSession(sessionId);

    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    const stats = hitlService.getSessionStats(sessionId);

    res.json({
      success: true,
      session: {
        id: session.id,
        status: session.status,
        samplingMode: session.samplingMode,
        batchSize: session.batchSize,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
      },
      stats,
      confirmedItems: session.confirmedItems,
    });
  } catch (error) {
    console.error('❌ HITL session error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Errore nel recupero sessione',
    });
  }
});

/**
 * POST /api/portfolio/ingest/hitl/:sessionId/complete
 *
 * Complete the HITL session and save confirmed items
 */
router.post('/ingest/hitl/:sessionId/complete', async (req: Request, res: Response) => {
  console.log(`🏁 POST /api/portfolio/ingest/hitl/${req.params.sessionId}/complete`);

  try {
    const { sessionId } = req.params;

    const hitlService = getHITLIngestionService();
    const session = hitlService.getSession(sessionId);

    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    // Save confirmed items to database
    const confirmedItems = session.confirmedItems;
    const originalItems = session.originalItems;
    const tenantId = session.tenantId;

    if (confirmedItems.length > 0 && tenantId) {
      console.log(`💾 Saving ${confirmedItems.length} confirmed items to database for tenant ${tenantId}`);

      // Group items by type and map to PortfolioItem format
      const products = confirmedItems
        .filter(item => item.type === 'product')
        .map(item => ({
          ...item,
          tags: item.tags || [],
          dependencies: item.dependencies || [],
          kpis: []
        }));

      const services = confirmedItems
        .filter(item => item.type === 'service')
        .map(item => ({
          ...item,
          tags: item.tags || [],
          dependencies: item.dependencies || [],
          kpis: []
        }));

      // ============================================================================
      // INDUSTRY MISMATCH DETECTION: Check if items match company industry
      // ============================================================================
      console.log(`\n🔍 Detecting industry/content mismatch...`);

      try {
        // Get company strategic profile
        const { data: assessment } = await supabase
          .from('assessments')
          .select('analysis')
          .eq('company_id', tenantId)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        if (assessment?.analysis?.industry) {
          const companyIndustry = assessment.analysis.industry;
          console.log(`   Company industry: ${companyIndustry}`);

          // Detect item industries based on categories and names
          const itemIndustries = new Map<string, number>();
          for (const item of confirmedItems) {
            const detectedIndustry = detectItemIndustry(item);
            itemIndustries.set(detectedIndustry, (itemIndustries.get(detectedIndustry) || 0) + 1);
          }

          // Find dominant industry in items
          const sortedIndustries = Array.from(itemIndustries.entries()).sort((a, b) => b[1] - a[1]);
          const dominantIndustry = sortedIndustries[0]?.[0];
          const dominantCount = sortedIndustries[0]?.[1] || 0;
          const dominantPercent = (dominantCount / confirmedItems.length) * 100;

          console.log(`   Detected industries in items:`);
          for (const [industry, count] of sortedIndustries) {
            console.log(`      - ${industry}: ${count} items (${((count / confirmedItems.length) * 100).toFixed(0)}%)`);
          }

          // Check for mismatch
          if (dominantIndustry && dominantPercent > 50) {
            const isMatch = companyIndustry.toLowerCase().includes(dominantIndustry.toLowerCase()) ||
                           dominantIndustry.toLowerCase().includes(companyIndustry.toLowerCase());

            if (!isMatch) {
              console.log(`   ⚠️  MISMATCH DETECTED!`);
              console.log(`      Company profile: ${companyIndustry}`);
              console.log(`      Document content: ${dominantIndustry} (${dominantPercent.toFixed(0)}% of items)`);
              console.log(`      This may indicate wrong industry classification or wrong document uploaded.`);
            } else {
              console.log(`   ✅ Industry alignment confirmed`);
            }
          }
        }
      } catch (mismatchError) {
        console.error(`   ⚠️  Could not check industry mismatch:`, mismatchError);
      }

      // ============================================================================
      // QUALITY GATES: Check items before saving
      // ============================================================================
      console.log(`\n🚦 Checking quality gates for ${confirmedItems.length} items...`);
      const qualityResults = await Promise.all(
        confirmedItems.map(item => checkQualityGates(tenantId, item, 'ingestion'))
      );

      const totalBlocking = qualityResults.reduce((sum, r) => sum + r.blockedBy.length, 0);
      const totalWarnings = qualityResults.reduce((sum, r) => sum + r.warnings.length, 0);

      if (totalBlocking > 0) {
        console.log(`   ❌ ${totalBlocking} blocking quality gate violations found`);
        for (let i = 0; i < qualityResults.length; i++) {
          const result = qualityResults[i];
          if (result.blockedBy.length > 0) {
            console.log(`   Item "${confirmedItems[i].name}": ${result.blockedBy.map(g => g.gate_name).join(', ')}`);
          }
        }
      }

      if (totalWarnings > 0) {
        console.log(`   ⚠️  ${totalWarnings} quality gate warnings`);
      }

      if (totalBlocking === 0 && totalWarnings === 0) {
        console.log(`   ✅ All quality gates passed`);
      }

      // Save products
      if (products.length > 0) {
        const savedProducts = await savePortfolioItems(products, tenantId, 'products');
        console.log(`   ✅ Saved ${savedProducts?.length || 0} products`);
      }

      // Save services
      if (services.length > 0) {
        const savedServices = await savePortfolioItems(services, tenantId, 'services');
        console.log(`   ✅ Saved ${savedServices?.length || 0} services`);
      }

      // ============================================================================
      // BATCH LEARNING: Trigger after saving items
      // ============================================================================
      if (confirmedItems.length >= 3 && originalItems.length > 0) {
        console.log(`\n📚 Triggering Batch Learning...`);
        console.log(`   Original items: ${originalItems.length}`);
        console.log(`   Corrected items: ${confirmedItems.length}`);

        try {
          await processBatchLearning(
            normalizeTenantId(tenantId),
            sessionId,
            originalItems,
            confirmedItems
          );
          console.log(`   ✅ Batch learning completed successfully`);
        } catch (batchLearningError) {
          console.error(`   ⚠️  Batch learning failed (non-blocking):`, batchLearningError);
          // Don't fail the whole request if batch learning fails
        }
      } else {
        console.log(`   ℹ️  Skipping batch learning (requires at least 3 items)`);
      }
    }

    // Mark session as completed
    hitlService.updateSessionStatus(sessionId, 'completed');

    const stats = hitlService.getSessionStats(sessionId);

    res.json({
      success: true,
      session: {
        id: session.id,
        status: 'completed',
        stats,
      },
      confirmedItems: session.confirmedItems,
      savedCount: confirmedItems.length,
      message: `Sessione completata: ${confirmedItems.length} item salvati nel database`,
    });
  } catch (error) {
    console.error('❌ HITL complete error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Errore nel completamento sessione',
    });
  }
});

/**
 * DELETE /api/portfolio/ingest/hitl/:sessionId
 *
 * Cancel and delete a HITL session
 */
router.delete('/ingest/hitl/:sessionId', async (req: Request, res: Response) => {
  console.log(`🗑️ DELETE /api/portfolio/ingest/hitl/${req.params.sessionId}`);

  try {
    const { sessionId } = req.params;

    const hitlService = getHITLIngestionService();

    // Update status before deleting
    hitlService.updateSessionStatus(sessionId, 'cancelled');
    const deleted = hitlService.deleteSession(sessionId);

    if (!deleted) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    res.json({
      success: true,
      message: 'Sessione cancellata',
    });
  } catch (error) {
    console.error('❌ HITL delete error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Errore nella cancellazione',
    });
  }
});

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Detect industry from item name and category
 */
function detectItemIndustry(item: any): string {
  const text = `${item.name} ${item.category} ${item.subcategory || ''}`.toLowerCase();

  // Automotive keywords
  if (text.match(/\b(car|auto|vehicle|suv|sedan|truck|abarth|fiat|alfa|peugeot|citroen|opel|jeep|maserati|chrysler|dodge|ram|lancia|ds|vauxhall|motor|engine|automotive)\b/)) {
    return 'Automotive';
  }

  // Software/IT keywords
  if (text.match(/\b(software|platform|saas|cloud|api|database|server|application|app|system|digital|technology|it|information)\b/)) {
    return 'Information Technology';
  }

  // Manufacturing keywords
  if (text.match(/\b(manufacturing|industrial|factory|production|machinery|equipment|plant)\b/)) {
    return 'Manufacturing';
  }

  // Financial keywords
  if (text.match(/\b(bank|financial|insurance|loan|credit|investment|trading|fintech)\b/)) {
    return 'Financial Services';
  }

  // Healthcare keywords
  if (text.match(/\b(healthcare|medical|hospital|pharma|clinic|health|medicine|diagnostic)\b/)) {
    return 'Healthcare';
  }

  // Retail/Consumer keywords
  if (text.match(/\b(retail|consumer|shop|store|ecommerce|sales|product|goods)\b/)) {
    return 'Retail/Consumer Goods';
  }

  // Default if no match
  return 'Unknown';
}

export default router;
