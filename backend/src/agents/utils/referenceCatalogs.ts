/**
 * Reference Catalogs for RAG Training
 *
 * Comprehensive, realistic product and service catalogs used to train and improve
 * the RAG system's ability to recognize and classify ONLY products and services.
 *
 * IMPORTANT: This catalog contains ONLY products and services.
 * Initiatives/projects have been removed to focus the RAG system on accurate
 * product/service classification.
 */

export interface ReferenceCatalogItem {
  id: string;
  name: string;
  description: string;
  type: 'product' | 'service'; // REMOVED 'initiative'
  category: string;
  subcategory?: string;
  status: 'active' | 'paused' | 'completed' | 'cancelled' | 'proposed';
  priority?: 'critical' | 'high' | 'medium' | 'low';
  budget?: number;
  timeline?: string;
  technologies?: string[];
  tags: string[];
  domain: 'it_infrastructure' | 'digital_transformation' | 'cloud' | 'erp' | 'security' | 'data_analytics' | 'devops';
}

/**
 * IT Infrastructure Products & Services
 */
export const IT_INFRASTRUCTURE_CATALOG: ReferenceCatalogItem[] = [
  {
    id: 'inf-prod-001',
    name: 'Server Monitoring Platform',
    description: 'Enterprise monitoring solution providing real-time visibility into server health, performance metrics, and automated alerting. Includes dashboards, alerts, and integration with ITSM tools.',
    type: 'product',
    category: 'Monitoring',
    subcategory: 'Infrastructure Monitoring',
    status: 'active',
    priority: 'high',
    budget: 450000,
    technologies: ['Datadog', 'Grafana', 'Prometheus', 'ELK Stack'],
    tags: ['monitoring', 'observability', 'alerting', 'dashboards', 'platform'],
    domain: 'it_infrastructure',
  },
  {
    id: 'inf-serv-001',
    name: 'Managed Infrastructure Services',
    description: '24/7 monitoring, maintenance, and support for on-premise and cloud infrastructure. Includes patching, backup management, incident response, and performance optimization.',
    type: 'service',
    category: 'Managed Services',
    subcategory: 'Infrastructure Management',
    status: 'active',
    priority: 'high',
    technologies: ['ServiceNow', 'Ansible', 'Terraform'],
    tags: ['managed-service', '24x7', 'support', 'maintenance', 'monitoring'],
    domain: 'it_infrastructure',
  },
  {
    id: 'inf-prod-002',
    name: 'Network Management System',
    description: 'Centralized platform for managing enterprise network infrastructure. Provides configuration management, performance monitoring, and automated troubleshooting for switches, routers, and firewalls.',
    type: 'product',
    category: 'Network',
    subcategory: 'Network Management',
    status: 'active',
    priority: 'high',
    budget: 350000,
    technologies: ['Cisco Prime', 'SolarWinds', 'PRTG'],
    tags: ['network', 'management', 'automation', 'platform', 'software'],
    domain: 'it_infrastructure',
  },
  {
    id: 'inf-serv-002',
    name: 'Data Center Operations Service',
    description: 'Comprehensive data center operations and maintenance service. Includes facility management, power and cooling optimization, hardware lifecycle management, and 24/7 on-site support.',
    type: 'service',
    category: 'Managed Services',
    subcategory: 'Data Center',
    status: 'active',
    priority: 'critical',
    technologies: ['DCIM', 'iPDU', 'Environmental Monitoring'],
    tags: ['data-center', 'facility-management', '24x7', 'operations'],
    domain: 'it_infrastructure',
  },
  {
    id: 'inf-prod-003',
    name: 'Backup and Recovery Solution',
    description: 'Enterprise backup and disaster recovery platform supporting virtual, physical, and cloud workloads. Features automated backup scheduling, deduplication, encryption, and instant recovery.',
    type: 'product',
    category: 'Backup',
    subcategory: 'Data Protection',
    status: 'active',
    priority: 'critical',
    budget: 280000,
    technologies: ['Veeam', 'Commvault', 'NetBackup'],
    tags: ['backup', 'disaster-recovery', 'data-protection', 'software'],
    domain: 'it_infrastructure',
  },
];

/**
 * Cloud Products & Services
 */
export const CLOUD_CATALOG: ReferenceCatalogItem[] = [
  {
    id: 'cloud-prod-001',
    name: 'Multi-Cloud Management Platform',
    description: 'Unified platform for managing resources across AWS, Azure, and GCP. Provides cost optimization, governance, compliance enforcement, and automated resource provisioning.',
    type: 'product',
    category: 'Cloud Management',
    subcategory: 'Multi-Cloud',
    status: 'active',
    priority: 'high',
    budget: 650000,
    technologies: ['CloudHealth', 'Terraform', 'Kubernetes', 'Istio'],
    tags: ['multi-cloud', 'governance', 'cost-optimization', 'compliance', 'platform'],
    domain: 'cloud',
  },
  {
    id: 'cloud-serv-001',
    name: 'Cloud Migration Assessment Service',
    description: 'Comprehensive assessment of on-premise workloads for cloud readiness. Provides migration strategy, TCO analysis, risk assessment, and detailed migration roadmap with timelines.',
    type: 'service',
    category: 'Consulting',
    subcategory: 'Cloud Assessment',
    status: 'active',
    priority: 'medium',
    technologies: ['AWS Migration Hub', 'Azure Migrate', 'CloudEndure'],
    tags: ['assessment', 'consulting', 'migration-planning', 'tco'],
    domain: 'cloud',
  },
  {
    id: 'cloud-prod-002',
    name: 'Container Orchestration Platform',
    description: 'Enterprise Kubernetes platform with automated deployment, scaling, and management. Includes service mesh, GitOps workflow, monitoring, and security scanning.',
    type: 'product',
    category: 'Containerization',
    subcategory: 'Kubernetes',
    status: 'active',
    priority: 'high',
    budget: 520000,
    technologies: ['Kubernetes', 'Docker', 'Helm', 'ArgoCD', 'Istio'],
    tags: ['kubernetes', 'containers', 'orchestration', 'platform'],
    domain: 'cloud',
  },
  {
    id: 'cloud-serv-002',
    name: 'Managed Cloud Services',
    description: '24/7 management and optimization of cloud infrastructure across AWS, Azure, and GCP. Includes cost optimization, security compliance, performance monitoring, and incident response.',
    type: 'service',
    category: 'Managed Services',
    subcategory: 'Cloud Operations',
    status: 'active',
    priority: 'high',
    technologies: ['AWS', 'Azure', 'GCP', 'Terraform', 'CloudWatch'],
    tags: ['managed-service', 'cloud', '24x7', 'optimization'],
    domain: 'cloud',
  },
  {
    id: 'cloud-prod-003',
    name: 'Cloud Cost Management Tool',
    description: 'SaaS platform for monitoring and optimizing cloud spending across multiple providers. Features anomaly detection, budget alerts, rightsizing recommendations, and executive dashboards.',
    type: 'product',
    category: 'FinOps',
    subcategory: 'Cost Management',
    status: 'active',
    priority: 'medium',
    budget: 180000,
    technologies: ['CloudHealth', 'Spot by NetApp', 'Azure Cost Management'],
    tags: ['cost-management', 'finops', 'optimization', 'saas'],
    domain: 'cloud',
  },
];

/**
 * Digital Transformation Products & Services
 */
export const DIGITAL_TRANSFORMATION_CATALOG: ReferenceCatalogItem[] = [
  {
    id: 'dt-prod-001',
    name: 'AI-Powered Chatbot Platform',
    description: 'Intelligent customer service chatbot platform handling Tier-1 support queries. Integrates with CRM and knowledge base for contextual responses. Supports multiple languages and channels.',
    type: 'product',
    category: 'AI & Automation',
    subcategory: 'Chatbot',
    status: 'active',
    priority: 'high',
    budget: 450000,
    technologies: ['Azure Bot Service', 'LUIS', 'OpenAI GPT-4', 'Power Virtual Agents'],
    tags: ['ai', 'chatbot', 'automation', 'customer-service', 'platform'],
    domain: 'digital_transformation',
  },
  {
    id: 'dt-serv-001',
    name: 'RPA Implementation Service',
    description: 'Design, build, and deploy robotic process automation bots for repetitive business processes. Includes process mining, optimization, bot development, and ongoing maintenance.',
    type: 'service',
    category: 'Automation',
    subcategory: 'RPA',
    status: 'active',
    priority: 'medium',
    technologies: ['UiPath', 'Blue Prism', 'Automation Anywhere', 'Celonis'],
    tags: ['rpa', 'automation', 'process-mining', 'efficiency', 'consulting'],
    domain: 'digital_transformation',
  },
  {
    id: 'dt-prod-002',
    name: 'Digital Workplace Platform',
    description: 'Unified collaboration platform combining document management, team chat, video conferencing, and workflow automation. Cloud-based with mobile support and enterprise security.',
    type: 'product',
    category: 'Collaboration',
    subcategory: 'Digital Workplace',
    status: 'active',
    priority: 'critical',
    budget: 850000,
    technologies: ['Microsoft 365', 'Teams', 'SharePoint', 'OneDrive', 'Power Platform'],
    tags: ['collaboration', 'workplace', 'productivity', 'platform'],
    domain: 'digital_transformation',
  },
  {
    id: 'dt-serv-002',
    name: 'Digital Transformation Consulting',
    description: 'Strategic consulting for digital transformation initiatives. Includes maturity assessment, roadmap development, technology selection, and change management support.',
    type: 'service',
    category: 'Consulting',
    subcategory: 'Strategy',
    status: 'active',
    priority: 'high',
    technologies: ['Design Thinking', 'Lean', 'Agile'],
    tags: ['consulting', 'strategy', 'transformation', 'advisory'],
    domain: 'digital_transformation',
  },
  {
    id: 'dt-prod-003',
    name: 'Customer Data Platform',
    description: 'CDP integrating customer data from CRM, ERP, marketing, and web analytics. Provides unified customer view, segmentation, and real-time personalization capabilities.',
    type: 'product',
    category: 'Customer Experience',
    subcategory: 'CDP',
    status: 'active',
    priority: 'high',
    budget: 720000,
    technologies: ['Segment', 'Salesforce CDP', 'Adobe Experience Platform'],
    tags: ['cdp', 'customer-data', 'analytics', 'platform'],
    domain: 'digital_transformation',
  },
];

/**
 * ERP & Enterprise Applications Products & Services
 */
export const ERP_CATALOG: ReferenceCatalogItem[] = [
  {
    id: 'erp-prod-001',
    name: 'Salesforce CRM Platform',
    description: 'Enterprise CRM platform with Sales Cloud, Service Cloud, and Marketing Cloud. Supports global sales and service teams with AI-powered insights, automation, and mobile capabilities.',
    type: 'product',
    category: 'CRM',
    subcategory: 'Salesforce',
    status: 'active',
    priority: 'critical',
    budget: 1200000,
    technologies: ['Salesforce', 'Einstein AI', 'MuleSoft', 'Tableau CRM'],
    tags: ['crm', 'salesforce', 'sales', 'customer-service', 'platform'],
    domain: 'erp',
  },
  {
    id: 'erp-serv-001',
    name: 'ERP Support & Maintenance',
    description: 'Managed services for SAP and Oracle ERP systems. Includes 24/7 support, quarterly upgrades, custom development, performance tuning, and security patching.',
    type: 'service',
    category: 'Managed Services',
    subcategory: 'ERP Support',
    status: 'active',
    priority: 'critical',
    technologies: ['SAP', 'Oracle', 'ServiceNow', 'JIRA Service Management'],
    tags: ['managed-service', 'erp-support', 'sap', 'oracle', '24x7'],
    domain: 'erp',
  },
  {
    id: 'erp-prod-002',
    name: 'SAP S/4HANA Cloud',
    description: 'Cloud ERP suite covering finance, procurement, supply chain, and manufacturing. Intelligent ERP with AI-powered insights, real-time analytics, and mobile access.',
    type: 'product',
    category: 'ERP',
    subcategory: 'SAP',
    status: 'active',
    priority: 'critical',
    budget: 2800000,
    technologies: ['SAP S/4HANA', 'SAP Fiori', 'SAP BTP', 'SAP Analytics Cloud'],
    tags: ['erp', 'sap', 's4hana', 'cloud-erp', 'platform'],
    domain: 'erp',
  },
  {
    id: 'erp-serv-002',
    name: 'ERP Implementation Service',
    description: 'End-to-end ERP implementation service covering requirements analysis, process design, configuration, data migration, testing, training, and go-live support.',
    type: 'service',
    category: 'Consulting',
    subcategory: 'ERP Implementation',
    status: 'active',
    priority: 'high',
    technologies: ['SAP', 'Oracle', 'Microsoft Dynamics'],
    tags: ['implementation', 'consulting', 'erp', 'integration'],
    domain: 'erp',
  },
  {
    id: 'erp-prod-003',
    name: 'Oracle Fusion Cloud ERP',
    description: 'Cloud-based ERP suite for financials, procurement, project management, and risk management. Complete, innovative, and proven enterprise resource planning platform.',
    type: 'product',
    category: 'ERP',
    subcategory: 'Oracle',
    status: 'active',
    priority: 'high',
    budget: 1950000,
    technologies: ['Oracle Fusion', 'Oracle Analytics', 'Oracle Integration Cloud'],
    tags: ['erp', 'oracle', 'fusion', 'cloud-erp', 'platform'],
    domain: 'erp',
  },
];

/**
 * Security Products & Services
 */
export const SECURITY_CATALOG: ReferenceCatalogItem[] = [
  {
    id: 'sec-prod-001',
    name: 'SIEM Platform',
    description: 'Security Information and Event Management platform for threat detection, incident response, and compliance reporting. Real-time analysis of security alerts with AI-powered threat intelligence.',
    type: 'product',
    category: 'Security',
    subcategory: 'SIEM',
    status: 'active',
    priority: 'critical',
    budget: 1200000,
    technologies: ['Splunk', 'QRadar', 'Azure Sentinel', 'Palo Alto Cortex'],
    tags: ['siem', 'threat-detection', 'compliance', 'incident-response', 'platform'],
    domain: 'security',
  },
  {
    id: 'sec-serv-001',
    name: 'SOC-as-a-Service',
    description: '24/7 Security Operations Center providing threat monitoring, incident response, vulnerability management, and compliance reporting. Includes dedicated security analysts and threat hunting.',
    type: 'service',
    category: 'Managed Services',
    subcategory: 'SOC',
    status: 'active',
    priority: 'critical',
    technologies: ['Splunk', 'CrowdStrike', 'Carbon Black', 'MITRE ATT&CK'],
    tags: ['soc', 'managed-security', '24x7', 'threat-hunting'],
    domain: 'security',
  },
  {
    id: 'sec-prod-002',
    name: 'Endpoint Detection and Response Platform',
    description: 'EDR solution providing real-time endpoint monitoring, threat detection, and automated response. Includes behavioral analysis, threat intelligence, and forensic investigation capabilities.',
    type: 'product',
    category: 'Security',
    subcategory: 'EDR',
    status: 'active',
    priority: 'critical',
    budget: 680000,
    technologies: ['CrowdStrike', 'Carbon Black', 'Microsoft Defender for Endpoint'],
    tags: ['edr', 'endpoint-security', 'threat-detection', 'platform'],
    domain: 'security',
  },
  {
    id: 'sec-serv-002',
    name: 'Penetration Testing Service',
    description: 'Comprehensive penetration testing and vulnerability assessment service. Includes network, web application, mobile, and social engineering testing with detailed remediation guidance.',
    type: 'service',
    category: 'Security Testing',
    subcategory: 'Penetration Testing',
    status: 'active',
    priority: 'high',
    technologies: ['Metasploit', 'Burp Suite', 'Nessus', 'Kali Linux'],
    tags: ['pentest', 'vulnerability-assessment', 'security-testing', 'consulting'],
    domain: 'security',
  },
  {
    id: 'sec-prod-003',
    name: 'Identity and Access Management Platform',
    description: 'Enterprise IAM solution with SSO, MFA, identity governance, and privileged access management. Cloud-native with support for hybrid environments and zero trust architecture.',
    type: 'product',
    category: 'Identity',
    subcategory: 'IAM',
    status: 'active',
    priority: 'critical',
    budget: 890000,
    technologies: ['Okta', 'Azure AD', 'CyberArk', 'SailPoint'],
    tags: ['iam', 'sso', 'mfa', 'identity', 'platform'],
    domain: 'security',
  },
];

/**
 * Data & Analytics Products & Services
 */
export const DATA_ANALYTICS_CATALOG: ReferenceCatalogItem[] = [
  {
    id: 'data-prod-001',
    name: 'Real-Time Analytics Platform',
    description: 'Streaming analytics platform processing millions of events per second. Provides real-time dashboards, anomaly detection, and predictive analytics for business operations.',
    type: 'product',
    category: 'Analytics',
    subcategory: 'Real-Time',
    status: 'active',
    priority: 'high',
    budget: 1800000,
    technologies: ['Apache Kafka', 'Apache Flink', 'Elasticsearch', 'Kibana'],
    tags: ['real-time', 'streaming', 'analytics', 'kafka', 'platform'],
    domain: 'data_analytics',
  },
  {
    id: 'data-prod-002',
    name: 'Data Science Platform',
    description: 'ML/AI platform for model development, training, and deployment. Includes AutoML, MLOps, model governance, and collaboration tools for data science teams.',
    type: 'product',
    category: 'AI/ML',
    subcategory: 'MLOps',
    status: 'active',
    priority: 'high',
    budget: 950000,
    technologies: ['Databricks', 'MLflow', 'Kubeflow', 'AWS SageMaker'],
    tags: ['ml', 'ai', 'mlops', 'automl', 'platform'],
    domain: 'data_analytics',
  },
  {
    id: 'data-serv-001',
    name: 'Data Engineering Service',
    description: 'End-to-end data engineering service covering data pipeline development, ETL/ELT implementation, data warehouse design, and data quality management.',
    type: 'service',
    category: 'Data Engineering',
    subcategory: 'ETL/ELT',
    status: 'active',
    priority: 'high',
    technologies: ['Apache Airflow', 'dbt', 'Snowflake', 'AWS Glue'],
    tags: ['data-engineering', 'etl', 'data-pipeline', 'consulting'],
    domain: 'data_analytics',
  },
  {
    id: 'data-prod-003',
    name: 'Business Intelligence Suite',
    description: 'Self-service BI platform with drag-and-drop report building, interactive dashboards, and embedded analytics. Connects to 100+ data sources with live or in-memory data.',
    type: 'product',
    category: 'Business Intelligence',
    subcategory: 'BI Tools',
    status: 'active',
    priority: 'medium',
    budget: 420000,
    technologies: ['Tableau', 'Power BI', 'Qlik Sense', 'Looker'],
    tags: ['bi', 'analytics', 'visualization', 'self-service', 'platform'],
    domain: 'data_analytics',
  },
  {
    id: 'data-serv-002',
    name: 'Data Governance Consulting',
    description: 'Strategic consulting for data governance program establishment. Includes data catalog implementation, lineage tracking, data quality frameworks, and compliance management.',
    type: 'service',
    category: 'Consulting',
    subcategory: 'Data Governance',
    status: 'active',
    priority: 'medium',
    technologies: ['Collibra', 'Alation', 'Informatica', 'Apache Atlas'],
    tags: ['data-governance', 'consulting', 'compliance', 'data-quality'],
    domain: 'data_analytics',
  },
];

/**
 * DevOps Products & Services
 */
export const DEVOPS_CATALOG: ReferenceCatalogItem[] = [
  {
    id: 'devops-prod-001',
    name: 'CI/CD Platform',
    description: 'Enterprise CI/CD platform supporting 100+ applications. Provides automated build, test, and deployment with compliance gates, security scanning, and release orchestration.',
    type: 'product',
    category: 'DevOps',
    subcategory: 'CI/CD',
    status: 'active',
    priority: 'high',
    budget: 650000,
    technologies: ['GitLab CI', 'ArgoCD', 'SonarQube', 'JFrog Artifactory'],
    tags: ['cicd', 'automation', 'gitops', 'security-scanning', 'platform'],
    domain: 'devops',
  },
  {
    id: 'devops-serv-001',
    name: 'DevOps Transformation Service',
    description: 'Comprehensive DevOps transformation service including assessment, roadmap, toolchain implementation, CI/CD pipeline setup, and team training.',
    type: 'service',
    category: 'Consulting',
    subcategory: 'DevOps Advisory',
    status: 'active',
    priority: 'high',
    technologies: ['GitLab', 'Jenkins', 'Terraform', 'Ansible', 'Kubernetes'],
    tags: ['devops', 'transformation', 'consulting', 'automation'],
    domain: 'devops',
  },
  {
    id: 'devops-prod-002',
    name: 'Application Performance Monitoring',
    description: 'APM solution with distributed tracing, real-time metrics, and AI-powered anomaly detection. Provides full-stack observability from infrastructure to user experience.',
    type: 'product',
    category: 'Observability',
    subcategory: 'APM',
    status: 'active',
    priority: 'high',
    budget: 480000,
    technologies: ['Dynatrace', 'New Relic', 'AppDynamics', 'Datadog'],
    tags: ['apm', 'monitoring', 'observability', 'performance', 'platform'],
    domain: 'devops',
  },
  {
    id: 'devops-serv-002',
    name: 'Managed DevOps Service',
    description: '24/7 management of DevOps toolchain and pipelines. Includes pipeline maintenance, security updates, performance optimization, and on-demand expert support.',
    type: 'service',
    category: 'Managed Services',
    subcategory: 'DevOps Operations',
    status: 'active',
    priority: 'medium',
    technologies: ['GitLab', 'Jenkins', 'Kubernetes', 'Terraform'],
    tags: ['managed-service', 'devops', '24x7', 'pipeline-management'],
    domain: 'devops',
  },
  {
    id: 'devops-prod-003',
    name: 'Infrastructure as Code Platform',
    description: 'IaC platform for provisioning and managing cloud infrastructure. Features policy enforcement, drift detection, cost estimation, and collaborative workflow.',
    type: 'product',
    category: 'Infrastructure',
    subcategory: 'IaC',
    status: 'active',
    priority: 'high',
    budget: 320000,
    technologies: ['Terraform', 'Pulumi', 'AWS CloudFormation', 'Ansible'],
    tags: ['iac', 'infrastructure', 'automation', 'platform'],
    domain: 'devops',
  },
];

/**
 * Complete Reference Catalog - ONLY Products and Services
 */
export const COMPLETE_REFERENCE_CATALOG: ReferenceCatalogItem[] = [
  ...IT_INFRASTRUCTURE_CATALOG,
  ...CLOUD_CATALOG,
  ...DIGITAL_TRANSFORMATION_CATALOG,
  ...ERP_CATALOG,
  ...SECURITY_CATALOG,
  ...DATA_ANALYTICS_CATALOG,
  ...DEVOPS_CATALOG,
];

/**
 * Get catalog by domain
 */
export function getCatalogByDomain(domain: ReferenceCatalogItem['domain']): ReferenceCatalogItem[] {
  return COMPLETE_REFERENCE_CATALOG.filter(item => item.domain === domain);
}

/**
 * Get catalog by type
 */
export function getCatalogByType(type: 'product' | 'service'): ReferenceCatalogItem[] {
  return COMPLETE_REFERENCE_CATALOG.filter(item => item.type === type);
}

/**
 * Get catalog statistics
 */
export function getCatalogStats() {
  const byType = {
    products: COMPLETE_REFERENCE_CATALOG.filter(i => i.type === 'product').length,
    services: COMPLETE_REFERENCE_CATALOG.filter(i => i.type === 'service').length,
  };

  const byDomain: Record<string, number> = {};
  COMPLETE_REFERENCE_CATALOG.forEach(item => {
    byDomain[item.domain] = (byDomain[item.domain] || 0) + 1;
  });

  return {
    total: COMPLETE_REFERENCE_CATALOG.length,
    byType,
    byDomain,
  };
}

export default {
  COMPLETE_REFERENCE_CATALOG,
  IT_INFRASTRUCTURE_CATALOG,
  CLOUD_CATALOG,
  DIGITAL_TRANSFORMATION_CATALOG,
  ERP_CATALOG,
  SECURITY_CATALOG,
  DATA_ANALYTICS_CATALOG,
  DEVOPS_CATALOG,
  getCatalogByDomain,
  getCatalogByType,
  getCatalogStats,
};
