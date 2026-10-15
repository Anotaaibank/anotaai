import {localMode,rows,query,service,type Auth} from './server.ts';
import {localFinanceState,localFinanceDocuments,applyLocalFinance,applyLocalWhatsappFinance} from './finance-store.ts';
import {financeSnapshot,type FinanceDocument,type FinancePlan,type FinanceState} from './finance.ts';
import {localSecret} from './local-db.ts';
import {AppError,brazilDay} from './model.ts';
import type {AdminEntry} from './expenses.ts';
import {financeQuery,financeReport} from './finance-report.ts';
export function financeSecret(){const key=localMode()?localSecret():process.env.ANOTA_WHATSAPP_ENCRYPTION_KEY;if(!key)throw new AppError('Configure o segredo de confirmação no servidor.',503);return key;}
async function financeDocuments(user:string,token?:string){const documents:FinanceDocument[]=[];for(let offset=0;offset<100000;offset+=1000){const path='anota_finance_documents?user_id=eq.'+user+'&select=data&order=id&limit=1000&offset='+offset,page=token?await query<{data:FinanceDocument}[]>(token,path):await service<{data:FinanceDocument}[]>(path);documents.push(...page.map(r=>r.data));if(page.length<1000)return documents;}throw new AppError('Consulta acima do limite.');}
export async function financeState(auth:Auth):Promise<FinanceState>{if(localMode())return localFinanceState(auth.user.id);const [documents,expenses]=await Promise.all([financeDocuments(auth.user.id,auth.token),rows(auth)]);return {documents,expenses};}
export async function financeStateForBot(user:string):Promise<FinanceState>{if(localMode())return localFinanceState(user);const readExpenses=async()=>{const expenses:AdminEntry[]=[];for(let offset=0;offset<100000;offset+=1000){const page=await service<AdminEntry[]>('anota_expenses?user_id=eq.'+user+'&select=*&limit=1000&offset='+offset+'&order=id');expenses.push(...page);if(page.length<1000)return expenses;}throw new AppError('Consulta acima do limite.');};const [documents,expenses]=await Promise.all([financeDocuments(user),readExpenses()]);return {documents,expenses};}
export async function financeStateForQuery(user:string,raw:unknown):Promise<FinanceState>{
 if(localMode())return localFinanceState(user);
 const input=raw as Record<string,unknown>;if(!input||!['agenda','pagamentos','atrasos','receber'].includes(String(input.topic)))return financeStateForBot(user);
 const q=financeQuery(raw),encoded=encodeURIComponent;let from=q.from,to=q.to;
 if(q.topic==='pagamentos'&&q.period==='mes_atual'||q.topic==='receber'&&q.period==='mes_atual')from='2000-01-01';
 const owner='user_id=eq.'+encoded(user);
 if(q.topic==='agenda'||q.topic==='receber'){
  const documents:FinanceDocument[]=[];
  for(let offset=0;offset<100000;offset+=1000){const page=await service<{data:FinanceDocument}[]>('anota_finance_documents?'+owner+'&data->>kind=eq.'+(q.topic==='agenda'?'APPOINTMENT':'INCOME')+'&data->>active=eq.true'+(q.topic==='receber'?'&data->>status=eq.PREVISTO':'')+'&data->>date=gte.'+from+'&data->>date=lte.'+to+'&select=data&order=id&limit=1000&offset='+offset);documents.push(...page.map(r=>r.data));if(page.length<1000)return {documents,expenses:[]};}
 }else{
  if(q.topic==='atrasos'||q.payment_state==='ATRASO')to=to<brazilDay()?to:brazilDay();
  const expenses:AdminEntry[]=[];
  for(let offset=0;offset<100000;offset+=1000){const page=await service<AdminEntry[]>('anota_expenses?'+owner+'&active=eq.true&status=eq.PREVISTO&entry_date=gte.'+from+'&entry_date=lte.'+to+'&select=*&order=id&limit=1000&offset='+offset);expenses.push(...page);if(page.length<1000)return {documents:[],expenses};}
 }
 throw new AppError('Consulta acima do limite.');
}
export async function applyFinance(auth:Auth,plan:FinancePlan,origin:AdminEntry['origin']='MANUAL'){if(localMode())return applyLocalFinance(auth.user.id,plan,origin);return query(auth.token,'rpc/anota_apply_finance','POST',{p_plan:plan,p_origin:origin});}
export function verifiedFinanceReceipt(result:unknown,plan:FinancePlan){const receipt=result as {ok?:boolean;saved?:boolean;operation_id?:string}|null;if(receipt?.ok!==true||receipt.saved!==true||receipt.operation_id!==plan.id)throw new AppError('A gravação não foi confirmada pelo servidor. Confira o histórico antes de tentar novamente.',503);return receipt;}
export async function applyFinanceForBot(user:string,plan:FinancePlan,message:{id:string;lease:string|null;sender:string}){const result=localMode()?applyLocalWhatsappFinance(user,plan,message):await service('rpc/anota_apply_finance_whatsapp','POST',{p_user:user,p_plan:plan,p_message:message.id,p_lease:message.lease});return verifiedFinanceReceipt(result,plan);}
export async function appointmentsForBot(user:string){return (localMode()?localFinanceDocuments(user):await financeDocuments(user)).filter(d=>d.kind==='APPOINTMENT');}
export function assistantFinanceData(state:FinanceState,raw:unknown={}){const query=financeQuery(raw);if(query.topic!=='contexto')return financeReport(state,raw);const snapshot=financeSnapshot(state);return {...snapshot,summary:financeReport(state,{topic:'resumo'}),documents:snapshot.documents.slice(0,100),expenses:snapshot.expenses.slice(0,100),timeline:snapshot.timeline.slice(0,100),truncated:state.documents.length>100||state.expenses.length>100};}
