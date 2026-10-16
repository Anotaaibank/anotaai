import type {AdminEntry} from './expenses.ts';
import type {FinanceDocument} from './finance.ts';

export function billRuleForExpense(expense:AdminEntry,documents:FinanceDocument[]){
 if(!expense.active||expense.status!=='PREVISTO')return undefined;
 return documents.find(rule=>rule.kind==='BILL_RULE'&&rule.active&&expense.details.notes==='Recorrência mensal: '+rule.id);
}
