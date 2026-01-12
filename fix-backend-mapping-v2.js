const fs = require('fs');
const path = 'c:/Users/l.de.angelis/Setup/backend/src/routes/assessment.routes.ts';
let content = fs.readFileSync(path, 'utf8');

// Use CRLF for Windows files
const NL = '\r\n';

// Find and replace the transformToStrategicAnswers function
const oldFunctionStart = `// Transform old assessment answers to new strategic assessment format${NL}function transformToStrategicAnswers(oldAnswers: Record<number, any>, companyName: string): Partial<StrategicAnswers> {${NL}  // OLD FORMAT (7 questions):${NL}  // 1. Portfolio size (initiatives count)${NL}  // 2. Decision-making process (governance)${NL}  // 3. Prioritization criteria (multiple)${NL}  // 4. Portfolio visibility (1-5 scale)${NL}  // 5. Main challenge${NL}  // 6. Initiative types (multiple)${NL}  // 7. Primary goal with THEMIS${NL}${NL}  const portfolioSize = oldAnswers[1] || '';${NL}  const governance = oldAnswers[2] || '';${NL}  const prioritization = oldAnswers[3] || [];${NL}  const visibility = parseInt(oldAnswers[4]) || 3;${NL}  const mainChallenge = oldAnswers[5] || '';${NL}  const initiativeTypes = oldAnswers[6] || [];${NL}  const mainGoal = oldAnswers[7] || '';`;

const newFunctionStart = `// Transform assessment answers to strategic assessment format${NL}function transformToStrategicAnswers(oldAnswers: Record<number, any>, companyName: string): Partial<StrategicAnswers> {${NL}  // CURRENT FORMAT (9 questions):${NL}  // 1. Industry (single choice)${NL}  // 2. Business model (single choice)${NL}  // 3. Operational scale (single choice)${NL}  // 4. Portfolio size/count (single choice)${NL}  // 5. Prioritization criteria (multiple choice)${NL}  // 6. Main challenge (single choice)${NL}  // 7. Governance/decision process (single choice)${NL}  // 8. Product types (multiple choice) - for RAG context${NL}  // 9. Service types (multiple choice) - for RAG context${NL}${NL}  const industry = oldAnswers[1] || 'General Business';${NL}  const businessModel = oldAnswers[2] || '';${NL}  const operationalScale = oldAnswers[3] || '';${NL}  const portfolioSize = oldAnswers[4] || '';${NL}  const prioritization = oldAnswers[5] || [];${NL}  const mainChallenge = oldAnswers[6] || '';${NL}  const governance = oldAnswers[7] || '';${NL}  const productTypes = oldAnswers[8] || []; // NEW: Product categories for RAG${NL}  const serviceTypes = oldAnswers[9] || []; // NEW: Service categories for RAG`;

// Update industry line
const oldIndustryLine = `    // A1: Industry (deduce from initiative types and goal)${NL}    a1_industry: deduceIndustry(initiativeTypes, mainGoal),`;
const newIndustryLine = `    // A1: Industry (from direct question)${NL}    a1_industry: mapIndustryAnswer(industry),`;

// Update business model
const oldBusinessModel = `    // A2: Business Model (deduce from governance)${NL}    a2_business_model: governance.includes('Board') ? 'b2b_enterprise' : 'b2b_smb',`;
const newBusinessModel = `    // A2: Business Model (from direct question)${NL}    a2_business_model: mapBusinessModel(businessModel),`;

// Update scale
const oldScale = `    // A3: Scale (deduce from portfolio size)${NL}    a3_operational_scale: deduceScale(portfolioSize),`;
const newScale = `    // A3: Scale (from direct question)${NL}    a3_operational_scale: mapOperationalScale(operationalScale),`;

// Update D2 section
const oldD2 = `    // D2: THEMIS context${NL}    d2_primary_use_case: mainGoal || 'Portfolio management',${NL}    d2_timeline: 'immediate'${NL}  };${NL}}`;

const newD2 = `    // D2: THEMIS context${NL}    d2_primary_use_case: 'Portfolio management',${NL}    d2_timeline: 'immediate',${NL}${NL}    // NEW: Portfolio examples for RAG training context${NL}    product_types: productTypes,${NL}    service_types: serviceTypes${NL}  };${NL}}`;

// Add helper functions after deduceScale
const afterDeduceScale = `function deduceScale(portfolioSize: string): string {${NL}  if (portfolioSize.includes('50+') || portfolioSize.includes('100+')) return 'enterprise';${NL}  if (portfolioSize.includes('30-50')) return 'mid_market';${NL}  if (portfolioSize.includes('10-30')) return 'scaleup';${NL}  return 'startup';${NL}}`;

const newHelperFunctions = `function deduceScale(portfolioSize: string): string {${NL}  if (portfolioSize.includes('50+') || portfolioSize.includes('100+')) return 'enterprise';${NL}  if (portfolioSize.includes('30-50')) return 'mid_market';${NL}  if (portfolioSize.includes('10-30')) return 'scaleup';${NL}  return 'startup';${NL}}${NL}${NL}// Map industry answer from frontend to strategic profile format${NL}function mapIndustryAnswer(industry: string): string {${NL}  const industryMap: Record<string, string> = {${NL}    'Information Technology': 'Information Technology',${NL}    'Manufacturing': 'Manufacturing',${NL}    'Financial Services': 'Financial Services',${NL}    'Healthcare': 'Healthcare',${NL}    'Retail & E-commerce': 'Retail',${NL}    'Professional Services': 'Professional Services',${NL}    'Education': 'Education',${NL}    'Energy & Utilities': 'Energy',${NL}    'Telecommunications': 'Telecommunications',${NL}    'General Business': 'General Business'${NL}  };${NL}  return industryMap[industry] || 'General Business';${NL}}${NL}${NL}// Map business model answer from frontend${NL}function mapBusinessModel(businessModel: string): string {${NL}  if (businessModel.includes('Enterprise')) return 'b2b_enterprise';${NL}  if (businessModel.includes('SMB')) return 'b2b_smb';${NL}  if (businessModel.includes('Consumer') || businessModel.includes('B2C')) return 'b2c';${NL}  if (businessModel.includes('Government') || businessModel.includes('B2G')) return 'b2g';${NL}  if (businessModel.includes('Marketplace') || businessModel.includes('Platform')) return 'marketplace';${NL}  if (businessModel.includes('Hybrid')) return 'hybrid';${NL}  return 'b2b_smb';${NL}}${NL}${NL}// Map operational scale answer from frontend${NL}function mapOperationalScale(scale: string): string {${NL}  if (scale.includes('Startup')) return 'startup';${NL}  if (scale.includes('Scale-up')) return 'scaleup';${NL}  if (scale.includes('Mid-Market')) return 'mid_market';${NL}  if (scale.includes('Enterprise')) return 'enterprise';${NL}  if (scale.includes('Conglomerate')) return 'conglomerate';${NL}  return 'startup';${NL}}`;

let modified = content;

// Apply replacements
if (modified.includes(oldFunctionStart)) {
  modified = modified.replace(oldFunctionStart, newFunctionStart);
  console.log('✅ Updated function header and variable mappings');
} else {
  console.log('❌ Function header pattern not found');
  // Debug: show what we're looking for vs what exists
  const idx = modified.indexOf('transformToStrategicAnswers');
  if (idx !== -1) {
    console.log('Found at index:', idx);
    console.log('Context:', JSON.stringify(modified.substring(idx - 100, idx + 200)));
  }
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
