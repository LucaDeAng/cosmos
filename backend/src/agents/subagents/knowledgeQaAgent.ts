/**
 * KnowledgeQA Agent
 * 
 * RAG-based question answering agent that searches the knowledge base
 * and provides contextual answers using semantic search and LLM.
 * Includes persistent conversation memory for context continuity.
 * Enhanced with expert knowledge (consulting frameworks, methodologies,
 * benchmarks, best practices) for strategic insights.
 */

import fs from 'fs';
import path from 'path';
import { ChatOpenAI } from '@langchain/openai';
import { PromptTemplate } from '@langchain/core/prompts';
import { SubAgent, SubAgentResult } from './types';
import { loadAgentContext, buildContextSummary } from '../utils/contextLoader';
import {
  semanticSearch,
  formatSearchResultsForContext,
  SearchResult,
  SourceType,
} from '../utils/embeddingService';
import { normalizeTenantId } from '../../utils/tenant';
import {
  createSession,
  getSession,
  addMessage,
  getMemoryWindow,
  formatMemoryForContext,
  MemoryWindow,
} from '../utils/conversationMemory';
import {
  loadExpertKnowledge,
  ExpertKnowledgeContext,
} from '../utils/expertKnowledgeLoader';

// Load system prompt
let systemPrompt: string;
try {
  const promptPath = path.resolve(__dirname, '../prompts/knowledge-qa-prompt.md');
  systemPrompt = fs.readFileSync(promptPath, { encoding: 'utf8' });
} catch (e) {
  systemPrompt = `You are ORACLE, an expert knowledge assistant for THEMIS IT Portfolio Management.

Your role is to answer questions about the company's IT portfolio, initiatives, strategies, and documents
by combining semantic search results with structured data context.

Guidelines:
1. Base your answers primarily on the provided knowledge context
2. Be specific and cite sources when possible
3. If information is not available, clearly state that
4. Provide actionable insights when appropriate
5. Use clear, professional language`;
}

// Input interface for the KnowledgeQA agent
interface KnowledgeQAInput {
  tenantId: string;
  question: string;
  sessionId?: string;  // For conversation memory
  sourceTypes?: SourceType[];
  includeStructuredData?: boolean;
  includeExpertKnowledge?: boolean;  // Include consulting frameworks and methodologies
  maxResults?: number;
  conversationHistory?: Array<{ role: string; content: string }>;  // Deprecated: use sessionId
}

// Result interface
interface KnowledgeQAResult {
  answer: string;
  sources: Array<{
    sourceType: SourceType;
    sourceId: string | null;
    title: string;
    similarity: number;
  }>;
  structuredDataUsed: boolean;
  expertKnowledgeUsed: boolean;  // Indicates if consulting frameworks were applied
  confidence: 'high' | 'medium' | 'low';
  suggestedFollowUps: string[];
  sessionId?: string;  // Returns session ID for conversation continuity
  frameworksApplied?: string[];  // List of consulting frameworks used
}

// Initialize the LLM
const llm = new ChatOpenAI({
  modelName: 'gpt-4o-mini',
  temperature: 0.3,
  maxTokens: 2000,
});

// Prompt template for answering questions
const qaPromptTemplate = new PromptTemplate({
  template: `{systemPrompt}

## Knowledge Base Context
{knowledgeContext}

## Structured Data Context
{structuredContext}

## Expert Knowledge & Frameworks
{expertKnowledge}

## Conversation History
{conversationHistory}

## Current Question
{question}

Please provide a comprehensive answer based on the above context. When expert frameworks are available,
apply them to provide strategic, consultant-level insights. Structure your response as follows:

1. **Answer**: Your main response to the question, applying relevant frameworks when appropriate
2. **Sources Used**: List the relevant sources you drew from
3. **Frameworks Applied**: List any consulting frameworks or methodologies you used in your analysis
4. **Confidence Level**: high/medium/low based on available information
5. **Suggested Follow-ups**: 2-3 related questions the user might want to explore

Respond in JSON format:
{{
  "answer": "Your detailed answer here, using framework-based analysis when appropriate",
  "sourcesUsed": ["source1", "source2"],
  "frameworksApplied": ["McKinsey 7S", "BCG Matrix", etc],
  "confidence": "high|medium|low",
  "suggestedFollowUps": ["question1", "question2", "question3"]
}}`,
  inputVariables: ['systemPrompt', 'knowledgeContext', 'structuredContext', 'expertKnowledge', 'conversationHistory', 'question'],
});

/**
 * Format conversation history for context
 */
function formatConversationHistory(history?: Array<{ role: string; content: string }>): string {
  if (!history || history.length === 0) {
    return 'No previous conversation.';
  }

  return history
    .slice(-5) // Keep last 5 messages for context
    .map(m => `${m.role.toUpperCase()}: ${m.content}`)
    .join('\n\n');
}

/**
 * Build structured data context from loaded agent context
 */
function buildStructuredContext(context: Awaited<ReturnType<typeof loadAgentContext>>): string {
  const sections: string[] = [];

  // Assessment summary - use any to avoid TS errors with dynamic properties
  if ((context as any).assessment) {
    const assessment = (context as any).assessment;
    sections.push(`### Company Assessment
- Company Stage: ${assessment.stage || 'N/A'}
- Industry: ${assessment.industry || 'N/A'}
- Employees: ${assessment.employees || 'N/A'}
- IT Budget: ${assessment.it_budget || 'N/A'}`);
  }

  // Portfolio summary
  if (context.portfolioItems.length > 0) {
    const initiatives = context.portfolioItems.filter(i => i.type === 'initiative');
    const products = context.portfolioItems.filter(i => i.type === 'product');
    const services = context.portfolioItems.filter(i => i.type === 'service');
    
    sections.push(`### Portfolio Summary
- Total Items: ${context.portfolioItems.length}
- Initiatives: ${initiatives.length}
- Products: ${products.length}
- Services: ${services.length}

#### Recent Initiatives:
${initiatives.slice(0, 5).map(i => `- ${i.name} (${i.status || 'unknown status'}, Priority: ${i.priority || 'N/A'})`).join('\n')}`);
  }

  // Portfolio Assessment
  if (context.portfolioAssessment) {
    const pa = context.portfolioAssessment as any;
    sections.push(`### Portfolio Assessment
- Health Score: ${pa.portfolioHealth?.overallScore || pa.overallScore || 'N/A'}/100
- Balance: ${pa.portfolioHealth?.balanceAssessment || pa.balanceAssessment || 'N/A'}
- Total Items Assessed: ${pa.assessedItems || 0}
- Risk Level: ${pa.portfolioHealth?.riskSummary || pa.riskSummary || 'N/A'}`);
  }

  // Active Roadmap
  if (context.roadmap) {
    const rm = context.roadmap as any;
    sections.push(`### Roadmap
- Total Phases: ${rm.phases?.length || 0}
- Roadmap Horizon: ${rm.horizonMonths || rm.timelineHorizon || 'N/A'} months
- Key Milestones: ${rm.phases?.slice(0, 3).map((p: any) => p.name).join(', ') || rm.keyMilestones?.slice(0, 3).join(', ') || 'None defined'}`);
  }

  // Budget Optimization
  if (context.budgetOptimization) {
    const bo = context.budgetOptimization as any;
    sections.push(`### Budget Optimization
- Total Budget: ${bo.inputSummary?.totalAvailableBudget || bo.totalBudget || 'N/A'}
- Optimized Allocation: ${bo.optimizedAllocation || 'N/A'}
- Potential Savings: ${bo.savingsAnalysis?.potentialSavings || bo.potentialSavings || 'N/A'}`);
  }

  // Strategy Analysis
  if (context.strategyAnalysis) {
    const sa = context.strategyAnalysis as any;
    sections.push(`### Strategy Analysis
- Strategic Focus: ${sa.strategicFocus || sa.executiveSummary?.overallAssessment || 'N/A'}
- Top Priorities: ${sa.executiveSummary?.topPriorities?.slice(0, 3).join(', ') || sa.topPriorities?.slice(0, 3).join(', ') || 'None defined'}
- Risk Assessment: ${sa.riskAssessment?.overallRiskLevel || sa.overallRisk || 'N/A'}`);
  }

  if (sections.length === 0) {
    return 'No structured data available for this company.';
  }

  return sections.join('\n\n');
}

/**
 * Parse LLM response to extract structured result
 */
function parseQAResponse(response: string): Partial<KnowledgeQAResult> {
  try {
    // Try to extract JSON from the response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        answer: parsed.answer || response,
        confidence: (['high', 'medium', 'low'].includes(parsed.confidence) 
          ? parsed.confidence 
          : 'medium') as 'high' | 'medium' | 'low',
        suggestedFollowUps: Array.isArray(parsed.suggestedFollowUps) 
          ? parsed.suggestedFollowUps.slice(0, 3) 
          : [],
        frameworksApplied: Array.isArray(parsed.frameworksApplied)
          ? parsed.frameworksApplied
          : [],
      };
    }
  } catch (e) {
    // JSON parsing failed, use raw response
  }

  return {
    answer: response,
    confidence: 'medium',
    suggestedFollowUps: [],
    frameworksApplied: [],
  };
}

/**
 * Main KnowledgeQA agent implementation
 */
export const knowledgeQaAgent: SubAgent = {
  name: 'KNOWLEDGE_QA',
  
  async run(args: Record<string, unknown>): Promise<SubAgentResult> {
    const input: KnowledgeQAInput = {
      tenantId: args.tenantId as string || args.tenant_id as string || '',
      question: args.question as string || args.query as string || '',
      sessionId: args.sessionId as string | undefined,
      sourceTypes: args.sourceTypes as SourceType[] | undefined,
      includeStructuredData: args.includeStructuredData !== false,
      includeExpertKnowledge: args.includeExpertKnowledge !== false,  // Default to true
      maxResults: (args.maxResults as number) || 10,
      conversationHistory: args.conversationHistory as Array<{ role: string; content: string }> | undefined,
    };

    console.log('[KnowledgeQA] Processing question:', input.question.slice(0, 100));

    if (!input.tenantId || !input.question) {
      return {
        content: JSON.stringify({
          error: 'Missing required parameters: tenantId and question are required',
        }),
        metadata: { routedTo: 'KNOWLEDGE_QA', success: false },
      };
    }

    let sessionId = input.sessionId;

    try {
      // 0. Handle conversation memory
      let memoryContext = 'No conversation history.';
      
      try {
        if (sessionId) {
          // Use existing session
          const session = await getSession(sessionId);
          if (session) {
            const memory = await getMemoryWindow(sessionId);
            memoryContext = formatMemoryForContext(memory);
            console.log(`[KnowledgeQA] Loaded memory from session ${sessionId} (${memory.totalMessages} messages)`);
          } else {
            // Session not found, create new one
            const newSession = await createSession(input.tenantId, undefined, input.question.slice(0, 50));
            sessionId = newSession.id;
            console.log('[KnowledgeQA] Session not found, created new:', sessionId);
          }
        } else {
          // Create new session
          const newSession = await createSession(input.tenantId, undefined, input.question.slice(0, 50));
          sessionId = newSession.id;
          console.log('[KnowledgeQA] Created new session:', sessionId);
        }

        // Add user message to session
        await addMessage(sessionId, 'user', input.question, undefined, {
          sourceTypes: input.sourceTypes,
        });
      } catch (memoryError) {
        console.warn('[KnowledgeQA] Memory system unavailable:', memoryError);
        // Fall back to provided conversation history
        memoryContext = formatConversationHistory(input.conversationHistory);
      }

      // 1. Perform semantic search in knowledge base
      let searchResults: SearchResult[] = [];
      let knowledgeContext = 'No knowledge base entries found.';
      
      try {
        const safeTenantId = normalizeTenantId(input.tenantId);
        if (safeTenantId !== input.tenantId) console.warn(`[KnowledgeQA] Invalid tenantId provided: "${input.tenantId}" - using system catalog fallback`);

        searchResults = await semanticSearch(
          safeTenantId,
          input.question,
          {
            sourceTypes: input.sourceTypes,
            limit: input.maxResults,
            similarityThreshold: 0.6,
          }
        );
        knowledgeContext = formatSearchResultsForContext(searchResults);
        console.log(`[KnowledgeQA] Found ${searchResults.length} relevant knowledge entries`);
      } catch (searchError) {
        console.warn('[KnowledgeQA] Semantic search failed, continuing without KB:', searchError);
        knowledgeContext = 'Knowledge base search unavailable. Using structured data only.';
      }

      // 2. Load structured context if requested
      let structuredContext = 'Structured data not requested.';
      if (input.includeStructuredData) {
        const agentContext = await loadAgentContext(input.tenantId, {
          includeAssessment: true,
          includePortfolio: true,
          includePortfolioAssessment: true,
          includeRoadmap: true,
          includeBudget: true,
          includeStrategy: true,
        });
        structuredContext = buildStructuredContext(agentContext);
        console.log('[KnowledgeQA] Structured context:', buildContextSummary(agentContext));
      }

      // 2.5. Load expert knowledge (consulting frameworks, methodologies, benchmarks)
      let expertKnowledgeContext = 'No expert knowledge available.';
      let expertKnowledge: ExpertKnowledgeContext | null = null;
      
      if (input.includeExpertKnowledge) {
        try {
          // Use SYSTEM company ID for shared expert knowledge
          const SYSTEM_COMPANY_ID = '00000000-0000-0000-0000-000000000000';
          expertKnowledge = await loadExpertKnowledge(
            SYSTEM_COMPANY_ID,
            input.question,
            'knowledge-qa',
            { limit: 2, similarityThreshold: 0.6 }
          );
          
          if (expertKnowledge.totalResults > 0) {
            expertKnowledgeContext = expertKnowledge.formattedContext;
            console.log(`[KnowledgeQA] Loaded ${expertKnowledge.totalResults} expert knowledge entries`);
          } else {
            expertKnowledgeContext = 'No relevant expert frameworks found for this query.';
          }
        } catch (expertError) {
          console.warn('[KnowledgeQA] Expert knowledge unavailable:', expertError);
          expertKnowledgeContext = 'Expert knowledge base unavailable.';
        }
      }

      // 3. Generate answer using LLM
      const prompt = await qaPromptTemplate.format({
        systemPrompt,
        knowledgeContext,
        structuredContext,
        expertKnowledge: expertKnowledgeContext,
        conversationHistory: memoryContext,
        question: input.question,
      });

      const llmResponse = await llm.invoke(prompt);
      const responseText = typeof llmResponse.content === 'string' 
        ? llmResponse.content 
        : JSON.stringify(llmResponse.content);

      // 4. Parse and structure the result
      const parsedResponse = parseQAResponse(responseText);

      const result: KnowledgeQAResult = {
        answer: parsedResponse.answer || 'Unable to generate answer.',
        sources: searchResults.map(r => ({
          sourceType: r.sourceType,
          sourceId: r.sourceId,
          title: r.metadata.title || r.sourceType,
          similarity: r.similarity,
        })),
        structuredDataUsed: input.includeStructuredData ?? false,
        expertKnowledgeUsed: (input.includeExpertKnowledge ?? false) && (expertKnowledge?.totalResults || 0) > 0,
        confidence: parsedResponse.confidence || 'medium',
        suggestedFollowUps: parsedResponse.suggestedFollowUps || [],
        sessionId, // Return session ID for conversation continuity
        frameworksApplied: parsedResponse.frameworksApplied || [],
      };

      // 5. Store assistant response in memory
      try {
        if (sessionId) {
          await addMessage(sessionId, 'assistant', result.answer, 'KNOWLEDGE_QA', {
            confidence: result.confidence,
            sourcesCount: searchResults.length,
          });
        }
      } catch (memoryError) {
        console.warn('[KnowledgeQA] Failed to store response in memory:', memoryError);
      }

      console.log('[KnowledgeQA] Answer generated with confidence:', result.confidence);
      if (result.frameworksApplied?.length) {
        console.log('[KnowledgeQA] Frameworks applied:', result.frameworksApplied.join(', '));
      }

      return {
        content: JSON.stringify(result, null, 2),
        metadata: {
          routedTo: 'KNOWLEDGE_QA',
          success: true,
          sourcesCount: searchResults.length,
          expertKnowledgeCount: expertKnowledge?.totalResults || 0,
          frameworksApplied: result.frameworksApplied,
          confidence: result.confidence,
          sessionId,
        },
      };

    } catch (error) {
      console.error('[KnowledgeQA] Error:', error);
      return {
        content: JSON.stringify({
          error: 'Failed to process question',
          details: error instanceof Error ? error.message : String(error),
          sessionId,
        }),
        metadata: { routedTo: 'KNOWLEDGE_QA', success: false, sessionId },
      };
    }
  },
};

export default knowledgeQaAgent;
