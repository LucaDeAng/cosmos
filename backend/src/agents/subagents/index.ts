import { OrchestratorToolName, SubAgent } from './types';
import { clientAssessmentAgent } from './clientAssessmentAgent';
import { portfolioAssessmentAgent } from './portfolioAssessmentAgent';
import { portfolioPrioritizationAgent } from './portfolioPrioritizationAgent';
import { catalogPrioritizationAgent } from './catalogPrioritizationAgent';
import { documentExtractionAgent } from './documentExtractionAgent';
import { roadmapGeneratorAgent } from './roadmapGeneratorAgent';
import { budgetOptimizerAgent } from './budgetOptimizerAgent';
import { strategyAdvisorAgent } from './strategyAdvisorAgent';
import { generatorAgent } from './generatorAgent';
import { validatorAgent } from './validatorAgent';
import { explorerAgent } from './explorerAgent';
import { knowledgeQaAgent } from './knowledgeQaAgent';
import { alertAgent } from './alertAgent';
import { ingestionAcceleratorAgent } from './ingestion/ingestionAcceleratorAgent';

// New agents
import { riskAssessmentAgent } from './analysis/riskAssessmentAgent';
import { techStackAnalyzer } from './analysis/techStackAnalyzer';
import { dataQualityGuardian } from './validation/dataQualityGuardian';
import { vendorIntelligenceAgent } from './intelligence/vendorIntelligenceAgent';

const subAgents: Record<OrchestratorToolName, SubAgent> = {
  CLIENT_ASSESSMENT: clientAssessmentAgent,
  PORTFOLIO_ASSESSMENT: portfolioAssessmentAgent,
  PORTFOLIO_PRIORITIZATION: portfolioPrioritizationAgent,
  CATALOG_PRIORITIZATION: catalogPrioritizationAgent,
  ROADMAP_GENERATOR: roadmapGeneratorAgent,
  BUDGET_OPTIMIZER: budgetOptimizerAgent,
  STRATEGY_ADVISOR: strategyAdvisorAgent,
  GENERATOR: generatorAgent,
  VALIDATOR: validatorAgent,
  EXPLORER: explorerAgent,
  KNOWLEDGE_QA: knowledgeQaAgent,
  ALERT_AGENT: alertAgent,
  // New agents
  RISK_ASSESSMENT: riskAssessmentAgent,
  DATA_QUALITY: dataQualityGuardian,
  TECH_STACK: techStackAnalyzer,
  VENDOR_INTELLIGENCE: vendorIntelligenceAgent,
  INGESTION_ACCELERATOR: ingestionAcceleratorAgent,
};

export function getSubAgent(name: OrchestratorToolName): SubAgent | undefined {
  return subAgents[name];
}

// Export agenti specializzati non orchestrati
export { documentExtractionAgent };
export { roadmapGeneratorAgent };
export { budgetOptimizerAgent };
export { strategyAdvisorAgent };
export { portfolioPrioritizationAgent };
export { catalogPrioritizationAgent };
export { alertAgent };

// Export new agents
export { riskAssessmentAgent };
export { techStackAnalyzer };
export { dataQualityGuardian };
export { vendorIntelligenceAgent };
export { ingestionAcceleratorAgent };

// Export analysis functions
export { performRiskAssessment } from './analysis/riskAssessmentAgent';
export { analyzeTechStack } from './analysis/techStackAnalyzer';
export { validateItem, validateBatch } from './validation/dataQualityGuardian';
export { analyzeVendorIntelligence } from './intelligence/vendorIntelligenceAgent';
export { accelerateIngestion } from './ingestion/ingestionAcceleratorAgent';

export default subAgents;
