const fs = require('fs');

const NL = '\r\n';
const schemaPath = 'c:/Users/l.de.angelis/Setup/backend/src/agents/schemas/strategicAssessmentSchema.ts';
let schemaContent = fs.readFileSync(schemaPath, 'utf8');

// The actual format is "// Section C: Strategic Context"
const oldSectionC = `  // Section C: Strategic Context`;
const newSectionC = `  // NEW: Portfolio examples for RAG context (from assessment questions 8 & 9)${NL}  product_types: z.array(z.string()).optional().describe('Selected product categories'),${NL}  service_types: z.array(z.string()).optional().describe('Selected service categories'),${NL}${NL}  // Section C: Strategic Context`;

if (schemaContent.includes(oldSectionC)) {
  schemaContent = schemaContent.replace(oldSectionC, newSectionC);
  fs.writeFileSync(schemaPath, schemaContent);
  console.log('✅ Updated AssessmentAnswersSchema with product_types/service_types');
} else {
  console.log('❌ Could not find Section C marker in schema');
}
