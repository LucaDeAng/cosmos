import express from 'express';
import request from 'supertest';
import path from 'path';
import fs from 'fs';

// Mock authenticate middleware
jest.mock('../src/middleware/auth.middleware', () => ({
  authenticate: (req: any, res: any, next: any) => {
    req.user = { userId: 'test-user-id' };
    next();
  },
}));

// Mock Supabase client
const mockFrom = jest.fn();
const mockSupabase = {
  from: mockFrom,
};

jest.mock('../src/config/supabase', () => ({
  supabase: mockSupabase,
}));

// Mock enhanced ingestion orchestrator
const mockIngestDataEnhanced = jest.fn();
const mockProcessBatchLearning = jest.fn();

jest.mock('../src/agents/subagents/enhancedIngestionOrchestrator', () => ({
  ingestDataEnhanced: mockIngestDataEnhanced,
  processBatchLearning: mockProcessBatchLearning,
}));

// Mock document pre-processor
const mockPreprocessDocuments = jest.fn();

jest.mock('../src/services/ingestion/documentPreProcessor', () => ({
  preprocessDocuments: mockPreprocessDocuments,
}));

// Mock tenant utility
jest.mock('../src/utils/tenant', () => ({
  normalizeTenantId: (tenantId: string) => tenantId, // Pass through without validation
  isValidTenantId: () => true,
}));

// Mock confidence metrics service
const mockGetConfidenceDashboard = jest.fn();
const mockGetConfidenceTrends = jest.fn();
const mockGetSourcePerformance = jest.fn();

class MockConfidenceMetricsService {
  getConfidenceDashboard = mockGetConfidenceDashboard;
  getConfidenceTrends = mockGetConfidenceTrends;
  getSourcePerformance = mockGetSourcePerformance;
}

jest.mock('../src/services/confidenceMetricsService', () => ({
  ConfidenceMetricsService: MockConfidenceMetricsService,
}));

describe('Enhanced Ingestion Routes', () => {
  let app: express.Express;

  beforeEach(() => {
    jest.resetAllMocks();
    app = express();
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    // Import router dynamically to ensure mocks apply
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const enhancedIngestionRouter = require('../src/routes/enhanced-ingestion.routes').default;
    app.use('/api/ingestion', enhancedIngestionRouter);
  });

  describe('POST /api/ingestion/enhanced', () => {
    it('should process enhanced ingestion with files successfully', async () => {
      // Mock successful enhanced ingestion result
      mockIngestDataEnhanced.mockResolvedValue({
        success: true,
        requestId: 'test-request-123',
        summary: {
          filesProcessed: 1,
          textProcessed: false,
          totalItemsExtracted: 10,
          totalItemsNormalized: 10,
          overallConfidence: 0.85,
          totalProcessingTime: 1500,
        },
        parsing: {
          results: [],
          totalRawItems: 10,
          totalProcessingTime: 500,
        },
        normalization: {
          items: [
            {
              id: 'item-1',
              name: 'Test Product',
              type: 'product',
              confidence: 0.85,
            },
          ],
          stats: {
            totalInput: 10,
            totalNormalized: 10,
            byType: { products: 8, services: 2 },
            avgConfidence: 0.85,
          },
          processingTime: 1000,
        },
        preProcessing: {
          results: [],
          relationships: [],
          summary: {
            totalDocuments: 1,
            documentsWithTables: 1,
            documentsWithClearStructure: 1,
          },
        },
        crossItemValidation: {
          valid: true,
          relationshipsDetected: 2,
          inconsistenciesFound: 0,
          duplicatesFound: 0,
        },
        confidenceMetrics: {
          avgOverallConfidence: 0.85,
          lowConfidenceItems: 1,
          qualityGateViolations: 0,
        },
        errors: [],
        warnings: [],
      });

      // Create a temporary test file
      const testFilePath = path.join(__dirname, 'test-file.xlsx');
      fs.writeFileSync(testFilePath, 'test content');

      const res = await request(app)
        .post('/api/ingestion/enhanced')
        .field('tenantId', '550e8400-e29b-41d4-a716-446655440000')
        .field('language', 'it')
        .attach('files', testFilePath)
        .expect(200);

      expect(res.body).toHaveProperty('success', true);
      expect(res.body.data).toHaveProperty('requestId', 'test-request-123');
      expect(res.body.data.summary.totalItemsNormalized).toBe(10);
      expect(res.body.data.normalization.itemCount).toBe(1);
      expect(res.body.data.preProcessing.documentsAnalyzed).toBe(1);
      expect(res.body.data.crossItemValidation.valid).toBe(true);
      expect(res.body.data.confidenceMetrics.avgOverallConfidence).toBe(0.85);

      // Verify the orchestrator was called with correct input
      expect(mockIngestDataEnhanced).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: '550e8400-e29b-41d4-a716-446655440000',
          language: 'it',
          enablePreProcessing: true,
          enableCrossItemValidation: true,
          enableConfidenceTracking: true,
        })
      );

      // Cleanup
      fs.unlinkSync(testFilePath);
    });

    it('should return 400 if tenantId is missing', async () => {
      const res = await request(app)
        .post('/api/ingestion/enhanced')
        .send({})
        .expect(400);

      expect(res.body).toHaveProperty('error', 'tenantId is required');
    });

    it('should return 400 if no files are uploaded', async () => {
      const res = await request(app)
        .post('/api/ingestion/enhanced')
        .field('tenantId', '550e8400-e29b-41d4-a716-446655440000')
        .expect(400);

      expect(res.body).toHaveProperty('error', 'At least one file is required');
    });

    it('should handle enhanced ingestion errors', async () => {
      mockIngestDataEnhanced.mockRejectedValue(new Error('Ingestion failed'));

      const testFilePath = path.join(__dirname, 'test-file.xlsx');
      fs.writeFileSync(testFilePath, 'test content');

      const res = await request(app)
        .post('/api/ingestion/enhanced')
        .field('tenantId', '550e8400-e29b-41d4-a716-446655440000')
        .attach('files', testFilePath)
        .expect(500);

      expect(res.body).toHaveProperty('error', 'Enhanced ingestion failed');
      expect(res.body).toHaveProperty('message', 'Ingestion failed');

      fs.unlinkSync(testFilePath);
    });
  });

  describe('POST /api/ingestion/preprocess', () => {
    it('should preprocess documents successfully', async () => {
      mockPreprocessDocuments.mockResolvedValue({
        results: [
          {
            documentId: 'doc-1',
            filename: 'test.pdf',
            layout: {
              orientation: 'portrait',
              columnLayout: 'single',
              hasVisualElements: true,
            },
            sections: [
              {
                id: 'section-1',
                type: 'body',
                title: 'Main Content',
                content: 'Test content',
                pageRange: { start: 1, end: 2 },
              },
            ],
            extractionPlan: {
              strategy: 'table_focused',
              reasoning: 'Document contains structured tables',
              targetSections: ['section-1'],
            },
          },
        ],
        relationships: [],
        summary: {
          totalDocuments: 1,
          documentsWithTables: 1,
          documentsWithClearStructure: 1,
        },
      });

      const testFilePath = path.join(__dirname, 'test-file.pdf');
      fs.writeFileSync(testFilePath, 'test content');

      const res = await request(app)
        .post('/api/ingestion/preprocess')
        .field('tenantId', '550e8400-e29b-41d4-a716-446655440000')
        .attach('files', testFilePath)
        .expect(200);

      expect(res.body).toHaveProperty('success', true);
      expect(res.body.data.results).toHaveLength(1);
      expect(res.body.data.results[0].documentId).toBe('doc-1');
      expect(res.body.data.results[0].sectionCount).toBe(1);
      expect(res.body.data.summary.documentsWithTables).toBe(1);

      fs.unlinkSync(testFilePath);
    });

    it('should return 400 if tenantId is missing', async () => {
      const res = await request(app)
        .post('/api/ingestion/preprocess')
        .send({})
        .expect(400);

      expect(res.body).toHaveProperty('error', 'tenantId is required');
    });

    it('should return 400 if no files are uploaded', async () => {
      const res = await request(app)
        .post('/api/ingestion/preprocess')
        .field('tenantId', '550e8400-e29b-41d4-a716-446655440000')
        .expect(400);

      expect(res.body).toHaveProperty('error', 'At least one file is required');
    });
  });

  describe('POST /api/ingestion/batch-learning', () => {
    it('should process batch learning successfully', async () => {
      mockProcessBatchLearning.mockResolvedValue(undefined);

      const originalItems = [
        {
          id: 'item-1',
          name: 'Original Product',
          type: 'product',
          confidence: 0.6,
        },
      ];

      const correctedItems = [
        {
          id: 'item-1',
          name: 'Corrected Product Name',
          type: 'product',
          confidence: 0.9,
        },
      ];

      const res = await request(app)
        .post('/api/ingestion/batch-learning')
        .send({
          tenantId: '550e8400-e29b-41d4-a716-446655440000',
          batchId: 'batch-456',
          originalItems,
          correctedItems,
        })
        .expect(200);

      expect(res.body).toHaveProperty('success', true);
      expect(res.body).toHaveProperty('message', 'Batch learning completed');

      expect(mockProcessBatchLearning).toHaveBeenCalledWith(
        '550e8400-e29b-41d4-a716-446655440000',
        'batch-456',
        originalItems,
        correctedItems
      );
    });

    it('should return 400 if required parameters are missing', async () => {
      const res = await request(app)
        .post('/api/ingestion/batch-learning')
        .send({ tenantId: '550e8400-e29b-41d4-a716-446655440000' })
        .expect(400);

      expect(res.body).toHaveProperty('error');
      expect(res.body.error).toContain('required');
    });

    it('should handle batch learning errors', async () => {
      mockProcessBatchLearning.mockRejectedValue(new Error('Learning failed'));

      const res = await request(app)
        .post('/api/ingestion/batch-learning')
        .send({
          tenantId: '550e8400-e29b-41d4-a716-446655440000',
          batchId: 'batch-456',
          originalItems: [],
          correctedItems: [],
        })
        .expect(500);

      expect(res.body).toHaveProperty('error', 'Batch learning failed');
      expect(res.body).toHaveProperty('message', 'Learning failed');
    });
  });

  describe('GET /api/ingestion/confidence-dashboard/:tenantId', () => {
    it('should return confidence dashboard data', async () => {
      mockGetConfidenceDashboard.mockResolvedValue({
        overallStats: {
          avgConfidence: 0.82,
          totalItems: 100,
          lowConfidenceItems: 15,
          qualityGateViolations: 3,
        },
        fieldStats: [
          {
            fieldName: 'name',
            avgConfidence: 0.9,
            lowConfidenceCount: 5,
          },
          {
            fieldName: 'category',
            avgConfidence: 0.75,
            lowConfidenceCount: 10,
          },
        ],
        sourcePerformance: [
          {
            source: 'icecat',
            avgConfidence: 0.88,
            usageCount: 50,
          },
        ],
        recentAlerts: [],
      });

      const res = await request(app)
        .get('/api/ingestion/confidence-dashboard/550e8400-e29b-41d4-a716-446655440000')
        .query({ days: '30' })
        .expect(200);

      expect(res.body).toHaveProperty('success', true);
      expect(res.body.data.overallStats.avgConfidence).toBe(0.82);
      expect(res.body.data.overallStats.totalItems).toBe(100);
      expect(res.body.data.fieldStats).toHaveLength(2);

      expect(mockGetConfidenceDashboard).toHaveBeenCalledWith('550e8400-e29b-41d4-a716-446655440000', 30);
    });

    it('should handle dashboard errors', async () => {
      mockGetConfidenceDashboard.mockRejectedValue(new Error('Dashboard failed'));

      const res = await request(app)
        .get('/api/ingestion/confidence-dashboard/550e8400-e29b-41d4-a716-446655440000')
        .expect(500);

      expect(res.body).toHaveProperty('error', 'Failed to get confidence dashboard');
    });
  });

  describe('GET /api/ingestion/confidence-trends/:tenantId', () => {
    it('should return confidence trends', async () => {
      mockGetConfidenceTrends.mockResolvedValue({
        daily: [
          {
            date: '2026-01-01',
            avgConfidence: 0.8,
            itemCount: 10,
          },
          {
            date: '2026-01-02',
            avgConfidence: 0.85,
            itemCount: 12,
          },
        ],
        trend: 'improving',
        changePercent: 6.25,
      });

      const res = await request(app)
        .get('/api/ingestion/confidence-trends/550e8400-e29b-41d4-a716-446655440000')
        .query({ days: '7' })
        .expect(200);

      expect(res.body).toHaveProperty('success', true);
      expect(res.body.data.daily).toHaveLength(2);
      expect(res.body.data.trend).toBe('improving');
      expect(res.body.data.changePercent).toBe(6.25);

      expect(mockGetConfidenceTrends).toHaveBeenCalledWith('550e8400-e29b-41d4-a716-446655440000', 7);
    });
  });

  describe('GET /api/ingestion/source-performance/:tenantId', () => {
    it('should return source performance metrics', async () => {
      mockGetSourcePerformance.mockResolvedValue({
        sources: [
          {
            name: 'icecat',
            avgConfidence: 0.88,
            usageCount: 50,
            successRate: 0.92,
            avgResponseTime: 850,
          },
          {
            name: 'open_food_facts',
            avgConfidence: 0.85,
            usageCount: 30,
            successRate: 0.88,
            avgResponseTime: 920,
          },
        ],
        summary: {
          totalSources: 2,
          avgConfidence: 0.865,
          totalEnrichments: 80,
        },
      });

      const res = await request(app)
        .get('/api/ingestion/source-performance/550e8400-e29b-41d4-a716-446655440000')
        .expect(200);

      expect(res.body).toHaveProperty('success', true);
      expect(res.body.data.sources).toHaveLength(2);
      expect(res.body.data.sources[0].name).toBe('icecat');
      expect(res.body.data.summary.totalSources).toBe(2);

      expect(mockGetSourcePerformance).toHaveBeenCalledWith('550e8400-e29b-41d4-a716-446655440000');
    });
  });
});
