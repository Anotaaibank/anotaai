import {adminMoneyInput} from './expenses.ts';
import type {FinanceCommand} from './finance.ts';

/** The manual form uses the same signed, server-validated operations as the assistant. */
export function manualExpenseCommand(input:{monthly:boolean;description:string;category:string;amount:string;date:string;status:'REALIZADO'|'PREVISTO';details:Record<string,unknown>}):FinanceCommand{
 const common={description:input.description.trim()||input.category,category:input.category,amount_cents:adminMoneyInput(input.amount),date:input.date,details:input.details};
 return input.monthly
  ?{...common,action:'expense_schedule',schedule_type:'MENSAL',amount_mode:'PARCELA',recurring:true,due_day:Number(input.date.slice(8))}
  :{...common,action:'expense_create',status:input.status};
}
