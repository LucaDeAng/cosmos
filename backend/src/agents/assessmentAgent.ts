/**
 * Assessment Analysis Agent
 * 
 * Agente LangChain che analizza le risposte dell'assessment aziendale
 * per Portfolio Management. Determina il profilo di maturità PPM e 
 * genera raccomandazioni per il censimento delle iniziative.
 * 
 * Basato su: PMI Standard for Portfolio Management, MoP, Gartner PPM Maturity
 */

import { ChatOpenAI } from '@langchain/openai';
import { PromptTemplate } from '@langchain/core/prompts';
import { StructuredOutputParser } from '@langchain/core/output_parsers';
import { z } from 'zod';
import fs from 'fs';
import path from 'path';

// snapshot schema (for the company snapshot the agent should produce)
import AssessmentSnapshotSchema, { AssessmentSnapshot } from './schemas/assessmentSnapshotSchema';

// Schema per l'output strutturato dell'analisi PPM
const AssessmentAnalysisSchema = z.object({
  cluster: z.enum([
    'ppm_starter',        // Nessun processo, decisioni ad-hoc
    'ppm_emerging',       // Processi base, visibilità limitata
    'ppm_defined',        // Processi definiti, governance presente
    'ppm_managed',        // Metriche, KPI, portfolio review regolari
    'ppm_optimized',      // Ottimizzazione continua, strategico
    'innovation_lab',     // Focus su R&D e venture
    'service_catalog',    // Focus su catalogo servizi
    'product_portfolio',  // Focus su gestione prodotti
  ]).describe('Cluster di maturità PPM identificato'),
  
  clusterLabel: z.string().describe('Nome leggibile del cluster in italiano'),
  
  confidence: z.number().min(0).max(100).describe('Livello di confidenza della classificazione (0-100)'),
  
  profile: z.object({
    ppmMaturityLevel: z.number().min(1).max(5).describe('Livello maturità Portfolio Management (1-5)'),
    governanceScore: z.number().min(1).max(10).describe('Score governance e decision-making (1-10)'),
    visibilityScore: z.number().min(1).max(10).describe('Score visibilità portfolio (1-10)'),
    // UX-friendly derived values (optional) - added for backwards compatibility
    digitalMaturity: z.string().optional().describe('Label leggibile di maturità digitale (opzionale)'),
    innovationIndex: z.number().min(0).max(10).optional().describe('Indice di innovazione 0-10 (opzionale)'),
    portfolioComplexity: z.enum(['low', 'medium', 'high', 'very_high']).describe('Complessità del portfolio'),
    primaryFocus: z.string().describe('Focus principale per THEMIS'),
    strengths: z.array(z.string()).describe('Punti di forza nella gestione portfolio'),
    challenges: z.array(z.string()).describe('Sfide principali identificate'),
    readinessForCensus: z.enum(['ready', 'needs_prep', 'significant_prep']).describe('Prontezza per il censimento')
  }).describe('Profilo dettagliato PPM'),
  
  recommendations: z.array(z.object({
    title: z.string().describe('Titolo della raccomandazione'),
    description: z.string().describe('Descrizione dettagliata'),
    priority: z.enum(['immediate', 'short_term', 'medium_term']).describe('Priorità temporale'),
    category: z.enum(['governance', 'process', 'visibility', 'prioritization', 'census', 'quick_win']).describe('Categoria'),
    actionItems: z.array(z.string()).describe('Azioni concrete da intraprendere')
  })).min(3).max(5).describe('Raccomandazioni per iniziare il censimento'),
  
  censusStrategy: z.object({
    suggestedApproach: z.string().describe('Approccio consigliato per il censimento'),
    startingPoint: z.string().describe('Da dove iniziare il censimento'),
    expectedInitiatives: z.string().describe('Stima iniziative da censire'),
    priorityCategories: z.array(z.string()).describe('Categorie da censire per prime')
  }).describe('Strategia consigliata per il censimento'),
  
  summary: z.string().describe('Riepilogo executive dell\'analisi in 2-3 frasi')
});

export type AssessmentAnalysis = z.infer<typeof AssessmentAnalysisSchema>;

// Interfaccia per le risposte dell'assessment (allineata alle nuove domande)
export interface AssessmentAnswers {
  [key: number]: string | string[];
}

// Cluster descriptions per Portfolio Management
const CLUSTER_DESCRIPTIONS = `
Cluster di maturità Portfolio Management:

- ppm_starter: Livello iniziale - Nessun processo formale, decisioni ad-hoc, poca visibilità. 
  Tipico di startup early-stage o team che non hanno mai gestito un portfolio strutturato.

- ppm_emerging: Livello emergente - Alcuni processi base esistono, visibilità limitata, 
  decisioni centralizzate ma non strutturate. Iniziano a sentire il bisogno di organizzarsi.

- ppm_defined: Livello definito - Processi documentati, governance presente con ruoli chiari,
  criteri di prioritizzazione esistono ma non sempre applicati sistematicamente.

- ppm_managed: Livello gestito - KPI definiti, portfolio review regolari, decisioni data-driven,
  buona visibilità, allocazione risorse basata su criteri oggettivi.

- ppm_optimized: Livello ottimizzato - Miglioramento continuo, forte allineamento strategico,
  portfolio balancing attivo, capacità predittiva, best practice consolidate.

- innovation_lab: Focus Innovazione - Primario interesse su R&D, venture, sperimentazione.
  Meno struttura tradizionale, più agilità e fail-fast mindset.

- service_catalog: Focus Servizi - Priorità su catalogazione e gestione servizi esistenti.
  Obiettivo: creare service catalog strutturato per clienti interni/esterni.

- product_portfolio: Focus Prodotti - Priorità su gestione portfolio prodotti.
  Obiettivo: lifecycle management, roadmap prodotti, portfolio balancing.
`;

const ASSESSMENT_QUESTIONS_CONTEXT = `
Le domande dell'assessment coprono 7 aree chiave per il Portfolio Management:

1. Portfolio Size (Q1): Numero di iniziative gestite - indica complessità
2. Governance (Q2): Come vengono prese le decisioni - indica maturità organizzativa  
3. Prioritization (Q3): Criteri usati per prioritizzare - indica sofisticazione PPM
4. Visibility (Q4): Trasparenza sullo stato iniziative - indica maturità reporting
5. Challenges (Q5): Problema principale - indica pain point da risolvere
6. Initiative Types (Q6): Tipi di iniziative da censire - indica scope
7. Goals (Q7): Obiettivo con THEMIS - indica aspettative e success criteria
`;

export interface AssessmentSnapshotInput {
  assessmentId?: string | null;
  tenantId?: string | null;
  companyName?: string | null;
  frontendAnswers?: Record<string, unknown> | Array<Record<string, unknown>> | null;
  ai_profile?: Record<string, unknown> | null;
  ai_cluster?: string | null;
  ai_recommendations?: Array<unknown> | null;
  scores?: Record<string, unknown> | null;
  meta?: Record<string, unknown> | null;
}

export class AssessmentAgent {
  private model: ChatOpenAI;
  private parser: StructuredOutputParser<typeof AssessmentAnalysisSchema>;
  private prompt: PromptTemplate;
  private snapshotParser: StructuredOutputParser<typeof AssessmentSnapshotSchema>;
  private systemPromptText: string;

  constructor(apiKey?: string) {
    this.model = new ChatOpenAI({
      modelName: 'gpt-4o-mini',
      temperature: 0.3,
      openAIApiKey: apiKey || process.env.OPENAI_API_KEY,
    });

    this.parser = StructuredOutputParser.fromZodSchema(AssessmentAnalysisSchema);

    // load the system prompt for snapshot generation
    try {
      const promptPath = path.resolve(__dirname, './prompts/assessment-system-prompt.md');
      this.systemPromptText = fs.readFileSync(promptPath, { encoding: 'utf8' });
    } catch (e) {
      // fallback to a small default prompt if the file can't be read
      this.systemPromptText = `You are an expert assessment agent. Produce a concise JSON snapshot using the provided analysis.`;
    }

    this.snapshotParser = StructuredOutputParser.fromZodSchema(AssessmentSnapshotSchema as any);

    this.prompt = new PromptTemplate({
      template: `Sei un esperto di Portfolio Management (PPM) con certificazioni PMI-PfMP e MoP.
Analizza le risposte dell'assessment per determinare il livello di maturità PPM e fornire 
raccomandazioni concrete per iniziare il censimento delle iniziative su THEMIS.

${CLUSTER_DESCRIPTIONS}

${ASSESSMENT_QUESTIONS_CONTEXT}

RISPOSTE ASSESSMENT:
{answers}

ISTRUZIONI:
1. Analizza le risposte considerando le correlazioni tra governance, prioritizzazione e visibilità
2. Identifica il cluster di maturità PPM più appropriato
3. Calcola i punteggi per maturità, governance e visibilità
4. Identifica il pain point principale e come THEMIS può risolverlo
5. Genera 3-5 raccomandazioni ACTIONABLE per iniziare il censimento
6. Definisci una strategia di censimento personalizzata (da dove iniziare, quali categorie prima)
7. Le raccomandazioni devono essere concrete con action items specifici

Focus su: preparare l'utente al passo successivo (censimento iniziative).

Rispondi in italiano.

{format_instructions}`,
      inputVariables: ['answers'],
      partialVariables: {
        format_instructions: this.parser.getFormatInstructions(),
      },
    });
  }

  async analyze(answers: AssessmentAnswers): Promise<AssessmentAnalysis> {
    try {
      const formattedAnswers = this.formatAnswersForPrompt(answers);
      
      const formattedPrompt = await this.prompt.format({
        answers: formattedAnswers,
      });

      const response = await this.model.invoke(formattedPrompt);
      
      const content = typeof response.content === 'string' 
        ? response.content 
        : JSON.stringify(response.content);

      let analysis = await this.parser.parse(content);

      // Ensure derived / UX-friendly fields exist on the profile
      // Use the lightweight helper so tests can import and validate mapping
      const { deriveProfileFields } = await import('./assessmentUtils');
      analysis = deriveProfileFields(analysis);

      return analysis;
    } catch (error) {
      console.error('Error in assessment analysis:', error);
      throw new Error(`Failed to analyze assessment: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate an initial company snapshot JSON from a previously-produced assessment analysis.
   * Uses the system prompt in `backend/src/agents/prompts/assessment-system-prompt.md` and validates against
   * the SnapshotSchema (Zod). If validation fails, an error is thrown so calling code can handle retries.
   */

  /**
   * Generate an initial company snapshot given a structured input payload.
   * Uses the system prompt and validates with AssessmentSnapshotSchema.
   */
  async generateSnapshot(input: AssessmentSnapshotInput): Promise<AssessmentSnapshot> {
    const promptText = `${this.systemPromptText}\n\nINPUT:\n${JSON.stringify(input, null, 2)}\n\n${this.snapshotParser.getFormatInstructions()}`;

    const snapshotPrompt = new PromptTemplate({ template: promptText, inputVariables: [] });
    const formatted = await snapshotPrompt.format({});

    const response = await this.model.invoke(formatted);
    const content = typeof response.content === 'string' ? response.content : JSON.stringify(response.content);

    try {
      const parsed = await this.snapshotParser.parse(content);

      // Ensure input ids are propagated if missing
      if (input.assessmentId && !(parsed as any).assessmentId) {
        (parsed as any).assessmentId = input.assessmentId;
      }
      if (input.tenantId && !(parsed as any).tenantId) {
        (parsed as any).tenantId = input.tenantId;
      }
      if (input.companyName && !(parsed as any).companyName) {
        (parsed as any).companyName = input.companyName;
      }

      return parsed as AssessmentSnapshot;
    } catch (err) {
      console.error('Assessment snapshot validation failed:', err instanceof Error ? err.message : err);
      throw new Error('Assessment snapshot generation or validation failed: ' + (err instanceof Error ? err.message : String(err)));
    }
  }

  /**
   * Backwards-compatible wrapper: convert a previous Analysis object into
   * a minimal AssessmentSnapshotInput and call generateSnapshot.
   * Marked as convenience — consider migrating callers to generateSnapshot.
   */
  async generateSnapshotFromAnalysis(analysis: AssessmentAnalysis, companyName?: string): Promise<AssessmentSnapshot> {
    const input: AssessmentSnapshotInput = {
      assessmentId: null,
      tenantId: null,
      companyName: companyName ?? null,
      frontendAnswers: null,
      ai_profile: (analysis as any).profile ?? null,
      ai_cluster: (analysis as any).cluster ?? null,
      ai_recommendations: (analysis as any).recommendations ?? null,
      scores: {
        confidence: analysis.confidence,
      },
      meta: { summary: analysis.summary ?? null },
    };

    return this.generateSnapshot(input);
  }

  async quickCluster(answers: AssessmentAnswers): Promise<{ cluster: string; confidence: number }> {
    const quickPrompt = new PromptTemplate({
      template: `Analizza queste risposte e determina il cluster di maturità PPM più appropriato.

${CLUSTER_DESCRIPTIONS}

Risposte: {answers}

Rispondi SOLO con JSON: {{"cluster": "nome_cluster", "confidence": numero_0_100}}`,
      inputVariables: ['answers'],
    });

    const formattedPrompt = await quickPrompt.format({
      answers: this.formatAnswersForPrompt(answers),
    });

    const response = await this.model.invoke(formattedPrompt);
    const content = typeof response.content === 'string' 
      ? response.content 
      : JSON.stringify(response.content);

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }

    throw new Error('Could not parse quick cluster response');
  }

  async generateRecommendations(
    cluster: string, 
    profile: AssessmentAnalysis['profile'],
    count: number = 3
  ): Promise<AssessmentAnalysis['recommendations']> {
    const recPrompt = new PromptTemplate({
      template: `Genera {count} raccomandazioni per il censimento iniziative per un'azienda con maturità PPM "{cluster}".

Profilo:
- Maturità PPM: {ppmMaturityLevel}/5
- Governance: {governanceScore}/10
- Visibilità: {visibilityScore}/10
- Sfide: {challenges}

Fornisci raccomandazioni concrete per iniziare il censimento su THEMIS.
Ogni raccomandazione deve avere: title, description, priority (immediate/short_term/medium_term), 
category (governance/process/visibility/prioritization/census/quick_win), actionItems (array di azioni).

Rispondi SOLO con il JSON array.`,
      inputVariables: ['cluster', 'ppmMaturityLevel', 'governanceScore', 'visibilityScore', 'challenges', 'count'],
    });

    const formattedPrompt = await recPrompt.format({
      cluster,
      ppmMaturityLevel: profile.ppmMaturityLevel.toString(),
      governanceScore: profile.governanceScore.toString(),
      visibilityScore: profile.visibilityScore.toString(),
      challenges: profile.challenges.join(', '),
      count: count.toString(),
    });

    const response = await this.model.invoke(formattedPrompt);
    const content = typeof response.content === 'string' 
      ? response.content 
      : JSON.stringify(response.content);

    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }

    return [];
  }

  private formatAnswersForPrompt(answers: AssessmentAnswers): string {
    const questionLabels: Record<number, string> = {
      1: 'Numero iniziative gestite',
      2: 'Processo decisionale',
      3: 'Criteri di prioritizzazione',
      4: 'Visibilità portfolio (1-5)',
      5: 'Sfida principale',
      6: 'Tipi di iniziative da censire',
      7: 'Obiettivo principale con THEMIS'
    };

    return Object.entries(answers)
      .map(([key, value]) => {
        const label = questionLabels[parseInt(key)] || `Domanda ${key}`;
        const displayValue = Array.isArray(value) ? value.join(', ') : value;
        return `- ${label}: ${displayValue}`;
      })
      .join('\n');
  }
}

/**
 * Derive UX-friendly fields from the structured analysis so the UI can rely
 * on stable keys like `digitalMaturity` and `innovationIndex` even if the
 * agent returns the new schema (ppmMaturityLevel / governanceScore / visibilityScore).
 */
// deriveProfileFields moved to lightweight module `assessmentUtils` to avoid
// pulling heavy runtime dependencies into tests.

let agentInstance: AssessmentAgent | null = null;

export function getAssessmentAgent(apiKey?: string): AssessmentAgent {
  if (!agentInstance) {
    agentInstance = new AssessmentAgent(apiKey);
  }
  return agentInstance;
}

export { CLUSTER_DESCRIPTIONS };
