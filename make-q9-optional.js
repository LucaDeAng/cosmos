const fs = require('fs');
const filePath = 'c:/Users/l.de.angelis/Setup/frontend/app/onboarding/assessment/page.tsx';
let content = fs.readFileSync(filePath, 'utf8');

const NL = '\r\n';

const oldCanProceed = `canProceed = () => {${NL}    const answer = answers[question.id];${NL}    console.log('🔍 canProceed check - questionId:', question.id, 'answer:', answer);${NL}    if (!answer) return false;${NL}    if (Array.isArray(answer) && answer.length === 0) return false;${NL}    return true;${NL}  };`;

const newCanProceed = `canProceed = () => {${NL}    const answer = answers[question.id];${NL}    console.log('🔍 canProceed check - questionId:', question.id, 'answer:', answer);${NL}    // Question 9 (servizi) è opzionale - può essere saltata${NL}    if (question.id === 9) return true;${NL}    if (!answer) return false;${NL}    if (Array.isArray(answer) && answer.length === 0) return false;${NL}    return true;${NL}  };`;

if (content.includes(oldCanProceed)) {
  content = content.replace(oldCanProceed, newCanProceed);
  fs.writeFileSync(filePath, content);
  console.log('✅ Made question 9 optional');
} else {
  console.log('❌ Pattern not found');
}
