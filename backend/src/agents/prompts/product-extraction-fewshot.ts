/**
 * Few-Shot Product Extraction Examples
 *
 * High-quality examples for teaching the LLM how to extract and classify
 * products and services from various document types.
 *
 * These examples cover:
 * - Software Products (SaaS, On-Premise, Licensing)
 * - IT Services (Managed, Consulting, Support)
 * - Edge Cases (Bundles, Platforms, Marketplaces)
 */

export interface FewShotExample {
  input: string;
  output: ExtractedProductExample;
  context?: string;
}

export interface ExtractedProductExample {
  name: string;
  vendor: string | null;
  category: string;
  subcategory: string;
  type: 'product' | 'service';
  pricing_model?: 'subscription' | 'perpetual' | 'usage_based' | 'freemium' | 'other';
  pricing_unit?: string;
  price_amount?: number;
  price_currency?: string;
  target_segment?: 'enterprise' | 'smb' | 'consumer' | 'government';
  deployment?: 'cloud' | 'on_premise' | 'hybrid' | 'saas';
  delivery_model?: 'managed_service' | 'professional_service' | 'self_service';
  sla_tier?: string;
  sla_details?: Record<string, string>;
  service_window?: string;
  supported_platforms?: string[];
  confidence: number;
  confidence_reasoning: string;
}

// ============================================================================
// SOFTWARE PRODUCTS EXAMPLES (10 examples)
// ============================================================================

export const SOFTWARE_PRODUCT_EXAMPLES: FewShotExample[] = [
  {
    input: `Microsoft 365 Business Premium - €22/utente/mese
Soluzione completa per produttività aziendale con Exchange, Teams, SharePoint`,
    output: {
      name: "Microsoft 365 Business Premium",
      vendor: "Microsoft",
      category: "Productivity Software",
      subcategory: "Office Suite",
      type: "product",
      pricing_model: "subscription",
      pricing_unit: "per_user_per_month",
      price_amount: 22,
      price_currency: "EUR",
      target_segment: "smb",
      deployment: "saas",
      confidence: 0.95,
      confidence_reasoning: "Well-known product with clear pricing and vendor"
    }
  },
  {
    input: `SAP S/4HANA Cloud
Enterprise ERP solution for large organizations
License: Named User - €150/user/month + Implementation`,
    output: {
      name: "SAP S/4HANA Cloud",
      vendor: "SAP",
      category: "Enterprise Resource Planning",
      subcategory: "Cloud ERP",
      type: "product",
      pricing_model: "subscription",
      pricing_unit: "per_user_per_month",
      price_amount: 150,
      price_currency: "EUR",
      target_segment: "enterprise",
      deployment: "cloud",
      confidence: 0.93,
      confidence_reasoning: "Major enterprise product with clear licensing model"
    }
  },
  {
    input: `Splunk Enterprise
Piattaforma di analisi dati e monitoring
Licenza perpetua basata su volume di dati: €3,500/GB/year`,
    output: {
      name: "Splunk Enterprise",
      vendor: "Splunk",
      category: "Data Analytics",
      subcategory: "Log Management & SIEM",
      type: "product",
      pricing_model: "usage_based",
      pricing_unit: "per_gb_per_year",
      price_amount: 3500,
      price_currency: "EUR",
      target_segment: "enterprise",
      deployment: "hybrid",
      confidence: 0.91,
      confidence_reasoning: "Known product with volume-based licensing"
    }
  },
  {
    input: `Jira Software Premium
Issue tracking e project management per team agili
$14.50 per user/month (annual billing)`,
    output: {
      name: "Jira Software Premium",
      vendor: "Atlassian",
      category: "Project Management",
      subcategory: "Issue Tracking",
      type: "product",
      pricing_model: "subscription",
      pricing_unit: "per_user_per_month",
      price_amount: 14.50,
      price_currency: "USD",
      target_segment: "smb",
      deployment: "saas",
      confidence: 0.94,
      confidence_reasoning: "Popular SaaS product with transparent pricing"
    }
  },
  {
    input: `VMware vSphere Enterprise Plus
Piattaforma di virtualizzazione data center
Licenza perpetua per CPU socket: €4,200`,
    output: {
      name: "VMware vSphere Enterprise Plus",
      vendor: "VMware (Broadcom)",
      category: "Virtualization",
      subcategory: "Server Virtualization",
      type: "product",
      pricing_model: "perpetual",
      pricing_unit: "per_cpu_socket",
      price_amount: 4200,
      price_currency: "EUR",
      target_segment: "enterprise",
      deployment: "on_premise",
      confidence: 0.90,
      confidence_reasoning: "Traditional enterprise software with perpetual licensing"
    }
  },
  {
    input: `Slack Business+
Piattaforma di comunicazione aziendale
€15 per utente attivo/mese`,
    output: {
      name: "Slack Business+",
      vendor: "Salesforce",
      category: "Collaboration",
      subcategory: "Team Messaging",
      type: "product",
      pricing_model: "subscription",
      pricing_unit: "per_active_user_per_month",
      price_amount: 15,
      price_currency: "EUR",
      target_segment: "smb",
      deployment: "saas",
      confidence: 0.94,
      confidence_reasoning: "Popular SaaS collaboration tool with clear pricing"
    }
  },
  {
    input: `CloudMigration Pro v3.2
Tool proprietario per migrazione workload cloud
AWS, Azure, GCP supportati
License perpetua €15,000`,
    output: {
      name: "CloudMigration Pro",
      vendor: null,
      category: "Cloud Management",
      subcategory: "Migration Tools",
      type: "product",
      pricing_model: "perpetual",
      price_amount: 15000,
      price_currency: "EUR",
      supported_platforms: ["AWS", "Azure", "GCP"],
      deployment: "on_premise",
      confidence: 0.75,
      confidence_reasoning: "Clear product with pricing, vendor not specified - likely proprietary"
    }
  },
  {
    input: `Oracle Database Enterprise Edition
Database relazionale enterprise-grade
Licensing: Processor-based - €47,500 per processor`,
    output: {
      name: "Oracle Database Enterprise Edition",
      vendor: "Oracle",
      category: "Database",
      subcategory: "Relational Database",
      type: "product",
      pricing_model: "perpetual",
      pricing_unit: "per_processor",
      price_amount: 47500,
      price_currency: "EUR",
      target_segment: "enterprise",
      deployment: "on_premise",
      confidence: 0.92,
      confidence_reasoning: "Major database product with well-known processor licensing"
    }
  },
  {
    input: `GitHub Enterprise Server
Self-hosted Git repository management
$21/user/month (annual) or $231/user/year`,
    output: {
      name: "GitHub Enterprise Server",
      vendor: "Microsoft",
      category: "DevOps",
      subcategory: "Source Control",
      type: "product",
      pricing_model: "subscription",
      pricing_unit: "per_user_per_year",
      price_amount: 231,
      price_currency: "USD",
      target_segment: "enterprise",
      deployment: "on_premise",
      confidence: 0.93,
      confidence_reasoning: "Known enterprise product with clear annual pricing"
    }
  },
  {
    input: `Tableau Desktop Professional
Business intelligence e data visualization
Licenza utente: €70/mese o €840/anno`,
    output: {
      name: "Tableau Desktop Professional",
      vendor: "Salesforce",
      category: "Business Intelligence",
      subcategory: "Data Visualization",
      type: "product",
      pricing_model: "subscription",
      pricing_unit: "per_user_per_month",
      price_amount: 70,
      price_currency: "EUR",
      target_segment: "enterprise",
      deployment: "on_premise",
      confidence: 0.91,
      confidence_reasoning: "Popular BI tool with clear user-based licensing"
    }
  }
];

// ============================================================================
// IT SERVICES EXAMPLES (10 examples)
// ============================================================================

export const IT_SERVICE_EXAMPLES: FewShotExample[] = [
  {
    input: `Servizio di Managed SOC 24/7
Monitoraggio continuo della sicurezza IT
SLA: 99.9% uptime, response time < 15 min
Canone mensile: €8,500`,
    output: {
      name: "Managed SOC 24/7",
      vendor: null,
      category: "Security Services",
      subcategory: "Managed Detection & Response",
      type: "service",
      delivery_model: "managed_service",
      sla_tier: "premium",
      sla_details: {
        uptime: "99.9%",
        response_time: "15 minutes"
      },
      service_window: "24/7",
      pricing_model: "subscription",
      price_amount: 8500,
      price_currency: "EUR",
      pricing_unit: "per_month",
      confidence: 0.88,
      confidence_reasoning: "Clear service description with SLA and pricing, vendor unknown"
    }
  },
  {
    input: `AWS Managed Services
Gestione completa infrastruttura AWS
Include: patching, monitoring, backup, disaster recovery
Basato su % spesa AWS: 15-20%`,
    output: {
      name: "AWS Managed Services",
      vendor: "Amazon Web Services",
      category: "Cloud Services",
      subcategory: "Cloud Management",
      type: "service",
      delivery_model: "managed_service",
      pricing_model: "usage_based",
      pricing_unit: "percentage_of_cloud_spend",
      target_segment: "enterprise",
      service_window: "24/7",
      confidence: 0.90,
      confidence_reasoning: "Official AWS service with percentage-based pricing model"
    }
  },
  {
    input: `ServiceNow Implementation & Configuration
Implementazione piattaforma ITSM
Durata progetto: 12-16 settimane
Team: 3 consulenti senior
Budget stimato: €180,000`,
    output: {
      name: "ServiceNow Implementation",
      vendor: null,
      category: "Professional Services",
      subcategory: "Platform Implementation",
      type: "service",
      delivery_model: "professional_service",
      pricing_model: "other",
      price_amount: 180000,
      price_currency: "EUR",
      pricing_unit: "project_based",
      target_segment: "enterprise",
      confidence: 0.85,
      confidence_reasoning: "Project-based implementation service with estimated budget"
    }
  },
  {
    input: `Help Desk L1/L2 - Multilingua
Supporto tecnico end-user in italiano, inglese, tedesco
Orari: Lu-Ve 8:00-20:00
SLA: Risposta entro 30 min, risoluzione L1 4h
€55/ticket o €4,800/mese flat`,
    output: {
      name: "Help Desk L1/L2 Multilingua",
      vendor: null,
      category: "IT Support Services",
      subcategory: "End User Support",
      type: "service",
      delivery_model: "managed_service",
      sla_tier: "standard",
      sla_details: {
        response_time: "30 minutes",
        l1_resolution: "4 hours"
      },
      service_window: "weekdays_8_20",
      pricing_model: "subscription",
      price_amount: 4800,
      price_currency: "EUR",
      pricing_unit: "per_month_flat",
      confidence: 0.86,
      confidence_reasoning: "Clear support service with SLA and dual pricing options"
    }
  },
  {
    input: `Cloud Architecture Consulting
Consulenza strategica per migrazione e design cloud
Senior Cloud Architect: €1,200/giorno
Minimo engagement: 5 giorni`,
    output: {
      name: "Cloud Architecture Consulting",
      vendor: null,
      category: "Consulting Services",
      subcategory: "Cloud Strategy",
      type: "service",
      delivery_model: "professional_service",
      pricing_model: "other",
      price_amount: 1200,
      price_currency: "EUR",
      pricing_unit: "per_day",
      target_segment: "enterprise",
      confidence: 0.84,
      confidence_reasoning: "Consulting service with daily rate, vendor not specified"
    }
  },
  {
    input: `Azure Reserved Instances Management
Ottimizzazione costi Azure tramite RI
Savings garantiti: 20-40% vs pay-as-you-go
Fee: 10% del risparmio generato`,
    output: {
      name: "Azure Reserved Instances Management",
      vendor: null,
      category: "Cloud Services",
      subcategory: "Cost Optimization",
      type: "service",
      delivery_model: "managed_service",
      pricing_model: "usage_based",
      pricing_unit: "percentage_of_savings",
      target_segment: "enterprise",
      confidence: 0.82,
      confidence_reasoning: "FinOps service with success-based pricing model"
    }
  },
  {
    input: `SAP Basis Administration
Gestione e manutenzione sistemi SAP
Include: monitoring, patching, transport, tuning
FTE dedicated: €12,000/mese`,
    output: {
      name: "SAP Basis Administration",
      vendor: null,
      category: "Application Management",
      subcategory: "ERP Operations",
      type: "service",
      delivery_model: "managed_service",
      pricing_model: "subscription",
      price_amount: 12000,
      price_currency: "EUR",
      pricing_unit: "per_month_per_fte",
      target_segment: "enterprise",
      service_window: "business_hours",
      confidence: 0.87,
      confidence_reasoning: "Specialized managed service with FTE-based pricing"
    }
  },
  {
    input: `Penetration Testing & Vulnerability Assessment
Test di sicurezza applicativa e infrastrutturale
OWASP Top 10, PTES methodology
Scope: 50 IP + 5 web applications
Quotazione: €25,000`,
    output: {
      name: "Penetration Testing & VA",
      vendor: null,
      category: "Security Services",
      subcategory: "Security Assessment",
      type: "service",
      delivery_model: "professional_service",
      pricing_model: "other",
      price_amount: 25000,
      price_currency: "EUR",
      pricing_unit: "project_based",
      target_segment: "enterprise",
      confidence: 0.83,
      confidence_reasoning: "Project-based security service with defined scope"
    }
  },
  {
    input: `Disaster Recovery as a Service (DRaaS)
Replica e failover automatico su cloud secondario
RPO: 15 min, RTO: 4 ore
Costo: €0.05/GB storage + €200/VM/mese`,
    output: {
      name: "Disaster Recovery as a Service",
      vendor: null,
      category: "Infrastructure Services",
      subcategory: "Business Continuity",
      type: "service",
      delivery_model: "managed_service",
      sla_tier: "premium",
      sla_details: {
        rpo: "15 minutes",
        rto: "4 hours"
      },
      pricing_model: "usage_based",
      pricing_unit: "per_gb_plus_per_vm",
      service_window: "24/7",
      confidence: 0.88,
      confidence_reasoning: "Clear DRaaS service with RPO/RTO SLAs and hybrid pricing"
    }
  },
  {
    input: `Data Center Colocation
Spazio rack in tier III data center
Incluso: power, cooling, connectivity, physical security
1 rack 42U: €1,500/mese + setup €2,000`,
    output: {
      name: "Data Center Colocation",
      vendor: null,
      category: "Infrastructure Services",
      subcategory: "Colocation",
      type: "service",
      delivery_model: "managed_service",
      sla_tier: "tier3",
      pricing_model: "subscription",
      price_amount: 1500,
      price_currency: "EUR",
      pricing_unit: "per_rack_per_month",
      service_window: "24/7",
      confidence: 0.85,
      confidence_reasoning: "Standard colocation offering with clear rack pricing"
    }
  }
];

// ============================================================================
// EDGE CASES EXAMPLES (10 examples)
// ============================================================================

export const EDGE_CASE_EXAMPLES: FewShotExample[] = [
  {
    input: `Microsoft Enterprise Agreement
Bundle completo: Office 365 E5 + Windows E5 + EMS E5
3-year term, 500 users
Discount: 25% from list price`,
    output: {
      name: "Microsoft Enterprise Agreement",
      vendor: "Microsoft",
      category: "Software Bundle",
      subcategory: "Enterprise Licensing",
      type: "product",
      pricing_model: "subscription",
      pricing_unit: "per_user_per_year",
      target_segment: "enterprise",
      deployment: "hybrid",
      confidence: 0.89,
      confidence_reasoning: "Enterprise bundle with multi-product licensing - categorized as product due to primary software nature"
    }
  },
  {
    input: `AWS Well-Architected Review + Remediation
Fase 1: Assessment architetturale (2 settimane)
Fase 2: Implementazione fix (4-6 settimane)
Include: 6 mesi di supporto post-go-live`,
    output: {
      name: "AWS Well-Architected Review & Remediation",
      vendor: null,
      category: "Professional Services",
      subcategory: "Cloud Assessment",
      type: "service",
      delivery_model: "professional_service",
      pricing_model: "other",
      pricing_unit: "project_based",
      target_segment: "enterprise",
      confidence: 0.81,
      confidence_reasoning: "Hybrid consulting + support engagement - categorized as service"
    }
  },
  {
    input: `Salesforce Sales Cloud + Service Cloud + Platform
CRM completo con customizzazione
Utenti Sales: 100, Service: 50
Implementation partner: Accenture`,
    output: {
      name: "Salesforce Sales + Service Cloud",
      vendor: "Salesforce",
      category: "Customer Relationship Management",
      subcategory: "CRM Platform",
      type: "product",
      pricing_model: "subscription",
      pricing_unit: "per_user_per_month",
      target_segment: "enterprise",
      deployment: "saas",
      confidence: 0.90,
      confidence_reasoning: "Multi-module SaaS product - implementation mentioned but primary is software"
    }
  },
  {
    input: `IT Operations Outsourcing
Full outsourcing dell'IT aziendale
Include: infrastruttura, applicazioni, helpdesk, security
SLA globale, single point of contact
Contratto 5 anni, €2.5M/anno`,
    output: {
      name: "IT Operations Outsourcing",
      vendor: null,
      category: "Outsourcing Services",
      subcategory: "Full IT Outsourcing",
      type: "service",
      delivery_model: "managed_service",
      pricing_model: "subscription",
      price_amount: 2500000,
      price_currency: "EUR",
      pricing_unit: "per_year",
      target_segment: "enterprise",
      service_window: "24/7",
      confidence: 0.86,
      confidence_reasoning: "Comprehensive IT outsourcing deal - clearly a service despite including products"
    }
  },
  {
    input: `Cisco Meraki SD-WAN + Support
Hardware: MX450 appliances (5 sites)
Software license: Enterprise (3 years)
Support: 24/7 advanced replacement
Total: €95,000`,
    output: {
      name: "Cisco Meraki SD-WAN Solution",
      vendor: "Cisco",
      category: "Network Infrastructure",
      subcategory: "SD-WAN",
      type: "product",
      pricing_model: "subscription",
      pricing_unit: "per_site_per_term",
      price_amount: 95000,
      price_currency: "EUR",
      target_segment: "enterprise",
      deployment: "on_premise",
      confidence: 0.87,
      confidence_reasoning: "Hardware + software bundle - primarily a product with bundled support"
    }
  },
  {
    input: `Cloud Native Development Platform
Kubernetes, Service Mesh, API Gateway
Build su AWS EKS o Azure AKS
Managed by vendor, self-service for dev teams`,
    output: {
      name: "Cloud Native Development Platform",
      vendor: null,
      category: "Platform as a Service",
      subcategory: "Container Platform",
      type: "product",
      pricing_model: "usage_based",
      deployment: "cloud",
      target_segment: "enterprise",
      confidence: 0.78,
      confidence_reasoning: "Platform offering with managed services component - categorized as product due to platform nature"
    }
  },
  {
    input: `Digital Workplace Transformation
Consulenza + implementazione + change management
M365, Viva, Power Platform adoption
12 mesi, team di 8 persone`,
    output: {
      name: "Digital Workplace Transformation",
      vendor: null,
      category: "Professional Services",
      subcategory: "Digital Transformation",
      type: "service",
      delivery_model: "professional_service",
      pricing_model: "other",
      pricing_unit: "project_based",
      target_segment: "enterprise",
      confidence: 0.84,
      confidence_reasoning: "Transformation program - service despite enabling product adoption"
    }
  },
  {
    input: `SASE Solution (Secure Access Service Edge)
Zscaler ZIA + ZPA
Integration with existing Palo Alto firewalls
Deployment + 3-year subscription`,
    output: {
      name: "SASE Solution - Zscaler",
      vendor: "Zscaler",
      category: "Security",
      subcategory: "Secure Access Service Edge",
      type: "product",
      pricing_model: "subscription",
      deployment: "cloud",
      target_segment: "enterprise",
      confidence: 0.85,
      confidence_reasoning: "Security SaaS product with professional services for deployment"
    }
  },
  {
    input: `API Marketplace Subscription
Accesso a 50+ API aziendali
Rate limiting: 10,000 calls/day
Self-service developer portal`,
    output: {
      name: "API Marketplace Subscription",
      vendor: null,
      category: "Integration",
      subcategory: "API Platform",
      type: "product",
      pricing_model: "usage_based",
      pricing_unit: "api_calls_per_day",
      deployment: "saas",
      target_segment: "smb",
      confidence: 0.80,
      confidence_reasoning: "API marketplace - product nature despite service-like consumption"
    }
  },
  {
    input: `Formazione Cybersecurity
Programma annuale awareness + technical training
Include: phishing simulation, certificazioni
500 dipendenti, 20 IT staff
Budget: €45,000/anno`,
    output: {
      name: "Cybersecurity Training Program",
      vendor: null,
      category: "Training Services",
      subcategory: "Security Awareness",
      type: "service",
      delivery_model: "professional_service",
      pricing_model: "subscription",
      price_amount: 45000,
      price_currency: "EUR",
      pricing_unit: "per_year",
      target_segment: "enterprise",
      confidence: 0.83,
      confidence_reasoning: "Training program - service even though it includes platform components"
    }
  }
];

// ============================================================================
// COMBINED EXAMPLES AND PROMPT BUILDER
// ============================================================================

export const ALL_EXAMPLES: FewShotExample[] = [
  ...SOFTWARE_PRODUCT_EXAMPLES,
  ...IT_SERVICE_EXAMPLES,
  ...EDGE_CASE_EXAMPLES
];

/**
 * Build few-shot prompt section with examples
 */
export function buildFewShotPrompt(
  exampleCount: number = 6,
  includeTypes: ('software' | 'services' | 'edge')[] = ['software', 'services', 'edge']
): string {
  const selectedExamples: FewShotExample[] = [];

  // Select examples from each category
  if (includeTypes.includes('software')) {
    selectedExamples.push(...SOFTWARE_PRODUCT_EXAMPLES.slice(0, Math.ceil(exampleCount / 3)));
  }
  if (includeTypes.includes('services')) {
    selectedExamples.push(...IT_SERVICE_EXAMPLES.slice(0, Math.ceil(exampleCount / 3)));
  }
  if (includeTypes.includes('edge')) {
    selectedExamples.push(...EDGE_CASE_EXAMPLES.slice(0, Math.ceil(exampleCount / 3)));
  }

  // Limit to requested count
  const examples = selectedExamples.slice(0, exampleCount);

  return `
<examples>
${examples.map((ex, i) => `
<example id="${i + 1}">
<input>
${ex.input}
</input>
<output>
${JSON.stringify(ex.output, null, 2)}
</output>
</example>
`).join('')}
</examples>
`;
}

/**
 * Build complete extraction prompt with few-shot examples
 */
export function buildProductExtractionPrompt(
  industryContext?: string,
  exampleCount: number = 6
): string {
  const fewShotSection = buildFewShotPrompt(exampleCount);

  return `You are an expert at extracting product and service information from business documents.
Your task is to accurately identify, classify, and structure items from the input text.

CLASSIFICATION RULES:
1. PRODUCT: Tangible goods, software, platforms, applications that can be sold or licensed
   - Has versions, releases, licenses
   - Can be deployed (cloud, on-premise, hybrid)
   - Has one-time or subscription pricing per user/seat/processor

2. SERVICE: Ongoing services, managed services, support, consulting
   - Delivered continuously or on-demand
   - Has SLAs, response times, service windows
   - Priced per month/year/project or consumption-based

IMPORTANT DISTINCTIONS:
- Software + Support bundle → Classify as PRODUCT (support is ancillary)
- Platform with managed option → Classify as PRODUCT (managed is delivery model)
- Implementation project → Classify as SERVICE
- Outsourcing contract → Classify as SERVICE
- Training program → Classify as SERVICE

${industryContext ? `INDUSTRY CONTEXT: ${industryContext}` : ''}

${fewShotSection}

Extract all products and services from the following text.
For each item:
1. Identify if it's a product or service using the rules above
2. Extract all available attributes (pricing, vendor, deployment, etc.)
3. Infer missing attributes based on context and industry knowledge
4. Provide confidence score (0-1) with detailed reasoning

Return a JSON array of extracted items following the example structure.
`;
}

export default {
  SOFTWARE_PRODUCT_EXAMPLES,
  IT_SERVICE_EXAMPLES,
  EDGE_CASE_EXAMPLES,
  ALL_EXAMPLES,
  buildFewShotPrompt,
  buildProductExtractionPrompt
};
