import { z } from 'zod';

// Schema per una singola fase della roadmap
export const RoadmapPhaseSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  order: z.number().min(1),
  
  // Timeline
  startMonth: z.number().min(1).max(36), // Mese di inizio (1 = mese corrente)
  durationMonths: z.number().min(1).max(24),
  
  // Obiettivi della fase
  objectives: z.array(z.object({
    id: z.string(),
    description: z.string(),
    type: z.enum(['strategic', 'operational', 'technical', 'organizational']),
    kpi: z.string().optional(),
    targetValue: z.string().optional(),
  })),
  
  // Iniziative coinvolte
  initiatives: z.array(z.object({
    itemId: z.string(),
    itemName: z.string(),
    role: z.enum(['primary', 'supporting', 'dependent']),
    actions: z.array(z.string()),
  })),
  
  // Milestone chiave
  milestones: z.array(z.object({
    id: z.string(),
    name: z.string(),
    targetDate: z.string(), // Formato: "Month X" o data ISO
    deliverables: z.array(z.string()),
    dependencies: z.array(z.string()),
  })),
  
  // Risorse necessarie
  resources: z.object({
    budget: z.number().optional(),
    fteRequired: z.number().optional(),
    skills: z.array(z.string()),
    externalSupport: z.array(z.string()),
  }),
  
  // Rischi e mitigazioni
  risks: z.array(z.object({
    risk: z.string(),
    likelihood: z.enum(['low', 'medium', 'high']),
    impact: z.enum(['low', 'medium', 'high']),
    mitigation: z.string(),
  })),
  
  // Success criteria
  successCriteria: z.array(z.string()),
  
  // Dipendenze da altre fasi
  dependencies: z.array(z.string()), // IDs delle fasi prerequisite
});

export type RoadmapPhase = z.infer<typeof RoadmapPhaseSchema>;

// Schema per le priorità strategiche
export const StrategicPrioritySchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  category: z.enum(['governance', 'process', 'technology', 'people', 'data']),
  priority: z.number().min(1).max(5),
  currentMaturity: z.number().min(1).max(5),
  targetMaturity: z.number().min(1).max(5),
  gap: z.number(),
  initiatives: z.array(z.string()), // IDs delle iniziative associate
});

export type StrategicPriority = z.infer<typeof StrategicPrioritySchema>;

// Schema per le quick wins
export const QuickWinSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  impact: z.enum(['high', 'medium', 'low']),
  effort: z.enum(['low', 'medium', 'high']),
  timeline: z.string(), // e.g., "2-4 settimane"
  relatedInitiatives: z.array(z.string()),
  expectedBenefit: z.string(),
});

export type QuickWin = z.infer<typeof QuickWinSchema>;

// Schema completo per la Roadmap
export const RoadmapResultSchema = z.object({
  roadmapId: z.string(),
  tenantId: z.string().nullable().optional(),
  companyId: z.string().nullable().optional(),
  createdAt: z.string().datetime(),
  version: z.string().default('1.0'),
  
  // Metadata
  roadmapName: z.string(),
  horizonMonths: z.number().min(6).max(36), // Orizzonte temporale totale
  
  // Executive Summary
  executiveSummary: z.string(),
  
  // Vision e obiettivi
  vision: z.object({
    statement: z.string(),
    targetMaturity: z.number().min(1).max(5),
    keyOutcomes: z.array(z.string()),
  }),
  
  // Analisi punto di partenza (da Assessment)
  currentState: z.object({
    overallMaturity: z.number().min(1).max(5),
    maturityByDimension: z.record(z.string(), z.number()),
    keyStrengths: z.array(z.string()),
    criticalGaps: z.array(z.string()),
    portfolioHealthScore: z.number().min(0).max(100).optional(),
  }),
  
  // Priorità strategiche
  strategicPriorities: z.array(StrategicPrioritySchema),
  
  // Quick Wins - azioni immediate
  quickWins: z.array(QuickWinSchema),
  
  // Fasi della roadmap
  phases: z.array(RoadmapPhaseSchema),
  
  // Budget totale stimato
  totalBudget: z.object({
    estimated: z.number(),
    breakdown: z.array(z.object({
      category: z.string(),
      amount: z.number(),
      percentage: z.number(),
    })),
    assumptions: z.array(z.string()),
  }),
  
  // Resource planning
  resourcePlan: z.object({
    totalFTE: z.number(),
    roles: z.array(z.object({
      role: z.string(),
      count: z.number(),
      duration: z.string(),
      internal: z.boolean(),
    })),
    skillGaps: z.array(z.string()),
    trainingNeeds: z.array(z.string()),
  }),
  
  // Governance
  governance: z.object({
    sponsor: z.string().optional(),
    steeringCommittee: z.array(z.string()),
    reviewCadence: z.enum(['monthly', 'quarterly', 'biannual']),
    decisionMakingProcess: z.string(),
    escalationPath: z.string(),
  }),
  
  // KPI di successo
  successMetrics: z.array(z.object({
    metric: z.string(),
    baseline: z.string(),
    target: z.string(),
    measurementFrequency: z.enum(['monthly', 'quarterly', 'annually']),
    owner: z.string().optional(),
  })),
  
  // Rischi complessivi
  overallRisks: z.array(z.object({
    id: z.string(),
    risk: z.string(),
    category: z.enum(['strategic', 'operational', 'financial', 'technical', 'organizational']),
    likelihood: z.enum(['low', 'medium', 'high']),
    impact: z.enum(['low', 'medium', 'high']),
    mitigation: z.string(),
    contingency: z.string().optional(),
  })),
  
  // Dipendenze esterne
  externalDependencies: z.array(z.object({
    dependency: z.string(),
    type: z.enum(['vendor', 'regulatory', 'market', 'technology', 'other']),
    impact: z.string(),
    mitigation: z.string(),
  })),
  
  // Raccomandazioni
  recommendations: z.array(z.object({
    id: z.string(),
    recommendation: z.string(),
    rationale: z.string(),
    priority: z.enum(['critical', 'high', 'medium', 'low']),
    owner: z.string().optional(),
  })),
  
  // Confidence e note
  confidenceLevel: z.enum(['high', 'medium', 'low']),
  assumptions: z.array(z.string()),
  notes: z.string().optional(),
});

export type RoadmapResult = z.infer<typeof RoadmapResultSchema>;

// Schema per l'input dell'agente
export const RoadmapInputSchema = z.object({
  tenantId: z.string().nullable().optional(),
  companyId: z.string().nullable().optional(),
  
  // Orizzonte temporale desiderato
  horizonMonths: z.number().min(6).max(36).default(24),
  
  // Focus specifico
  focusAreas: z.array(z.enum(['governance', 'process', 'technology', 'people', 'data'])).optional(),
  
  // Vincoli
  constraints: z.object({
    maxBudget: z.number().optional(),
    maxFTE: z.number().optional(),
    mustIncludeInitiatives: z.array(z.string()).optional(),
    mustExcludeInitiatives: z.array(z.string()).optional(),
    fixedDeadlines: z.array(z.object({
      initiative: z.string(),
      deadline: z.string(),
    })).optional(),
  }).optional(),
  
  // Obiettivi specifici
  goals: z.array(z.string()).optional(),
  
  // Livello di dettaglio
  detailLevel: z.enum(['executive', 'tactical', 'detailed']).default('tactical'),
  
  // Include quick wins
  includeQuickWins: z.boolean().default(true),
  
  // Richiesta utente specifica
  userRequest: z.string().optional(),
});

export type RoadmapInput = z.infer<typeof RoadmapInputSchema>;

export default RoadmapResultSchema;
