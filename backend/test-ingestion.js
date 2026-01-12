const http = require('http');

const data = JSON.stringify({
  tenantId: 'test-tenant-123',
  text: `
    Progetto CRM Modernization, budget 500000 euro, owner Mario Rossi, status in corso, priorità alta.
    Servizio Help Desk IT, attivo, priorità media, owner IT Support Team.
    Prodotto SAP ERP, maturo, owner Finance Team, budget 1200000.
  `
});

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

console.log('🚀 Testing ingestion endpoint...\n');

const req = http.request(options, (res) => {
  let responseData = '';
  
  res.on('data', (chunk) => {
    responseData += chunk;
  });
  
  res.on('end', () => {
    console.log(`Status: ${res.statusCode}`);
    console.log('\nResponse:');
    try {
      const json = JSON.parse(responseData);
      console.log(JSON.stringify(json, null, 2));
    } catch {
      console.log(responseData);
    }
  });
});

req.on('error', (e) => {
  console.error(`Error: ${e.message}`);
});

req.write(data);
req.end();
