/**
 * Strategic Assessment Agent
 *
 * Advanced assessment agent that creates comprehensive company profiles
 * to feed RAG training, schema inference, and strategic Q&A generation.
 *
 * This agent focuses on:
 * - Industry context and terminology
 * - Product/Service examples for RAG training
 * - Strategic goals and prioritization criteria
 * - Schema pre-filling hints
 * - Intelligent Q&A generation context
 */

import { ChatOpenAI } from '@langchain/openai';
import { PromptTemplate } from '@langchain/core/prompts';
import { StructuredOutputParser } from '@langchain/core/output_parsers';
import fs from 'fs';
import path from 'path';

import {
  StrategicAssessmentProfileSchema,
  type StrategicAssessmentProfile,
  type AssessmentAnswers,
  type CompanyIdentity,
  type PortfolioComposition,
  type StrategicContext,
} from './schemas/strategicAssessmentSchema';

export interface StrategicAssessmentInput {
  tenant_id?: string;
  company_name?: string;
  answers: AssessmentAnswers;
}

export class StrategicAssessmentAgent {
  private model: ChatOpenAI;
  private parser: StructuredOutputParser<typeof StrategicAssessmentProfileSchema>;
  private systemPromptText: string;

  constructor(apiKey?: string) {
    this.model = new ChatOpenAI({
      modelName: 'gpt-4o',  // Use gpt-4o for better strategic analysis
      temperature: 0.3,
      openAIApiKey: apiKey || process.env.OPENAI_API_KEY,
    });

    this.parser = StructuredOutputParser.fromZodSchema(StrategicAssessmentProfileSchema);

    // Load the strategic assessment system prompt
    try {
      const promptPath = path.resolve(__dirname, './prompts/strategic-assessment-prompt.md');
      this.systemPromptText = fs.readFileSync(promptPath, { encoding: 'utf8' });
    } catch (e) {
      console.warn('Could not load strategic assessment prompt file, using fallback');
      this.systemPromptText = this.getFallbackPrompt();
    }
  }

  /**
   * Generate complete strategic assessment profile from answers
   */
  async generateProfile(input: StrategicAssessmentInput): Promise<StrategicAssessmentProfile> {
    try {
      const formattedAnswers = this.formatAnswersForPrompt(input.answers);

      const prompt = new PromptTemplate({
        template: `${this.systemPromptText}

COMPANY INFORMATION:
Company Name: {company_name}
Tenant ID: {tenant_id}

ASSESSMENT ANSWERS:
{answers}

INSTRUCTIONS:
Analyze these answers and generate a COMPLETE Strategic Assessment Profile in JSON format.

Focus on:
1. Extracting industry-specific terminology and context
2. Creating RAG training configuration from product/service examples
3. Mapping business model to schema inference hints
4. Identifying strategic priorities for Q&A generation
5. Generating actionable recommendations

{format_instructions}

Return ONLY valid JSON matching the StrategicAssessmentProfile schema.`,
        inputVariables: ['company_name', 'tenant_id', 'answers'],
        partialVariables: {
          format_instructions: this.parser.getFormatInstructions(),
        },
      });

      const formattedPrompt = await prompt.format({
        company_name: input.company_name || 'Unknown',
        tenant_id: input.tenant_id || 'unknown',
        answers: formattedAnswers,
      });

      const response = await this.model.invoke(formattedPrompt);

      const content = typeof response.content === 'string'
        ? response.content
        : JSON.stringify(response.content);

      // Pre-process to fix common LLM enum value mistakes
      const fixedContent = this.fixEnumValues(content);

      // Parse and validate against schema
      const profile = await this.parser.parse(fixedContent);

      // Add metadata
      profile.generated_at = new Date().toISOString();
      profile.assessment_version = '2.0';

      // Calculate confidence score
      profile.confidence_score = this.calculateConfidenceScore(profile);

      return profile;
    } catch (error) {
      console.error('Error generating strategic assessment profile:', error);
      throw new Error(`Failed to generate strategic profile: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Quick analysis - generate only company identity
   */
  async generateQuickProfile(answers: AssessmentAnswers): Promise<CompanyIdentity> {
    const quickPrompt = new PromptTemplate({
      template: `You are a strategic consultant analyzing a company.

ASSESSMENT ANSWERS:
{answers}

Generate ONLY the company identity section with:
- industry
- business_model
- product_service_mix
- operational_scale
- geographic_scope
- value_proposition (brief)

Return valid JSON matching CompanyIdentity schema.

{format_instructions}`,
      inputVariables: ['answers'],
      partialVariables: {
        format_instructions: StructuredOutputParser.fromZodSchema(
          StrategicAssessmentProfileSchema.shape.company_identity
        ).getFormatInstructions(),
      },
    });

    const formattedPrompt = await quickPrompt.format({
      answers: this.formatAnswersForPrompt(answers),
    });

    const response = await this.model.invoke(formattedPrompt);
    const content = typeof response.content === 'string'
      ? response.content
      : JSON.stringify(response.content);

    const parser = StructuredOutputParser.fromZodSchema(
      StrategicAssessmentProfileSchema.shape.company_identity
    );

    return await parser.parse(content);
  }

  /**
   * Extract RAG training configuration from profile
   */
  extractRAGConfig(profile: StrategicAssessmentProfile) {
    return profile.rag_training_config;
  }

  /**
   * Extract schema inference hints from profile
   */
  extractSchemaHints(profile: StrategicAssessmentProfile) {
    return profile.schema_inference_hints;
  }

  /**
   * Extract Q&A generation context from profile
   */
  extractQAContext(profile: StrategicAssessmentProfile) {
    return {
      ...profile.qa_generation_context,
      strategic_goals: profile.strategic_context.goals_2025_2027,
      prioritization_criteria: profile.strategic_context.prioritization_criteria,
      pain_point: profile.strategic_context.primary_pain_point,
    };
  }

  /**
   * Generate recommendations based on specific focus areas
   */
  async generateTargetedRecommendations(
    profile: StrategicAssessmentProfile,
    focusAreas: string[]
  ): Promise<StrategicAssessmentProfile['recommendations']> {
    const recPrompt = new PromptTemplate({
      template: `Generate 3-5 strategic recommendations for a company with this profile:

Industry: {industry}
Business Model: {business_model}
Strategic Goals: {goals}
Primary Pain Point: {pain_point}

Focus specifically on these areas:
{focus_areas}

Each recommendation should have:
- title (concise)
- category (onboarding, data_quality, strategic_alignment, process_improvement, quick_win, integration, governance)
- priority (immediate, short_term, medium_term)
- rationale (why this matters)
- action_items (3-5 concrete steps)
- expected_impact (what will improve)

Return ONLY a JSON array of recommendations.`,
      inputVariables: ['industry', 'business_model', 'goals', 'pain_point', 'focus_areas'],
    });

    const formattedPrompt = await recPrompt.format({
      industry: profile.company_identity.industry,
      business_model: profile.company_identity.business_model,
      goals: profile.strategic_context.goals_2025_2027.map(g => g.goal).join(', '),
      pain_point: profile.strategic_context.primary_pain_point,
      focus_areas: focusAreas.join('\n- '),
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

  /**
   * Fix common enum value mistakes from LLM output
   */
  private fixEnumValues(content: string): string {
    // Governance model mappings - common LLM outputs to valid values
    const governanceMapping: Record<string, string> = {
      'pmo_board': 'approval_matrix',
      'pmo': 'approval_matrix',
      'board': 'executive_committee',
      'centralized': 'ceo_centralized',
      'decentralized': 'business_unit_autonomous',
      'autonomous': 'business_unit_autonomous',
      'kpi_driven': 'data_driven_kpi',
      'kpi': 'data_driven_kpi',
      'agile': 'agile_dynamic',
      'dynamic': 'agile_dynamic',
      'matrix': 'approval_matrix',
      'council': 'product_council',
      'committee': 'executive_committee',
    };

    // Success metrics mappings - map goal names to valid metric enum values
    const metricsMapping: Record<string, string> = {
      'operational_excellence': 'strategic_alignment_score',
      'operational excellence': 'strategic_alignment_score',
      'digital_transformation': 'innovation_index',
      'digital transformation': 'innovation_index',
      'customer_satisfaction': 'net_promoter_score',
      'customer satisfaction': 'net_promoter_score',
      'customer_retention': 'customer_retention_churn',
      'customer retention': 'customer_retention_churn',
      'revenue_growth': 'revenue_arr_mrr',
      'revenue growth': 'revenue_arr_mrr',
      'profitability': 'profitability_margin',
      'market_position': 'market_share',
      'market position': 'market_share',
      'cost_optimization': 'profitability_margin',
      'cost optimization': 'profitability_margin',
      'time_to_value': 'time_to_market',
      'time to value': 'time_to_market',
      'speed_to_market': 'time_to_market',
      'innovation': 'innovation_index',
      'efficiency': 'resource_utilization',
      'compliance': 'risk_compliance_score',
      'risk_management': 'risk_compliance_score',
      'risk management': 'risk_compliance_score',
      'strategic_alignment': 'strategic_alignment_score',
      'strategic alignment': 'strategic_alignment_score',
      'portfolio_alignment': 'strategic_alignment_score',
    };

    let fixed = content;

    // Fix governance_model values
    for (const [wrong, correct] of Object.entries(governanceMapping)) {
      // Match "governance_model": "wrong_value" pattern
      const regex = new RegExp(`("governance_model"\\s*:\\s*)"${wrong}"`, 'gi');
      fixed = fixed.replace(regex, `$1"${correct}"`);
    }

    // Fix success_metrics metric values
    for (const [wrong, correct] of Object.entries(metricsMapping)) {
      // Match "metric": "wrong_value" pattern in success_metrics array
      const regex = new RegExp(`("metric"\\s*:\\s*)"${wrong}"`, 'gi');
      fixed = fixed.replace(regex, `$1"${correct}"`);
    }

    return fixed;
  }

  /**
   * Calculate confidence score based on data completeness
   */
  private calculateConfidenceScore(profile: StrategicAssessmentProfile): number {
    let score = 0;
    let maxScore = 0;

    // Company Identity (30%)
    maxScore += 30;
    if (profile.company_identity.industry) score += 10;
    if (profile.company_identity.business_model) score += 10;
    if (profile.company_identity.value_proposition) score += 10;

    // Portfolio Composition (40%)
    maxScore += 40;
    if (profile.portfolio_composition.product_portfolio?.top_products?.length) score += 20;
    if (profile.portfolio_composition.service_portfolio?.top_services?.length) score += 20;

    // Strategic Context (20%)
    maxScore += 20;
    if (profile.strategic_context.goals_2025_2027?.length) score += 10;
    if (profile.strategic_context.prioritization_criteria) score += 10;

    // RAG Config (10%)
    maxScore += 10;
    if (profile.rag_training_config.reference_examples.products?.length) score += 5;
    if (profile.rag_training_config.reference_examples.services?.length) score += 5;

    return maxScore > 0 ? score / maxScore : 0;
  }

  /**
   * Format answers for prompt
   */
  private formatAnswersForPrompt(answers: AssessmentAnswers): string {
    const sections = [
      '# SECTION A: COMPANY IDENTITY\n',
      `Industry: ${answers.a1_industry}`,
      answers.a1_vertical ? `Vertical: ${answers.a1_vertical}` : '',
      answers.a1_positioning ? `Positioning: ${answers.a1_positioning}` : '',
      `\nBusiness Model: ${answers.a2_business_model}`,
      `Product/Service Mix: ${answers.a2_product_percentage}% products / ${answers.a2_service_percentage}% services`,
      `\nOperational Scale: ${answers.a3_operational_scale}`,
      `Geographic Scope: ${answers.a3_geographic_scope}`,

      '\n\n# SECTION B: PORTFOLIO COMPOSITION\n',
      answers.b1_product_count !== undefined ? `Total Products: ${answers.b1_product_count}` : '',
      answers.b2_top_products ? `\nTop Products:\n${answers.b2_top_products.map(p => `- ${p.name} (${p.category}): ${p.description}`).join('\n')}` : '',

      answers.b3_service_count !== undefined ? `\nTotal Services: ${answers.b3_service_count}` : '',
      answers.b4_top_services ? `\nTop Services:\n${answers.b4_top_services.map(s => `- ${s.name} (${s.service_type}): ${s.description}`).join('\n')}` : '',

      '\n\n# SECTION C: STRATEGIC CONTEXT\n',
      `Strategic Goals:\n${answers.c1_strategic_goals.map((g, i) => `${i + 1}. ${g.goal} (priority ${g.priority})`).join('\n')}`,
      answers.c1_vision ? `\nVision: ${answers.c1_vision}` : '',

      '\n\nPrioritization Criteria Weights:',
      `- ROI: ${answers.c2_criteria_weights.roi}/5`,
      `- Strategic Alignment: ${answers.c2_criteria_weights.strategic_alignment}/5`,
      `- Market Size: ${answers.c2_criteria_weights.market_size}/5`,
      `- Customer Demand: ${answers.c2_criteria_weights.customer_demand}/5`,
      `- Innovation: ${answers.c2_criteria_weights.innovation}/5`,

      `\nPrimary Pain Point: ${answers.c3_pain_point}`,
      answers.c3_pain_description ? `Pain Details: ${answers.c3_pain_description}` : '',

      `\nGovernance Model: ${answers.c4_governance}`,

      answers.c5_success_metrics ? `\nSuccess Metrics: ${answers.c5_success_metrics.join(', ')}` : '',
      answers.c5_has_dashboard ? `Dashboard: ${answers.c5_dashboard_tool || 'Yes'}` : '',

      // NEW: Product/Service categories selected by user (for RAG context)
      answers.product_types?.length ? `\n\n# PORTFOLIO CATEGORIES (User Selected)\nProduct Types: ${answers.product_types.join(', ')}` : '',
      answers.service_types?.length ? `Service Types: ${answers.service_types.join(', ')}` : '',

      '\n\n# SECTION D: THEMIS CONTEXT\n',
      `Census Scope: ${answers.d1_census_scope.join(', ')}`,
      `Volume Estimate: ${answers.d1_volume_estimate}`,
      answers.d2_data_sources ? `Data Sources: ${answers.d2_data_sources.join(', ')}` : '',
      answers.d2_timeline ? `Timeline: ${answers.d2_timeline}` : '',
      answers.d2_primary_use_case ? `Primary Use Case: ${answers.d2_primary_use_case}` : '',
    ];

    return sections.filter(s => s).join('\n');
  }

  /**
   * Fallback prompt if file can't be loaded
   */
  private getFallbackPrompt(): string {
    return `You are an elite Strategic Portfolio Consultant. Analyze the company assessment answers to create a comprehensive company profile for a Portfolio Management system.

Generate a complete JSON profile including:
1. Company Identity (industry, business model, scale)
2. Portfolio Composition (products, services, examples)
3. Strategic Context (goals, priorities, criteria)
4. RAG Training Config (for AI classification)
5. Schema Inference Hints (for auto-filling)
6. Q&A Generation Context (for intelligent questions)
7. Recommendations (actionable next steps)

Focus on extracting terminology, examples, and strategic context that will help the system understand this specific company and industry.`;
  }
}

// Singleton instance
let strategicAgentInstance: StrategicAssessmentAgent | null = null;

export function getStrategicAssessmentAgent(apiKey?: string): StrategicAssessmentAgent {
  if (!strategicAgentInstance) {
    strategicAgentInstance = new StrategicAssessmentAgent(apiKey);
  }
  return strategicAgentInstance;
}

export default StrategicAssessmentAgent;
