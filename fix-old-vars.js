const fs = require('fs');

const NL = '\r\n';
const filePath = 'c:/Users/l.de.angelis/Setup/backend/src/routes/assessment.routes.ts';
let content = fs.readFileSync(filePath, 'utf8');

// Fix 1: mainGoal -> use a derived goal based on challenge
const oldMainGoal = `      { goal: mainGoal || 'Improve portfolio management', priority: 1 },`;
const newMainGoal = `      { goal: deriveGoalFromChallenge(mainChallenge), priority: 1 },`;

// Fix 2: visibility reference -> use default
const oldVisibility = "c3_pain_description: `Primary challenge: ${mainChallenge}. Current visibility level: ${visibility}/5`,";
const newVisibility = "c3_pain_description: `Primary challenge: ${mainChallenge}`,";

// Fix 3: initiativeTypes -> use productTypes and serviceTypes
const oldInitiativeTypes = `    // D1: Census scope (from initiative types)${NL}    d1_census_scope: Array.isArray(initiativeTypes) && initiativeTypes.length > 0${NL}      ? initiativeTypes.map((type: string) => mapInitiativeTypeToScope(type))${NL}      : ['all_initiatives'],`;
const newInitiativeTypes = `    // D1: Census scope (from product/service types)${NL}    d1_census_scope: deriveCensusScope(productTypes, serviceTypes),`;

// Apply fixes
let modified = content;

if (modified.includes(oldMainGoal)) {
  modified = modified.replace(oldMainGoal, newMainGoal);
  console.log('✅ Fixed mainGoal reference');
} else {
  console.log('❌ Could not find mainGoal reference');
}

if (modified.includes(oldVisibility)) {
  modified = modified.replace(oldVisibility, newVisibility);
  console.log('✅ Fixed visibility reference');
} else {
  console.log('❌ Could not find visibility reference');
}

if (modified.includes(oldInitiativeTypes)) {
  modified = modified.replace(oldInitiativeTypes, newInitiativeTypes);
  console.log('✅ Fixed initiativeTypes reference');
} else {
  console.log('❌ Could not find initiativeTypes reference');
}

// Add helper functions after mapOperationalScale function
const afterMapScale = `// Map operational scale answer from frontend${NL}function mapOperationalScale(scale: string): string {${NL}  if (scale.includes('Startup')) return 'startup';${NL}  if (scale.includes('Scale-up')) return 'scaleup';${NL}  if (scale.includes('Mid-Market')) return 'mid_market';${NL}  if (scale.includes('Enterprise')) return 'enterprise';${NL}  if (scale.includes('Conglomerate')) return 'conglomerate';${NL}  return 'startup';${NL}}`;

const newHelperFunctions = `// Map operational scale answer from frontend${NL}function mapOperationalScale(scale: string): string {${NL}  if (scale.includes('Startup')) return 'startup';${NL}  if (scale.includes('Scale-up')) return 'scaleup';${NL}  if (scale.includes('Mid-Market')) return 'mid_market';${NL}  if (scale.includes('Enterprise')) return 'enterprise';${NL}  if (scale.includes('Conglomerate')) return 'conglomerate';${NL}  return 'startup';${NL}}${NL}${NL}// Derive strategic goal from the main challenge${NL}function deriveGoalFromChallenge(challenge: string): string {${NL}  const challengeToGoal: Record<string, string> = {${NL}    'Mancanza di visibilità sul portfolio': 'Improve portfolio visibility and tracking',${NL}    'Difficoltà nella prioritizzazione': 'Enhance prioritization decision-making',${NL}    'Risorse insufficienti / sovraccarico': 'Optimize resource allocation',${NL}    'Scarso allineamento strategico': 'Strengthen strategic alignment',${NL}    'Problemi di go-to-market': 'Accelerate go-to-market execution',${NL}    'Bassa retention / customer value': 'Improve customer value and retention',${NL}    'Innovazione troppo lenta': 'Accelerate innovation velocity',${NL}    'Complessità operativa eccessiva': 'Simplify operational complexity'${NL}  };${NL}  return challengeToGoal[challenge] || 'Improve portfolio management';${NL}}${NL}${NL}// Derive census scope from product and service types${NL}function deriveCensusScope(productTypes: string[], serviceTypes: string[]): string[] {${NL}  const scopes: string[] = [];${NL}${NL}  if (productTypes.length > 0) {${NL}    scopes.push('all_products');${NL}    if (productTypes.includes('Software / Piattaforme SaaS')) scopes.push('digital_products');${NL}    if (productTypes.includes('Hardware / Dispositivi')) scopes.push('physical_products');${NL}  }${NL}${NL}  if (serviceTypes.length > 0) {${NL}    scopes.push('all_services');${NL}    if (serviceTypes.includes('Consulenza Strategica')) scopes.push('consulting');${NL}    if (serviceTypes.includes('Managed Services')) scopes.push('managed_services');${NL}  }${NL}${NL}  return scopes.length > 0 ? scopes : ['all_initiatives'];${NL}}`;

if (modified.includes(afterMapScale)) {
  modified = modified.replace(afterMapScale, newHelperFunctions);
  console.log('✅ Added deriveGoalFromChallenge and deriveCensusScope functions');
} else {
  console.log('❌ Could not add helper functions');
}

if (modified !== content) {
  fs.writeFileSync(filePath, modified);
  console.log('\n✅ File updated successfully!');
} else {
  console.log('\n❌ No changes made to file');
}
