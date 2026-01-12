import { Router, Request, Response } from 'express';
import { supabase } from '../config/supabase';
import { authenticate } from '../middleware/auth.middleware';
import { getAssessmentAgent, AssessmentAnswers } from '../agents/assessmentAgent';
import { getStrategicAssessmentAgent } from '../agents/strategicAssessmentAgent';
import { bootstrapTenantRAG } from '../agents/utils/ragCustomTraining';
import { saveAssessmentSnapshot } from '../repositories/assessmentSnapshotRepository';
import type { StrategicAssessmentProfile, AssessmentAnswers as StrategicAnswers } from '../agents/schemas/strategicAssessmentSchema';

const router = Router();

// Cluster labels per Portfolio Management
const clusterLabels: Record<string, string> = {
  'ppm_starter': 'PPM Starter',
  'ppm_emerging': 'PPM Emergente',
  'ppm_defined': 'PPM Definito',
  'ppm_managed': 'PPM Gestito',
  'ppm_optimized': 'PPM Ottimizzato',
  'innovation_lab': 'Innovation Lab',
  'service_catalog': 'Service Catalog',
  'product_portfolio': 'Product Portfolio'
};

// POST /api/assessment - Salva risposte assessment
router.post('/', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const { answers, completedAt } = req.body;

    console.log('📝 Assessment ricevuto per userId:', userId);

    // Recupera company_id dell'utente
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('company_id')
      .eq('id', userId)
      .single();

    if (userError || !user) {
      console.error('❌ Utente non trovato:', userError);
      return res.status(400).json({ error: 'Utente non trovato' });
    }

    if (!user.company_id) {
      console.error('❌ Utente senza company_id');
      return res.status(400).json({ error: 'Utente non associato a un\'azienda' });
    }

    let aiCluster: string;
    let aiProfile: object;
    let aiRecommendations: Record<string, unknown>[];
    let aiSummary: string | undefined;
    let censusStrategy: object | undefined;
    let strategicProfile: StrategicAssessmentProfile | undefined;
    let ragTrainingStats: any | undefined;

    // Recupera nome azienda per strategic assessment
    const { data: company } = await supabase
      .from('companies')
      .select('name')
      .eq('id', user.company_id)
      .single();

    const companyName = company?.name || 'Azienda';

    // Prova a usare l'agente AI se disponibile
    if (process.env.OPENAI_API_KEY) {
      try {
        console.log('🤖 Usando STRATEGIC ASSESSMENT AGENT per analisi completa...');

        // 1. Transform old answers to strategic format
        const strategicAnswers = transformToStrategicAnswers(answers, companyName) as any;

        // 2. Generate strategic profile with new agent
        const strategicAgent = getStrategicAssessmentAgent();
        strategicProfile = await strategicAgent.generateProfile({
          tenant_id: user.company_id,
          company_name: companyName,
          answers: strategicAnswers
        });

        console.log(`✅ Strategic Profile generato - Industry: ${strategicProfile.company_identity.industry}`);
        console.log(`   Confidence Score: ${(strategicProfile.confidence_score || 0) * 100}%`);

        // 3. Bootstrap RAG with company-specific training
        console.log('🎯 Addestrando RAG con profilo aziendale...');
        ragTrainingStats = await bootstrapTenantRAG(user.company_id, strategicProfile);

        console.log(`✅ RAG Training completato:`);
        console.log(`   - ${ragTrainingStats.products_added} products added`);
        console.log(`   - ${ragTrainingStats.services_added} services added`);
        console.log(`   - ${ragTrainingStats.total_embeddings_created} embeddings created`);

        // 4. Map strategic profile to old format for backward compatibility
        aiCluster = mapStrategicToCluster(strategicProfile);
        aiProfile = {
          ppmMaturityLevel: deducePPMMaturity(strategicProfile),
          governanceScore: mapGovernanceScore(strategicProfile.strategic_context.prioritization_criteria),
          visibilityScore: 7, // Default good score
          portfolioComplexity: strategicProfile.company_identity.operational_scale,
          primaryFocus: strategicProfile.strategic_context.primary_pain_point,
          strengths: strategicProfile.recommendations.map(r => r.title).slice(0, 3),
          challenges: [strategicProfile.strategic_context.primary_pain_point],
          readinessForCensus: 'ready',
          // NEW: Add strategic profile reference
          strategic_profile_id: null // Will be set after save
        };
        aiRecommendations = strategicProfile.recommendations;
        aiSummary = strategicProfile.executive_summary;
        censusStrategy = {
          suggestedApproach: 'Strategic approach based on company profile',
          startingPoint: strategicProfile.themis_context.census_scope[0],
          expectedInitiatives: strategicProfile.themis_context.initial_volume_estimate,
          priorityCategories: strategicProfile.themis_context.census_scope
        };

        console.log(`✅ Analisi STRATEGICA completata - Cluster: ${aiCluster}`);

        // ⚡ OPTIMIZATION: Removed blocking comparison call - saves 2-3 seconds
        // Old comparison logic removed to reduce latency
        // To re-enable for debugging, uncomment below:
        // const oldAgent = getAssessmentAgent();
        // const oldAnalysis = await oldAgent.analyze(answers as AssessmentAnswers);
        // console.log(`Old vs New Cluster: ${oldAnalysis.cluster} vs ${aiCluster}`);

      } catch (aiError: any) {
        console.error('⚠️ Errore strategic agent, uso fallback:', aiError.message);
        console.error(aiError.stack);
        const fallback = calculateLocalAnalysis(answers);
        aiCluster = fallback.cluster;
        aiProfile = fallback.profile;
        aiRecommendations = fallback.recommendations;
        aiSummary = fallback.summary;
        censusStrategy = fallback.censusStrategy;
      }
    } else {
      console.log('📊 OPENAI_API_KEY non presente, uso logica locale');
      const fallback = calculateLocalAnalysis(answers);
      aiCluster = fallback.cluster;
      aiProfile = fallback.profile;
      aiRecommendations = fallback.recommendations;
      aiSummary = fallback.summary;
      censusStrategy = fallback.censusStrategy;
    }

    // Salva o aggiorna assessment
    const { data: assessment, error } = await supabase
      .from('company_assessments')
      .upsert({
        company_id: user.company_id,
        answers,
        ai_cluster: aiCluster,
        ai_profile: { ...aiProfile, censusStrategy },
        ai_recommendations: aiRecommendations,
        completed_at: completedAt || new Date().toISOString()
      }, { onConflict: 'company_id' })
      .select()
      .single();

    if (error) {
      console.error('❌ Errore salvataggio assessment:', error);
      return res.status(500).json({ error: 'Errore salvataggio assessment', details: error.message });
    }

    console.log('✅ Assessment salvato con ID:', assessment.id);

    // Salva snapshot strutturato su Supabase per il frontend
    const snapshotData = {
      snapshotVersion: '1.0',
      assessmentId: assessment.id,
      tenantId: user.company_id,
      companyName: company?.name || 'Azienda',
      cluster: aiCluster,
      createdAt: new Date().toISOString(),
      executiveSummary: aiSummary || '',
      maturityProfile: {
        overallScore: calculateOverallScore(aiProfile as Record<string, unknown>),
        clusterLabel: clusterLabels[aiCluster] || aiCluster,
        dimensions: strategicProfile
          ? buildDimensionsFromStrategic(strategicProfile)
          : buildDimensionsFromProfile(aiProfile as Record<string, unknown>)
      },
      swot: {
        strengths: (aiProfile as Record<string, unknown>).strengths || [],
        weaknesses: (aiProfile as Record<string, unknown>).challenges || [],
        opportunities: ['Digitalizzazione processi', 'Dashboard real-time', 'Formazione team'],
        threats: ['Resistenza al cambiamento', 'Risorse limitate']
      },
      immediatePriorities: aiRecommendations.slice(0, 3).map((rec: Record<string, unknown>, idx: number) => ({
        id: `priority-${idx + 1}`,
        title: rec.title,
        summary: rec.description,
        impact: rec.priority === 'immediate' ? 'high' : rec.priority === 'short_term' ? 'medium' : 'low',
        effort: 'medium',
        confidence: 0.8,
        rationale: rec.description,
        owners: [],
        estimatedTTR_months: rec.priority === 'immediate' ? 1 : rec.priority === 'short_term' ? 3 : 6
      })),
      confidenceOverall: 'Medium',
      // NEW: Include full strategic profile for schema inference
      strategic_profile: strategicProfile || undefined
    };

    // Salva snapshot su tabella dedicata
    await saveAssessmentSnapshot(snapshotData as unknown as import('../agents/schemas/assessmentSnapshotSchema').AssessmentSnapshot);
    console.log('💾 Snapshot salvato su Supabase');

    // Aggiorna step onboarding
    await supabase
      .from('companies')
      .update({ onboarding_step: 'categories' })
      .eq('id', user.company_id);

    res.json({
      success: true,
      assessment,
      cluster: aiCluster,
      clusterLabel: clusterLabels[aiCluster] || aiCluster,
      profile: aiProfile,
      recommendations: aiRecommendations,
      summary: aiSummary,
      censusStrategy,
      // NEW: Strategic assessment data
      strategic_profile: strategicProfile ? {
        industry: strategicProfile.company_identity.industry,
        business_model: strategicProfile.company_identity.business_model,
        confidence_score: strategicProfile.confidence_score,
        rag_config: strategicProfile.rag_training_config,
        schema_hints: strategicProfile.schema_inference_hints
      } : undefined,
      rag_training_stats: ragTrainingStats
    });

  } catch (error: any) {
    console.error('❌ Errore assessment:', error);
    res.status(500).json({ error: 'Errore interno del server', details: error.message });
  }
});

// GET /api/assessment - Recupera assessment azienda
router.get('/', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;

    const { data: user } = await supabase
      .from('users')
      .select('company_id')
      .eq('id', userId)
      .single();

    if (!user) {
      return res.status(400).json({ error: 'Utente non trovato' });
    }

    const { data: assessment, error } = await supabase
      .from('company_assessments')
      .select('*')
      .eq('company_id', user.company_id)
      .single();

    if (error && error.code !== 'PGRST116') {
      return res.status(500).json({ error: 'Errore recupero assessment' });
    }

    res.json({ assessment: assessment || null });

  } catch (error) {
    console.error('Errore get assessment:', error);
    res.status(500).json({ error: 'Errore interno del server' });
  }
});

// GET /api/assessment/clusters - Lista cluster disponibili
router.get('/clusters', async (req: Request, res: Response) => {
  const clusters = [
    { id: 'ppm_starter', label: 'PPM Starter', description: 'Gestione iniziative ad-hoc, senza processi formali', icon: '🌱', color: 'gray' },
    { id: 'ppm_emerging', label: 'PPM Emergente', description: 'Primi processi in sviluppo, visibilità limitata', icon: '🌿', color: 'green' },
    { id: 'ppm_defined', label: 'PPM Definito', description: 'Processi documentati, governance presente', icon: '📋', color: 'blue' },
    { id: 'ppm_managed', label: 'PPM Gestito', description: 'KPI e metriche, decisioni data-driven', icon: '📊', color: 'purple' },
    { id: 'ppm_optimized', label: 'PPM Ottimizzato', description: 'Best practice consolidate, miglioramento continuo', icon: '🎯', color: 'cyan' },
    { id: 'innovation_lab', label: 'Innovation Lab', description: 'Focus su R&D e sperimentazione', icon: '🔬', color: 'pink' },
    { id: 'service_catalog', label: 'Service Catalog', description: 'Focus su catalogazione servizi', icon: '📚', color: 'orange' },
    { id: 'product_portfolio', label: 'Product Portfolio', description: 'Focus su gestione prodotti', icon: '📦', color: 'indigo' }
  ];

  res.json({ clusters });
});

// GET /api/assessment/:assessmentId/snapshot - Recupera snapshot assessment
router.get('/:assessmentId/snapshot', authenticate, async (req: Request, res: Response) => {
  try {
    const { assessmentId } = req.params;
    const userId = (req as any).user.userId;

    console.log('📊 Richiesta snapshot per assessmentId:', assessmentId);

    // Prima prova a recuperare dalla tabella snapshot dedicata
    const { data: savedSnapshot } = await supabase
      .from('company_assessment_snapshots')
      .select('snapshot')
      .eq('assessment_id', assessmentId)
      .single();

    if (savedSnapshot?.snapshot) {
      console.log('✅ Snapshot trovato nella tabella dedicata');
      return res.json({ snapshot: savedSnapshot.snapshot });
    }

    // Fallback: genera snapshot dalla tabella company_assessments
    const { data: assessment, error: assessmentError } = await supabase
      .from('company_assessments')
      .select('*')
      .eq('id', assessmentId)
      .single();

    if (assessmentError || !assessment) {
      console.error('❌ Assessment non trovato:', assessmentError);
      return res.status(404).json({ error: 'Assessment non trovato' });
    }

    // Verifica che l'utente appartenga alla stessa company
    const { data: user } = await supabase
      .from('users')
      .select('company_id')
      .eq('id', userId)
      .single();

    if (!user || user.company_id !== assessment.company_id) {
      return res.status(403).json({ error: 'Non autorizzato' });
    }

    // Recupera nome azienda
    const { data: company } = await supabase
      .from('companies')
      .select('name')
      .eq('id', assessment.company_id)
      .single();

    // Costruisci lo snapshot dalla struttura esistente
    const profile = assessment.ai_profile || {};
    const recommendations = assessment.ai_recommendations || [];
    
    // Genera snapshot nel formato richiesto dal frontend
    const snapshot = {
      snapshotVersion: '1.0',
      assessmentId: assessment.id,
      companyName: company?.name || 'Azienda',
      cluster: assessment.ai_cluster,
      createdAt: assessment.completed_at,
      maturityProfile: {
      overallScore: calculateOverallScore(profile),
      clusterLabel: clusterLabels[assessment.ai_cluster] || assessment.ai_cluster,
      dimensions: assessment.ai_profile?.strategic_profile
        ? buildDimensionsFromStrategic(assessment.ai_profile.strategic_profile as any)
        : buildDimensionsFromProfile(profile as Record<string, unknown>)
    },
      swot: {
        strengths: profile.strengths || ['Team motivato', 'Volontà di migliorare'],
        weaknesses: profile.challenges || ['Processi non standardizzati'],
        opportunities: ['Digitalizzazione processi', 'Dashboard real-time'],
        threats: ['Resistenza al cambiamento', 'Risorse limitate']
      },
      immediatePriorities: recommendations.slice(0, 3).map((rec: Record<string, unknown>, idx: number) => ({
        id: `priority-${idx + 1}`,
        title: rec.title,
        summary: rec.description,
        impact: rec.priority === 'immediate' ? 'high' : rec.priority === 'short_term' ? 'medium' : 'low',
        effort: 'medium',
        confidence: 0.8,
        rationale: rec.description,
        owners: [],
        estimatedTTR_months: rec.priority === 'immediate' ? 1 : rec.priority === 'short_term' ? 3 : 6
      })),
      confidenceOverall: 'Medium'
    };

    res.json({ snapshot });

  } catch (error: unknown) {
    console.error('❌ Errore snapshot:', error);
    res.status(500).json({ error: 'Errore interno del server', details: error instanceof Error ? error.message : 'Unknown error' });
  }
});

// Funzione helper per generare SWOT
function generateSwot(profile: any, cluster: string) {
  return {
    strengths: profile.strengths || ['Volontà di migliorare', 'Team motivato'],
    weaknesses: profile.challenges || ['Processi non standardizzati', 'Visibilità limitata'],
    opportunities: [
      'Digitalizzazione dei processi',
      'Implementazione dashboard real-time',
      'Formazione team su best practice PPM'
    ],
    threats: [
      'Resistenza al cambiamento',
      'Risorse limitate',
      'Priorità concorrenti'
    ]
  };
}

// Funzione di fallback per analisi locale (senza AI)
function calculateLocalAnalysis(answers: Record<number, any>) {
  const portfolioSize = answers[1] || '';
  const governance = answers[2] || '';
  const prioritization = answers[3] || [];
  const visibility = parseInt(answers[4]) || 3;
  const mainChallenge = answers[5] || '';
  const initiativeTypes = answers[6] || [];
  const mainGoal = answers[7] || '';

  // Calcola cluster
  let cluster = 'ppm_emerging';
  let ppmMaturityLevel = 2;

  if (governance.includes('Non abbiamo un processo')) {
    cluster = 'ppm_starter';
    ppmMaturityLevel = 1;
  } else if (governance.includes('Portfolio Review Board') && Array.isArray(prioritization) && prioritization.length >= 4) {
    cluster = 'ppm_managed';
    ppmMaturityLevel = 4;
  } else if (governance.includes('Comitato direttivo') && Array.isArray(prioritization) && prioritization.length >= 2) {
    cluster = 'ppm_defined';
    ppmMaturityLevel = 3;
  }

  // Override per focus specifici
  if (mainGoal.includes('catalogo servizi')) {
    cluster = 'service_catalog';
  } else if (Array.isArray(initiativeTypes) && initiativeTypes.includes('Innovazione / R&D')) {
    cluster = 'innovation_lab';
  }

  const profile = {
    ppmMaturityLevel,
    governanceScore: governance.includes('Board') ? 8 : governance.includes('Comitato') ? 6 : 3,
    visibilityScore: visibility * 2,
    portfolioComplexity: portfolioSize.includes('50') ? 'very_high' : portfolioSize.includes('30') ? 'high' : 'medium',
    primaryFocus: mainGoal,
    strengths: identifyLocalStrengths(answers),
    challenges: [mainChallenge],
    readinessForCensus: visibility >= 3 ? 'ready' : 'needs_prep'
  };

  const recommendations = generateLocalRecommendations(cluster, mainChallenge);

  const censusStrategy = {
    suggestedApproach: portfolioSize.includes('50') 
      ? 'Approccio incrementale: inizia da un\'area pilota' 
      : 'Approccio completo: censimento full in 2-3 settimane',
    startingPoint: Array.isArray(initiativeTypes) && initiativeTypes[0] ? initiativeTypes[0] : 'Iniziative più critiche',
    expectedInitiatives: portfolioSize,
    priorityCategories: Array.isArray(initiativeTypes) ? initiativeTypes.slice(0, 3) : []
  };

  return {
    cluster,
    profile,
    recommendations,
    summary: `La tua organizzazione ha un livello di maturità PPM "${clusterLabels[cluster] || cluster}". La sfida principale è "${mainChallenge}". Ti consigliamo di iniziare il censimento da ${censusStrategy.startingPoint}.`,
    censusStrategy
  };
}

function identifyLocalStrengths(answers: Record<number, any>): string[] {
  const strengths: string[] = [];
  const prioritization = answers[3] || [];
  const visibility = parseInt(answers[4]) || 3;
  const governance = answers[2] || '';

  if (Array.isArray(prioritization)) {
    if (prioritization.includes('ROI')) strengths.push('Approccio data-driven al business case');
    if (prioritization.includes('Allineamento strategico')) strengths.push('Focus sull\'allineamento strategico');
  }
  if (visibility >= 4) strengths.push('Buona trasparenza sullo stato iniziative');
  if (governance.includes('Board') || governance.includes('Comitato')) {
    strengths.push('Governance strutturata presente');
  }
  
  if (strengths.length === 0) strengths.push('Volontà di migliorare i processi');
  
  return strengths;
}

function generateLocalRecommendations(cluster: string, challenge: string) {
  const recs = [];

  // Quick win
  recs.push({
    title: 'Quick Win: Lista Iniziative Attive',
    description: 'Prima di tutto, crea una lista semplice di tutte le iniziative attive. Bastano nome, owner e stato.',
    priority: 'immediate',
    category: 'census',
    actionItems: ['Scarica il template Excel', 'Identifica i 3 owner principali', 'Raccogli info in 1 settimana']
  });

  // Basato sulla sfida
  if (challenge.includes('Troppe iniziative')) {
    recs.push({
      title: 'Prioritizzazione Portfolio',
      description: 'Definisci criteri chiari per classificare le iniziative: Must-have, Should-have, Nice-to-have.',
      priority: 'short_term',
      category: 'prioritization',
      actionItems: ['Definisci 3-5 criteri di priorità', 'Crea matrice di scoring', 'Valuta le top 10 iniziative']
    });
  } else if (challenge.includes('visibilità')) {
    recs.push({
      title: 'Dashboard Portfolio',
      description: 'Implementa una dashboard semplice per visualizzare stato e avanzamento delle iniziative.',
      priority: 'short_term',
      category: 'visibility',
      actionItems: ['Definisci KPI essenziali', 'Scegli tool di visualizzazione', 'Setup review settimanale']
    });
  } else if (challenge.includes('misurare')) {
    recs.push({
      title: 'Framework di Misurazione',
      description: 'Definisci metriche chiare per ogni tipo di iniziativa: ROI, time-to-value, customer impact.',
      priority: 'short_term',
      category: 'process',
      actionItems: ['Mappa tipi iniziativa → metriche', 'Definisci baseline', 'Implementa tracking trimestrale']
    });
  } else {
    recs.push({
      title: 'Assessment Iniziative',
      description: 'Valuta ogni iniziativa su criteri standard: valore, rischio, effort, allineamento strategico.',
      priority: 'short_term',
      category: 'process',
      actionItems: ['Crea scorecard', 'Valuta prime 5 iniziative', 'Itera e migliora']
    });
  }

  // Governance per cluster base
  if (cluster === 'ppm_starter' || cluster === 'ppm_emerging') {
    recs.push({
      title: 'Setup Governance Base',
      description: 'Definisci chi decide cosa: ruoli, responsabilità e processo di approvazione.',
      priority: 'medium_term',
      category: 'governance',
      actionItems: ['Identifica decision maker', 'Definisci processo Go/No-Go', 'Schedula prima portfolio review']
    });
  }

  return recs;
}

// Calcola overall score basato sul profilo
function calculateOverallScore(profile: Record<string, unknown>): number {
  const ppmLevel = (profile.ppmMaturityLevel as number) || 2;
  const governanceScore = (profile.governanceScore as number) || 5;
  const visibilityScore = (profile.visibilityScore as number) || 6;

  // Media ponderata normalizzata a 100
  const normalizedPpm = (ppmLevel / 5) * 100;
  const normalizedGov = (governanceScore / 10) * 100;
  const normalizedVis = (visibilityScore / 10) * 100;

  return Math.round((normalizedPpm * 0.4 + normalizedGov * 0.3 + normalizedVis * 0.3));
}

// Build dimensions leveraging strategic profile when disponibile
function buildDimensionsFromStrategic(profile: StrategicAssessmentProfile) {
  const ppmLevel = deducePPMMaturity(profile);
  const criteria = profile.strategic_context?.prioritization_criteria;

  // Calculate scores based on actual criteria weights, with differentiation
  // Each criterion is 1-5, we need to create variance and meaningful scores

  // Strategic Alignment: based on strategic_alignment_weight + business model maturity
  const strategicWeight = criteria?.strategic_alignment_weight || 3;
  const scaleBonus = mapScaleToBonus(profile.company_identity.operational_scale);
  const strategicAlignmentScore = Math.min(10, Math.max(3,
    Math.round(strategicWeight * 1.5 + scaleBonus)
  ));

  // ROI Focus: based on roi_weight + profitability consideration
  const roiWeight = criteria?.roi_weight || 3;
  const roiFocusScore = Math.min(10, Math.max(3,
    Math.round(roiWeight * 1.8 + (criteria?.market_size_weight || 3) * 0.4)
  ));

  // Innovation Capacity: based on innovation_weight + competitive advantage
  const innovationWeight = criteria?.innovation_weight || 3;
  const competitiveWeight = criteria?.competitive_advantage_weight || 3;
  const innovationCapacityScore = Math.min(10, Math.max(3,
    Math.round((innovationWeight * 1.4 + competitiveWeight * 0.6))
  ));

  // Customer Focus: based on customer_demand_weight + governance maturity
  const customerWeight = criteria?.customer_demand_weight || 3;
  const governanceBonus = mapGovernanceToBonus(profile.strategic_context.governance_model);
  const customerFocusScore = Math.min(10, Math.max(3,
    Math.round(customerWeight * 1.6 + governanceBonus)
  ));

  // Time to Market: based on time_to_market_weight + resource constraints
  const ttmWeight = criteria?.time_to_market_weight || 3;
  const resourceWeight = criteria?.resource_availability_weight || 3;
  const timeToMarketScore = Math.min(10, Math.max(3,
    Math.round(ttmWeight * 1.4 + resourceWeight * 0.5)
  ));

  return [
    {
      name: 'Allineamento Strategico',
      nameEN: 'Strategic Alignment',
      score: strategicAlignmentScore,
      description: 'Quanto le iniziative supportano gli obiettivi aziendali'
    },
    {
      name: 'Focus sul ROI',
      nameEN: 'ROI Focus',
      score: roiFocusScore,
      description: 'Capacità di valutare e massimizzare il ritorno sugli investimenti'
    },
    {
      name: 'Capacità di Innovazione',
      nameEN: 'Innovation Capacity',
      score: innovationCapacityScore,
      description: 'Propensione all\'innovazione e adozione di nuove tecnologie'
    },
    {
      name: 'Orientamento al Cliente',
      nameEN: 'Customer Focus',
      score: customerFocusScore,
      description: 'Quanto le decisioni sono guidate dai bisogni del cliente'
    },
    {
      name: 'Velocità di Esecuzione',
      nameEN: 'Time to Market',
      score: timeToMarketScore,
      description: 'Capacità di portare rapidamente le iniziative sul mercato'
    }
  ];
}

// Helper: bonus based on operational scale
function mapScaleToBonus(scale: string): number {
  const bonuses: Record<string, number> = {
    'startup': 0,
    'scaleup': 1,
    'mid_market': 2,
    'enterprise': 3,
    'conglomerate': 3
  };
  return bonuses[scale] || 1;
}

// Helper: bonus based on governance model
function mapGovernanceToBonus(governance: string): number {
  const bonuses: Record<string, number> = {
    'ad_hoc': 0,
    'ceo_centralized': 1,
    'business_unit_autonomous': 1,
    'executive_committee': 2,
    'product_council': 2,
    'approval_matrix': 3,
    'data_driven_kpi': 3,
    'agile_dynamic': 2
  };
  return bonuses[governance] || 1;
}

// Build dimensions from legacy ai_profile
function buildDimensionsFromProfile(profile: Record<string, unknown>) {
  const ppmLevel = (profile.ppmMaturityLevel as number) || 2;
  const governanceScore = (profile.governanceScore as number) || 5;
  const visibilityScore = Math.min(10, Math.round(((profile.visibilityScore as number) || 6)));

  // More varied calculations for legacy profiles
  const strategyScore = Math.min(10, Math.max(3, Math.round(governanceScore * 0.8 + ppmLevel)));
  const executionScore = Math.min(10, Math.max(3, Math.round(ppmLevel * 1.8 + visibilityScore * 0.2)));
  const resourceScore = Math.min(10, Math.max(3, Math.round(governanceScore * 0.6 + executionScore * 0.4)));
  const innovationScore = Math.min(10, Math.max(3, Math.round(visibilityScore * 0.7 + ppmLevel * 0.8)));
  const customerScore = Math.min(10, Math.max(3, Math.round((strategyScore + innovationScore) / 2)));

  return [
    {
      name: 'Allineamento Strategico',
      nameEN: 'Strategic Alignment',
      score: strategyScore,
      description: 'Quanto le iniziative supportano gli obiettivi aziendali'
    },
    {
      name: 'Focus sul ROI',
      nameEN: 'ROI Focus',
      score: governanceScore,
      description: 'Capacità di valutare e massimizzare il ritorno sugli investimenti'
    },
    {
      name: 'Capacità di Innovazione',
      nameEN: 'Innovation Capacity',
      score: innovationScore,
      description: 'Propensione all\'innovazione e adozione di nuove tecnologie'
    },
    {
      name: 'Orientamento al Cliente',
      nameEN: 'Customer Focus',
      score: customerScore,
      description: 'Quanto le decisioni sono guidate dai bisogni del cliente'
    },
    {
      name: 'Velocità di Esecuzione',
      nameEN: 'Time to Market',
      score: executionScore,
      description: 'Capacità di portare rapidamente le iniziative sul mercato'
    }
  ];
}

// Transform assessment answers to strategic assessment format
function transformToStrategicAnswers(oldAnswers: Record<number, any>, companyName: string): Partial<StrategicAnswers> {
  // CURRENT FORMAT (9 questions):
  // 1. Industry (single choice)
  // 2. Business model (single choice)
  // 3. Operational scale (single choice)
  // 4. Portfolio size/count (single choice)
  // 5. Prioritization criteria (multiple choice)
  // 6. Main challenge (single choice)
  // 7. Governance/decision process (single choice)
  // 8. Product types (multiple choice) - for RAG context
  // 9. Service types (multiple choice) - for RAG context

  const industry = oldAnswers[1] || 'General Business';
  const businessModel = oldAnswers[2] || '';
  const operationalScale = oldAnswers[3] || '';
  const portfolioSize = oldAnswers[4] || '';
  const prioritization = oldAnswers[5] || [];
  const mainChallenge = oldAnswers[6] || '';
  const governance = oldAnswers[7] || '';
  const productTypes = oldAnswers[8] || []; // NEW: Product categories for RAG
  const serviceTypes = oldAnswers[9] || []; // NEW: Service categories for RAG

  // Deduce strategic answers from old assessment
  return {
    // A1: Industry (from direct question)
    a1_industry: mapIndustryAnswer(industry),

    // A2: Business Model (from direct question)
    a2_business_model: mapBusinessModel(businessModel),
    a2_product_percentage: 50, // Default assumption
    a2_service_percentage: 50,

    // A3: Scale (from direct question)
    a3_operational_scale: mapOperationalScale(operationalScale),
    a3_geographic_scope: 'single_country', // Default assumption

    // B1: Portfolio counts (from portfolio size)
    b1_product_count: deduceCount(portfolioSize, 'product'),
    b3_service_count: deduceCount(portfolioSize, 'service'),

    // C1: Strategic goals (from main goal)
    c1_strategic_goals: [
      { goal: deriveGoalFromChallenge(mainChallenge), priority: 1 },
      { goal: 'Enhance visibility and control', priority: 2 }
    ],

    // C2: Prioritization criteria weights (from criteria list)
    c2_criteria_weights: {
      roi: Array.isArray(prioritization) && prioritization.includes('ROI') ? 5 : 3,
      strategic_alignment: Array.isArray(prioritization) && prioritization.includes('Allineamento strategico') ? 5 : 3,
      market_size: 3,
      competitive_advantage: 3,
      customer_demand: Array.isArray(prioritization) && prioritization.includes('Customer value') ? 5 : 3,
      innovation: Array.isArray(prioritization) && prioritization.includes('Innovazione') ? 5 : 3,
      resource_availability: 3,
      risk: 3,
      time_to_market: 3
    },

    // C3: Pain point (from main challenge)
    c3_pain_point: mainChallenge || 'Lack of portfolio visibility',
    c3_pain_description: `Primary challenge: ${mainChallenge}`,

    // C4: Governance (from governance question) - must use valid enum values
    c4_governance: governance.includes('Board') ? 'approval_matrix' : governance.includes('Comitato') ? 'executive_committee' : 'ad_hoc',

    // D1: Census scope (from product/service types)
    d1_census_scope: deriveCensusScope(productTypes, serviceTypes),
    d1_volume_estimate: portfolioSize || '10-30 initiatives',

    // D2: THEMIS context
    d2_primary_use_case: 'Portfolio management',
    d2_timeline: 'immediate',

    // NEW: Portfolio examples for RAG training context
    product_types: productTypes,
    service_types: serviceTypes
  };
}

function deduceIndustry(initiativeTypes: any[], mainGoal: string): string {
  if (Array.isArray(initiativeTypes)) {
    if (initiativeTypes.some(t => t.includes('Digital') || t.includes('Technology'))) return 'Information Technology';
    if (initiativeTypes.some(t => t.includes('Product'))) return 'Manufacturing';
    if (initiativeTypes.some(t => t.includes('Service'))) return 'Professional Services';
  }
  if (mainGoal.includes('prodotti')) return 'Manufacturing';
  if (mainGoal.includes('servizi')) return 'Professional Services';
  return 'General Business';
}

function deduceScale(portfolioSize: string): string {
  if (portfolioSize.includes('50+') || portfolioSize.includes('100+')) return 'enterprise';
  if (portfolioSize.includes('30-50')) return 'mid_market';
  if (portfolioSize.includes('10-30')) return 'scaleup';
  return 'startup';
}

// Map industry answer from frontend to strategic profile format
function mapIndustryAnswer(industry: string): string {
  const industryMap: Record<string, string> = {
    'Information Technology': 'Information Technology',
    'Manufacturing': 'Manufacturing',
    'Financial Services': 'Financial Services',
    'Healthcare': 'Healthcare',
    'Retail & E-commerce': 'Retail',
    'Professional Services': 'Professional Services',
    'Education': 'Education',
    'Energy & Utilities': 'Energy',
    'Telecommunications': 'Telecommunications',
    'General Business': 'General Business'
  };
  return industryMap[industry] || 'General Business';
}

// Map business model answer from frontend
function mapBusinessModel(businessModel: string): string {
  if (businessModel.includes('Enterprise')) return 'b2b_enterprise';
  if (businessModel.includes('SMB')) return 'b2b_smb';
  if (businessModel.includes('Consumer') || businessModel.includes('B2C')) return 'b2c';
  if (businessModel.includes('Government') || businessModel.includes('B2G')) return 'b2g';
  if (businessModel.includes('Marketplace') || businessModel.includes('Platform')) return 'marketplace';
  if (businessModel.includes('Hybrid')) return 'hybrid';
  return 'b2b_smb';
}

// Map operational scale answer from frontend
function mapOperationalScale(scale: string): string {
  if (scale.includes('Startup')) return 'startup';
  if (scale.includes('Scale-up')) return 'scaleup';
  if (scale.includes('Mid-Market')) return 'mid_market';
  if (scale.includes('Enterprise')) return 'enterprise';
  if (scale.includes('Conglomerate')) return 'conglomerate';
  return 'startup';
}

// Derive strategic goal from the main challenge
function deriveGoalFromChallenge(challenge: string): string {
  const challengeToGoal: Record<string, string> = {
    'Mancanza di visibilità sul portfolio': 'Improve portfolio visibility and tracking',
    'Difficoltà nella prioritizzazione': 'Enhance prioritization decision-making',
    'Risorse insufficienti / sovraccarico': 'Optimize resource allocation',
    'Scarso allineamento strategico': 'Strengthen strategic alignment',
    'Problemi di go-to-market': 'Accelerate go-to-market execution',
    'Bassa retention / customer value': 'Improve customer value and retention',
    'Innovazione troppo lenta': 'Accelerate innovation velocity',
    'Complessità operativa eccessiva': 'Simplify operational complexity'
  };
  return challengeToGoal[challenge] || 'Improve portfolio management';
}

// Derive census scope from product and service types
function deriveCensusScope(productTypes: string[], serviceTypes: string[]): string[] {
  const scopes: string[] = [];

  if (productTypes.length > 0) {
    scopes.push('all_products');
    if (productTypes.includes('Software / Piattaforme SaaS')) scopes.push('digital_products');
    if (productTypes.includes('Hardware / Dispositivi')) scopes.push('physical_products');
  }

  if (serviceTypes.length > 0) {
    scopes.push('all_services');
    if (serviceTypes.includes('Consulenza Strategica')) scopes.push('consulting');
    if (serviceTypes.includes('Managed Services')) scopes.push('managed_services');
  }

  return scopes.length > 0 ? scopes : ['all_initiatives'];
}

function deduceCount(portfolioSize: string, type: 'product' | 'service'): number {
  const match = portfolioSize.match(/(\d+)/);
  const count = match ? parseInt(match[1]) : 10;
  return type === 'product' ? Math.floor(count * 0.6) : Math.floor(count * 0.4);
}

function mapInitiativeTypeToScope(type: string): string {
  if (type.includes('Product')) return 'all_products';
  if (type.includes('Service')) return 'all_services';
  if (type.includes('Innovation') || type.includes('R&D')) return 'strategic_initiatives';
  return 'all_initiatives';
}

// Map strategic profile to old cluster format
function mapStrategicToCluster(profile: StrategicAssessmentProfile): string {
  const businessModel = profile.company_identity.business_model;
  const productPct = profile.company_identity.product_service_mix.products_percentage;
  const servicePct = profile.company_identity.product_service_mix.services_percentage;
  const scale = profile.company_identity.operational_scale;

  // Determine focus area
  if (productPct > 70) return 'product_portfolio';
  if (servicePct > 70) return 'service_catalog';

  // Check for innovation focus
  const goals = profile.strategic_context.goals_2025_2027;
  const hasInnovationGoal = goals.some(g =>
    g.goal.toLowerCase().includes('innov') ||
    g.goal.toLowerCase().includes('r&d') ||
    g.goal.toLowerCase().includes('research')
  );
  if (hasInnovationGoal) return 'innovation_lab';

  // Map by operational maturity
  if (scale === 'startup' || scale === 'scaleup') return 'ppm_starter';
  if (scale === 'mid_market') return 'ppm_emerging';
  if (scale === 'enterprise' || scale === 'conglomerate') {
    // Check governance maturity
    const governance = profile.strategic_context.prioritization_criteria;
    const totalCriteria = governance.roi_weight + governance.strategic_alignment_weight +
                          governance.market_size_weight + governance.customer_demand_weight + governance.innovation_weight;
    const avgScore = totalCriteria / 5;

    if (avgScore >= 4.5) return 'ppm_optimized';
    if (avgScore >= 3.5) return 'ppm_managed';
    return 'ppm_defined';
  }

  return 'ppm_emerging';
}

// Deduce PPM maturity level from strategic profile
function deducePPMMaturity(profile: StrategicAssessmentProfile): number {
  const scale = profile.company_identity.operational_scale;
  const criteria = profile.strategic_context.prioritization_criteria;

  // Base maturity on scale
  let maturity = 2; // emerging

  if (scale === 'startup') maturity = 1;
  else if (scale === 'scaleup') maturity = 2;
  else if (scale === 'mid_market') maturity = 3;
  else if (scale === 'enterprise' || scale === 'conglomerate') {
    // Check sophistication of criteria
    const avgCriteria = (criteria.roi_weight + criteria.strategic_alignment_weight +
                        criteria.market_size_weight + criteria.customer_demand_weight + criteria.innovation_weight) / 5;
    if (avgCriteria >= 4.5) maturity = 5; // optimized
    else if (avgCriteria >= 3.5) maturity = 4; // managed
    else maturity = 3; // defined
  }

  return maturity;
}

function mapGovernanceScore(criteria: {
  roi_weight: number;
  strategic_alignment_weight: number;
  market_size_weight: number;
  competitive_advantage_weight: number;
  customer_demand_weight: number;
  innovation_weight: number;
  resource_availability_weight: number;
  risk_weight: number;
  time_to_market_weight: number;
}): number {
  // Governance score based on how well-defined prioritization is
  const total = criteria.roi_weight + criteria.strategic_alignment_weight + criteria.market_size_weight +
                criteria.customer_demand_weight + criteria.innovation_weight;
  const avg = total / 5;

  // Map 1-5 scale to 1-10 score
  return Math.round(avg * 2);
}

export default router;
