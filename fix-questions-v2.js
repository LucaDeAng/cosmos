const fs = require('fs');

const filePath = 'c:/Users/l.de.angelis/Setup/frontend/app/onboarding/assessment/page.tsx';
let content = fs.readFileSync(filePath, 'utf8');

// Find Q8 and Q9 and replace them
const oldQ8Start = "// SEZIONE D: Quick Context (per RAG - domande veloci)";
const oldQ8End = "]\n  }\n];";

const startIdx = content.indexOf(oldQ8Start);
const endIdx = content.indexOf(oldQ8End, startIdx);

if (startIdx !== -1 && endIdx !== -1) {
  const before = content.substring(0, startIdx);
  const after = content.substring(endIdx + oldQ8End.length);

  const newSection = `// SEZIONE D: Portfolio - Focus Prodotti
  {
    id: 8,
    question: "Che tipo di prodotti offrite?",
    description: "Seleziona le categorie principali del vostro portfolio prodotti",
    type: 'multiple',
    category: 'portfolio_examples',
    options: [
      'Prodotti Fisici / Beni di Consumo',
      'Software / Applicazioni',
      'Piattaforme Digitali',
      'Hardware / Dispositivi',
      'Prodotti Industriali / B2B',
      'Soluzioni Integrate (Hardware + Software)',
      'Prodotti Finanziari / Assicurativi',
      'Altro'
    ]
  },
  {
    id: 9,
    question: "Offrite anche servizi collegati ai prodotti?",
    description: "Opzionale - seleziona se applicabile",
    type: 'multiple',
    category: 'portfolio_examples',
    options: [
      'Installazione / Setup',
      'Manutenzione / Supporto',
      'Formazione / Training',
      'Consulenza',
      'Personalizzazione / Customization',
      'Assistenza Post-Vendita',
      'Non offriamo servizi',
      'Altro'
    ]
  }
];`;

  content = before + newSection + after;
  fs.writeFileSync(filePath, content);
  console.log('✅ Updated questions 8 and 9');
} else {
  console.log('❌ Could not find pattern');
  console.log('startIdx:', startIdx);
  console.log('endIdx:', endIdx);
}
