import { z } from 'zod';

// Schema per singola iniziativa/prodotto/servizio nel portfolio
export const PortfolioItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(['product', 'service']),
  description: z.string().optional(),
  status: z.enum(['active', 'paused', 'completed', 'cancelled', 'proposed']).default('active'),
  owner: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  budget: z.number().optional(),
  actualCost: z.number().optional(),
  
  // Metriche di valutazione
  strategicAlignment: z.number().min(1).max(10).optional(),
  businessValue: z.number().min(1).max(10).optional(),
  riskLevel: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  complexity: z.enum(['low', 'medium', 'high']).optional(),
  resourceRequirement: z.number().min(1).max(10).optional(),
  timeToValue: z.number().optional(), // mesi
  roi: z.number().optional(), // percentuale
  
  // Metadata
  category: z.string().optional(),
  tags: z.array(z.string()).default([]),
  dependencies: z.array(z.string()).default([]),
  kpis: z.array(z.object({
    name: z.string(),
    target: z.union([z.string(), z.number()]),
    current: z.union([z.string(), z.number()]).optional(),
  })).default([]),
});

export type PortfolioItem = z.infer<typeof PortfolioItemSchema>;

// Progress callback type for streaming
export interface ProgressCallback {
  (data: {
    phase: 'loading' | 'analyzing' | 'saving' | 'complete';
    message: string;
    progress: number;
    itemsProcessed?: number;
    totalItems?: number;
  }): void;
}

// Schema per la valutazione di un singolo item
export const ItemAssessmentSchema = z.object({
  itemId: z.string(),
  itemName: z.string(),
  overallScore: z.number().min(0).max(100),
  ranking: z.number(),
  recommendation: z.enum(['keep', 'accelerate', 'review', 'pause', 'stop', 'merge']),
  confidenceLevel: z.enum(['high', 'medium', 'low']),
  
  // Scores dettagliati
  scores: z.object({
    strategicFit: z.number().min(0).max(100),
    valueDelivery: z.number().min(0).max(100),
    riskAdjustedReturn: z.number().min(0).max(100),
    resourceEfficiency: z.number().min(0).max(100),
    marketTiming: z.number().min(0).max(100),
  }),
  
  // Analisi
  strengths: z.array(z.string()),
  weaknesses: z.array(z.string()),
  opportunities: z.array(z.string()),
  threats: z.array(z.string()),
  
  // Raccomandazioni specifiche
  actionItems: z.array(z.object({
    action: z.string(),
    priority: z.enum(['immediate', 'short_term', 'medium_term', 'long_term']),
    impact: z.enum(['high', 'medium', 'low']),
    owner: z.string().optional(),
  })),
  
  rationale: z.string(),
});

export type ItemAssessment = z.infer<typeof ItemAssessmentSchema>;

// Schema per il risultato completo del Portfolio Assessment
export const PortfolioAssessmentResultSchema = z.object({
  assessmentId: z.string(),
  tenantId: z.string().nullable().optional(),
  companyId: z.string().nullable().optional(),
  createdAt: z.string(), // ISO 8601 datetime string
  
  // Metadata assessment
  portfolioType: z.enum(['initiatives', 'products', 'services', 'mixed']),
  totalItems: z.number(),
  assessedItems: z.number(),
  
  // Executive Summary
  executiveSummary: z.string(),
  
  // Portfolio Health Score
  portfolioHealth: z.object({
    overallScore: z.number().min(0).max(100),
    balanceScore: z.number().min(0).max(100), // diversificazione
    alignmentScore: z.number().min(0).max(100), // allineamento strategico
    riskScore: z.number().min(0).max(100), // rischio complessivo (invertito)
    performanceScore: z.number().min(0).max(100), // performance complessiva
  }),
  
  // Distribuzione raccomandazioni
  recommendationDistribution: z.object({
    keep: z.number(),
    accelerate: z.number(),
    review: z.number(),
    pause: z.number(),
    stop: z.number(),
    merge: z.number(),
  }),
  
  // Top performers e worst performers
  topPerformers: z.array(z.object({
    itemId: z.string(),
    name: z.string(),
    score: z.number(),
    highlight: z.string(),
  })),
  
  bottomPerformers: z.array(z.object({
    itemId: z.string(),
    name: z.string(),
    score: z.number(),
    issue: z.string(),
  })),
  
  // Valutazioni individuali
  itemAssessments: z.array(ItemAssessmentSchema),
  
  // Raccomandazioni portfolio-level
  portfolioRecommendations: z.array(z.object({
    category: z.enum(['rebalancing', 'resource_allocation', 'risk_mitigation', 'strategic_alignment', 'optimization']),
    title: z.string(),
    description: z.string(),
    impact: z.enum(['high', 'medium', 'low']),
    effort: z.enum(['high', 'medium', 'low']),
    priority: z.number().min(1).max(5),
  })),
  
  // Gap Analysis
  gapAnalysis: z.object({
    missingCapabilities: z.array(z.string()),
    overInvestedAreas: z.array(z.string()),
    underInvestedAreas: z.array(z.string()),
    redundancies: z.array(z.object({
      items: z.array(z.string()),
      reason: z.string(),
    })),
  }),
  
  // Rischi portfolio
  portfolioRisks: z.array(z.object({
    risk: z.string(),
    likelihood: z.enum(['low', 'medium', 'high']),
    impact: z.enum(['low', 'medium', 'high']),
    affectedItems: z.array(z.string()),
    mitigation: z.string(),
  })),
  
  // Confidence e data quality
  dataQuality: z.object({
    completeness: z.number().min(0).max(100),
    accuracy: z.enum(['high', 'medium', 'low', 'unknown']),
    dataGaps: z.array(z.string()),
  }),
  
  confidenceOverall: z.enum(['high', 'medium', 'low']),
  notes: z.string().optional(),
});

export type PortfolioAssessmentResult = z.infer<typeof PortfolioAssessmentResultSchema>;

// Schema per l'input dell'agente
export const PortfolioAssessmentInputSchema = z.object({
  tenantId: z.string().nullable().optional(),
  companyId: z.string().nullable().optional(),
  portfolioType: z.enum(['initiatives', 'products', 'services', 'mixed']).default('mixed'),
  
  // Items da valutare
  items: z.array(PortfolioItemSchema).optional(),
  
  // Oppure riferimento a dati esistenti
  dataSource: z.enum(['manual', 'supabase', 'file', 'api']).default('manual'),
  dataRef: z.string().optional(), // ID tabella, URL file, etc.
  
  // Criteri di valutazione (peso 1-10)
  evaluationCriteria: z.object({
    strategicAlignment: z.number().min(1).max(10).default(8),
    businessValue: z.number().min(1).max(10).default(9),
    riskTolerance: z.number().min(1).max(10).default(5),
    resourceConstraint: z.number().min(1).max(10).default(7),
    timeToValue: z.number().min(1).max(10).default(6),
  }).optional(),
  
  // Progress callback for streaming (not validated by Zod, just typed)
  onProgress: z.any().optional(), // Function type: ProgressCallback

  // Contesto business dall'assessment iniziale
  companyProfile: z.object({
    cluster: z.string().optional(),
    ppmMaturityLevel: z.number().optional(),
    primaryFocus: z.string().optional(),
    constraints: z.array(z.string()).optional(),
  }).optional(),
  
  // Richiesta specifica
  userGoal: z.string().optional(),
  focusArea: z.string().optional(),
});

export type PortfolioAssessmentInput = z.infer<typeof PortfolioAssessmentInputSchema>;

export default PortfolioAssessmentResultSchema;
