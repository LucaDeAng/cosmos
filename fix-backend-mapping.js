const fs = require('fs');
const path = 'c:/Users/l.de.angelis/Setup/backend/src/routes/assessment.routes.ts';
let content = fs.readFileSync(path, 'utf8');

// Find and replace the transformToStrategicAnswers function
const oldFunctionStart = '// Transform old assessment answers to new strategic assessment format\nfunction transformToStrategicAnswers(oldAnswers: Record<number, any>, companyName: string): Partial<StrategicAnswers> {\n  // OLD FORMAT (7 questions):\n  // 1. Portfolio size (initiatives count)\n  // 2. Decision-making process (governance)\n  // 3. Prioritization criteria (multiple)\n  // 4. Portfolio visibility (1-5 scale)\n  // 5. Main challenge\n  // 6. Initiative types (multiple)\n  // 7. Primary goal with THEMIS\n\n  const portfolioSize = oldAnswers[1] || \'\';\n  const governance = oldAnswers[2] || \'\';\n  const prioritization = oldAnswers[3] || [];\n  const visibility = parseInt(oldAnswers[4]) || 3;\n  const mainChallenge = oldAnswers[5] || \'\';\n  const initiativeTypes = oldAnswers[6] || [];\n  const mainGoal = oldAnswers[7] || \'\';';

const newFunctionStart = `// Transform assessment answers to strategic assessment format
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
  const serviceTypes = oldAnswers[9] || []; // NEW: Service categories for RAG`;

// Also need to update how industry, business model, and scale are used
const oldIndustryLine = '    // A1: Industry (deduce from initiative types and goal)\n    a1_industry: deduceIndustry(initiativeTypes, mainGoal),';
const newIndustryLine = `    // A1: Industry (from direct question)
    a1_industry: mapIndustryAnswer(industry),`;

const oldBusinessModel = '    // A2: Business Model (deduce from governance)\n    a2_business_model: governance.includes(\'Board\') ? \'b2b_enterprise\' : \'b2b_smb\',';
const newBusinessModel = `    // A2: Business Model (from direct question)
    a2_business_model: mapBusinessModel(businessModel),`;

const oldScale = '    // A3: Scale (deduce from portfolio size)\n    a3_operational_scale: deduceScale(portfolioSize),';
const newScale = `    // A3: Scale (from direct question)
    a3_operational_scale: mapOperationalScale(operationalScale),`;

// Update D2 section to include product/service types
const oldD2 = `    // D2: THEMIS context
    d2_primary_use_case: mainGoal || 'Portfolio management',
    d2_timeline: 'immediate'
  };
}`;

const newD2 = `    // D2: THEMIS context
    d2_primary_use_case: 'Portfolio management',
    d2_timeline: 'immediate',

    // NEW: Portfolio examples for RAG training context
    product_types: productTypes,
    service_types: serviceTypes
  };
}`;

let modified = content;

// Apply replacements
if (modified.includes(oldFunctionStart)) {
  modified = modified.replace(oldFunctionStart, newFunctionStart);
  console.log('✅ Updated function header and variable mappings');
} else {
  console.log('❌ Function header pattern not found');
}

if (modified.includes(oldIndustryLine)) {
  modified = modified.replace(oldIndustryLine, newIndustryLine);
  console.log('✅ Updated industry mapping');
} else {
  console.log('❌ Industry line pattern not found');
}

if (modified.includes(oldBusinessModel)) {
  modified = modified.replace(oldBusinessModel, newBusinessModel);
  console.log('✅ Updated business model mapping');
} else {
  console.log('❌ Business model pattern not found');
}

if (modified.includes(oldScale)) {
  modified = modified.replace(oldScale, newScale);
  console.log('✅ Updated scale mapping');
} else {
  console.log('❌ Scale pattern not found');
}

if (modified.includes(oldD2)) {
  modified = modified.replace(oldD2, newD2);
  console.log('✅ Updated D2 section with product/service types');
} else {
  console.log('❌ D2 section pattern not found');
}

// Add new helper functions after deduceScale function
const afterDeduceScale = `function deduceScale(portfolioSize: string): string {
  if (portfolioSize.includes('50+') || portfolioSize.includes('100+')) return 'enterprise';
  if (portfolioSize.includes('30-50')) return 'mid_market';
  if (portfolioSize.includes('10-30')) return 'scaleup';
  return 'startup';
}`;

const newHelperFunctions = `function deduceScale(portfolioSize: string): string {
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
}`;

if (modified.includes(afterDeduceScale)) {
  modified = modified.replace(afterDeduceScale, newHelperFunctions);
  console.log('✅ Added new helper functions');
} else {
  console.log('❌ Could not add helper functions');
}

if (modified !== content) {
  fs.writeFileSync(path, modified);
  console.log('\n✅ File updated successfully!');
} else {
  console.log('\n❌ No changes made to file');
}
