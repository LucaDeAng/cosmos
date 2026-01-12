/**
 * Data Ingestion Test Suite
 * Tests all formats and measures performance
 */

const http = require('http');

const API_URL = 'http://localhost:3000/api/portfolio/ingest/text';

// Test cases
const tests = [
  {
    name: 'TEST 1: Testo Semplice (3 items)',
    expected: 3,
    body: {
      tenantId: 'test-uuid-1234',
      text: `Portfolio IT 2024:
1. CRM Modernization - Migrazione a Salesforce, budget 150000 euro, priorità alta, owner Mario Rossi
2. ERP SAP S/4HANA - Upgrade sistema gestionale, budget 500000 euro, in corso, owner Finance Team  
3. Cybersecurity Assessment - Valutazione sicurezza aziendale, budget 80000 euro, pianificato`
    }
  },
  {
    name: 'TEST 2: CSV Format (3 items)',
    expected: 3,
    body: {
      tenantId: 'test-uuid-1234',
      text: `Nome,Tipo,Budget,Stato,Priorità,Owner
Migrazione Cloud AWS,Progetto,250000,In Corso,Alta,Cloud Team
Help Desk IT,Servizio,120000,Attivo,Media,IT Support
Piattaforma E-commerce,Prodotto,180000,Pianificato,Alta,Digital Team`
    }
  },
  {
    name: 'TEST 3: Tabella Markdown (3 items)',
    expected: 3,
    body: {
      tenantId: 'test-uuid-1234',
      text: `| Nome | Tipo | Budget | Stato | Owner |
|------|------|--------|-------|-------|
| Data Warehouse | Progetto | 300000 | In Corso | BI Team |
| API Gateway | Prodotto | 150000 | Attivo | Platform Team |
| Managed SOC | Servizio | 200000 | Pianificato | Security Team |`
    }
  },
  {
    name: 'TEST 4: Lista Puntata (4 items)',
    expected: 4,
    body: {
      tenantId: 'test-uuid-1234',
      text: `Progetti Attivi:
• Microsoft 365 Migration - migrazione email e collaboration, budget 100k, alta priorità
• Network Refresh - aggiornamento infrastruttura di rete, budget 200k, in corso
• Identity Management - implementazione IAM, budget 150k, pianificato
• Backup & DR - disaster recovery solution, budget 80k, critico`
    }
  },
  {
    name: 'TEST 5: Stress Test (10 items)',
    expected: 10,
    body: {
      tenantId: 'test-uuid-1234',
      text: `Portfolio IT Completo 2024-2025:

1. CRM Salesforce - Customer relationship management, budget 150000, priorità alta, in corso, owner Sales Team
2. ERP SAP S/4HANA - Enterprise resource planning, budget 500000, priorità critica, attivo, owner Finance
3. Cloud AWS Migration - Migrazione infrastruttura cloud, budget 300000, priorità alta, pianificato, owner Cloud Team
4. Data Lake Azure - Piattaforma dati centralizzata, budget 400000, priorità media, in sviluppo, owner BI Team
5. Cybersecurity Suite - Sicurezza endpoint e network, budget 200000, priorità critica, attivo, owner Security
6. DevOps Platform - CI/CD e automation, budget 180000, priorità alta, in corso, owner DevOps Team
7. HR Management System - Gestione risorse umane, budget 120000, priorità media, pianificato, owner HR
8. Business Intelligence - Dashboard e analytics, budget 250000, priorità alta, attivo, owner Analytics Team
9. Mobile App Enterprise - App aziendale mobile, budget 160000, priorità media, in sviluppo, owner Mobile Team
10. AI/ML Platform - Machine learning infrastructure, budget 350000, priorità alta, ricerca, owner Data Science`
    }
  },
  {
    name: 'TEST 6: Testo Non Strutturato',
    expected: 2,
    body: {
      tenantId: 'test-uuid-1234',
      text: `Durante la riunione del comitato IT del 15 dicembre si è discusso del progetto di modernizzazione del CRM aziendale. 
Il progetto, denominato "CRM Next Generation", prevede un budget di 250.000 euro e sarà guidato da Marco Bianchi del team Sales.
Inoltre, è stato approvato il nuovo servizio di Help Desk Premium con un investimento di 80.000 euro annui, gestito dal team IT Support.`
    }
  }
];

// Genera testo per stress test con 100 elementi
function generateStressItems(count) {
  const lines = [];
  for (let i = 1; i <= count; i++) {
    lines.push(`${i}. Project ${i} - Task description, budget ${10000 + i * 1000}, owner Team ${i % 10}`);
  }
  return `Portfolio Bulk Import:\n\n${lines.join('\n')}`;
}

tests.push({
  name: 'TEST 7: Stress Test (100 items)',
  expected: 100,
  body: {
    tenantId: 'test-uuid-1234',
    text: generateStressItems(100)
  }
});

async function runTest(test) {
  const startTime = Date.now();
  
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(test.body);
    
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: '/api/portfolio/ingest/text',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        const elapsed = Date.now() - startTime;
        try {
          const result = JSON.parse(body);
          resolve({
            name: test.name,
            expected: test.expected,
            actual: result.items?.length || 0,
            success: result.success,
            elapsed,
            items: result.items || [],
            confidence: result.stats?.confidence || 0
          });
        } catch (e) {
          reject(new Error(`Parse error: ${e.message}`));
        }
      });
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function runAllTests() {
  console.log('\n' + '='.repeat(60));
  console.log('🧪 DATA INGESTION TEST SUITE');
  console.log('='.repeat(60) + '\n');

  const results = [];
  
  for (const test of tests) {
    try {
      console.log(`\n⏳ Running: ${test.name}...`);
      const result = await runTest(test);
      results.push(result);
      
      const status = result.actual >= result.expected ? '✅' : '⚠️';
      console.log(`${status} ${result.name}`);
      console.log(`   Expected: ${result.expected} | Actual: ${result.actual} | Time: ${result.elapsed}ms`);
      console.log(`   Confidence: ${(result.confidence * 100).toFixed(1)}%`);
      
      if (result.items.length > 0) {
        console.log('   Items:');
        result.items.slice(0, 5).forEach(item => {
          console.log(`     - ${item.name} [${item.type}] budget=${item.budget || 'N/A'}`);
        });
        if (result.items.length > 5) {
          console.log(`     ... and ${result.items.length - 5} more`);
        }
      }
    } catch (error) {
      console.log(`❌ ${test.name}: ${error.message}`);
      results.push({ name: test.name, error: error.message });
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 SUMMARY');
  console.log('='.repeat(60));
  
  const successful = results.filter(r => !r.error && r.actual >= r.expected).length;
  const partial = results.filter(r => !r.error && r.actual > 0 && r.actual < r.expected).length;
  const failed = results.filter(r => r.error || r.actual === 0).length;
  
  console.log(`✅ Successful: ${successful}/${tests.length}`);
  console.log(`⚠️ Partial: ${partial}/${tests.length}`);
  console.log(`❌ Failed: ${failed}/${tests.length}`);
  
  const avgTime = results.filter(r => r.elapsed).reduce((a, b) => a + b.elapsed, 0) / results.filter(r => r.elapsed).length;
  console.log(`⏱️ Avg Time: ${avgTime.toFixed(0)}ms`);
  
  const totalExpected = results.filter(r => !r.error).reduce((a, b) => a + b.expected, 0);
  const totalActual = results.filter(r => !r.error).reduce((a, b) => a + b.actual, 0);
  console.log(`📈 Extraction Rate: ${((totalActual / totalExpected) * 100).toFixed(1)}%`);
  
  console.log('\n' + '='.repeat(60) + '\n');
  
  return results;
}

// Run tests
runAllTests().then(results => {
  process.exit(results.every(r => !r.error && r.actual >= r.expected) ? 0 : 1);
}).catch(err => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
