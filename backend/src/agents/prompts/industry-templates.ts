/**
 * Industry-Specific Templates for Product/Service Extraction
 *
 * These templates provide industry context for better classification,
 * category mapping, and attribute inference.
 *
 * Covers 5 main sectors:
 * 1. Technology / Software
 * 2. Finance / Banking
 * 3. Healthcare / Life Sciences
 * 4. Manufacturing / Industrial
 * 5. Retail / E-commerce
 */

export interface IndustryTemplate {
  id: string;
  name: string;
  aliases: string[];
  productCategories: string[];
  serviceCategories: string[];
  commonVendors: string[];
  typicalPricingModels: string[];
  regulatoryRequirements?: string[];
  keyTerms: string[];
  categoryMappings: Record<string, { category: string; subcategory?: string }>;
}

// ============================================================================
// TECHNOLOGY / SOFTWARE INDUSTRY
// ============================================================================

export const TECH_SOFTWARE_TEMPLATE: IndustryTemplate = {
  id: 'tech_software',
  name: 'Technology / Software',
  aliases: [
    'tech', 'software', 'IT', 'information technology', 'tecnologia',
    'software house', 'system integrator', 'ISV', 'SaaS company'
  ],
  productCategories: [
    'Enterprise Software',
    'Productivity Software',
    'Development Tools',
    'Cloud Platforms',
    'Security Software',
    'Database Systems',
    'Analytics & BI',
    'DevOps & CI/CD',
    'API Platforms',
    'Collaboration Tools'
  ],
  serviceCategories: [
    'Software Development',
    'Cloud Migration',
    'System Integration',
    'Managed Services',
    'IT Consulting',
    'Cybersecurity Services',
    'Data Analytics Services',
    'Training & Certification'
  ],
  commonVendors: [
    'Microsoft', 'Google', 'Amazon Web Services', 'Salesforce', 'Oracle',
    'SAP', 'IBM', 'Adobe', 'Atlassian', 'VMware', 'Cisco', 'ServiceNow',
    'Splunk', 'Datadog', 'Snowflake', 'Elastic', 'MongoDB', 'HashiCorp'
  ],
  typicalPricingModels: ['subscription', 'usage_based', 'freemium', 'perpetual'],
  keyTerms: [
    'SaaS', 'PaaS', 'IaaS', 'API', 'SDK', 'cloud', 'on-premise', 'hybrid',
    'microservices', 'container', 'kubernetes', 'DevOps', 'CI/CD', 'agile',
    'machine learning', 'AI', 'data lake', 'ETL', 'integration'
  ],
  categoryMappings: {
    // Product mappings
    'crm': { category: 'Customer Relationship Management', subcategory: 'CRM Platform' },
    'erp': { category: 'Enterprise Resource Planning', subcategory: 'ERP System' },
    'office': { category: 'Productivity Software', subcategory: 'Office Suite' },
    'collaboration': { category: 'Collaboration', subcategory: 'Team Collaboration' },
    'security': { category: 'Security Software', subcategory: 'Cybersecurity' },
    'database': { category: 'Database', subcategory: 'Database Management' },
    'analytics': { category: 'Business Intelligence', subcategory: 'Analytics Platform' },
    'cloud': { category: 'Cloud Computing', subcategory: 'Cloud Platform' },
    'devops': { category: 'DevOps', subcategory: 'CI/CD Tools' },
    // Service mappings
    'consulting': { category: 'Professional Services', subcategory: 'IT Consulting' },
    'implementation': { category: 'Professional Services', subcategory: 'Implementation' },
    'support': { category: 'IT Support Services', subcategory: 'Technical Support' },
    'managed': { category: 'Managed Services', subcategory: 'Managed IT' }
  }
};

// ============================================================================
// FINANCE / BANKING INDUSTRY
// ============================================================================

export const FINANCE_BANKING_TEMPLATE: IndustryTemplate = {
  id: 'finance_banking',
  name: 'Finance / Banking',
  aliases: [
    'finance', 'banking', 'fintech', 'financial services', 'banca',
    'insurance', 'assicurazioni', 'asset management', 'investment',
    'payments', 'finanza'
  ],
  productCategories: [
    'Core Banking Systems',
    'Trading Platforms',
    'Risk Management',
    'Compliance & RegTech',
    'Payment Processing',
    'Fraud Detection',
    'Wealth Management',
    'Insurance Platforms',
    'Financial Analytics',
    'Credit Scoring'
  ],
  serviceCategories: [
    'Financial Consulting',
    'Risk Advisory',
    'Compliance Services',
    'Audit Services',
    'Transaction Services',
    'M&A Advisory',
    'IT Banking Services',
    'Cybersecurity for Finance'
  ],
  commonVendors: [
    'FIS', 'Fiserv', 'Temenos', 'Finastra', 'SS&C', 'Bloomberg',
    'Refinitiv', 'Moody\'s', 'SAS', 'FICO', 'Wolters Kluwer',
    'Broadridge', 'Calypso', 'Murex', 'SimCorp', 'Bottomline'
  ],
  typicalPricingModels: ['subscription', 'transaction_based', 'perpetual', 'aum_based'],
  regulatoryRequirements: [
    'PCI-DSS', 'SOX', 'Basel III', 'MiFID II', 'GDPR', 'PSD2',
    'DORA', 'AML/KYC', 'SOC 2', 'ISO 27001'
  ],
  keyTerms: [
    'core banking', 'real-time payments', 'SWIFT', 'SEPA', 'AML', 'KYC',
    'risk scoring', 'credit risk', 'market risk', 'trading', 'custody',
    'wealth management', 'robo-advisor', 'blockchain', 'DeFi', 'open banking'
  ],
  categoryMappings: {
    'banking': { category: 'Core Banking', subcategory: 'Banking Platform' },
    'trading': { category: 'Trading Systems', subcategory: 'Trading Platform' },
    'risk': { category: 'Risk Management', subcategory: 'Risk Analytics' },
    'compliance': { category: 'Compliance & RegTech', subcategory: 'Regulatory Compliance' },
    'payment': { category: 'Payment Processing', subcategory: 'Payment Gateway' },
    'fraud': { category: 'Fraud Detection', subcategory: 'Fraud Prevention' },
    'wealth': { category: 'Wealth Management', subcategory: 'Portfolio Management' },
    'insurance': { category: 'Insurance', subcategory: 'Insurance Platform' },
    'audit': { category: 'Audit Services', subcategory: 'Internal Audit' },
    'advisory': { category: 'Advisory Services', subcategory: 'Financial Advisory' }
  }
};

// ============================================================================
// HEALTHCARE / LIFE SCIENCES INDUSTRY
// ============================================================================

export const HEALTHCARE_TEMPLATE: IndustryTemplate = {
  id: 'healthcare_lifesciences',
  name: 'Healthcare / Life Sciences',
  aliases: [
    'healthcare', 'health', 'medical', 'pharma', 'pharmaceutical',
    'life sciences', 'biotech', 'hospital', 'clinical', 'sanita',
    'ospedale', 'farmaceutico'
  ],
  productCategories: [
    'Electronic Health Records (EHR)',
    'Clinical Decision Support',
    'Medical Imaging',
    'Laboratory Information Systems',
    'Pharmacy Management',
    'Telemedicine Platforms',
    'Clinical Trials Management',
    'Drug Discovery',
    'Medical Devices',
    'Population Health'
  ],
  serviceCategories: [
    'Healthcare IT Consulting',
    'Clinical Services',
    'Medical Device Services',
    'Regulatory Affairs',
    'Clinical Research Services',
    'Health Data Analytics',
    'Telehealth Services',
    'Healthcare Cybersecurity'
  ],
  commonVendors: [
    'Epic', 'Cerner', 'Meditech', 'Allscripts', 'athenahealth',
    'Veeva', 'IQVIA', 'Philips Healthcare', 'GE Healthcare', 'Siemens Healthineers',
    'McKesson', 'Nuance', 'InterSystems', 'Infor Healthcare', 'Oracle Health'
  ],
  typicalPricingModels: ['subscription', 'perpetual', 'per_bed', 'per_patient'],
  regulatoryRequirements: [
    'HIPAA', 'FDA', 'CE Mark', 'HL7', 'FHIR', 'DICOM',
    'GxP', 'ISO 13485', 'IEC 62304', 'MDR', 'IVDR'
  ],
  keyTerms: [
    'EHR', 'EMR', 'PACS', 'RIS', 'LIS', 'CPOE', 'clinical workflow',
    'interoperability', 'HL7', 'FHIR', 'telemedicine', 'mHealth',
    'precision medicine', 'genomics', 'clinical trial', 'FDA approval'
  ],
  categoryMappings: {
    'ehr': { category: 'Electronic Health Records', subcategory: 'EHR Platform' },
    'emr': { category: 'Electronic Medical Records', subcategory: 'EMR System' },
    'imaging': { category: 'Medical Imaging', subcategory: 'PACS/RIS' },
    'laboratory': { category: 'Laboratory Systems', subcategory: 'LIS/LIMS' },
    'pharmacy': { category: 'Pharmacy Management', subcategory: 'Pharmacy System' },
    'telemedicine': { category: 'Telemedicine', subcategory: 'Telehealth Platform' },
    'clinical': { category: 'Clinical Systems', subcategory: 'Clinical Decision Support' },
    'research': { category: 'Clinical Research', subcategory: 'CTMS' },
    'device': { category: 'Medical Devices', subcategory: 'Medical Device Software' },
    'regulatory': { category: 'Regulatory Services', subcategory: 'Regulatory Affairs' }
  }
};

// ============================================================================
// MANUFACTURING / INDUSTRIAL INDUSTRY
// ============================================================================

export const MANUFACTURING_TEMPLATE: IndustryTemplate = {
  id: 'manufacturing_industrial',
  name: 'Manufacturing / Industrial',
  aliases: [
    'manufacturing', 'industrial', 'factory', 'production', 'industry 4.0',
    'automotive', 'aerospace', 'machinery', 'produzione', 'manifatturiero'
  ],
  productCategories: [
    'Manufacturing Execution Systems (MES)',
    'Enterprise Resource Planning (ERP)',
    'Product Lifecycle Management (PLM)',
    'Computer-Aided Design (CAD)',
    'Industrial IoT Platforms',
    'Supply Chain Management',
    'Quality Management Systems',
    'Asset Performance Management',
    'SCADA & HMI',
    'Predictive Maintenance'
  ],
  serviceCategories: [
    'Manufacturing Consulting',
    'Plant Engineering',
    'Industrial Automation Services',
    'Supply Chain Consulting',
    'Lean Manufacturing',
    'Quality Assurance Services',
    'Maintenance Services',
    'Industrial Cybersecurity'
  ],
  commonVendors: [
    'Siemens', 'Rockwell Automation', 'Dassault Systèmes', 'PTC', 'AVEVA',
    'SAP', 'Oracle', 'Infor', 'Hexagon', 'Autodesk', 'Ansys',
    'Emerson', 'ABB', 'Honeywell', 'Schneider Electric', 'GE Digital'
  ],
  typicalPricingModels: ['perpetual', 'subscription', 'usage_based', 'site_license'],
  regulatoryRequirements: [
    'ISO 9001', 'ISO 14001', 'IATF 16949', 'AS9100', 'ISO 45001',
    'FDA 21 CFR Part 11', 'IEC 62443', 'Machinery Directive'
  ],
  keyTerms: [
    'MES', 'PLM', 'CAD', 'CAM', 'CAE', 'SCADA', 'HMI', 'PLC', 'DCS',
    'OEE', 'lean', 'six sigma', 'industry 4.0', 'smart factory', 'IIoT',
    'digital twin', 'predictive maintenance', 'supply chain', 'BOM'
  ],
  categoryMappings: {
    'mes': { category: 'Manufacturing Execution', subcategory: 'MES Platform' },
    'erp': { category: 'Enterprise Resource Planning', subcategory: 'Manufacturing ERP' },
    'plm': { category: 'Product Lifecycle Management', subcategory: 'PLM Platform' },
    'cad': { category: 'Design Software', subcategory: 'CAD/CAM' },
    'scada': { category: 'Industrial Automation', subcategory: 'SCADA/HMI' },
    'iot': { category: 'Industrial IoT', subcategory: 'IIoT Platform' },
    'quality': { category: 'Quality Management', subcategory: 'QMS' },
    'maintenance': { category: 'Maintenance Management', subcategory: 'CMMS/EAM' },
    'supply': { category: 'Supply Chain Management', subcategory: 'SCM Platform' },
    'automation': { category: 'Industrial Automation', subcategory: 'Automation Services' }
  }
};

// ============================================================================
// RETAIL / E-COMMERCE INDUSTRY
// ============================================================================

export const RETAIL_ECOMMERCE_TEMPLATE: IndustryTemplate = {
  id: 'retail_ecommerce',
  name: 'Retail / E-commerce',
  aliases: [
    'retail', 'e-commerce', 'ecommerce', 'commerce', 'store', 'shop',
    'omnichannel', 'cpg', 'consumer goods', 'vendita', 'negozio'
  ],
  productCategories: [
    'Point of Sale (POS)',
    'E-commerce Platforms',
    'Order Management Systems',
    'Inventory Management',
    'Customer Data Platforms',
    'Loyalty & CRM',
    'Digital Marketing',
    'Price Optimization',
    'Warehouse Management',
    'Payment Processing'
  ],
  serviceCategories: [
    'Retail Consulting',
    'Digital Commerce Services',
    'Omnichannel Implementation',
    'Store Operations',
    'Retail Analytics',
    'Customer Experience',
    'Fulfillment Services',
    'Retail Technology Support'
  ],
  commonVendors: [
    'Shopify', 'Magento', 'Salesforce Commerce', 'SAP Commerce', 'Oracle Retail',
    'BigCommerce', 'commercetools', 'VTEX', 'Manhattan Associates',
    'Blue Yonder', 'NCR', 'Square', 'Lightspeed', 'Zendesk', 'Klaviyo'
  ],
  typicalPricingModels: ['subscription', 'transaction_based', 'gmv_based', 'tiered'],
  regulatoryRequirements: [
    'PCI-DSS', 'GDPR', 'CCPA', 'Consumer Protection Laws',
    'Accessibility (ADA/WCAG)', 'Tax Compliance'
  ],
  keyTerms: [
    'omnichannel', 'unified commerce', 'POS', 'mPOS', 'BOPIS', 'BORIS',
    'fulfillment', 'last mile', 'dropship', 'marketplace', 'cart abandonment',
    'conversion rate', 'CLV', 'NPS', 'personalization', 'recommendation engine'
  ],
  categoryMappings: {
    'pos': { category: 'Point of Sale', subcategory: 'POS System' },
    'ecommerce': { category: 'E-commerce', subcategory: 'E-commerce Platform' },
    'oms': { category: 'Order Management', subcategory: 'OMS Platform' },
    'inventory': { category: 'Inventory Management', subcategory: 'Inventory System' },
    'crm': { category: 'Customer Management', subcategory: 'Retail CRM' },
    'loyalty': { category: 'Customer Loyalty', subcategory: 'Loyalty Platform' },
    'marketing': { category: 'Digital Marketing', subcategory: 'Marketing Automation' },
    'payment': { category: 'Payment Processing', subcategory: 'Payment Gateway' },
    'wms': { category: 'Warehouse Management', subcategory: 'WMS Platform' },
    'analytics': { category: 'Retail Analytics', subcategory: 'Analytics Platform' }
  }
};

// ============================================================================
// ALL TEMPLATES AND UTILITIES
// ============================================================================

export const ALL_INDUSTRY_TEMPLATES: IndustryTemplate[] = [
  TECH_SOFTWARE_TEMPLATE,
  FINANCE_BANKING_TEMPLATE,
  HEALTHCARE_TEMPLATE,
  MANUFACTURING_TEMPLATE,
  RETAIL_ECOMMERCE_TEMPLATE
];

/**
 * Get industry template by ID or alias
 */
export function getIndustryTemplate(industryOrAlias: string): IndustryTemplate | null {
  const normalized = industryOrAlias.toLowerCase().trim();

  // Check exact ID match
  const exactMatch = ALL_INDUSTRY_TEMPLATES.find(t => t.id === normalized);
  if (exactMatch) return exactMatch;

  // Check aliases
  for (const template of ALL_INDUSTRY_TEMPLATES) {
    if (template.aliases.some(alias => normalized.includes(alias) || alias.includes(normalized))) {
      return template;
    }
  }

  return null;
}

/**
 * Detect industry from text content
 */
export function detectIndustry(text: string): { template: IndustryTemplate; confidence: number } | null {
  const normalized = text.toLowerCase();
  const scores: { template: IndustryTemplate; score: number }[] = [];

  for (const template of ALL_INDUSTRY_TEMPLATES) {
    let score = 0;

    // Check aliases
    for (const alias of template.aliases) {
      if (normalized.includes(alias)) {
        score += 2;
      }
    }

    // Check key terms
    for (const term of template.keyTerms) {
      if (normalized.includes(term.toLowerCase())) {
        score += 1;
      }
    }

    // Check common vendors
    for (const vendor of template.commonVendors) {
      if (normalized.includes(vendor.toLowerCase())) {
        score += 1.5;
      }
    }

    if (score > 0) {
      scores.push({ template, score });
    }
  }

  if (scores.length === 0) return null;

  // Sort by score descending
  scores.sort((a, b) => b.score - a.score);
  const best = scores[0];

  // Normalize confidence (max score ~20 for a perfect match)
  const confidence = Math.min(best.score / 15, 1);

  return {
    template: best.template,
    confidence
  };
}

/**
 * Get category mapping for a term within an industry
 */
export function mapToIndustryCategory(
  term: string,
  industry: IndustryTemplate
): { category: string; subcategory?: string } | null {
  const normalized = term.toLowerCase();

  for (const [key, mapping] of Object.entries(industry.categoryMappings)) {
    if (normalized.includes(key)) {
      return mapping;
    }
  }

  return null;
}

/**
 * Build industry context prompt section
 */
export function buildIndustryContextPrompt(industry: IndustryTemplate): string {
  return `
INDUSTRY CONTEXT: ${industry.name}

PRODUCT CATEGORIES FOR THIS INDUSTRY:
${industry.productCategories.map(c => `- ${c}`).join('\n')}

SERVICE CATEGORIES FOR THIS INDUSTRY:
${industry.serviceCategories.map(c => `- ${c}`).join('\n')}

COMMON VENDORS IN THIS INDUSTRY:
${industry.commonVendors.slice(0, 10).join(', ')}

TYPICAL PRICING MODELS:
${industry.typicalPricingModels.join(', ')}

${industry.regulatoryRequirements ? `
REGULATORY REQUIREMENTS TO CONSIDER:
${industry.regulatoryRequirements.join(', ')}
` : ''}

KEY INDUSTRY TERMS:
${industry.keyTerms.slice(0, 15).join(', ')}
`;
}

export default {
  TECH_SOFTWARE_TEMPLATE,
  FINANCE_BANKING_TEMPLATE,
  HEALTHCARE_TEMPLATE,
  MANUFACTURING_TEMPLATE,
  RETAIL_ECOMMERCE_TEMPLATE,
  ALL_INDUSTRY_TEMPLATES,
  getIndustryTemplate,
  detectIndustry,
  mapToIndustryCategory,
  buildIndustryContextPrompt
};
