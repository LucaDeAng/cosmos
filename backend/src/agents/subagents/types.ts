export type OrchestratorToolName =
  | 'CLIENT_ASSESSMENT'
  | 'PORTFOLIO_ASSESSMENT'
  | 'PORTFOLIO_PRIORITIZATION'
  | 'CATALOG_PRIORITIZATION'
  | 'ROADMAP_GENERATOR'
  | 'BUDGET_OPTIMIZER'
  | 'STRATEGY_ADVISOR'
  | 'GENERATOR'
  | 'VALIDATOR'
  | 'EXPLORER'
  | 'KNOWLEDGE_QA'
  | 'RISK_ASSESSMENT'
  | 'DATA_QUALITY'
  | 'TECH_STACK'
  | 'VENDOR_INTELLIGENCE'
  | 'ALERT_AGENT'
  | 'INGESTION_ACCELERATOR';

export interface SubAgentResult {
  content: string;
  metadata?: Record<string, unknown>;
}

export interface SubAgent {
  name: OrchestratorToolName;
  run: (args: Record<string, unknown>) => Promise<SubAgentResult>;
}

export default {} as unknown;
