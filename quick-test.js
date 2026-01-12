/**
 * Simple test runner with better error handling
 */

const http = require('http');

console.log('Testing connection to server...');

const testData = {
  tenantId: 'test-1234',
  text: '1. CRM System - budget 150000, alta priorita. 2. ERP SAP - budget 500000.'
};

const data = JSON.stringify(testData);

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
  console.log(`Status: ${res.statusCode}`);
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => {
    console.log('Response:', body);
    try {
      const result = JSON.parse(body);
      console.log('Items found:', result.items?.length || 0);
      if (result.items) {
        result.items.forEach(item => {
          console.log(`  - ${item.name} [${item.type}] budget=${item.budget || 'N/A'}`);
        });
      }
    } catch (e) {
      console.log('Parse error:', e.message);
    }
  });
});

req.on('error', (e) => {
  console.error('Connection error:', e.message);
  console.log('Make sure the server is running on port 3000');
});

req.write(data);
req.end();
