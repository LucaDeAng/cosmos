const fs = require('fs');

// Use CRLF for Windows files
const NL = '\r\n';

// ============================================================
// 1. UPDATE ASSESSMENT SCHEMA TO INCLUDE product_types/service_types
// ============================================================

const schemaPath = 'c:/Users/l.de.angelis/Setup/backend/src/agents/schemas/strategicAssessmentSchema.ts';
let schemaContent = fs.readFileSync(schemaPath, 'utf8');

// Add product_types and service_types before the Section C section
const oldSectionC = `  \\ Section C: Strategic Context`;
const newSectionC = `  // NEW: Portfolio examples for RAG context (from assessment questions 8 & 9)${NL}  product_types: z.array(z.string()).optional().describe('Selected product categories'),${NL}  service_types: z.array(z.string()).optional().describe('Selected service categories'),${NL}${NL}  \\ Section C: Strategic Context`;

if (schemaContent.includes(oldSectionC)) {
  schemaContent = schemaContent.replace(oldSectionC, newSectionC);
  fs.writeFileSync(schemaPath, schemaContent);
  console.log('✅ Updated AssessmentAnswersSchema with product_types/service_types');
} else {
  console.log('❌ Could not find Section C marker in schema');
}

// ============================================================
// 2. UPDATE formatAnswersForPrompt IN AGENT
// ============================================================

const agentPath = 'c:/Users/l.de.angelis/Setup/backend/src/agents/strategicAssessmentAgent.ts';
let agentContent = fs.readFileSync(agentPath, 'utf8');

// Find the formatAnswersForPrompt function and add product_types/service_types
const oldThemisSection = `      '\\n\\n# SECTION D: THEMIS CONTEXT\\n',`;
const newThemisSection = `      // NEW: Product/Service categories selected by user (for RAG context)${NL}      answers.product_types?.length ? \`\\n\\n# PORTFOLIO CATEGORIES (User Selected)\\nProduct Types: \${answers.product_types.join(', ')}\` : '',${NL}      answers.service_types?.length ? \`Service Types: \${answers.service_types.join(', ')}\` : '',${NL}${NL}      '\\n\\n# SECTION D: THEMIS CONTEXT\\n',`;

if (agentContent.includes(oldThemisSection)) {
  agentContent = agentContent.replace(oldThemisSection, newThemisSection);
  fs.writeFileSync(agentPath, agentContent);
  console.log('✅ Updated formatAnswersForPrompt to include product_types/service_types');
} else {
  console.log('❌ Could not find THEMIS CONTEXT section in agent');
  // Debug
  const idx = agentContent.indexOf('SECTION D');
  if (idx !== -1) {
    console.log('Found SECTION D at:', idx);
    console.log('Context:', JSON.stringify(agentContent.substring(idx - 50, idx + 100)));
  }
}

// ============================================================
// 3. UPDATE PROMPT TO USE THESE CATEGORIES
// ============================================================

// Check if there's a prompt file
const promptPath = 'c:/Users/l.de.angelis/Setup/backend/src/agents/prompts/strategic-assessment-prompt.md';
if (fs.existsSync(promptPath)) {
  let promptContent = fs.readFileSync(promptPath, 'utf8');

  // Add instruction to use the user-selected categories
  if (!promptContent.includes('PORTFOLIO CATEGORIES')) {
    const instruction = `\n\n## IMPORTANT: Portfolio Category Context\n\nWhen the user provides PORTFOLIO CATEGORIES (Product Types and Service Types), use these as the basis for generating top_products and top_services examples. These categories reflect the actual products/services the company offers, so generate specific examples within these categories rather than generic examples.\n`;

    promptContent += instruction;
    fs.writeFileSync(promptPath, promptContent);
    console.log('✅ Updated strategic-assessment-prompt.md with category instructions');
  } else {
    console.log('ℹ️  Prompt already contains PORTFOLIO CATEGORIES instructions');
  }
} else {
  console.log('ℹ️  Prompt file not found (using fallback prompt)');
}

console.log('\n✅ RAG context updates complete!');
