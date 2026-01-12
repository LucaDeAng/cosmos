const fs = require('fs');
const path = 'c:/Users/l.de.angelis/Setup/backend/src/routes/assessment.routes.ts';
let content = fs.readFileSync(path, 'utf8');

// Update the comment and variable mappings
const oldMapping = `// Transform old assessment answers to new strategic assessment format
function transformToStrategicAnswers(oldAnswers: Record<number, any>, companyName: string): Partial<StrategicAnswers> {
  // OLD FORMAT (7 questions):
  // 1. Portfolio size (initiatives count)
  // 2. Decision-making process (governance)
  // 3. Prioritization criteria (multiple)
  // 4. Portfolio visibility (1-5 scale)
  // 5. Main challenge
  // 6. Initiative types (multiple)
  // 7. Primary goal with THEMIS

  const portfolioSize = oldAnswers[1] || '';
  const governance = oldAnswers[2] || '';
  const prioritization = oldAnswers[3] || [];
  const visibility = parseInt(oldAnswers[4]) || 3;
  const mainChallenge = oldAnswers[5] || '';
  const initiativeTypes = oldAnswers[6] || [];
  const mainGoal = oldAnswers[7] || '';`;

const newMapping = `// Transform assessment answers to strategic assessment format
function transformToStrategicAnswers(oldAnswers: Record<number, any>, companyName: string): Partial<StrategicAnswers> {
  // CURRENT FORMAT (9 questions):
  // 1. Industry
  // 2. Business model
  // 3. Operational scale
  // 4. Portfolio size (count)
  // 5. Prioritization criteria (multiple)
  // 6. Main challenge
  // 7. Governance/decision process
  // 8. Product types (multiple) - NEW for RAG
  // 9. Service types (multiple) - NEW for RAG

  const industry = oldAnswers[1] || 'General Business';
  const businessModel = oldAnswers[2] || '';
  const operationalScale = oldAnswers[3] || '';
  const portfolioSize = oldAnswers[4] || '';
  const prioritization = oldAnswers[5] || [];
  const mainChallenge = oldAnswers[6] || '';
  const governance = oldAnswers[7] || '';
  const productTypes = oldAnswers[8] || []; // NEW: Product categories for RAG
  const serviceTypes = oldAnswers[9] || []; // NEW: Service categories for RAG`;

if (content.includes(oldMapping)) {
  content = content.replace(oldMapping, newMapping);

  // Also update the industry deduction to use the actual answer
  const oldIndustryDeduction = `    // A1: Industry (deduce from initiative types and goal)
    a1_industry: deduceIndustry(initiativeTypes, mainGoal),`;

  const newIndustryDeduction = `    // A1: Industry (from direct question)
    a1_industry: industry,`;

  content = content.replace(oldIndustryDeduction, newIndustryDeduction);

  // Update business model deduction
  const oldBusinessModel = `    // A2: Business Model (deduce from governance)
    a2_business_model: governance.includes('Board') ? 'b2b_enterprise' : 'b2b_smb',`;

  const newBusinessModel = `    // A2: Business Model (from direct question)
    a2_business_model: businessModel.includes('Enterprise') ? 'b2b_enterprise' :
                       businessModel.includes('SMB') ? 'b2b_smb' :
                       businessModel.includes('B2C') ? 'b2c' :
                       businessModel.includes('B2G') ? 'b2g' :
                       businessModel.includes('Marketplace') ? 'marketplace' : 'hybrid',`;

  content = content.replace(oldBusinessModel, newBusinessModel);

  // Update scale deduction
  const oldScale = `    // A3: Scale (deduce from portfolio size)
    a3_operational_scale: deduceScale(portfolioSize),`;

  const newScale = `    // A3: Scale (from direct question)
    a3_operational_scale: operationalScale.includes('Startup') ? 'startup' :
                          operationalScale.includes('Scale-up') ? 'scaleup' :
                          operationalScale.includes('Mid-Market') ? 'mid_market' :
                          operationalScale.includes('Enterprise') ? 'enterprise' :
                          operationalScale.includes('Conglomerate') ? 'conglomerate' : 'startup',`;

  content = content.replace(oldScale, newScale);

  // Add product/service types to the return object (after d2_timeline)
  const oldTimeline = `    d2_timeline: 'immediate'
  };`;

  const newTimeline = `    d2_timeline: 'immediate',

    // NEW: Portfolio examples for RAG training
    product_types: productTypes,
    service_types: serviceTypes
  };`;

  content = content.replace(oldTimeline, newTimeline);

  fs.writeFileSync(path, content);
  console.log('SUCCESS: Backend mapping updated');
} else {
  console.log('ERROR: Pattern not found');
}
