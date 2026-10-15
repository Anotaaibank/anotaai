import {prepareFinanceDraft,type FinanceDraft} from './finance-ai.ts';
import {stableId,type FinanceState,type FinancePlan} from './finance.ts';
import {fold,monetaryLiterals} from './finance-date.ts';
import {financialAmountFragments} from './conversation-language.ts';
import {AppError,brazilDay} from './model.ts';
// Incomplete items never enter the database plan. Their literal source travels
// separately inside the signed conversation envelope, after a user confirms.
export function prepareFinanceProposal(draft:FinanceDraft,source:string,state:FinanceState,user:string,id:string,today=brazilDay(),carry:string[]=[]){
 if(!draft.items?.some(item=>!item.command))return {plan:prepareFinanceDraft(draft,source,state,user,id,today),incomplete:carry};
 if(draft.intent!=='COMMAND'||draft.confidence!=='ALTA'||draft.command||draft.items.length>5)throw new AppError(draft.question||'Complete os dados dos itens antes de confirmar.');
 let remaining=fold(source);const incomplete:string[]=[],ready:FinanceDraft['items']=[];
 for(const item of draft.items){const literal=fold(item.source);if(literal.length<2||!remaining.includes(literal))throw new AppError('Não consegui separar a lista. Envie uma conta por linha.');remaining=remaining.replace(literal,' ');if(item.command)ready.push(item);else incomplete.push(item.source);}
 if(monetaryLiterals(remaining).length||financialAmountFragments(remaining).length)throw new AppError('Há um valor fora dos itens identificados. Envie uma conta por linha.');
 if(!ready.length)throw new AppError(draft.question||'Informe os dados que faltam: '+incomplete.join('; '));
 const plan:FinancePlan={id,documents:[],expenses:[],checks:[],title:'Conferir '+ready.length+' registro(s) completo(s)',lines:[]};
 for(const [index,item]of ready.entries()){if(!item.command||item.command.target_id||!['expense_create','expense_schedule','appointment_upsert','income_upsert','extra_activity'].includes(item.command.action))throw new AppError('Envie alterações separadas dos novos registros.');const child=prepareFinanceDraft({...draft,...item,items:null},item.source,state,user,stableId(id+':ready:'+index),today);plan.documents.push(...child.documents);plan.expenses.push(...child.expenses);plan.checks.push(...child.checks);plan.lines.push((index+1)+'. '+child.lines.filter(Boolean).join(' · '));}
 if(plan.expenses.length>60||plan.documents.length>5)throw new AppError('Divida a lista em mensagens menores.');
 for(const item of incomplete)plan.lines.push('Não incluído neste resumo: '+item);
 plan.lines.push(draft.question||'Depois de confirmar os itens completos, envie os dados que faltam para continuar.');const pending=[...new Set([...carry,...incomplete])];if(pending.length>5)throw new AppError('Complete os itens pendentes antes de iniciar outra lista.');
 return {plan,incomplete:pending};
}
