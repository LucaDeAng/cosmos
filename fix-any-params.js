const fs = require('fs');

const filePath = 'c:/Users/l.de.angelis/Setup/frontend/app/onboarding/result/page.tsx';
let content = fs.readFileSync(filePath, 'utf8');

// Fix the sort parameters
const oldSort = '.sort((a, b) => a.priority - b.priority)';
const newSort = '.sort((a: { goal: string; priority: number }, b: { goal: string; priority: number }) => a.priority - b.priority)';

if (content.includes(oldSort)) {
  content = content.replace(oldSort, newSort);
  fs.writeFileSync(filePath, content);
  console.log('✅ Fixed sort parameters with explicit types');
} else {
  console.log('❌ Could not find sort pattern');
}
