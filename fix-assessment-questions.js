const fs = require('fs');

const NL = '\r\n';
const filePath = 'c:/Users/l.de.angelis/Setup/frontend/app/onboarding/assessment/page.tsx';
let content = fs.readFileSync(filePath, 'utf8');

// 1. REPLACE QUESTION 8 WITH MORE GENERIC PRODUCT OPTIONS
const oldQ8 = `  // SEZIONE D: Quick Context (per RAG - domande veloci)
  {
    id: 8,
    question: "Che tipo di prodotti/soluzioni offrite?",
    description: "Seleziona le categorie principali",
    type: 'multiple',
    category: 'portfolio_examples',
    options: [
      'Software / Piattaforme SaaS',
      'Hardware / Dispositivi',
      'Applicazioni Mobile',
      'Soluzioni Cloud',
      'Prodotti Data / Analytics',
      'Piattaforme AI / ML',
      'Soluzioni IoT',
      'Prodotti Cybersecurity'
    ]
  },
  {
    id: 9,
    question: "Che tipo di servizi offrite?",
    description: "Seleziona le categorie principali",
    type: 'multiple',
    category: 'portfolio_examples',
    options: [
      'Consulenza Strategica',
      'Implementazione / System Integration',
      'Supporto / Manutenzione',
      'Formazione',
      'Managed Services',
      'Sviluppo Custom',
      'Cloud Migration',
      'Security Services'
    ]
  }
];`;

const newQ8 = `  // SEZIONE D: Portfolio - Focus Prodotti
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

if (content.includes(oldQ8)) {
  content = content.replace(oldQ8, newQ8);
  fs.writeFileSync(filePath, content);
  console.log('✅ Updated questions 8 and 9 with generic product-focused options');
} else {
  console.log('❌ Could not find question pattern');
  // Debug - check what's there
  const idx = content.indexOf('SEZIONE D');
  if (idx !== -1) {
    console.log('Found SEZIONE D at:', idx);
    console.log('Context:', content.substring(idx, idx + 200));
  }
}
