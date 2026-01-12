const fs = require('fs');

const filePath = 'c:/Users/l.de.angelis/Setup/frontend/app/onboarding/assessment/page.tsx';
let content = fs.readFileSync(filePath, 'utf8');

// Find Q8 and Q9 and replace them using CRLF
const NL = content.includes('\r\n') ? '\r\n' : '\n';
console.log('Line ending type:', NL === '\r\n' ? 'CRLF' : 'LF');

const oldQ8Start = "// SEZIONE D: Quick Context (per RAG - domande veloci)";
const oldQ8End = `]${NL}  }${NL}];`;

const startIdx = content.indexOf(oldQ8Start);
const endIdx = content.indexOf(oldQ8End, startIdx);

console.log('startIdx:', startIdx);
console.log('endIdx:', endIdx);

if (startIdx !== -1 && endIdx !== -1) {
  const before = content.substring(0, startIdx);
  const after = content.substring(endIdx + oldQ8End.length);

  const newSection = `// SEZIONE D: Portfolio - Focus Prodotti${NL}  {${NL}    id: 8,${NL}    question: "Che tipo di prodotti offrite?",${NL}    description: "Seleziona le categorie principali del vostro portfolio prodotti",${NL}    type: 'multiple',${NL}    category: 'portfolio_examples',${NL}    options: [${NL}      'Prodotti Fisici / Beni di Consumo',${NL}      'Software / Applicazioni',${NL}      'Piattaforme Digitali',${NL}      'Hardware / Dispositivi',${NL}      'Prodotti Industriali / B2B',${NL}      'Soluzioni Integrate (Hardware + Software)',${NL}      'Prodotti Finanziari / Assicurativi',${NL}      'Altro'${NL}    ]${NL}  },${NL}  {${NL}    id: 9,${NL}    question: "Offrite anche servizi collegati ai prodotti?",${NL}    description: "Opzionale - seleziona se applicabile",${NL}    type: 'multiple',${NL}    category: 'portfolio_examples',${NL}    options: [${NL}      'Installazione / Setup',${NL}      'Manutenzione / Supporto',${NL}      'Formazione / Training',${NL}      'Consulenza',${NL}      'Personalizzazione / Customization',${NL}      'Assistenza Post-Vendita',${NL}      'Non offriamo servizi',${NL}      'Altro'${NL}    ]${NL}  }${NL}];`;

  content = before + newSection + after;
  fs.writeFileSync(filePath, content);
  console.log('✅ Updated questions 8 and 9');
} else {
  console.log('❌ Could not find pattern');
  // Try to find the actual ending
  const fromStart = content.substring(startIdx, startIdx + 1000);
  console.log('Content from start:', fromStart.substring(0, 500));
}
