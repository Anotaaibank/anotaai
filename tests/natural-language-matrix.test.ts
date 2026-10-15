import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {languageCases} from './fixtures/anotei-language-cases.ts';
import {naturalFinanceTurn,normalizeAssistantText,sourceWithVerifiedTarget} from '../lib/conversation-language.ts';
import {fastWhatsappQuery,whatsappQueryAnswer} from '../lib/whatsapp-reports.ts';
import {quickFinanceDraft,prepareFinanceDraft,type FinanceDraft} from '../lib/finance-ai.ts';
import {buildFinancePlan,type FinanceCommand,type FinancePlan,type FinanceState,financeSnapshot} from '../lib/finance.ts';
import {calendarEntries} from '../lib/agenda-calendar.ts';
import {whatsappHelp} from '../lib/whatsapp-help.ts';
import {assistantTimer} from '../lib/assistant-timing.ts';
const today='2026-10-15',user=randomUUID();
function baseline(){
 const state:FinanceState={documents:[],expenses:[]};
 const add=(command:FinanceCommand)=>{const plan=buildFinancePlan(command,state,user,randomUUID(),today);state.documents.push(...plan.documents.map(d=>({...d.document,updated_at:today+'T12:00:00Z'})));state.expenses.push(...plan.expenses.map(e=>({...e.payload,user_id:user,active:true,origin:'MANUAL' as const,created_at:today,updated_at:today})));return plan;};
 add({action:'profile_upsert',profile:{salary_cents:600000,salary_day:5,opening_balance_cents:650000,opening_date:'2026-10-01'}});
 const pending=add({action:'expense_create',description:'Aluguel',amount_cents:120000,status:'PREVISTO',date:'2026-10-10'});
 add({action:'expense_create',description:'Energia',amount_cents:18000,status:'PREVISTO',date:today});
 add({action:'expense_schedule',description:'Carro',amount_cents:150000,count:3,schedule_type:'PARCELAS',amount_mode:'PARCELA',date:'2026-11-05'});
 const paid=add({action:'expense_create',description:'Restaurante',category:'Restaurante',amount_cents:12000,date:'2026-10-01'});
 add({action:'expense_create',description:'Restaurante anterior',category:'Restaurante',amount_cents:10000,date:'2026-09-01'});
 add({action:'income_upsert',description:'Freelance',amount_cents:50000,status:'PREVISTO',date:'2026-10-21'});
 add({action:'income_upsert',description:'Uber',activity:'Uber',amount_cents:8000,status:'REALIZADO',date:today});
 const appointment=add({action:'appointment_upsert',description:'Dentista',date:'2026-10-16',time:'15:00'});
 add({action:'appointment_upsert',description:'Reunião com Ana',date:'2026-10-16',time:'10:00'});
 return {state,paid,pending,appointment};
}
test('matriz semântica com pelo menos 120 mensagens: intenção, entidades, contexto, operação e efeito',()=>{
 assert.ok(languageCases.length>=120);const errors:string[]=[];
 for(const row of languageCases){try{
  const {state,paid,pending,appointment}=baseline(),snapshot=JSON.stringify(state),text=normalizeAssistantText(row.message),context={query:row.context==='last_query'?JSON.stringify({period:'mes_atual',category:'Restaurante'}):undefined,focus:row.context==='saved_appointment'?appointment:row.context==='saved_expense'?paid:row.context==='saved_pending_expense'?pending:undefined};
  let draft=naturalFinanceTurn(text,state,today,context);if(!draft){const query=fastWhatsappQuery(text,today);draft=query?{intent:'QUERY',query} as FinanceDraft:quickFinanceDraft(text,today);}
  assert.ok(draft,'Deve reconhecer sem adivinhar ou chamar o modelo');assert.equal(draft.intent,row.expected.intent);
  if(draft.intent==='COMMAND'){
   const command=draft.command as FinanceCommand|null;assert.equal(draft.items?.length?'batch':command?.action,row.expected.operation);
   for(const [key,value] of Object.entries(row.expected.entities))assert.deepEqual(command?.[key as keyof FinanceCommand],value,key);
   const plan=prepareFinanceDraft(draft,sourceWithVerifiedTarget(text,draft),state,user,randomUUID(),today);assert.ok(plan.documents.length||plan.expenses.length);assert.ok(plan.lines.length);assert.equal(JSON.stringify(state),snapshot,'Preparar não grava');
  }else if(draft.intent==='QUERY'){
   const query=JSON.parse(draft.query);assert.equal(query.report||query.topic||'expenses',row.expected.operation);
   for(const [key,value]of Object.entries(row.expected.entities))assert.deepEqual(query[key],value,key);
   if(query.report!=='feedback'){const reply=whatsappQueryAnswer(state,draft.query,today,text);assert.ok(reply.trim().length);assert.doesNotMatch(reply,/undefined|NaN/);}
  }else{assert.ok(draft.question);assert.equal(row.expected.clarification,draft.intent==='CLARIFY');}
  assert.equal(JSON.stringify(state),snapshot,'Nenhuma consulta ou proposta altera a conta');
 }catch(error){errors.push(row.message+' → '+(error as Error).message);}}
 assert.deepEqual(errors,[]);console.info('Mensagens verificadas na matriz:',languageCases.length);
});
test('calendário junta somente registros salvos: vermelho a pagar, azul a receber, verde compromisso',()=>{
 const {state}=baseline(),before=JSON.stringify(state),entries=calendarEntries(state.documents,state.expenses,state.documents);
 assert.equal(entries.filter(e=>e.kind==='payable').length,5);assert.equal(entries.filter(e=>e.kind==='receivable').length,1);assert.equal(entries.filter(e=>e.kind==='appointment').length,2);
 assert.ok(entries.some(e=>e.kind==='payable'&&e.date==='2026-10-10'));assert.ok(!entries.some(e=>e.description==='Restaurante'));assert.equal(entries.find(e=>e.kind==='receivable')?.date,'2026-10-21');
 const proposed=buildFinancePlan({action:'appointment_upsert',description:'Não confirmado',date:'2026-11-07',time:'19:00'},state,user,randomUUID(),today);assert.ok(!entries.some(e=>e.id===proposed.documents[0].document.id));assert.equal(JSON.stringify(state),before);
 const snapshot=financeSnapshot(state,today);assert.equal(snapshot.balance_cents,646000,'Previsões não entram no caixa');
});
test('comando contendo como pagamento não é ajuda e medição não registra texto nem dados pessoais',async()=>{
 assert.equal(whatsappHelp('Agenda pra mim, eu tenho compromissos de pagar o carro, 1500 reais todo dia 5. Coloca isso como pagamento.'),null);
 const events:unknown[]=[],timer=assistantTimer('request-sintetico',e=>events.push(e));assert.equal(await timer.stage('write',async()=>42),42);await assert.rejects(()=>timer.stage('query',async()=>{throw Error('falha');}));
 assert.equal(events.length,2);assert.deepEqual(Object.keys(events[0] as object).sort(),['event','milliseconds','ok','request','stage']);assert.equal((events[1] as {ok:boolean}).ok,false);
});
test('backend rejeita um lançamento proposto pelo modelo para uma pergunta, negação ou hipótese',()=>{
 const state={documents:[],expenses:[]},draft:FinanceDraft={intent:'COMMAND',command:{action:'expense_create',description:'Aluguel',amount_cents:50000},confidence:'ALTA',query:'',question:'',target_excerpt:'',money_evidence:[{field:'amount_cents',excerpt:'500'}],date_evidence:[]};
 for(const text of ['Tenho uma conta de 500?','Já paguei 500 de aluguel?','Quanto gastei de aluguel, 500?','Não paguei 500 de aluguel.','Se eu gastar 500, quanto sobra?'])assert.throws(()=>prepareFinanceDraft(draft,text,state,user,randomUUID(),today));
});
