# Quick Start Testing Guide

## 🚀 Avvio Rapido

### Prerequisiti

1. **Environment variables** configurate in `.env`:
```bash
OPENAI_API_KEY=sk-...
SUPABASE_URL=https://...
SUPABASE_KEY=...
```

2. **Dependencies** installate:
```bash
npm install
```

3. **Database** migrato:
```bash
npm run migrate
```

---

## 📋 Test Rapidi

### 1. Bootstrap RAG (Prima Volta)

```bash
npx ts-node src/scripts/harmonize-agents.ts
```

**Cosa fa:**
- ✅ Carica 35 reference catalogs nel RAG
- ✅ Testa classificazione (Initiative/Product/Service)
- ✅ Verifica validazione dati
- ✅ Testa integrazione end-to-end

**Output atteso:**
```
📦 Bootstrap: ✅ Success
🎯 RAG Accuracy: 92.3% ✅
✅ Validation: ✅ Working
🔗 Integration: 95/100 ✅

📋 Recommendations:
   ✅ All systems working optimally - ready for production
```

---

### 2. Test Completo End-to-End

```bash
npx ts-node src/test/rag-e2e.test.ts
```

**Esegue 4 test:**
1. ✅ Bootstrap Reference Catalogs
2. ✅ RAG Performance (con/senza ottimizzazioni)
3. ✅ Sample Catalog Classification
4. ✅ Data Quality Validation

**Target di successo:** 4/4 test passed

---

### 3. Test Manuale con Node REPL

```bash
node
```

```javascript
// Import modules
const { bootstrapReferenceCatalogs, testRAGWithReferenceCatalog } = require('./dist/agents/utils/catalogBootstrap');
const { semanticSearch } = require('./dist/agents/utils/embeddingService');

// 1. Bootstrap (se non già fatto)
await bootstrapReferenceCatalogs({ force: true, verbose: true });

// 2. Test una query
const results = await semanticSearch(
  '00000000-0000-0000-0000-000000000000', // SYSTEM_COMPANY_ID
  'Migrate applications to AWS cloud',
  {
    useHybridSearch: true,
    useQueryExpansion: true,
    useAdaptiveThreshold: true,
  }
);

console.log('Top match:', results[0]?.metadata);
console.log('Similarity:', Math.round(results[0]?.similarity * 100) + '%');

// 3. Test completo
const { stats } = await testRAGWithReferenceCatalog({
  useOptimizations: true,
  verbose: true
});

console.log('Type Accuracy:', stats.typeAccuracy + '%');
```

---

## 🧪 Test con Dati Reali

### Esempio 1: Catalogo IT Projects

Crea file `test-catalog.txt`:
```
1. Cloud Migration to AWS
Description: Migrate 150 on-premise applications to AWS
Budget: €4,500,000
Status: Active

2. SAP S/4HANA Implementation
Description: Replace legacy SAP ECC with S/4HANA Cloud
Budget: €8,500,000
Status: Active

3. Microsoft 365 Deployment
Description: Migrate 5000 users to M365
Budget: €3,200,000
Status: Proposed
```

**Testa classificazione:**

```javascript
const fs = require('fs');
const { semanticSearch } = require('./dist/agents/utils/embeddingService');

const catalog = fs.readFileSync('test-catalog.txt', 'utf8');
const lines = catalog.split('\n').filter(l => l.trim());

for (const line of lines) {
  if (line.match(/^\d+\./)) {
    const name = line.replace(/^\d+\.\s*/, '');

    const results = await semanticSearch(
      '00000000-0000-0000-0000-000000000000',
      name,
      { useHybridSearch: true, useQueryExpansion: true }
    );

    const match = results[0];
    console.log(`\n"${name}"`);
    console.log(`→ ${match?.metadata.type} | ${match?.metadata.category}`);
    console.log(`  Confidence: ${Math.round(match?.similarity * 100)}%`);
  }
}
```

---

### Esempio 2: Test con PDF (simulato)

```javascript
const { semanticSearch } = require('./dist/agents/utils/embeddingService');
const { validateNormalizedItem } = require('./dist/agents/subagents/ingestion/itemValidator');

// Simula estrazione da PDF
const extractedItems = [
  {
    name: 'Enterprise Data Lake Implementation',
    description: 'Build cloud-native data lake on AWS S3',
    rawType: 'Project',
    rawStatus: 'Active',
    budget: 2200000,
  },
  {
    name: 'SIEM Security Platform',
    description: 'Threat detection and compliance monitoring',
    rawType: 'Platform',
    rawStatus: 'Live',
  },
];

// Per ogni item estratto
for (const item of extractedItems) {
  console.log(`\n📄 Processing: ${item.name}`);

  // 1. RAG enhancement
  const ragResults = await semanticSearch(
    '00000000-0000-0000-0000-000000000000',
    `${item.name} ${item.description}`,
    {
      limit: 3,
      useHybridSearch: true,
      useQueryExpansion: true,
      useAdaptiveThreshold: true,
    }
  );

  const bestMatch = ragResults[0];
  console.log(`  🎯 RAG Match: ${bestMatch.metadata.title}`);
  console.log(`     Type: ${bestMatch.metadata.type}`);
  console.log(`     Category: ${bestMatch.metadata.category}`);
  console.log(`     Similarity: ${Math.round(bestMatch.similarity * 100)}%`);

  // 2. Normalize
  const normalized = {
    id: Math.random().toString(),
    name: item.name,
    description: item.description,
    type: bestMatch.metadata.type,
    status: 'active',
    category: bestMatch.metadata.category,
    confidence: bestMatch.similarity,
    budget: item.budget,
  };

  // 3. Validate
  const validation = validateNormalizedItem(normalized);
  console.log(`  ✅ Validation:`);
  console.log(`     Valid: ${validation.valid}`);
  console.log(`     Score: ${validation.score.toFixed(2)}`);
  console.log(`     Quarantine: ${validation.quarantine ? 'YES' : 'NO'}`);

  if (validation.errors.length > 0) {
    console.log(`     Errors: ${validation.errors.length}`);
    validation.errors.forEach(e => console.log(`       - ${e.message}`));
  }
}
```

---

## 📊 Metriche di Successo

### Target di Performance

| Metrica | Target | Come Testare |
|---------|--------|--------------|
| **RAG Type Accuracy** | >90% | `testRAGWithReferenceCatalog()` |
| **RAG Category Match** | >85% | `testRAGWithReferenceCatalog()` |
| **Validation Pass Rate** | 90-95% | `validateBatch()` su dati buoni |
| **Quarantine Rate** | 5-10% | `validateBatch()` su dati misti |
| **Integration Score** | >90/100 | `harmonize-agents.ts` |

### Come Verificare

```javascript
// Test accuracy
const { stats } = await testRAGWithReferenceCatalog({
  useOptimizations: true
});

console.log('✅ Type Accuracy:', stats.typeAccuracy, '% (target: >90%)');
console.log('✅ Category Accuracy:', stats.categoryAccuracy, '% (target: >85%)');
console.log('✅ Pass Rate:', Math.round((stats.passed/stats.total)*100), '% (target: >85%)');
```

---

## 🔧 Troubleshooting

### Problema: "No matches found"

**Causa:** RAG non bootstrappato

**Soluzione:**
```javascript
await bootstrapReferenceCatalogs({ force: true, verbose: true });
```

---

### Problema: "Low accuracy (<80%)"

**Causa:** Ottimizzazioni non abilitate

**Soluzione:**
```javascript
// Assicurati di usare le ottimizzazioni
const results = await semanticSearch(companyId, query, {
  useHybridSearch: true,        // ✅ MUST
  useQueryExpansion: true,      // ✅ MUST
  useAdaptiveThreshold: true,   // ✅ MUST
});
```

---

### Problema: "All items quarantined"

**Causa:** Threshold troppo alto

**Soluzione:**
```javascript
// Verifica quality gates
const { QUALITY_GATES } = require('./dist/agents/subagents/ingestion/itemValidator');

console.log('Current gates:', QUALITY_GATES);

// Se necessario, abbassa temporaneamente
QUALITY_GATES.MIN_OVERALL_CONFIDENCE = 0.3; // Default: 0.4
QUALITY_GATES.QUARANTINE_THRESHOLD = 0.2;    // Default: 0.3
```

---

### Problema: "OPENAI_API_KEY not found"

**Verifica:**
```javascript
const dotenv = require('dotenv');
dotenv.config();

console.log('OpenAI Key set:', !!process.env.OPENAI_API_KEY);
console.log('Supabase URL set:', !!process.env.SUPABASE_URL);
console.log('Supabase Key set:', !!process.env.SUPABASE_KEY);
```

---

## 🎯 Test Scenarios

### Scenario 1: IT Portfolio Recognition

**Input:**
```
1. AWS Cloud Migration - €4.5M
2. SAP S/4HANA Implementation - €8.5M
3. Microsoft 365 Deployment - €3.2M
4. Zero Trust Security - €3.5M
5. SIEM Platform - €1.2M
6. CI/CD Platform - €650K
7. 24/7 Infrastructure Support - €850K/year
8. SOC-as-a-Service - €1.4M/year
```

**Expected Output:**
```
1. Initiative | Cloud Migration (>85% confidence)
2. Initiative | ERP (>85% confidence)
3. Initiative | Digital Workplace (>85% confidence)
4. Initiative | Security (>85% confidence)
5. Product | Security (>80% confidence)
6. Product | DevOps (>80% confidence)
7. Service | Managed Services (>80% confidence)
8. Service | Managed Services (>80% confidence)
```

**Success Criteria:** 8/8 correct classifications

---

### Scenario 2: Mixed Quality Data

**Input:**
```
1. Enterprise Data Lake - detailed description - €2.2M
2. Prj123 - no description - €0
3. Real-time Analytics Platform - good description - €1.8M
4. Item X - unclear - negative budget
```

**Expected Output:**
```
1. ✅ Accepted - Initiative | Data Platform (confidence: 0.87)
2. 🚨 Quarantined - Low confidence (0.23), missing description
3. ✅ Accepted - Product | Analytics (confidence: 0.84)
4. 🚨 Quarantined - Invalid budget, low confidence
```

**Success Criteria:** 2 accepted, 2 quarantined

---

## 📈 Performance Monitoring

### Daily Health Check

Aggiungi a cron:
```bash
# Run daily at 2 AM
0 2 * * * cd /path/to/backend && npx ts-node src/scripts/harmonize-agents.ts >> /var/log/rag-health.log 2>&1
```

### Monitoring Script

```javascript
// monitor-rag.js
const { quickHealthCheck } = require('./dist/scripts/harmonize-agents');

setInterval(async () => {
  const healthy = await quickHealthCheck();

  if (!healthy) {
    console.error('⚠️ RAG health check failed!');
    // Send alert (email, Slack, etc.)
  } else {
    console.log('✅ RAG healthy');
  }
}, 3600000); // Every hour
```

---

## 🚀 Production Readiness Checklist

- [ ] Bootstrap completato con successo
- [ ] RAG accuracy >85%
- [ ] Validation working (quarantine rate 5-10%)
- [ ] Integration score >90
- [ ] Environment variables configurate
- [ ] Database migrato
- [ ] Health check running
- [ ] Monitoring attivo

---

## 📚 Reference

- **RAG Optimizations**: [RAG_OPTIMIZATIONS.md](./RAG_OPTIMIZATIONS.md)
- **Data Ingestion**: [DATA_INGESTION_ANALYSIS.md](./DATA_INGESTION_ANALYSIS.md)
- **Self-Improvement**: [SELF_IMPROVEMENT_GUIDE.md](./SELF_IMPROVEMENT_GUIDE.md)
- **Optimization Summary**: [OPTIMIZATION_SUMMARY.md](./OPTIMIZATION_SUMMARY.md)

---

**Last Updated:** 2025-12-12
**Version:** 1.0
**Status:** ✅ Ready for Testing
