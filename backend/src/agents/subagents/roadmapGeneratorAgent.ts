import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { ChatOpenAI } from '@langchain/openai';
import { PromptTemplate } from '@langchain/core/prompts';
import { SubAgent, SubAgentResult } from './types';
import { supabase } from '../../config/supabase';
import {
  RoadmapInput,
  RoadmapResult,
  RoadmapResultSchema,
  RoadmapPhase,
  StrategicPriority,
  QuickWin,
} from '../schemas/roadmapSchema';
import { PortfolioAssessmentResult } from '../schemas/portfolioAssessmentSchema';

// Load system prompt
let systemPrompt: string;
try {
  const promptPath = path.resolve(__dirname, '../prompts/roadmap-generator-prompt.md');
  systemPrompt = fs.readFileSync(promptPath, { encoding: 'utf8' });
} catch (e) {
  systemPrompt = 'You are THEMIS Roadmap Generator Agent. Generate strategic roadmaps for IT transformation.';
}

/**
 * Carica l'assessment snapshot (maturità IT) da Supabase
 */
async function loadAssessmentSnapshot(tenantId: string | null | undefined): Promise<Record<string, unknown> | null> {
  if (!tenantId) return null;
  
  try {
    const { data, error } = await supabase
      .from('company_assessment_snapshots')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    
    if (error) {
      console.warn('Could not load assessment snapshot:', error.message);
      return null;
    }
    
    return data;
  } catch (err) {
    console.warn('Error loading assessment snapshot:', err);
    return null;
  }
}

/**
 * Carica l'ultimo portfolio assessment da Supabase
 */
async function loadPortfolioAssessment(tenantId: string | null | undefined): Promise<PortfolioAssessmentResult | null> {
  if (!tenantId) return null;
  
  try {
    const { data, error } = await supabase
      .from('portfolio_assessments')
      .select('result')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    
    if (error) {
      console.warn('Could not load portfolio assessment:', error.message);
      return null;
    }
    
    return data?.result as PortfolioAssessmentResult;
  } catch (err) {
    console.warn('Error loading portfolio assessment:', err);
    return null;
  }
}

/**
 * Salva la roadmap su Supabase
 */
async function saveRoadmap(roadmap: RoadmapResult): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('roadmaps')
      .upsert({
        roadmap_id: roadmap.roadmapId,
        tenant_id: roadmap.tenantId,
        company_id: roadmap.companyId,
        roadmap_name: roadmap.roadmapName,
        version: roadmap.version,
        horizon_months: roadmap.horizonMonths,
        executive_summary: roadmap.executiveSummary,
        vision: roadmap.vision,
        current_state: roadmap.currentState,
        phases: roadmap.phases,
        strategic_priorities: roadmap.strategicPriorities,
        quick_wins: roadmap.quickWins,
        total_budget: roadmap.totalBudget,
        resource_plan: roadmap.resourcePlan,
        governance: roadmap.governance,
        success_metrics: roadmap.successMetrics,
        overall_risks: roadmap.overallRisks,
        confidence_level: roadmap.confidenceLevel,
        result: roadmap,
        created_at: roadmap.createdAt,
      }, { onConflict: 'roadmap_id' });
    
    if (error) {
      console.error('Error saving roadmap:', error);
      return false;
    }
    
    return true;
  } catch (err) {
    console.error('Exception saving roadmap:', err);
    return false;
  }
}

/**
 * Genera un ID per le fasi
 */
function generatePhaseId(index: number): string {
  return `phase-${index + 1}-${uuidv4().slice(0, 8)}`;
}

/**
 * Calcola le priorità strategiche basate sui gap di maturità
 */
function calculateStrategicPriorities(
  assessmentSnapshot: Record<string, unknown> | null,
  portfolioAssessment: PortfolioAssessmentResult | null
): StrategicPriority[] {
  const priorities: StrategicPriority[] = [];
  const dimensions = ['governance', 'process', 'technology', 'people', 'data'] as const;
  
  // Estrai maturity scores dall'assessment
  const maturityScores: Record<string, number> = {};
  if (assessmentSnapshot) {
    const snapshot = assessmentSnapshot as Record<string, unknown>;
    if (snapshot.dimension_scores && typeof snapshot.dimension_scores === 'object') {
      Object.assign(maturityScores, snapshot.dimension_scores);
    }
  }
  
  // Calcola gap e priorità per ogni dimensione
  for (const dim of dimensions) {
    const current = maturityScores[dim] || 2; // Default a 2 se non disponibile
    const target = 4; // Target default: livello 4
    const gap = target - current;
    
    if (gap > 0) {
      priorities.push({
        id: `priority-${dim}`,
        name: getDimensionPriorityName(dim, gap),
        description: getDimensionDescription(dim, current, target),
        category: dim,
        priority: Math.min(5, Math.round(gap * 2)), // Più alto il gap, più alta la priorità
        currentMaturity: current,
        targetMaturity: target,
        gap: gap,
        initiatives: [], // Sarà popolato dall'AI
      });
    }
  }
  
  // Ordina per gap (priorità maggiore ai gap più alti)
  priorities.sort((a, b) => b.gap - a.gap);
  
  return priorities.slice(0, 6); // Max 6 priorità
}

function getDimensionPriorityName(dimension: string, gap: number): string {
  const names: Record<string, string> = {
    governance: gap > 2 ? 'Fondazione Governance IT' : 'Rafforzamento Governance',
    process: gap > 2 ? 'Standardizzazione Processi' : 'Ottimizzazione Processi',
    technology: gap > 2 ? 'Modernizzazione Tecnologica' : 'Evoluzione Stack Tecnico',
    people: gap > 2 ? 'Sviluppo Competenze Base' : 'Upskilling Avanzato',
    data: gap > 2 ? 'Fondamenta Data Management' : 'Data Excellence',
  };
  return names[dimension] || `Miglioramento ${dimension}`;
}

function getDimensionDescription(dimension: string, current: number, target: number): string {
  const descriptions: Record<string, string> = {
    governance: `Elevare la governance IT dal livello ${current} al ${target}, implementando framework di gestione e controllo strutturati`,
    process: `Migliorare la maturità dei processi IT dal livello ${current} al ${target}, introducendo standardizzazione e automazione`,
    technology: `Evolvere l'infrastruttura tecnologica dal livello ${current} al ${target}, modernizzando stack e architetture`,
    people: `Sviluppare le competenze del team IT dal livello ${current} al ${target}, con programmi di formazione e sviluppo`,
    data: `Potenziare le capacità di data management dal livello ${current} al ${target}, implementando governance dei dati`,
  };
  return descriptions[dimension] || `Portare ${dimension} dal livello ${current} al ${target}`;
}

/**
 * Genera quick wins basati sul portfolio assessment
 */
function generateQuickWins(portfolioAssessment: PortfolioAssessmentResult | null): QuickWin[] {
  const quickWins: QuickWin[] = [];
  
  if (!portfolioAssessment) {
    // Quick wins generici se non c'è portfolio assessment
    return [
      {
        id: 'qw-1',
        name: 'Audit Portfolio Esistente',
        description: 'Censire tutte le iniziative in corso e classificarle per stato e priorità',
        impact: 'high',
        effort: 'low',
        timeline: '2-3 settimane',
        relatedInitiatives: [],
        expectedBenefit: 'Visibilità completa sul portfolio per decisioni informate',
      },
      {
        id: 'qw-2',
        name: 'Setup Dashboard Base',
        description: 'Creare una dashboard semplice per il tracking delle iniziative principali',
        impact: 'medium',
        effort: 'low',
        timeline: '1-2 settimane',
        relatedInitiatives: [],
        expectedBenefit: 'Monitoraggio real-time dello stato portfolio',
      },
    ];
  }
  
  // Quick wins basati sui top performers da accelerare
  const accelerateItems = portfolioAssessment.itemAssessments
    ?.filter(a => a.recommendation === 'accelerate')
    .slice(0, 2);
  
  if (accelerateItems) {
    for (const item of accelerateItems) {
      quickWins.push({
        id: `qw-acc-${item.itemId}`,
        name: `Accelerare: ${item.itemName}`,
        description: `Rimuovere blocchi e allocare risorse aggiuntive per ${item.itemName}`,
        impact: 'high',
        effort: 'medium',
        timeline: '3-4 settimane',
        relatedInitiatives: [item.itemId],
        expectedBenefit: item.rationale.slice(0, 100) + '...',
      });
    }
  }
  
  // Quick win per items da rivedere
  const reviewItems = portfolioAssessment.itemAssessments
    ?.filter(a => a.recommendation === 'review')
    .slice(0, 1);
  
  if (reviewItems && reviewItems.length > 0) {
    quickWins.push({
      id: 'qw-review',
      name: 'Review Priorità Portfolio',
      description: `Rivedere priorità e scope di ${reviewItems.length} iniziative in stato di revisione`,
      impact: 'medium',
      effort: 'low',
      timeline: '1-2 settimane',
      relatedInitiatives: reviewItems.map(i => i.itemId),
      expectedBenefit: 'Riallineamento risorse su iniziative a maggior valore',
    });
  }
  
  // Quick win governance se ci sono gaps
  if (portfolioAssessment.gapAnalysis?.missingCapabilities?.length > 0) {
    quickWins.push({
      id: 'qw-gap',
      name: 'Colmare Gap Critici',
      description: `Indirizzare i gap di capability identificati: ${portfolioAssessment.gapAnalysis.missingCapabilities.slice(0, 2).join(', ')}`,
      impact: 'high',
      effort: 'medium',
      timeline: '4-6 settimane',
      relatedInitiatives: [],
      expectedBenefit: 'Riduzione del rischio e miglioramento capacità di delivery',
    });
  }
  
  return quickWins.slice(0, 5); // Max 5 quick wins
}

/**
 * Roadmap Generator Agent
 * STEP 4 nel flusso sequenziale THEMIS
 */
export const roadmapGeneratorAgent: SubAgent = {
  name: 'ROADMAP_GENERATOR',
  
  async run(args): Promise<SubAgentResult> {
    console.log('🗺️ ROADMAP_GENERATOR invoked');
    
    try {
      // Parse input
      const input: RoadmapInput = typeof args === 'string' ? JSON.parse(args) : args;
      const {
        tenantId,
        companyId,
        horizonMonths = 24,
        focusAreas,
        constraints,
        goals,
        detailLevel = 'tactical',
        includeQuickWins = true,
        userRequest,
      } = input;
      
      // Load prerequisite data (STEP 1 + STEP 3)
      console.log('📥 Loading assessment and portfolio data...');
      const [assessmentSnapshot, portfolioAssessment] = await Promise.all([
        loadAssessmentSnapshot(tenantId),
        loadPortfolioAssessment(tenantId),
      ]);
      
      if (!assessmentSnapshot && !portfolioAssessment) {
        return {
          content: `⚠️ **Dati insufficienti per generare la roadmap**

Per generare una roadmap strategica, è necessario completare i passaggi precedenti:

1. **Step 1 - Assessment Maturità IT**: Completa il questionario in /onboarding
2. **Step 2 - Portfolio**: Carica le tue iniziative/prodotti/servizi in /portfolio
3. **Step 3 - Portfolio Assessment**: Avvia la valutazione del portfolio

Una volta completati questi step, torna qui per generare la tua roadmap personalizzata.`,
          metadata: {
            routedTo: 'ROADMAP_GENERATOR',
            error: 'missing_prerequisites',
            hasAssessment: !!assessmentSnapshot,
            hasPortfolio: !!portfolioAssessment,
          },
        };
      }
      
      // Calcola priorità strategiche
      const strategicPriorities = calculateStrategicPriorities(assessmentSnapshot, portfolioAssessment);
      
      // Genera quick wins
      const quickWins = includeQuickWins ? generateQuickWins(portfolioAssessment) : [];
      
      // Prepara contesto per l'AI
      const contextData = {
        assessmentSnapshot: assessmentSnapshot ? {
          overall_maturity: (assessmentSnapshot as Record<string, unknown>).overall_maturity || 2.5,
          dimension_scores: (assessmentSnapshot as Record<string, unknown>).dimension_scores || {},
          cluster: (assessmentSnapshot as Record<string, unknown>).cluster || 'PMO Intermedio',
          recommendations: (assessmentSnapshot as Record<string, unknown>).recommendations || [],
        } : null,
        portfolioAssessment: portfolioAssessment ? {
          portfolioHealth: portfolioAssessment.portfolioHealth,
          recommendationDistribution: portfolioAssessment.recommendationDistribution,
          gapAnalysis: portfolioAssessment.gapAnalysis,
          topPerformers: portfolioAssessment.topPerformers?.slice(0, 5),
          bottomPerformers: portfolioAssessment.bottomPerformers?.slice(0, 5),
          portfolioRecommendations: portfolioAssessment.portfolioRecommendations?.slice(0, 5),
        } : null,
        strategicPriorities,
        constraints,
        goals,
        horizonMonths,
        focusAreas,
        detailLevel,
        userRequest,
      };
      
      // Initialize LLM
      const model = new ChatOpenAI({
        modelName: 'gpt-4o-mini',
        temperature: 0.2, // Leggermente più creativo per roadmap
        maxTokens: 8000,
      });
      
      // Create prompt
      const promptTemplate = PromptTemplate.fromTemplate(`${systemPrompt}

## Contesto Attuale

### Assessment Maturità IT (Step 1)
{assessmentContext}

### Portfolio Assessment (Step 3)
{portfolioContext}

### Priorità Strategiche Calcolate
{priorities}

### Vincoli e Obiettivi
{constraints}

### Richiesta Utente
{userRequest}

## Istruzioni
Genera una roadmap completa in formato JSON per un orizzonte di {horizonMonths} mesi.
Livello di dettaglio richiesto: {detailLevel}

Rispondi SOLO con un JSON valido che rispetti lo schema RoadmapResultSchema.`);
      
      const prompt = await promptTemplate.format({
        assessmentContext: contextData.assessmentSnapshot 
          ? JSON.stringify(contextData.assessmentSnapshot, null, 2)
          : 'Non disponibile - Assessment maturità non ancora completato',
        portfolioContext: contextData.portfolioAssessment
          ? JSON.stringify(contextData.portfolioAssessment, null, 2)
          : 'Non disponibile - Portfolio assessment non ancora completato',
        priorities: JSON.stringify(strategicPriorities, null, 2),
        constraints: JSON.stringify({ constraints, goals, focusAreas }, null, 2),
        userRequest: userRequest || 'Genera una roadmap strategica completa per la trasformazione IT',
        horizonMonths: horizonMonths.toString(),
        detailLevel,
      });
      
      console.log('🤖 Calling LLM for roadmap generation...');
      const response = await model.invoke(prompt);
      const responseText = typeof response.content === 'string' 
        ? response.content 
        : JSON.stringify(response.content);
      
      // Parse JSON response
      let aiRoadmap: Partial<RoadmapResult>;
      try {
        // Estrai JSON dalla risposta (potrebbe essere wrappato in markdown)
        const jsonMatch = responseText.match(/```json\n?([\s\S]*?)\n?```/) || 
                         responseText.match(/\{[\s\S]*\}/);
        const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : responseText;
        aiRoadmap = JSON.parse(jsonStr);
      } catch (parseError) {
        console.warn('Could not parse AI response, using fallback');
        aiRoadmap = {};
      }
      
      // Build complete roadmap result
      const roadmapId = uuidv4();
      const now = new Date().toISOString();
      
      const result: RoadmapResult = {
        roadmapId,
        tenantId: tenantId || null,
        companyId: companyId || null,
        createdAt: now,
        version: '1.0',
        
        roadmapName: aiRoadmap.roadmapName || 
          `Roadmap Trasformazione IT ${new Date().getFullYear()}-${new Date().getFullYear() + Math.ceil(horizonMonths/12)}`,
        horizonMonths,
        
        executiveSummary: aiRoadmap.executiveSummary || 
          `Roadmap strategica per l'evoluzione della maturità IT su un orizzonte di ${horizonMonths} mesi, basata sull'assessment di maturità e la valutazione del portfolio esistente.`,
        
        vision: aiRoadmap.vision || {
          statement: 'Raggiungere un livello di maturità IT ottimale per supportare la crescita aziendale',
          targetMaturity: 4,
          keyOutcomes: [
            'Governance IT strutturata e trasparente',
            'Processi standardizzati e misurabili',
            'Portfolio bilanciato e allineato alla strategia',
          ],
        },
        
        currentState: aiRoadmap.currentState || {
          overallMaturity: contextData.assessmentSnapshot?.overall_maturity as number || 2.5,
          maturityByDimension: (contextData.assessmentSnapshot?.dimension_scores as Record<string, number>) || {},
          keyStrengths: [],
          criticalGaps: strategicPriorities.map(p => p.name),
          portfolioHealthScore: contextData.portfolioAssessment?.portfolioHealth?.overallScore,
        },
        
        strategicPriorities: aiRoadmap.strategicPriorities || strategicPriorities,
        
        quickWins: aiRoadmap.quickWins || quickWins,
        
        phases: aiRoadmap.phases || generateDefaultPhases(horizonMonths, strategicPriorities),
        
        totalBudget: aiRoadmap.totalBudget || {
          estimated: horizonMonths * 15000, // Stima base
          breakdown: [
            { category: 'Technology', amount: horizonMonths * 6000, percentage: 40 },
            { category: 'People', amount: horizonMonths * 4500, percentage: 30 },
            { category: 'Process', amount: horizonMonths * 3000, percentage: 20 },
            { category: 'Governance', amount: horizonMonths * 1500, percentage: 10 },
          ],
          assumptions: ['Costi calcolati su base media di mercato', 'Risorse interne già disponibili'],
        },
        
        resourcePlan: aiRoadmap.resourcePlan || {
          totalFTE: Math.ceil(horizonMonths / 6) + 2,
          roles: [
            { role: 'Project Manager', count: 1, duration: `${horizonMonths} mesi`, internal: true },
            { role: 'Business Analyst', count: 1, duration: `${horizonMonths} mesi`, internal: true },
            { role: 'Consulente PMO', count: 1, duration: '6 mesi', internal: false },
          ],
          skillGaps: strategicPriorities.map(p => `Competenze ${p.category}`),
          trainingNeeds: ['Project Management avanzato', 'Change Management'],
        },
        
        governance: aiRoadmap.governance || {
          sponsor: 'CIO / IT Director',
          steeringCommittee: ['CIO', 'CFO', 'Business Unit Leaders'],
          reviewCadence: 'monthly',
          decisionMakingProcess: 'Steering Committee approva milestone e variazioni budget >10%',
          escalationPath: 'PM → PMO → Sponsor → Steering Committee',
        },
        
        successMetrics: aiRoadmap.successMetrics || [
          {
            metric: 'Maturità IT Complessiva',
            baseline: (contextData.assessmentSnapshot?.overall_maturity || 2.5).toString(),
            target: '4.0',
            measurementFrequency: 'quarterly',
            owner: 'CIO',
          },
          {
            metric: 'Portfolio Health Score',
            baseline: (contextData.portfolioAssessment?.portfolioHealth?.overallScore || 50).toString(),
            target: '80',
            measurementFrequency: 'monthly',
            owner: 'PMO',
          },
          {
            metric: 'Iniziative On-Time On-Budget',
            baseline: '50%',
            target: '80%',
            measurementFrequency: 'monthly',
            owner: 'PMO',
          },
        ],
        
        overallRisks: aiRoadmap.overallRisks || [
          {
            id: 'risk-1',
            risk: 'Resistenza al cambiamento',
            category: 'organizational',
            likelihood: 'high',
            impact: 'high',
            mitigation: 'Piano di change management strutturato con comunicazione proattiva',
            contingency: 'Coinvolgimento HR e training aggiuntivo',
          },
          {
            id: 'risk-2',
            risk: 'Carenza risorse interne',
            category: 'operational',
            likelihood: 'medium',
            impact: 'high',
            mitigation: 'Ingaggio consulenti esterni per picchi di lavoro',
            contingency: 'Ridefinizione scope e timeline',
          },
          {
            id: 'risk-3',
            risk: 'Budget insufficiente',
            category: 'financial',
            likelihood: 'medium',
            impact: 'medium',
            mitigation: 'Approvazione budget con margine 15%',
            contingency: 'Prioritizzazione iniziative ad alto ROI',
          },
        ],
        
        externalDependencies: aiRoadmap.externalDependencies || [],
        
        recommendations: aiRoadmap.recommendations || [
          {
            id: 'rec-1',
            recommendation: 'Avviare subito con i Quick Wins per creare momentum',
            rationale: 'I quick wins generano risultati visibili e buy-in degli stakeholder',
            priority: 'critical',
          },
          {
            id: 'rec-2',
            recommendation: 'Stabilire governance prima di avviare le fasi principali',
            rationale: 'Una governance chiara riduce rischi di scope creep e conflitti',
            priority: 'high',
          },
        ],
        
        confidenceLevel: aiRoadmap.confidenceLevel || 
          (assessmentSnapshot && portfolioAssessment ? 'high' : 'medium'),
        
        assumptions: aiRoadmap.assumptions || [
          'Commitment del management',
          'Budget approvato',
          'Risorse disponibili come pianificato',
        ],
        
        notes: aiRoadmap.notes,
      };
      
      // Validate with Zod
      try {
        RoadmapResultSchema.parse(result);
      } catch (validationError) {
        console.warn('Validation warning:', validationError);
      }
      
      // Save to Supabase
      const saved = await saveRoadmap(result);
      if (saved) {
        console.log('💾 Roadmap saved to Supabase');
      } else {
        console.warn('⚠️ Could not save roadmap to Supabase');
      }
      
      // Build response
      const summaryLines = [
        `## 🗺️ Roadmap Strategica Generata`,
        ``,
        `**${result.roadmapName}**`,
        ``,
        `### Executive Summary`,
        result.executiveSummary,
        ``,
        `### Panoramica`,
        `- **Orizzonte**: ${result.horizonMonths} mesi`,
        `- **Fasi**: ${result.phases.length}`,
        `- **Budget Stimato**: €${result.totalBudget.estimated.toLocaleString()}`,
        `- **FTE Richiesti**: ${result.resourcePlan.totalFTE}`,
        ``,
        `### Vision`,
        `> ${result.vision.statement}`,
        ``,
        `**Target Maturity**: ${result.vision.targetMaturity}/5`,
        ``,
        `### Priorità Strategiche`,
        ...result.strategicPriorities.map((p, i) => 
          `${i + 1}. **${p.name}** - Gap: ${p.gap.toFixed(1)} (${p.currentMaturity}→${p.targetMaturity})`
        ),
        ``,
      ];
      
      if (result.quickWins.length > 0) {
        summaryLines.push(
          `### 🚀 Quick Wins`,
          ...result.quickWins.map(qw => `- **${qw.name}**: ${qw.description} _(${qw.timeline})_`),
          ``
        );
      }
      
      summaryLines.push(
        `### 📅 Fasi della Roadmap`,
        ...result.phases.map(phase => 
          `**${phase.order}. ${phase.name}** (Mese ${phase.startMonth}-${phase.startMonth + phase.durationMonths - 1})
   ${phase.description}
   - Milestone: ${phase.milestones.length}
   - Iniziative: ${phase.initiatives.length}`
        ),
        ``,
        `### ⚠️ Rischi Principali`,
        ...result.overallRisks.slice(0, 3).map(r => 
          `- **${r.risk}** (${r.likelihood}/${r.impact}): ${r.mitigation}`
        ),
        ``,
        `---`,
        `Roadmap ID: \`${result.roadmapId}\``,
        `Confidence: **${result.confidenceLevel}**`
      );
      
      return {
        content: summaryLines.join('\n'),
        metadata: {
          routedTo: 'ROADMAP_GENERATOR',
          roadmapId: result.roadmapId,
          horizonMonths: result.horizonMonths,
          phasesCount: result.phases.length,
          quickWinsCount: result.quickWins.length,
          totalBudget: result.totalBudget.estimated,
          confidenceLevel: result.confidenceLevel,
          result,
        },
      };
      
    } catch (error) {
      console.error('❌ ROADMAP_GENERATOR error:', error);
      return {
        content: `Errore durante la generazione della roadmap: ${error instanceof Error ? error.message : 'Errore sconosciuto'}`,
        metadata: { error: true, routedTo: 'ROADMAP_GENERATOR' },
      };
    }
  },
};

/**
 * Genera fasi di default se l'AI non le produce
 */
function generateDefaultPhases(
  horizonMonths: number, 
  priorities: StrategicPriority[]
): RoadmapPhase[] {
  const numPhases = Math.min(5, Math.max(3, Math.ceil(horizonMonths / 6)));
  const phaseDuration = Math.floor(horizonMonths / numPhases);
  const phases: RoadmapPhase[] = [];
  
  const phaseNames = [
    { name: 'Foundation & Quick Wins', desc: 'Stabilire le basi e raccogliere primi risultati' },
    { name: 'Build & Standardize', desc: 'Costruire processi e standardizzare pratiche' },
    { name: 'Scale & Integrate', desc: 'Scalare soluzioni e integrare sistemi' },
    { name: 'Optimize & Automate', desc: 'Ottimizzare e automatizzare processi' },
    { name: 'Sustain & Innovate', desc: 'Mantenere e innovare continuamente' },
  ];
  
  for (let i = 0; i < numPhases; i++) {
    const phaseInfo = phaseNames[i] || phaseNames[phaseNames.length - 1];
    const startMonth = i * phaseDuration + 1;
    const relevantPriorities = priorities.slice(i * 2, (i + 1) * 2);
    
    phases.push({
      id: generatePhaseId(i),
      name: phaseInfo.name,
      description: phaseInfo.desc,
      order: i + 1,
      startMonth,
      durationMonths: phaseDuration,
      objectives: relevantPriorities.map((p, j) => ({
        id: `obj-${i + 1}-${j + 1}`,
        description: p.description,
        type: p.category as 'strategic' | 'operational' | 'technical' | 'organizational',
        kpi: `${p.category} maturity`,
        targetValue: `Level ${p.targetMaturity}`,
      })),
      initiatives: [],
      milestones: [
        {
          id: `m-${i + 1}-1`,
          name: `Milestone Fine Fase ${i + 1}`,
          targetDate: `Month ${startMonth + phaseDuration - 1}`,
          deliverables: relevantPriorities.map(p => `${p.name} completato`),
          dependencies: i > 0 ? [`phase-${i}`] : [],
        },
      ],
      resources: {
        budget: (horizonMonths * 15000) / numPhases,
        fteRequired: 2,
        skills: relevantPriorities.map(p => `Competenze ${p.category}`),
        externalSupport: i === 0 ? ['Consulente PMO setup iniziale'] : [],
      },
      risks: [
        {
          risk: `Ritardi nella fase ${i + 1}`,
          likelihood: 'medium',
          impact: 'medium',
          mitigation: 'Buffer temporale del 15% incluso',
        },
      ],
      successCriteria: relevantPriorities.map(p => 
        `${p.category} maturity raggiunge livello ${Math.min(5, p.currentMaturity + 1)}`
      ),
      dependencies: i > 0 ? [phases[i - 1]?.id || ''] : [],
    });
  }
  
  return phases;
}

export default roadmapGeneratorAgent;
