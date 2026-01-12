// Test completo del backend
const http = require('http');

console.log('\nTEST BACKEND API\n');
console.log('='.repeat(60));

// Test 1: Health Check
function testHealth() {
  return new Promise((resolve, reject) => {
    const req = http.get('http://localhost:3000/health', (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        console.log('\nTEST 1: Health Check');
        try {
          console.log(JSON.parse(data));
        } catch (e) {
          console.log(data);
        }
        resolve();
      });
    });
    req.on('error', (err) => {
      console.log('\nErrore Health Check:', err.message);
      reject(err);
    });
    req.setTimeout(5000);
  });
}

// Test 2: Register User
function testRegister() {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      email: 'test@example.com',
      password: 'TestPass123!',
      fullName: 'Test User',
      companyName: 'Test Company',
      companyDomain: 'test.com'
    });

    const options = {
      hostname: 'localhost',
      port: 3000,
      path: '/api/auth/register',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': postData.length
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        console.log('\nTEST 2: User Registration');
        console.log('Status:', res.statusCode);
        try {
          console.log(JSON.parse(data));
        } catch (e) {
          console.log(data);
        }
        resolve();
      });
    });

    req.on('error', (err) => {
      console.log('\nErrore Registration:', err.message);
      reject(err);
    });
    req.setTimeout(5000);
    req.write(postData);
    req.end();
  });
}

// Esegui tutti i test
async function runTests() {
  try {
    await testHealth();
    await testRegister();
    
    console.log('\n' + '='.repeat(60));
    console.log('TUTTI I TEST COMPLETATI!');
    console.log('='.repeat(60) + '\n');
  } catch (error) {
    console.error('\nErrore durante i test:', error.message);
  }
}

// Attendi che il server sia pronto
console.log('Attendo 3 secondi per il server...\n');
setTimeout(runTests, 3000);
