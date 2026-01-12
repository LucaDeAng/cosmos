const fs = require('fs');
const content = fs.readFileSync('c:/Users/l.de.angelis/Setup/backend/src/routes/assessment.routes.ts', 'utf8');
console.log('Has CRLF:', content.includes('\r\n'));
console.log('First 50 chars with escapes:', JSON.stringify(content.substring(600, 700)));
