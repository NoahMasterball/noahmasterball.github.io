// npm run balance — prints the power budget per operator and the time-to-kill matrix
// (every weapon × every operator, body/head, at the reference ranges) from src/data/.
// Exit code 1 if content is invalid or an operator leaves the budget band.
import { budgetStatus, operatorBudget } from '../src/balance/budget.ts';
import { balanceMarkdown } from '../src/balance/report.ts';
import { OPERATORS, validateContent } from '../src/data/content.ts';

const problems = validateContent();
if (problems.length) {
  console.error(`Invalid content:\n- ${problems.join('\n- ')}`);
  process.exit(1);
}

console.log(balanceMarkdown());

const outside = OPERATORS.map(operatorBudget).filter((b) => budgetStatus(b.total) !== 'ok');
if (outside.length) {
  console.error(`Outside the budget band: ${outside.map((b) => `${b.operatorId} (${b.total.toFixed(2)})`).join(', ')}`);
  process.exit(1);
}
