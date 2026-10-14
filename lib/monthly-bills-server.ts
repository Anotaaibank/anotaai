import {localMode,service} from './server.ts';
import {localFinanceState,applyLocalFinance} from './finance-store.ts';
import {monthlyOccurrenceId,stableId,type FinancePlan} from './finance.ts';
import {brazilDay,monthlyDates} from './model.ts';
import {adminInput} from './expenses.ts';
import {getBot} from './whatsapp-store.ts';
export async function expandMonthlyBillsForBot(user:string,now=Date.now()){
 const bot=await getBot(user);if(!bot?.enabled||bot.status!=='PRONTO')return 0;
 if(!localMode())return service<number>('rpc/anota_expand_monthly_bills','POST',{p_user:user});
 const today=brazilDay(new Date(now)),state=localFinanceState(user);let count=0;
 for(const rule of state.documents.filter(d=>d.kind==='BILL_RULE'&&d.active)){
  const dates=monthlyDates(today.slice(0,8)+'01',13).map(month=>month.slice(0,8)+String(Math.min(Number(rule.details.day),new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7)),0)).getUTCDate())).padStart(2,'0')).filter(d=>d>=rule.date);
  const plan:FinancePlan={id:stableId('monthly-expand:'+user+':'+rule.id+':'+today.slice(0,7)),expenses:[],documents:[],checks:[{id:rule.id,updated_at:rule.updated_at}],title:'Continuar conta recorrente',lines:[]};
  for(const due of dates){const id=monthlyOccurrenceId(rule.id,due.slice(0,7));if(state.expenses.some(e=>e.id===id))continue;const {expected_updated_at:_,...payload}=adminInput({id,kind:'MENSAL',scope:'PESSOAL',description:rule.description,entry_date:due,status:'PREVISTO',amount_cents:rule.amount_cents,category:rule.details.category,details:{payment_method:rule.details.payment_method,notes:'Recorrência mensal: '+rule.id}});void _;plan.expenses.push({payload,expected:null});}
  if(plan.expenses.length){applyLocalFinance(user,plan,'WHATSAPP');count+=plan.expenses.length;}
 }return count;
}
