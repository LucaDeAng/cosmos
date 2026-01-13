import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import multer from 'multer';
import * as XLSX from 'xlsx';
import * as path from 'path';
import * as fs from 'fs';
import { supabase } from '../config/supabase';
import { portfolioAssessmentAgent } from '../agents/subagents/portfolioAssessmentAgent';
import { documentExtractionAgent } from '../agents/subagents/documentExtractionAgent';
import { catalogPrioritizationAgent } from '../agents/subagents/catalogPrioritizationAgent';
import { ingestData, ingestText, FileInput } from '../agents/subagents/dataIngestionOrchestrator';
import { normalizeTenantId } from '../utils/tenant';

// Continuous Learning
import { LearningService } from '../services/learningService';
import { MetricsService } from '../services/metricsService';
import { getRAGTrainingService } from '../services/ragTrainingService';

// HITL Ingestion Service
import { getHITLIngestionService } from '../services/hitlIngestionService';
const hitlIngestionService = getHITLIngestionService();

// Portfolio Health & Dependency Analysis
import { analyzePortfolioHealth } from '../agents/subagents/analysis/portfolioHealthAgent';
import { analyzeDependencies, generateMermaidDiagram, detectConflicts, getDependencyStats } from '../agents/subagents/analysis/dependencyGraphAgent';
import {
  savePortfolioAssessment,
  getPortfolioAssessment,
  getLatestPortfolioAssessment,
  listPortfolioAssessments,
  savePortfolioItems,
  getPortfolioItems,
  saveDocumentExtraction,
  getDocumentExtractions,
  getExtractionStats,
} from '../repositories/portfolioRepository';
import type { PortfolioItem, PortfolioAssessmentInput } from '../agents/schemas/portfolioAssessmentSchema';

const router = Router();

// Configurazione Multer per upload file
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../../uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
  fileFilter: (req, file, cb) => {
    const allowedMimes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // xlsx
      'application/vnd.ms-excel', // xls
      'text/csv',
      'application/json',
      'application/pdf'
    ];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Tipo file non supportato. Formati accettati: Excel, CSV, JSON, PDF'));
    }
  }
});

/**
 * POST /api/portfolio/assess
 * Avvia un nuovo portfolio assessment
 */
router.post('/assess', async (req: Request, res: Response) => {
  console.log('📊 POST /api/portfolio/assess');
  
  try {
    const {
      tenantId,
      companyId,
      portfolioType = 'mixed',
      items,
      evaluationCriteria,
      userGoal,
      focusArea,
    } = req.body;

    if (!tenantId) {
      return res.status(400).json({ error: 'tenantId è richiesto' });
    }

    const safeTenantId = normalizeTenantId(tenantId);
    if (safeTenantId !== tenantId) console.warn(`[Ingest] Invalid tenantId provided: "${tenantId}" - using system catalog fallback`);

    const input: PortfolioAssessmentInput = {
      tenantId: safeTenantId,
      companyId,
      portfolioType,
      items,
      dataSource: items?.length > 0 ? 'manual' : 'supabase',
      evaluationCriteria,
      userGoal,
      focusArea,
    };

    console.log(`🔍 Running assessment for tenant ${tenantId}, type: ${portfolioType}`);
    
    const result = await portfolioAssessmentAgent.run(input as unknown as Record<string, unknown>);

    if (result.metadata?.error) {
      return res.status(400).json({
        error: result.content,
        details: result.metadata
      });
    }

    const responsePayload = {
      success: true,
      message: result.content,
      assessmentId: result.metadata?.assessmentId,
      portfolioHealth: result.metadata?.portfolioHealth,
      recommendationDistribution: result.metadata?.recommendationDistribution,
      result: result.metadata?.result,
    };

    console.log('📤 Sending assessment response:', {
      success: responsePayload.success,
      assessmentId: responsePayload.assessmentId,
      hasResult: !!responsePayload.result,
      resultKeys: responsePayload.result ? Object.keys(responsePayload.result) : [],
    });

    res.json(responsePayload);

  } catch (error) {
    console.error('❌ Error in portfolio assessment:', error);
    res.status(500).json({ 
      error: 'Errore durante l\'assessment del portfolio',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/portfolio/assessment/:assessmentId
 * Recupera un assessment specifico
 */
router.get('/assessment/:assessmentId', async (req: Request, res: Response) => {
  const { assessmentId } = req.params;
  
  try {
    const assessment = await getPortfolioAssessment(assessmentId);
    
    if (!assessment) {
      return res.status(404).json({ error: 'Assessment non trovato' });
    }

    res.json({ assessment });
  } catch (error) {
    console.error('❌ Error fetching assessment:', error);
    res.status(500).json({ error: 'Errore nel recupero dell\'assessment' });
  }
});

/**
 * GET /api/portfolio/assessment/latest/:tenantId
 * Recupera l'ultimo assessment per un tenant
 */
router.get('/assessment/latest/:tenantId', async (req: Request, res: Response) => {
  const { tenantId } = req.params;
  
  try {
    const assessment = await getLatestPortfolioAssessment(tenantId);
    
    if (!assessment) {
      return res.status(404).json({ error: 'Nessun assessment trovato per questo tenant' });
    }

    res.json({ assessment });
  } catch (error) {
    console.error('❌ Error fetching latest assessment:', error);
    res.status(500).json({ error: 'Errore nel recupero dell\'assessment' });
  }
});

/**
 * GET /api/portfolio/assessments/:tenantId
 * Lista tutti gli assessment per un tenant
 */
router.get('/assessments/:tenantId', async (req: Request, res: Response) => {
  const { tenantId } = req.params;
  const limit = parseInt(req.query.limit as string) || 10;
  
  try {
    const assessments = await listPortfolioAssessments(tenantId, limit);
    res.json({ assessments });
  } catch (error) {
    console.error('❌ Error listing assessments:', error);
    res.status(500).json({ error: 'Errore nel recupero degli assessment' });
  }
});

/**
 * POST /api/portfolio/items/bulk
 * Salva in bulk items validati dall'utente
 * IMPORTANTE: Questa route DEVE essere definita PRIMA di /items/:type
 */
router.post('/items/bulk', async (req: Request, res: Response) => {
  console.log('📦 POST /api/portfolio/items/bulk');
  console.log('📦 Request body:', JSON.stringify(req.body, null, 2));

  try {
    const { tenantId, items } = req.body;

    console.log('📦 tenantId:', tenantId);
    console.log('📦 items count:', items?.length);
    console.log('📦 items:', JSON.stringify(items, null, 2));

    if (!tenantId) {
      return res.status(400).json({ error: 'tenantId è richiesto' });
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'items deve essere un array non vuoto' });
    }

    // Raggruppa items per tipo
    const groupedItems: Record<string, PortfolioItem[]> = {
      initiatives: [],
      products: [],
      services: [],
    };

    for (const item of items) {
      const type = item.type || 'initiative';
      const group = type === 'initiative' ? 'initiatives' : 
                    type === 'product' ? 'products' : 'services';
      
      groupedItems[group].push({
        ...item,
        id: item.id || uuidv4(),
        createdAt: new Date().toISOString(),
      });
    }

    // Salva ogni gruppo
    const results: Record<string, number> = {};
    
    for (const [groupType, groupItems] of Object.entries(groupedItems)) {
      if (groupItems.length > 0) {
        console.log(`📦 Saving ${groupItems.length} items to ${groupType}...`);
        const saved = await savePortfolioItems(
          groupItems,
          tenantId,
          groupType as 'products' | 'services'
        );
        console.log(`📦 Saved result for ${groupType}:`, saved);
        results[groupType] = saved?.length || 0;
      }
    }

    const totalSaved = Object.values(results).reduce((sum, n) => sum + n, 0);

    console.log(`✅ Bulk saved ${totalSaved} items:`, results);

    res.json({
      success: true,
      totalSaved,
      byType: results,
    });

  } catch (error) {
    console.error('❌ Error in bulk save:', error);
    res.status(500).json({ 
      error: 'Errore nel salvataggio bulk',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/portfolio/items/:type
 * Salva items del portfolio (products, services)
 */
router.post('/items/:type', async (req: Request, res: Response) => {
  const { type } = req.params;
  const { tenantId, items } = req.body;

  if (!['products', 'services'].includes(type)) {
    return res.status(400).json({ error: 'Tipo non valido. Usa: products, services' });
  }

  if (!tenantId || !items || !Array.isArray(items)) {
    return res.status(400).json({ error: 'tenantId e items sono richiesti' });
  }

  try {
    // Assegna ID se mancanti
    const itemsWithIds = items.map((item: PortfolioItem) => ({
      ...item,
      id: item.id || uuidv4(),
    }));

    const result = await savePortfolioItems(
      itemsWithIds,
      tenantId,
      type as 'products' | 'services'
    );

    if (!result) {
      return res.status(500).json({ error: 'Errore nel salvataggio degli items' });
    }

    res.json({ 
      success: true, 
      saved: result.length,
      items: result 
    });
  } catch (error) {
    console.error('❌ Error saving items:', error);
    res.status(500).json({ error: 'Errore nel salvataggio degli items' });
  }
});

/**
 * GET /api/portfolio/items/:type/:tenantId
 * Recupera items del portfolio
 */
router.get('/items/:type/:tenantId', async (req: Request, res: Response) => {
  const { type, tenantId } = req.params;
  const { status, category, limit } = req.query;

  if (!['products', 'services'].includes(type)) {
    return res.status(400).json({ error: 'Tipo non valido. Usa: products, services' });
  }

  try {
    const items = await getPortfolioItems(
      tenantId,
      type as 'products' | 'services',
      {
        status: status as string | undefined,
        category: category as string | undefined,
        limit: limit ? parseInt(limit as string) : undefined,
      }
    );

    res.json({ items, count: items.length });
  } catch (error) {
    console.error('❌ Error fetching items:', error);
    res.status(500).json({ error: 'Errore nel recupero degli items' });
  }
});

/**
 * POST /api/portfolio/items/:type/upload
 * Upload batch di items da file/CSV
 */
router.post('/items/:type/upload', async (req: Request, res: Response) => {
  const { type } = req.params;
  const { tenantId, data, format = 'json' } = req.body;

  if (!['products', 'services'].includes(type)) {
    return res.status(400).json({ error: 'Tipo non valido' });
  }

  if (!tenantId || !data) {
    return res.status(400).json({ error: 'tenantId e data sono richiesti' });
  }

  try {
    let items: PortfolioItem[] = [];

    if (format === 'json') {
      items = Array.isArray(data) ? data : [data];
    } else if (format === 'csv') {
      // Parse CSV (simplified - in production use a proper CSV parser)
      const lines = data.split('\n');
      const headers = lines[0].split(',').map((h: string) => h.trim().toLowerCase());
      
      for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        const values = lines[i].split(',');
        const item: Record<string, unknown> = { id: uuidv4() };
        
        headers.forEach((header: string, idx: number) => {
          const value = values[idx]?.trim();
          if (value) {
            // Map common CSV headers
            const fieldMap: Record<string, string> = {
              'nome': 'name',
              'descrizione': 'description',
              'stato': 'status',
              'owner': 'owner',
              'budget': 'budget',
              'valore': 'businessValue',
              'rischio': 'riskLevel',
              'categoria': 'category',
            };
            const fieldName = fieldMap[header] || header;
            item[fieldName] = header === 'budget' || header === 'valore' 
              ? parseFloat(value) 
              : value;
          }
        });
        
        items.push(item as unknown as PortfolioItem);
      }
    }

    // Validate and save
    const itemsWithIds = items.map(item => ({
      ...item,
      id: item.id || uuidv4(),
      type: type === 'products' ? 'product' : 'service',
    }));

    const result = await savePortfolioItems(
      itemsWithIds as PortfolioItem[],
      tenantId,
      type as 'products' | 'services'
    );

    res.json({
      success: true,
      imported: result?.length || 0,
      items: result,
    });
  } catch (error) {
    console.error('❌ Error uploading items:', error);
    res.status(500).json({ error: 'Errore nell\'upload degli items' });
  }
});

/**
 * POST /api/portfolio/import-url
 * Importa dati da un URL (PDF, JSON API, CSV)
 */
router.post('/import-url', async (req: Request, res: Response) => {
  console.log('🔗 POST /api/portfolio/import-url');

  try {
    const { url, type = 'mixed', authHeader, tenantId } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'URL è richiesto' });
    }

    if (!tenantId) {
      return res.status(400).json({ error: 'tenantId è richiesto' });
    }

    console.log(`📥 Importing from URL: ${url}`);

    // Fetch il contenuto dall'URL
    const headers: Record<string, string> = {};
    if (authHeader) {
      headers['Authorization'] = authHeader;
    }

    const response = await fetch(url, { headers });
    
    if (!response.ok) {
      throw new Error(`Errore nel fetch URL: ${response.status} ${response.statusText}`);
    }

    const contentType = response.headers.get('content-type') || '';
    let items: PortfolioItem[] = [];

    if (contentType.includes('application/json')) {
      // Parse JSON API response
      const jsonData = await response.json() as Record<string, unknown>;
      
      // Try to extract items from common JSON structures
      const rawItems = Array.isArray(jsonData) 
        ? jsonData 
        : (jsonData.items || jsonData.data || jsonData.initiatives || jsonData.portfolio || []) as Record<string, unknown>[];

      items = rawItems.map((item: Record<string, unknown>, index: number) => ({
        id: String(item.id || `url-import-${Date.now()}-${index}`),
        name: String(item.name || item.title || item.nome || `Item ${index + 1}`),
        description: String(item.description || item.descrizione || ''),
        type: type !== 'mixed' ? (type as 'initiative' | 'product' | 'service') : detectItemType(item),
        status: (item.status || item.stato || 'active') as 'active' | 'completed' | 'paused' | 'cancelled' | 'proposed',
        priority: String(item.priority || item.priorita || 'medium'),
        budget: Number(item.budget || item.costo || 0),
        startDate: (item.startDate || item.start_date || item.dataInizio || undefined) as string | undefined,
        endDate: (item.endDate || item.end_date || item.dataFine || undefined) as string | undefined,
        owner: String(item.owner || item.responsabile || ''),
        tags: [],
        dependencies: [],
        kpis: [],
      })) as PortfolioItem[];

    } else if (contentType.includes('application/pdf')) {
      // Per PDF, usa l'agent di estrazione documenti
      const pdfBuffer = await response.arrayBuffer();
      const pdfText = Buffer.from(pdfBuffer).toString('utf-8');

      // Usa documentExtractionAgent per estrarre contenuti
      const extractionResult = await documentExtractionAgent.extractFromDocument({
        content: pdfText,
        documentType: 'pdf',
        targetType: type === 'mixed' ? 'mixed' : `${type}s` as 'products' | 'services' | 'mixed',
        userContext: `Estrai dal documento. Tipo preferito: ${type}`,
      });

      if (extractionResult.items) {
        items = extractionResult.items;
      }

    } else if (contentType.includes('text/csv') || url.endsWith('.csv')) {
      // Parse CSV
      const csvText = await response.text();
      const lines = csvText.split('\n').filter(line => line.trim());

      if (lines.length > 1) {
        const headers = lines[0].split(',').map(h => h.trim().toLowerCase());

        for (let i = 1; i < lines.length; i++) {
          const values = lines[i].split(',');
          const item: Record<string, unknown> = {};
          headers.forEach((header, idx) => {
            item[header] = values[idx]?.trim() || '';
          });

          items.push({
            id: `csv-import-${Date.now()}-${i}`,
            name: String(item.name || item.nome || item.title || `Item ${i}`),
            description: String(item.description || item.descrizione || ''),
            type: type !== 'mixed' ? (type as 'product' | 'service') : 'product',
            status: (item.status || item.stato || 'active') as 'active' | 'completed' | 'paused' | 'cancelled' | 'proposed',
            priority: String(item.priority || 'medium'),
            budget: Number(item.budget || item.costo || 0),
            tags: [],
            dependencies: [],
            kpis: [],
          } as PortfolioItem);
        }
      }

    } else {
      // Tenta di parsare come testo e usare AI per estrarre
      const textContent = await response.text();

      const extractionResult = await documentExtractionAgent.extractFromDocument({
        content: textContent,
        documentType: 'text',
        targetType: type === 'mixed' ? 'mixed' : `${type}s` as 'products' | 'services' | 'mixed',
        userContext: `Estrai dal testo. Tipo preferito: ${type}`,
      });

      if (extractionResult.items) {
        items = extractionResult.items;
      }
    }

    if (items.length === 0) {
      return res.status(400).json({ 
        error: 'Nessun item estratto dall\'URL',
        hint: 'Verifica che l\'URL contenga dati validi nel formato corretto'
      });
    }

    // Salva gli items nel database (determina la tabella dal tipo prevalente)
    const mainType = items[0]?.type === 'product' ? 'products' : 'services';
    await savePortfolioItems(items, tenantId, mainType);

    // Conta per tipo
    const byType = {
      products: items.filter(i => i.type === 'product').length,
      services: items.filter(i => i.type === 'service').length,
    };

    console.log(`✅ Imported ${items.length} items from URL`);

    res.json({
      success: true,
      imported: items.length,
      items,
      byType,
      source: url,
    });

  } catch (error) {
    console.error('❌ Error importing from URL:', error);
    res.status(500).json({ 
      error: 'Errore durante l\'importazione da URL',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Helper per detectare il tipo di item
function detectItemType(item: Record<string, unknown>): 'product' | 'service' {
  const text = JSON.stringify(item).toLowerCase();

  if (text.includes('servizio') || text.includes('service') || text.includes('supporto') || text.includes('manutenzione')) {
    return 'service';
  }
  // Default to product for everything else (including projects, products, applications, software)
  return 'product';
}

/**
 * POST /api/portfolio/upload-document
 * Upload di un documento (Excel, CSV, JSON, PDF) per estrarre items
 *
 * @deprecated This endpoint is deprecated. Use POST /api/portfolio/ingest instead.
 * The new endpoint provides:
 * - Multi-file upload support
 * - Enhanced AI confidence scoring
 * - Strategic profile integration
 * - Better error handling
 *
 * Migration guide: https://docs.example.com/migration/upload-document
 */
router.post('/upload-document', upload.single('file'), async (req: Request, res: Response) => {
  console.log('⚠️  DEPRECATED: POST /api/portfolio/upload-document - Use /api/portfolio/ingest instead');

  // Add deprecation warning header
  res.setHeader('X-API-Deprecated', 'true');
  res.setHeader('X-API-Deprecation-Info', 'Use POST /api/portfolio/ingest instead');
  res.setHeader('X-API-Deprecation-Date', '2025-12-17');
  res.setHeader('X-API-Sunset-Date', '2026-03-31');

  if (!req.file) {
    return res.status(400).json({ error: 'Nessun file caricato' });
  }

  const { tenantId, itemType = 'initiatives' } = req.body;

  if (!tenantId) {
    return res.status(400).json({ error: 'tenantId è richiesto' });
  }

  if (!['initiatives', 'products', 'services'].includes(itemType)) {
    return res.status(400).json({ error: 'itemType non valido' });
  }

  try {
    const filePath = req.file.path;
    const mimeType = req.file.mimetype;
    const useAI = req.body.useAI !== 'false'; // Default: usa AI
    let items: PortfolioItem[] = [];
    let extractionMetadata: Record<string, unknown> = {};

    console.log(`📄 Processing ${mimeType} file, AI extraction: ${useAI}`);

    // Parse in base al tipo di file
    if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) {
      if (useAI) {
        // Usa AI per estrazione intelligente da Excel
        const result = await documentExtractionAgent.extractFromExcel(filePath, itemType);
        items = result.items;
        extractionMetadata = { ...result.summary, ...result.metadata };
      } else {
        // Fallback: parsing diretto
        items = await parseExcelFile(filePath, itemType);
      }
    } else if (mimeType === 'text/csv') {
      const csvContent = fs.readFileSync(filePath, 'utf-8');
      if (useAI) {
        // Usa AI per interpretare CSV
        const result = await documentExtractionAgent.extractFromDocument({
          content: csvContent,
          documentType: 'csv',
          targetType: itemType as 'products' | 'services' | 'mixed',
          fileName: req.file.originalname,
        });
        items = result.items;
        extractionMetadata = { ...result.summary, ...result.metadata };
      } else {
        items = parseCSVContent(csvContent, itemType);
      }
    } else if (mimeType === 'application/json') {
      // JSON: parsing diretto (già strutturato)
      const jsonContent = fs.readFileSync(filePath, 'utf-8');
      const data = JSON.parse(jsonContent);
      items = (Array.isArray(data) ? data : data.items || [data]).map((item: Record<string, unknown>) => ({
        ...item,
        id: item.id || uuidv4(),
        type: itemType === 'products' ? 'product' : 'service',
      })) as PortfolioItem[];
    } else if (mimeType === 'application/pdf') {
      // PDF: SEMPRE usa AI per estrazione intelligente
      const pdfText = await extractPDFText(filePath);
      const result = await documentExtractionAgent.extractFromPDFText(
        pdfText,
        itemType,
        req.file.originalname
      );
      items = result.items;
      extractionMetadata = { ...result.summary, ...result.metadata };
    }

    // Cleanup: rimuovi il file temporaneo
    fs.unlinkSync(filePath);

    if (items.length === 0) {
      // Salva anche le estrazioni fallite per analytics
      await saveDocumentExtraction({
        tenantId,
        fileName: req.file.originalname,
        fileType: mimeType,
        fileSize: req.file.size,
        totalExtracted: 0,
        itemsByType: { products: 0, services: 0 },
        confidence: 'low',
        warnings: ['Nessun item estratto dal documento'],
        modelUsed: (extractionMetadata as Record<string, unknown>).modelUsed as string || 'unknown',
        processingTimeMs: (extractionMetadata as Record<string, unknown>).processingTime as number || 0,
        extractedItems: [],
        status: 'failed',
        errorMessage: 'Nessun item trovato nel documento',
      });

      return res.status(400).json({ 
        error: 'Nessun item trovato nel documento',
        hint: 'Assicurati che il file contenga dati strutturati (nome, descrizione, budget, ecc.)'
      });
    }

    // Salva gli items nel database
    const savedItems = await savePortfolioItems(
      items,
      tenantId,
      itemType as 'products' | 'services'
    );

    // Salva la cronologia dell'estrazione su Supabase
    const extractionRecord = await saveDocumentExtraction({
      tenantId,
      fileName: req.file.originalname,
      fileType: mimeType,
      fileSize: req.file.size,
      totalExtracted: items.length,
      itemsByType: {
        products: items.filter(i => i.type === 'product').length,
        services: items.filter(i => i.type === 'service').length,
      },
      confidence: (extractionMetadata as Record<string, unknown>).confidence as 'high' | 'medium' | 'low' || 'medium',
      warnings: (extractionMetadata as Record<string, unknown>).warnings as string[] || [],
      modelUsed: (extractionMetadata as Record<string, unknown>).modelUsed as string || 'direct-parse',
      processingTimeMs: (extractionMetadata as Record<string, unknown>).processingTime as number || 0,
      extractedItems: items,
      status: 'completed',
    });

    console.log(`📊 Extraction saved to Supabase:`, extractionRecord?.id);

    res.json({
      success: true,
      imported: savedItems?.length || 0,
      items: savedItems,
      preview: items.slice(0, 5), // Preview dei primi 5 items
      extraction: extractionMetadata, // Metadata sull'estrazione AI
      extractionId: extractionRecord?.id,
      _deprecated: {
        warning: 'This endpoint is deprecated and will be removed on 2026-03-31',
        replacement: 'POST /api/portfolio/ingest',
        migrationGuide: 'https://docs.example.com/migration/upload-document',
        benefits: [
          'Multi-file upload support',
          'Enhanced AI confidence scoring with breakdown',
          'Strategic profile integration',
          'Better error handling and validation'
        ]
      }
    });

  } catch (error) {
    console.error('❌ Error parsing document:', error);
    // Cleanup file se esiste
    if (req.file?.path && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ 
      error: 'Errore nel parsing del documento',
      details: error instanceof Error ? error.message : 'Errore sconosciuto'
    });
  }
});

/**
 * GET /api/portfolio/extractions/:tenantId
 * Recupera la cronologia delle estrazioni documenti
 */
router.get('/extractions/:tenantId', async (req: Request, res: Response) => {
  const { tenantId } = req.params;
  const limit = parseInt(req.query.limit as string) || 20;

  try {
    const extractions = await getDocumentExtractions(tenantId, limit);
    const stats = await getExtractionStats(tenantId);

    res.json({
      success: true,
      extractions,
      stats,
    });
  } catch (error) {
    console.error('❌ Error fetching extractions:', error);
    res.status(500).json({ error: 'Errore nel recupero delle estrazioni' });
  }
});

/**
 * GET /api/portfolio/upload-template/:type
 * Scarica un template Excel per l'upload
 */
router.get('/upload-template/:type', async (req: Request, res: Response) => {
  const { type } = req.params;

  if (!['products', 'services'].includes(type)) {
    return res.status(400).json({ error: 'Tipo non valido' });
  }

  try {
    const templateData = getTemplateData(type);
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(templateData);
    XLSX.utils.book_append_sheet(workbook, worksheet, type);

    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=template_${type}.xlsx`);
    res.send(buffer);
  } catch (error) {
    console.error('❌ Error generating template:', error);
    res.status(500).json({ error: 'Errore nella generazione del template' });
  }
});

// ==================== Helper Functions ====================

/**
 * Estrae testo da file PDF
 */
async function extractPDFText(filePath: string): Promise<string> {
  try {
    const pdfParseModule = await import('pdf-parse');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pdfParse = (pdfParseModule.default || pdfParseModule) as any;
    const dataBuffer = fs.readFileSync(filePath);
    const data = await pdfParse(dataBuffer);
    return data.text as string;
  } catch (error) {
    console.error('Error extracting PDF text:', error);
    return '';
  }
}

/**
 * Parse file Excel
 */
async function parseExcelFile(filePath: string, itemType: string): Promise<PortfolioItem[]> {
  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const rawData = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet);

  return rawData.map((row) => mapRowToPortfolioItem(row, itemType));
}

/**
 * Parse contenuto CSV
 */
function parseCSVContent(content: string, itemType: string): PortfolioItem[] {
  const lines = content.split('\n').filter(line => line.trim());
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
  const items: PortfolioItem[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    const row: Record<string, unknown> = {};
    headers.forEach((header, idx) => {
      row[header] = values[idx]?.trim();
    });
    items.push(mapRowToPortfolioItem(row, itemType));
  }

  return items;
}

/**
 * Parse una riga CSV gestendo le virgole tra virgolette
 */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

/**
 * Parse file PDF (estrazione testo base)
 */
async function parsePDFFile(filePath: string, itemType: string): Promise<PortfolioItem[]> {
  try {
    // Dynamic import per pdf-parse
    const pdfParseModule = await import('pdf-parse');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pdfParse = (pdfParseModule.default || pdfParseModule) as any;
    const dataBuffer = fs.readFileSync(filePath);
    const data = await pdfParse(dataBuffer);
    
    const text = data.text as string;
    const items: PortfolioItem[] = [];

    // Prova a identificare items dal testo (pattern matching semplice)
    // Cerca pattern come "Nome: xxx" o tabelle
    const lines = text.split('\n').filter((l: string) => l.trim());
    let currentItem: Record<string, unknown> | null = null;

    for (const line of lines) {
      const trimmed = line.trim();
      
      // Pattern: "Nome: Valore" o "Nome - Valore"
      const colonMatch = trimmed.match(/^(nome|name|progetto|initiative|prodotto|product|servizio|service)\s*[:|-]\s*(.+)/i);
      if (colonMatch) {
        if (currentItem && currentItem.name) {
          items.push(mapRowToPortfolioItem(currentItem, itemType));
        }
        currentItem = { name: colonMatch[2].trim() };
        continue;
      }

      if (currentItem) {
        // Cerca altri campi
        const descMatch = trimmed.match(/^(descrizione|description)\s*[:|-]\s*(.+)/i);
        if (descMatch) {
          currentItem.description = descMatch[2].trim();
          continue;
        }

        const budgetMatch = trimmed.match(/^(budget|costo|cost)\s*[:|-]\s*([€$]?\s*[\d.,]+)/i);
        if (budgetMatch) {
          currentItem.budget = parseFloat(budgetMatch[2].replace(/[€$\s,]/g, ''));
          continue;
        }

        const statusMatch = trimmed.match(/^(stato|status)\s*[:|-]\s*(.+)/i);
        if (statusMatch) {
          currentItem.status = statusMatch[2].trim();
          continue;
        }
      }
    }

    // Aggiungi l'ultimo item
    if (currentItem && currentItem.name) {
      items.push(mapRowToPortfolioItem(currentItem, itemType));
    }

    // Se non abbiamo trovato items strutturati, creiamo un item generico dal testo
    if (items.length === 0 && text.length > 50) {
      // Estrai possibili nomi di progetti (righe che sembrano titoli)
      const potentialNames = lines.filter((l: string) => 
        l.trim().length > 3 && 
        l.trim().length < 100 && 
        !l.includes(':') &&
        /^[A-Z]/.test(l.trim())
      ).slice(0, 10);

      for (const name of potentialNames) {
        items.push(mapRowToPortfolioItem({ name: name.trim() }, itemType));
      }
    }

    return items;
  } catch (error) {
    console.error('Errore parsing PDF:', error);
    return [];
  }
}

/**
 * Mappa una riga di dati a PortfolioItem
 */
function mapRowToPortfolioItem(row: Record<string, unknown>, itemType: string): PortfolioItem {
  const fieldMap: Record<string, string> = {
    // Italian to English
    'nome': 'name',
    'descrizione': 'description',
    'stato': 'status',
    'proprietario': 'owner',
    'responsabile': 'owner',
    'budget': 'budget',
    'costo': 'budget',
    'valore': 'businessValue',
    'valore_business': 'businessValue',
    'rischio': 'riskLevel',
    'livello_rischio': 'riskLevel',
    'categoria': 'category',
    'priorita': 'priority',
    'priorità': 'priority',
    'data_inizio': 'startDate',
    'data_fine': 'endDate',
    'roi': 'expectedROI',
    'roi_atteso': 'expectedROI',
    // English variations
    'project_name': 'name',
    'project': 'name',
    'desc': 'description',
    'cost': 'budget',
    'value': 'businessValue',
    'risk': 'riskLevel',
    'start_date': 'startDate',
    'end_date': 'endDate',
    'expected_roi': 'expectedROI',
  };

  const mapped: Record<string, unknown> = {
    id: uuidv4(),
    type: itemType === 'initiatives' ? 'initiative' : itemType === 'products' ? 'product' : 'service',
  };

  for (const [key, value] of Object.entries(row)) {
    if (value === undefined || value === null || value === '') continue;
    
    const normalizedKey = key.toLowerCase().trim().replace(/\s+/g, '_');
    const targetKey = fieldMap[normalizedKey] || normalizedKey;
    
    // Converti numeri
    if (['budget', 'businessValue', 'expectedROI', 'estimatedCost', 'actualCost'].includes(targetKey)) {
      const numValue = typeof value === 'string' 
        ? parseFloat(value.replace(/[€$,\s]/g, '')) 
        : Number(value);
      if (!isNaN(numValue)) {
        mapped[targetKey] = numValue;
      }
    } else {
      mapped[targetKey] = value;
    }
  }

  // Assicurati che ci sia almeno un nome
  if (!mapped.name) {
    mapped.name = 'Item senza nome';
  }

  return mapped as unknown as PortfolioItem;
}

/**
 * Genera dati template per tipo
 */
function getTemplateData(type: string): Record<string, unknown>[] {
  const commonFields = {
    name: 'Nome esempio',
    description: 'Descrizione dettagliata',
    status: 'active',
    owner: 'Responsabile',
    budget: 100000,
    category: 'Categoria',
    priority: 'high',
  };

  if (type === 'initiatives') {
    return [{
      ...commonFields,
      startDate: '2024-01-01',
      endDate: '2024-12-31',
      expectedROI: 1.5,
      businessValue: 500000,
      riskLevel: 'medium',
      strategicFit: 'Digital Transformation',
    }];
  } else if (type === 'products') {
    return [{
      ...commonFields,
      productLine: 'Product Line',
      marketSegment: 'Enterprise',
      revenue: 200000,
      margin: 0.3,
      lifecycle: 'growth',
    }];
  } else {
    return [{
      ...commonFields,
      serviceType: 'consulting',
      deliveryModel: 'recurring',
      monthlyRevenue: 50000,
      customerCount: 25,
      churnRate: 0.05,
    }];
  }
}

/**
 * DELETE /api/portfolio/items/:type/:itemId
 * Elimina un item
 */
router.delete('/items/:type/:itemId', async (req: Request, res: Response) => {
  const { type, itemId } = req.params;
  const { tenantId } = req.query;

  if (!['products', 'services'].includes(type)) {
    return res.status(400).json({ error: 'Tipo non valido' });
  }

  // Mappa ai nomi tabella corretti
  const tableNameMap: Record<string, string> = {
    initiatives: 'initiatives',
    products: 'portfolio_products',
    services: 'portfolio_services',
  };
  const actualTable = tableNameMap[type] || type;

  try {
    let query = supabase
      .from(actualTable)
      .delete()
      .eq('id', itemId);

    if (tenantId) {
      query = query.eq('tenant_id', tenantId);
    }

    const { error } = await query;

    if (error) {
      return res.status(500).json({ error: 'Errore nell\'eliminazione' });
    }

    res.json({ success: true, deleted: itemId });
  } catch (error) {
    console.error('❌ Error deleting item:', error);
    res.status(500).json({ error: 'Errore nell\'eliminazione' });
  }
});

/**
 * GET /api/portfolio/summary/:tenantId
 * Recupera un sommario rapido del portfolio
 */
router.get('/summary/:tenantId', async (req: Request, res: Response) => {
  const { tenantId } = req.params;

  try {
    // Count items per type (using correct table names)
    const [initiatives, products, services] = await Promise.all([
      supabase.from('initiatives').select('id, status', { count: 'exact' }).eq('tenant_id', tenantId),
      supabase.from('portfolio_products').select('id, status', { count: 'exact' }).eq('tenant_id', tenantId),
      supabase.from('portfolio_services').select('id, status', { count: 'exact' }).eq('tenant_id', tenantId),
    ]);

    // Get latest assessment
    const latestAssessment = await getLatestPortfolioAssessment(tenantId);

    const summary = {
      totalItems: {
        initiatives: initiatives.count || 0,
        products: products.count || 0,
        services: services.count || 0,
        total: (initiatives.count || 0) + (products.count || 0) + (services.count || 0),
      },
      latestAssessment: latestAssessment ? {
        assessmentId: latestAssessment.assessmentId,
        createdAt: latestAssessment.createdAt,
        portfolioHealth: latestAssessment.portfolioHealth,
        recommendationDistribution: latestAssessment.recommendationDistribution,
      } : null,
    };

    res.json({ summary });
  } catch (error) {
    console.error('❌ Error fetching summary:', error);
    res.status(500).json({ error: 'Errore nel recupero del sommario' });
  }
});

/**
 * POST /api/portfolio/extract-intelligent
 * Estrazione intelligente da testo con AI
 * Supporta copia/incolla di testo libero
 *
 * @deprecated This endpoint is deprecated. Use POST /api/portfolio/ingest/text instead.
 * The new endpoint provides:
 * - Multi-level confidence scoring
 * - Strategic profile integration
 * - Enhanced RAG semantic search
 * - Better type detection (products/services)
 *
 * Migration guide: https://docs.example.com/migration/extract-intelligent
 */
router.post('/extract-intelligent', async (req: Request, res: Response) => {
  console.log('⚠️  DEPRECATED: POST /api/portfolio/extract-intelligent - Use /api/portfolio/ingest/text instead');

  // Add deprecation warning headers
  res.setHeader('X-API-Deprecated', 'true');
  res.setHeader('X-API-Deprecation-Info', 'Use POST /api/portfolio/ingest/text instead');
  res.setHeader('X-API-Deprecation-Date', '2025-12-17');
  res.setHeader('X-API-Sunset-Date', '2026-03-31');

  try {
    const { text, tenantId, preferredType = 'mixed' } = req.body;

    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'Il campo "text" è richiesto' });
    }

    if (!tenantId) {
      return res.status(400).json({ error: 'tenantId è richiesto' });
    }

    if (text.trim().length < 10) {
      return res.status(400).json({ error: 'Il testo è troppo breve per l\'estrazione' });
    }

    console.log(`📝 Extracting from text (${text.length} chars), preferred type: ${preferredType}`);

    // Usa documentExtractionAgent per estrarre contenuti dal testo
    const extractionResult = await documentExtractionAgent.extractFromDocument({
      content: text,
      documentType: 'text',
      targetType: preferredType === 'mixed' ? 'mixed' :
                  preferredType === 'product' ? 'products' : 'services',
      userContext: `Analizza il testo e estrai tutti i prodotti e servizi IT menzionati.`,
      language: 'it',
    });

    // Estrai gli items dal risultato
    let items: Array<{
      id: string;
      name: string;
      description: string;
      type: 'product' | 'service';
      status: string;
      priority: string;
      budget?: number;
      confidence: number;
      suggestedCategory?: string;
      extractedFrom?: string;
    }> = [];

    if (extractionResult.items && Array.isArray(extractionResult.items)) {
      items = extractionResult.items.map((item, index: number) => ({
        id: `extract-${Date.now()}-${index}`,
        name: String(item.name || `Item ${index + 1}`),
        description: String(item.description || ''),
        type: (item.type === 'product' || item.type === 'service' ? item.type : 'product') as 'product' | 'service',
        status: String(item.status || 'draft'),
        priority: item.riskLevel === 'critical' ? 'critical' : 
                  item.riskLevel === 'high' ? 'high' : 
                  item.riskLevel === 'medium' ? 'medium' : 'low',
        budget: item.budget ? Number(item.budget) : undefined,
        confidence: extractionResult.summary.confidence === 'high' ? 85 : 
                    extractionResult.summary.confidence === 'medium' ? 65 : 45,
        suggestedCategory: String(item.category || ''),
        extractedFrom: '',
      }));
    }

    // Se non ci sono items, prova un parsing semplice basato su pattern
    if (items.length === 0) {
      items = simpleTextExtraction(text, preferredType);
    }

    const confidence = items.length > 0 
      ? Math.round(items.reduce((sum, i) => sum + i.confidence, 0) / items.length)
      : 0;

    console.log(`✅ Extracted ${items.length} items with average confidence ${confidence}%`);

    res.json({
      success: true,
      items,
      extraction: {
        totalExtracted: items.length,
        averageConfidence: confidence,
        byType: {
          products: items.filter(i => i.type === 'product').length,
          services: items.filter(i => i.type === 'service').length,
        },
        sourceLength: text.length,
        processingModel: extractionResult.metadata?.modelUsed || 'ai-extraction',
      },
      _deprecated: {
        warning: 'This endpoint is deprecated and will be removed on 2026-03-31',
        replacement: 'POST /api/portfolio/ingest/text',
        migrationGuide: 'https://docs.example.com/migration/extract-intelligent',
        benefits: [
          'Multi-level confidence scoring with detailed breakdown',
          'Strategic profile integration for better classification',
          'Enhanced RAG semantic search across 7 catalog types',
          'Better product/service type detection (initiatives removed)',
          'Field-level confidence tracking'
        ]
      }
    });

  } catch (error) {
    console.error('❌ Error in intelligent extraction:', error);
    res.status(500).json({ 
      error: 'Errore durante l\'estrazione intelligente',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Helper per normalizzare il tipo di item
function normalizeItemType(type: string): 'product' | 'service' {
  const normalized = type.toLowerCase().trim();
  if (normalized.includes('product') || normalized.includes('prodotto') || normalized.includes('applicazione') || normalized.includes('initiative') || normalized.includes('iniziativa') || normalized.includes('progetto')) {
    return 'product';
  }
  if (normalized.includes('service') || normalized.includes('servizio') || normalized.includes('supporto')) {
    return 'service';
  }
  return 'product'; // default
}

// Estrazione semplice da testo basata su pattern
function simpleTextExtraction(text: string, preferredType: string): Array<{
  id: string;
  name: string;
  description: string;
  type: 'product' | 'service';
  status: string;
  priority: string;
  confidence: number;
}> {
  const items: Array<{
    id: string;
    name: string;
    description: string;
    type: 'product' | 'service';
    status: string;
    priority: string;
    confidence: number;
  }> = [];

  // Pattern per trovare items in liste
  const listPatterns = [
    /^[-•*]\s*(.+)$/gm, // Liste con bullet
    /^\d+[.)]\s*(.+)$/gm, // Liste numerate
    /^(?:Progetto|Iniziativa|Prodotto|Servizio|Project|Initiative|Product|Service):\s*(.+)$/gim,
  ];

  const matches: string[] = [];
  for (const pattern of listPatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      if (match[1] && match[1].trim().length > 3) {
        matches.push(match[1].trim());
      }
    }
  }

  // Se non ci sono match, prova a dividere per righe
  if (matches.length === 0) {
    const lines = text.split('\n').filter(l => l.trim().length > 10);
    for (const line of lines.slice(0, 10)) { // Max 10 items
      const cleanLine = line.replace(/^[-•*\d.)]+\s*/, '').trim();
      if (cleanLine.length > 5) {
        matches.push(cleanLine);
      }
    }
  }

  // Crea items dai match
  for (let i = 0; i < Math.min(matches.length, 20); i++) {
    const matchText = matches[i];
    const type = preferredType !== 'mixed'
      ? normalizeItemType(preferredType)
      : detectItemType({ name: matchText }) as 'product' | 'service';

    items.push({
      id: `simple-${Date.now()}-${i}`,
      name: matchText.slice(0, 100),
      description: matchText.length > 100 ? matchText : '',
      type,
      status: 'draft',
      priority: 'medium',
      confidence: 50, // Bassa confidenza per estrazione semplice
    });
  }

  return items;
}

/**
 * GET /api/portfolio/stats/:companyId
 * Recupera statistiche portfolio per companyId (usato dal dashboard)
 */
router.get('/stats/:companyId', async (req: Request, res: Response) => {
  const { companyId } = req.params;

  if (!companyId || companyId === 'undefined' || companyId === 'null') {
    return res.status(400).json({ error: 'companyId non valido' });
  }

  try {
    // Cerca il tenantId associato alla company
    const { data: company } = await supabase
      .from('companies')
      .select('tenant_id')
      .eq('id', companyId)
      .single();

    const tenantId = company?.tenant_id || companyId;

    // Count items per type
    const [initiatives, products, services] = await Promise.all([
      supabase.from('initiatives').select('id, status', { count: 'exact' }).eq('tenant_id', tenantId),
      supabase.from('portfolio_products').select('id, status', { count: 'exact' }).eq('tenant_id', tenantId),
      supabase.from('portfolio_services').select('id, status', { count: 'exact' }).eq('tenant_id', tenantId),
    ]);

    // Get latest assessment
    const latestAssessment = await getLatestPortfolioAssessment(tenantId);

    const stats = {
      totalItems: {
        initiatives: initiatives.count || 0,
        products: products.count || 0,
        services: services.count || 0,
        total: (initiatives.count || 0) + (products.count || 0) + (services.count || 0),
      },
      isEmpty: ((initiatives.count || 0) + (products.count || 0) + (services.count || 0)) === 0,
      latestAssessment: latestAssessment ? {
        assessmentId: latestAssessment.assessmentId,
        createdAt: latestAssessment.createdAt,
        portfolioHealth: latestAssessment.portfolioHealth,
        recommendationDistribution: latestAssessment.recommendationDistribution,
      } : null,
      hasAssessment: !!latestAssessment,
    };

    res.json(stats);
  } catch (error) {
    console.error('❌ Error fetching portfolio stats:', error);
    res.status(500).json({ error: 'Errore nel recupero delle statistiche portfolio' });
  }
});

// ============================================================================
// DATA INGESTION ROUTES - Multi-Agent Pipeline
// ============================================================================

/**
 * POST /api/portfolio/ingest
 * Advanced data ingestion with multi-agent pipeline
 * Accepts files (PDF, Excel, CSV) and/or text, extracts and normalizes portfolio items
 */
router.post('/ingest', upload.array('files', 10), async (req: Request, res: Response) => {
  console.log('\n🚀 POST /api/portfolio/ingest');
  const startTime = Date.now();
  
  try {
    const { tenantId, text, userContext, language, options } = req.body;
    const uploadedFiles = req.files as Express.Multer.File[];

    console.log('📋 Request body keys:', Object.keys(req.body));
    console.log('📋 tenantId:', tenantId);
    console.log('📋 text length:', text?.length || 0);

    if (!tenantId) {
      return res.status(400).json({ error: 'tenantId è richiesto' });
    }

    const safeTenantId = normalizeTenantId(tenantId);
    if (safeTenantId !== tenantId) console.warn(`[Ingest] Invalid tenantId provided: "${tenantId}" - using system catalog fallback`);

    if ((!uploadedFiles || uploadedFiles.length === 0) && !text) {
      return res.status(400).json({ error: 'Almeno un file o del testo è richiesto' });
    }

    console.log(`📂 Received ${uploadedFiles?.length || 0} files, text: ${text ? 'yes' : 'no'}`);
    
    // Log file details
    if (uploadedFiles && uploadedFiles.length > 0) {
      for (const file of uploadedFiles) {
        console.log(`   📄 File: ${file.originalname}`);
        console.log(`      - mimetype: ${file.mimetype}`);
        console.log(`      - size: ${file.size} bytes`);
        console.log(`      - path: ${file.path}`);
        console.log(`      - exists: ${fs.existsSync(file.path)}`);
      }
    }

    // Prepare file inputs
    const fileInputs: FileInput[] = [];
    if (uploadedFiles && uploadedFiles.length > 0) {
      for (const file of uploadedFiles) {
        const buffer = fs.readFileSync(file.path);
        console.log(`   📦 Buffer loaded: ${buffer.length} bytes`);
        fileInputs.push({
          id: uuidv4(),
          buffer,
          fileName: file.originalname,
          mimeType: file.mimetype,
          size: file.size,
        });
      }
    }

    // Parse options
    let parsedOptions;
    try {
      parsedOptions = options ? JSON.parse(options) : undefined;
    } catch {
      parsedOptions = undefined;
    }

    // Run ingestion pipeline
    const result = await ingestData({
      files: fileInputs.length > 0 ? fileInputs : undefined,
      text: text || undefined,
      tenantId: safeTenantId,
      userContext: userContext || undefined,
      language: language || 'auto',
      options: parsedOptions,
    });

    // Cleanup uploaded files
    if (uploadedFiles) {
      for (const file of uploadedFiles) {
        try {
          fs.unlinkSync(file.path);
        } catch (e) {
          console.warn(`Could not delete temp file: ${file.path}`);
        }
      }
    }

    console.log(`✅ Ingestion complete in ${Date.now() - startTime}ms`);
    console.log(`   Items extracted: ${result.summary.totalItemsExtracted}`);
    console.log(`   Items normalized: ${result.summary.totalItemsNormalized}`);

    // Add a warning when tenantId was invalid and fallback was used
    if (safeTenantId !== tenantId) {
      result.warnings = result.warnings || [];
      result.warnings.push('Invalid tenantId provided; using system catalog fallback');
      console.log('[Ingest] Added warning to result.warnings:', result.warnings);
    }

    res.json({
      success: result.success,
      requestId: result.requestId,
      items: result.normalization.items,
      stats: {
        filesProcessed: result.summary.filesProcessed,
        textProcessed: result.summary.textProcessed,
        totalExtracted: result.summary.totalItemsExtracted,
        totalNormalized: result.summary.totalItemsNormalized,
        byType: {
          initiatives: 0, // Initiatives removed from system
          products: result.normalization.stats.byType.products,
          services: result.normalization.stats.byType.services,
        },
        confidence: result.summary.overallConfidence,
        processingTime: result.summary.totalProcessingTime,
      },
      parsing: result.parsing.results.map(r => ({
        fileName: r.fileName,
        source: r.source,
        success: r.success,
        itemCount: r.items.length,
        confidence: r.confidence,
        notes: r.notes,
      })),
      errors: result.errors,
      warnings: result.warnings,
    });

  } catch (error) {
    console.error('❌ Ingestion error:', error);
    res.status(500).json({
      error: 'Errore durante l\'ingestion dei dati',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/portfolio/ingest/text
 * Simplified text-only ingestion endpoint
 */
router.post('/ingest/text', async (req: Request, res: Response) => {
  console.log('📝 POST /api/portfolio/ingest/text');
  
  try {
    const { tenantId, text, userContext } = req.body;

    if (!tenantId) {
      return res.status(400).json({ error: 'tenantId è richiesto' });
    }

    const safeTenantId = normalizeTenantId(tenantId);
    if (safeTenantId !== tenantId) {
      console.warn(`[Ingest] Invalid tenantId provided: "${tenantId}" - using system catalog fallback`);
    }

    if (!text || typeof text !== 'string' || text.trim().length < 10) {
      return res.status(400).json({ error: 'Testo valido richiesto (minimo 10 caratteri)' });
    }

    const result = await ingestText(text, safeTenantId, userContext);

    if (safeTenantId !== tenantId) {
      result.warnings = result.warnings || [];
      result.warnings.push('Invalid tenantId provided; using system catalog fallback');
    }

    res.json({
      success: result.success,
      requestId: result.requestId,
      items: result.normalization.items,
      stats: {
        totalExtracted: result.summary.totalItemsExtracted,
        totalNormalized: result.summary.totalItemsNormalized,
        byType: result.normalization.stats.byType,
        confidence: result.summary.overallConfidence,
      },
      errors: result.errors,
      warnings: result.warnings,
    });

  } catch (error) {
    console.error('❌ Text ingestion error:', error);
    res.status(500).json({
      error: 'Errore durante l\'ingestion del testo',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/portfolio/ingest/save
 * Save ingested and validated items to portfolio
 * Also records corrections for continuous learning
 *
 * Body:
 * - tenantId: string (required)
 * - items: array of confirmed items (required)
 * - originalItems: array of original extracted items (optional, for learning)
 * - batchId: string (optional, for metrics tracking)
 */
router.post('/ingest/save', async (req: Request, res: Response) => {
  console.log('💾 POST /api/portfolio/ingest/save');
  const startTime = Date.now();

  try {
    const { tenantId, items, originalItems, batchId } = req.body;

    if (!tenantId) {
      return res.status(400).json({ error: 'tenantId è richiesto' });
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'items array non valido' });
    }

    // ========================================================================
    // CONTINUOUS LEARNING: Record corrections before saving
    // ========================================================================
    let correctionsRecorded = 0;
    let learningTriggered = false;
    let ragTrainingTriggered = false;

    if (originalItems && Array.isArray(originalItems) && originalItems.length > 0) {
      console.log(`\n📝 Recording corrections for continuous learning...`);
      const learningService = new LearningService();
      const ragTrainingService = getRAGTrainingService();

      for (let i = 0; i < Math.min(items.length, originalItems.length); i++) {
        const original = originalItems[i];
        const corrected = items[i];

        // Skip if IDs don't match (items might be reordered)
        if (original.id && corrected.id && original.id !== corrected.id) {
          // Try to find matching item by ID
          const matchingOriginal = originalItems.find(o => o.id === corrected.id);
          if (matchingOriginal) {
            const result = await learningService.recordCorrection(
              tenantId,
              matchingOriginal,
              corrected,
              'user_save',
              { batchId }
            );
            if (result.fieldsChanged > 0) {
              correctionsRecorded++;
              // Trigger RAG training for this correction
              try {
                await ragTrainingService.onUserCorrection(
                  tenantId,
                  { id: matchingOriginal.id || '', name: matchingOriginal.name || '', type: matchingOriginal.type || 'product', ...matchingOriginal },
                  { id: corrected.id || '', name: corrected.name || '', type: corrected.type || 'product', ...corrected },
                  'user_save_correction'
                );
                ragTrainingTriggered = true;
              } catch (ragErr) {
                console.warn('[RAGTraining] Error during correction training:', ragErr);
              }
            }
            if (result.learningTriggered) learningTriggered = true;
          }
        } else {
          // Items are in order, compare directly
          const result = await learningService.recordCorrection(
            tenantId,
            original,
            corrected,
            'user_save',
            { batchId }
          );
          if (result.fieldsChanged > 0) {
            correctionsRecorded++;
            // Trigger RAG training for this correction
            try {
              await ragTrainingService.onUserCorrection(
                tenantId,
                { id: original.id || '', name: original.name || '', type: original.type || 'product', ...original },
                { id: corrected.id || '', name: corrected.name || '', type: corrected.type || 'product', ...corrected },
                'user_save_correction'
              );
              ragTrainingTriggered = true;
            } catch (ragErr) {
              console.warn('[RAGTraining] Error during correction training:', ragErr);
            }
          }
          if (result.learningTriggered) learningTriggered = true;
        }
      }

      console.log(`   📊 Corrections recorded: ${correctionsRecorded}`);
      if (learningTriggered) {
        console.log(`   🎓 Learning was triggered!`);
      }
      if (ragTrainingTriggered) {
        console.log(`   🧠 RAG training was triggered!`);
      }
    }

    // ========================================================================
    // SAVE ITEMS TO DATABASE
    // ========================================================================

    // Group items by type
    const grouped: Record<string, PortfolioItem[]> = {
      products: [],
      services: [],
    };

    for (const item of items) {
      const type = item.type || 'product';
      const group = type === 'product' ? 'products' : 'services';

      grouped[group].push({
        ...item,
        id: item.id || uuidv4(),
        createdAt: new Date().toISOString(),
      });
    }

    // Save each group
    const results: Record<string, number> = {};

    for (const [groupType, groupItems] of Object.entries(grouped)) {
      if (groupItems.length > 0) {
        const saved = await savePortfolioItems(
          groupItems,
          tenantId,
          groupType as 'products' | 'services'
        );
        results[groupType] = saved?.length || 0;
      }
    }

    const totalSaved = Object.values(results).reduce((sum, n) => sum + n, 0);

    // ========================================================================
    // RECORD METRICS
    // ========================================================================
    if (originalItems && Array.isArray(originalItems) && originalItems.length > 0) {
      const metricsService = new MetricsService();
      await metricsService.recordSaveMetrics(
        tenantId,
        batchId || `save-${Date.now()}`,
        originalItems,
        items,
        Date.now() - startTime
      );
    }

    console.log(`✅ Saved ${totalSaved} ingested items`);

    res.json({
      success: true,
      totalSaved,
      byType: results,
      learning: {
        correctionsRecorded,
        learningTriggered,
        ragTrainingTriggered,
      },
    });

  } catch (error) {
    console.error('❌ Save ingested items error:', error);
    res.status(500).json({
      error: 'Errore durante il salvataggio degli items',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ============================================================================
// PORTFOLIO HEALTH ANALYSIS
// ============================================================================

/**
 * GET /api/portfolio/health/:tenantId
 * Get portfolio health score and recommendations
 */
router.get('/health/:tenantId', async (req: Request, res: Response) => {
  console.log('📊 GET /api/portfolio/health');

  try {
    const { tenantId } = req.params;

    if (!tenantId) {
      return res.status(400).json({ error: 'tenantId è richiesto' });
    }

    const safeTenantId = normalizeTenantId(tenantId);

    // Get portfolio items (both products and services)
    const [products, services] = await Promise.all([
      getPortfolioItems(safeTenantId, 'products'),
      getPortfolioItems(safeTenantId, 'services'),
    ]);

    // Combine and type-annotate items
    const items = [
      ...(products || []).map(p => ({ ...p, type: 'product' as const })),
      ...(services || []).map(s => ({ ...s, type: 'service' as const })),
    ];

    if (items.length === 0) {
      return res.json({
        success: true,
        message: 'No portfolio items found',
        overallScore: 0,
        overallStatus: 'warning',
        dimensions: {},
        topRecommendations: [{
          id: 'add-items',
          priority: 'high',
          category: 'Coverage',
          title: 'Add portfolio items',
          description: 'Start by importing your IT products and services to get a health analysis.',
          impact: 'Enable portfolio health monitoring',
          effort: 'low',
        }],
        summary: {
          totalItems: 0,
          products: 0,
          services: 0,
          totalBudget: 0,
          avgStrategicAlignment: 0,
        },
      });
    }

    // Get maturity profile if available (optional)
    let maturityProfile;
    try {
      const { data: assessment } = await supabase
        .from('assessments')
        .select('analysis')
        .eq('company_id', safeTenantId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (assessment?.analysis) {
        maturityProfile = assessment.analysis;
      }
    } catch {
      // No maturity profile available, continue without it
    }

    // Analyze health (cast items to the expected type)
    const healthReport = await analyzePortfolioHealth(
      safeTenantId,
      items as Parameters<typeof analyzePortfolioHealth>[1],
      maturityProfile
    );

    res.json({
      success: true,
      ...healthReport,
    });

  } catch (error) {
    console.error('❌ Portfolio health error:', error);
    res.status(500).json({
      error: 'Failed to analyze portfolio health',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/portfolio/dependencies/:tenantId
 * Get dependency graph for portfolio
 */
router.get('/dependencies/:tenantId', async (req: Request, res: Response) => {
  console.log('🔗 GET /api/portfolio/dependencies');

  try {
    const { tenantId } = req.params;

    if (!tenantId) {
      return res.status(400).json({ error: 'tenantId è richiesto' });
    }

    const safeTenantId = normalizeTenantId(tenantId);

    // Get portfolio items (both products and services)
    const [products, services] = await Promise.all([
      getPortfolioItems(safeTenantId, 'products'),
      getPortfolioItems(safeTenantId, 'services'),
    ]);

    // Combine and type-annotate items
    const items = [
      ...(products || []).map(p => ({ ...p, type: 'product' as const })),
      ...(services || []).map(s => ({ ...s, type: 'service' as const })),
    ];

    if (items.length === 0) {
      return res.json({
        success: true,
        message: 'No portfolio items found',
        graph: { nodes: [], edges: [], clusters: [] },
        mermaidCode: 'flowchart LR\n    empty[No items]',
        conflictCount: 0,
        conflicts: [],
        stats: {
          totalConnections: 0,
          avgConnectionsPerNode: 0,
          mostConnectedNodes: [],
          isolatedNodes: [],
          byType: {},
          byDetectionMethod: {},
        },
      });
    }

    // Analyze dependencies
    const graph = await analyzeDependencies(items as Parameters<typeof analyzeDependencies>[0]);
    const mermaidCode = generateMermaidDiagram(graph);
    const conflicts = detectConflicts(graph);
    const stats = getDependencyStats(graph);

    res.json({
      success: true,
      graph,
      mermaidCode,
      conflictCount: conflicts.length,
      conflicts,
      stats,
    });

  } catch (error) {
    console.error('❌ Dependency analysis error:', error);
    res.status(500).json({
      error: 'Failed to analyze dependencies',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ============================================================================
// CONTINUOUS LEARNING ENDPOINTS
// ============================================================================

/**
 * GET /api/portfolio/learning-stats
 * Get learning statistics for current tenant
 */
router.get('/learning-stats/:tenantId', async (req: Request, res: Response) => {
  console.log('📊 GET /api/portfolio/learning-stats');

  try {
    const { tenantId } = req.params;

    if (!tenantId) {
      return res.status(400).json({ error: 'tenantId è richiesto' });
    }

    const safeTenantId = normalizeTenantId(tenantId);
    const learningService = new LearningService();
    const metricsService = new MetricsService();

    // Get learning stats
    const learningStats = await learningService.getLearningStats(safeTenantId);
    const metricsSummary = await metricsService.getMetricsSummary(safeTenantId);
    const metricsTrend = await metricsService.getMetricsTrend(safeTenantId, 30);

    res.json({
      success: true,
      learning: learningStats,
      metrics: metricsSummary,
      trend: metricsTrend,
    });

  } catch (error) {
    console.error('❌ Learning stats error:', error);
    res.status(500).json({
      error: 'Failed to get learning stats',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/portfolio/feedback
 * Record explicit user feedback/corrections for learning
 */
router.post('/feedback', async (req: Request, res: Response) => {
  console.log('📝 POST /api/portfolio/feedback');

  try {
    const { tenantId, itemId, itemType, corrections } = req.body;

    if (!tenantId) {
      return res.status(400).json({ error: 'tenantId è richiesto' });
    }

    if (!corrections || !Array.isArray(corrections) || corrections.length === 0) {
      return res.status(400).json({ error: 'corrections array è richiesto' });
    }

    const safeTenantId = normalizeTenantId(tenantId);
    const learningService = new LearningService();
    const ragTrainingService = getRAGTrainingService();

    const results = [];
    let patternsCreated = 0;
    let ragTrainingTriggered = false;

    for (const correction of corrections) {
      // Build original and corrected items from the correction
      const originalItem: Record<string, unknown> = {};
      const correctedItem: Record<string, unknown> = {};

      if (correction.field && correction.original !== undefined && correction.corrected !== undefined) {
        originalItem[correction.field] = correction.original;
        correctedItem[correction.field] = correction.corrected;

        // If we have itemId, add it to both items
        if (itemId) {
          originalItem.id = itemId;
          correctedItem.id = itemId;
        }

        const result = await learningService.recordCorrection(
          safeTenantId,
          originalItem,
          correctedItem,
          correction.context?.documentType,
          correction.context
        );

        results.push(result);

        if (result.learningTriggered) {
          patternsCreated++;
        }

        // Trigger RAG training for this correction
        if (result.fieldsChanged > 0) {
          try {
            await ragTrainingService.onUserCorrection(
              safeTenantId,
              { id: itemId || '', name: originalItem.name as string || '', type: itemType || 'product', ...originalItem },
              { id: itemId || '', name: correctedItem.name as string || '', type: itemType || 'product', ...correctedItem },
              `feedback_${correction.field}`
            );
            ragTrainingTriggered = true;
          } catch (ragErr) {
            console.warn('[RAGTraining] Error during feedback training:', ragErr);
          }
        }
      }
    }

    const correctionsRecorded = results.filter(r => r.correctionId).length;

    res.json({
      success: true,
      correctionsRecorded,
      patternsCreated,
      ragTrainingTriggered,
      message: patternsCreated > 0
        ? `Learned ${patternsCreated} new pattern(s) from your corrections!`
        : correctionsRecorded > 0
        ? 'Corrections recorded for future learning.'
        : 'No corrections to record.',
    });

  } catch (error) {
    console.error('❌ Feedback error:', error);
    res.status(500).json({
      error: 'Failed to record feedback',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/portfolio/rag-training/stats/:tenantId
 * Get RAG training statistics for a tenant
 */
router.get('/rag-training/stats/:tenantId', async (req: Request, res: Response) => {
  console.log('📊 GET /api/portfolio/rag-training/stats');

  try {
    const { tenantId } = req.params;

    if (!tenantId) {
      return res.status(400).json({ error: 'tenantId è richiesto' });
    }

    const safeTenantId = normalizeTenantId(tenantId);
    const ragTrainingService = getRAGTrainingService();

    const stats = await ragTrainingService.getTrainingStats(safeTenantId);

    res.json({
      success: true,
      stats,
    });

  } catch (error) {
    console.error('❌ RAG training stats error:', error);
    res.status(500).json({
      error: 'Failed to get RAG training stats',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/portfolio/rag-training/trigger/:tenantId
 * Manually trigger RAG training for a tenant
 */
router.post('/rag-training/trigger/:tenantId', async (req: Request, res: Response) => {
  console.log('🧠 POST /api/portfolio/rag-training/trigger');

  try {
    const { tenantId } = req.params;

    if (!tenantId) {
      return res.status(400).json({ error: 'tenantId è richiesto' });
    }

    const safeTenantId = normalizeTenantId(tenantId);
    const ragTrainingService = getRAGTrainingService();

    await ragTrainingService.triggerManualTraining(safeTenantId);

    const stats = await ragTrainingService.getTrainingStats(safeTenantId);

    res.json({
      success: true,
      message: 'RAG training triggered successfully',
      stats,
    });

  } catch (error) {
    console.error('❌ RAG training trigger error:', error);
    res.status(500).json({
      error: 'Failed to trigger RAG training',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/portfolio/learning/trigger
 * Manually trigger learning for a tenant
 */
router.post('/learning/trigger/:tenantId', async (req: Request, res: Response) => {
  console.log('🎓 POST /api/portfolio/learning/trigger');

  try {
    const { tenantId } = req.params;

    if (!tenantId) {
      return res.status(400).json({ error: 'tenantId è richiesto' });
    }

    const safeTenantId = normalizeTenantId(tenantId);
    const learningService = new LearningService();

    const result = await learningService.triggerLearning(safeTenantId);

    res.json({
      success: true,
      ...result,
      message: `Created ${result.rulesCreated} new rules, updated ${result.rulesUpdated} existing rules.`,
    });

  } catch (error) {
    console.error('❌ Learning trigger error:', error);
    res.status(500).json({
      error: 'Failed to trigger learning',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/portfolio/learning/rules/:tenantId
 * Get all learned rules for a tenant
 */
router.get('/learning/rules/:tenantId', async (req: Request, res: Response) => {
  console.log('📜 GET /api/portfolio/learning/rules');

  try {
    const { tenantId } = req.params;

    if (!tenantId) {
      return res.status(400).json({ error: 'tenantId è richiesto' });
    }

    const safeTenantId = normalizeTenantId(tenantId);
    const learningService = new LearningService();

    const rules = await learningService.getLearnedRules(safeTenantId);

    res.json({
      success: true,
      rules,
      count: rules.length,
    });

  } catch (error) {
    console.error('❌ Get rules error:', error);
    res.status(500).json({
      error: 'Failed to get learned rules',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ============================================================================
// HITL (Human-in-the-Loop) BULK CONFIRM ENDPOINTS
// ============================================================================

/**
 * GET /api/portfolio/ingest/hitl/:sessionId/confidence-distribution
 * Get confidence distribution for a HITL session
 */
router.get('/ingest/hitl/:sessionId/confidence-distribution', async (req: Request, res: Response) => {
  console.log('📊 GET /api/portfolio/ingest/hitl/confidence-distribution');

  try {
    const { sessionId } = req.params;

    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId è richiesto' });
    }

    const distribution = hitlIngestionService.getConfidenceDistribution(sessionId);

    if (!distribution) {
      return res.status(404).json({ error: 'Sessione HITL non trovata' });
    }

    res.json({
      success: true,
      sessionId,
      distribution,
      thresholds: {
        low: { min: 0, max: 0.6, label: 'Low Confidence' },
        medium: { min: 0.6, max: 0.8, label: 'Medium Confidence' },
        high: { min: 0.8, max: 1.0, label: 'High Confidence' },
      },
    });

  } catch (error) {
    console.error('❌ Confidence distribution error:', error);
    res.status(500).json({
      error: 'Errore nel recupero della distribuzione confidence',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/portfolio/ingest/hitl/:sessionId/bulk-confirm
 * Bulk confirm items above a confidence threshold
 */
router.post('/ingest/hitl/:sessionId/bulk-confirm', async (req: Request, res: Response) => {
  console.log('✅ POST /api/portfolio/ingest/hitl/bulk-confirm');

  try {
    const { sessionId } = req.params;
    const { minConfidence = 0.8 } = req.body;

    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId è richiesto' });
    }

    const result = hitlIngestionService.bulkConfirmByConfidence(sessionId, minConfidence);

    if (!result) {
      return res.status(404).json({ error: 'Sessione HITL non trovata' });
    }

    console.log(`   ✅ Bulk confirmed ${result.confirmed.length} items (confidence >= ${minConfidence})`);
    console.log(`   ⏳ ${result.remaining.length} items remaining for review`);

    res.json({
      success: true,
      sessionId,
      minConfidence,
      confirmed: {
        count: result.confirmed.length,
        items: result.confirmed.map((item: { id: string; name: string; type: string; confidence: number }) => ({
          id: item.id,
          name: item.name,
          type: item.type,
          confidence: item.confidence,
        })),
      },
      remaining: {
        count: result.remaining.length,
        items: result.remaining.map((item: { id: string; name: string; type: string; confidence: number }) => ({
          id: item.id,
          name: item.name,
          type: item.type,
          confidence: item.confidence,
        })),
      },
    });

  } catch (error) {
    console.error('❌ Bulk confirm error:', error);
    res.status(500).json({
      error: 'Errore nella conferma bulk',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/portfolio/ingest/hitl/:sessionId/confirm-all
 * Confirm all remaining items with learned patterns applied
 */
router.post('/ingest/hitl/:sessionId/confirm-all', async (req: Request, res: Response) => {
  console.log('✅ POST /api/portfolio/ingest/hitl/confirm-all');

  try {
    const { sessionId } = req.params;

    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId è richiesto' });
    }

    const confirmedItems = hitlIngestionService.confirmAllRemaining(sessionId);

    if (!confirmedItems) {
      return res.status(404).json({ error: 'Sessione HITL non trovata' });
    }

    console.log(`   ✅ Confirmed all ${confirmedItems.length} remaining items`);

    res.json({
      success: true,
      sessionId,
      confirmed: {
        count: confirmedItems.length,
        items: confirmedItems.map((item: { id: string; name: string; type: string; confidence: number }) => ({
          id: item.id,
          name: item.name,
          type: item.type,
          confidence: item.confidence,
        })),
      },
    });

  } catch (error) {
    console.error('❌ Confirm all error:', error);
    res.status(500).json({
      error: 'Errore nella conferma di tutti gli items',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/portfolio/ingest/hitl/:sessionId/sample
 * Get a representative sample for HITL review
 */
router.get('/ingest/hitl/:sessionId/sample', async (req: Request, res: Response) => {
  console.log('🎯 GET /api/portfolio/ingest/hitl/sample');

  try {
    const { sessionId } = req.params;
    const sampleSize = parseInt(req.query.size as string) || 15;

    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId è richiesto' });
    }

    const session = hitlIngestionService.getSession(sessionId);

    if (!session) {
      return res.status(404).json({ error: 'Sessione HITL non trovata' });
    }

    // Get pending items
    const pendingItems = session.pendingItems;

    // Use selectRepresentativeSample
    const { sample, remaining } = hitlIngestionService.selectRepresentativeSample(
      pendingItems,
      Math.min(sampleSize, pendingItems.length)
    );

    res.json({
      success: true,
      sessionId,
      sample: {
        count: sample.length,
        items: sample,
      },
      remaining: {
        count: remaining.length,
      },
      totalPending: pendingItems.length,
      confidenceDistribution: hitlIngestionService.getConfidenceDistribution(sessionId),
    });

  } catch (error) {
    console.error('❌ Sample error:', error);
    res.status(500).json({
      error: 'Errore nel recupero del campione',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ============================================================================
// CATALOG PRIORITIZATION ENDPOINTS
// ============================================================================

/**
 * POST /api/portfolio/prioritize-catalog
 * Run catalog prioritization with multi-framework scoring
 */
router.post('/prioritize-catalog', async (req: Request, res: Response) => {
  console.log('🎯 POST /api/portfolio/prioritize-catalog');

  try {
    const { tenantId, companyId, portfolioType = 'mixed', customWeights, strategicFocus } = req.body;

    if (!tenantId) {
      return res.status(400).json({ error: 'tenantId è richiesto' });
    }

    const safeTenantId = normalizeTenantId(tenantId);

    console.log(`🔍 Running catalog prioritization for tenant ${safeTenantId}`);

    const result = await catalogPrioritizationAgent.run({
      tenantId: safeTenantId,
      companyId,
      portfolioType,
      customWeights,
      strategicFocus,
    });

    if (result.metadata?.error) {
      return res.status(400).json({
        success: false,
        error: result.metadata.error,
      });
    }

    const data = JSON.parse(result.content);

    res.json({
      success: true,
      data,
      prioritizationId: result.metadata?.prioritizationId,
    });

  } catch (error) {
    console.error('❌ Catalog prioritization error:', error);
    res.status(500).json({
      error: 'Errore durante la prioritizzazione del catalogo',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/portfolio/prioritization/latest/:tenantId
 * Get latest catalog prioritization for tenant
 */
router.get('/prioritization/latest/:tenantId', async (req: Request, res: Response) => {
  console.log('📊 GET /api/portfolio/prioritization/latest');

  try {
    const { tenantId } = req.params;

    if (!tenantId) {
      return res.status(400).json({ error: 'tenantId è richiesto' });
    }

    const safeTenantId = normalizeTenantId(tenantId);

    const { data, error } = await supabase
      .from('catalog_prioritizations')
      .select('*')
      .eq('tenant_id', safeTenantId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error || !data) {
      return res.status(404).json({
        success: false,
        error: 'Nessuna prioritizzazione trovata',
      });
    }

    res.json({
      success: true,
      data: data.result,
      prioritizationId: data.prioritization_id,
      createdAt: data.created_at,
    });

  } catch (error) {
    console.error('❌ Get prioritization error:', error);
    res.status(500).json({
      error: 'Errore nel recupero della prioritizzazione',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/portfolio/prioritization/:prioritizationId
 * Get specific catalog prioritization by ID
 */
router.get('/prioritization/:prioritizationId', async (req: Request, res: Response) => {
  console.log('📊 GET /api/portfolio/prioritization/:id');

  try {
    const { prioritizationId } = req.params;

    if (!prioritizationId) {
      return res.status(400).json({ error: 'prioritizationId è richiesto' });
    }

    const { data, error } = await supabase
      .from('catalog_prioritizations')
      .select('*')
      .eq('prioritization_id', prioritizationId)
      .single();

    if (error || !data) {
      return res.status(404).json({
        success: false,
        error: 'Prioritizzazione non trovata',
      });
    }

    res.json({
      success: true,
      data: data.result,
      prioritizationId: data.prioritization_id,
      createdAt: data.created_at,
    });

  } catch (error) {
    console.error('❌ Get prioritization error:', error);
    res.status(500).json({
      error: 'Errore nel recupero della prioritizzazione',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
