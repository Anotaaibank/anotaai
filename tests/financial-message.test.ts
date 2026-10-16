import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {extractFinance,prepareFinanceDraft} from '../lib/finance-ai.ts';
import {naturalFinanceTurn,normalizeAssistantText} from '../lib/conversation-language.ts';
import {financeDate} from '../lib/finance-date.ts';
import {readFinance,type FinanceCommand,type FinanceState} from '../lib/finance.ts';
import {assistantTurn} from '../lib/assistant-turn.ts';
import {transcribeExpense} from '../lib/whatsapp-ai.ts';
import {fastWhatsappQuery} from '../lib/whatsapp-reports.ts';
import {financeSnapshot} from '../lib/finance.ts';

const today='2026-10-16',state:FinanceState={documents:[],expenses:[]};
const noModel:typeof fetch=async()=>{throw Error('Pedido completo não deve chamar outro modelo');};
const cases:[string,string,number,string,string][]=[
 ['Dia 25 agora vou pagar 800 reais da última parcela da minha moto.','expense_create',80000,'2026-10-25','PREVISTO'],
 ['800 da parcela da moto, dia 25.','expense_create',80000,'2026-10-25','PREVISTO'],
 ['Paguei 800 da moto hoje.','expense_create',80000,today,'REALIZADO'],
 ['Amanhã recebo 1500 de um cliente.','income_upsert',150000,'2026-10-17','PREVISTO'],
 ['Vendi minha bicicleta por 700.','income_upsert',70000,today,'REALIZADO'],
 ['Tive 300 reais de lucro na venda.','income_upsert',30000,today,'REALIZADO'],
 ['Vou pagar 800, corrigindo, 850, dia 25.','expense_create',85000,'2026-10-25','PREVISTO'],
 ['parcela da moto, oitocentos, dia vinte e cinco','expense_create',80000,'2026-10-25','PREVISTO'],
 ['Dia vinte e cinco agora vou pagar mil e duzentos da moto','expense_create',120000,'2026-10-25','PREVISTO'],
 ['Paguei o João 80 reais hoje','expense_create',8000,today,'REALIZADO'],
 ['O João me pagou 80 reais hoje','income_upsert',8000,today,'REALIZADO'],
 ['Vou pagar o João 80 reais amanhã','expense_create',8000,'2026-10-17','PREVISTO'],
 ['O João vai me pagar 80 reais amanhã','income_upsert',8000,'2026-10-17','PREVISTO'],
];
test('frases naturais completas extraem papel, valor, tempo e data sem esclarecimento nem modelo redundante',async()=>{
 const failures:string[]=[];
 for(const [source,action,amount,date,status] of cases){try{
  const d=await extractFinance(source,state,'synthetic',today,noModel);
  assert.equal(d.intent,'COMMAND');assert.equal(d.question,'');
  const c=d.command as FinanceCommand;assert.equal(c.action,action);assert.equal(c.amount_cents,amount);assert.equal(c.status,status);
  const p=prepareFinanceDraft(d,source,state,randomUUID(),randomUUID(),today);
  const row=p.expenses.length?p.expenses[0].payload:p.documents[0]?.document;
  assert.ok(row);assert.equal(p.expenses.length?p.expenses[0].payload.entry_date:p.documents[0].document.date,date);assert.equal(row.status,status);assert.equal(row.amount_cents,amount);
  assert.equal(p.expenses.length+p.documents.length,1);assert.equal(c.count,undefined);assert.equal(c.recurring,undefined);
  if(source.includes('última')){assert.match(row.description,/última parcela/i);assert.equal(p.expenses[0].payload.category,'Veículo pessoal');}
 }catch(e){failures.push(source+' → '+(e as Error).message);}}
 assert.deepEqual(failures,[]);assert.deepEqual(state,{documents:[],expenses:[]});
});
test('compromisso declarativo com e sem horário não vira conta a pagar',async()=>{
 for(const source of ['Sexta tenho reunião às 14h.','Amanhã tenho consulta.']){
  const d=await extractFinance(source,state,'synthetic',today,noModel);assert.equal(d.intent,'COMMAND');
  const p=prepareFinanceDraft(d,source,state,randomUUID(),randomUUID(),today);assert.equal(p.documents[0].document.kind,'APPOINTMENT');assert.equal(p.expenses.length,0);
  assert.equal(p.documents[0].document.details.time,source.includes('14h')?'14:00':'');
 }
});
test('falta somente valor: pergunta única e complemento reaproveita o mesmo pedido',async()=>{
 const first=await assistantTurn({user:randomUUID(),text:'Paguei a parcela da moto.',state,key:'synthetic',secret:'synthetic',today,transport:noModel});
 assert.equal(first.answer,'Qual foi o valor?');assert.equal(first.pending,undefined);
 const d=naturalFinanceTurn('Paguei a parcela da moto. 800',state,today);assert.equal(d?.intent,'COMMAND');
});
test('dia sem mês respeita direção temporal, viradas e meses sem dia 31',()=>{
 for(const [source,base,future,date] of [
  ['dia 25 agora','2026-10-16',true,'2026-10-25'],['dia 5','2026-12-31',true,'2027-01-05'],
  ['dia 5','2026-01-02','past','2025-12-05'],['dia 31','2026-02-01',true,'2026-03-31'],
  ['dia 31','2026-02-20','past','2026-01-31'],['dia 16','2026-10-16','past',today],
  ['25/09/2026','2026-10-16',true,'2026-09-25']
 ] as const)assert.equal(financeDate(source,base,future),date);
 const d=naturalFinanceTurn('Paguei 800 da moto dia 25',state,today)!;
 assert.equal(prepareFinanceDraft(d,'Paguei 800 da moto dia 25',state,randomUUID(),randomUUID(),today).expenses[0].payload.entry_date,'2026-09-25');
});
test('transferência, negação, dúvida real e hipótese não criam pagamento',()=>{
 for(const source of ['Transferi 500 da minha conta para minha outra conta.','Não paguei os 800 da moto ainda.','Se eu comprar uma moto por 800...'])assert.notEqual(naturalFinanceTurn(source,state,today)?.intent,'COMMAND');
 const d=naturalFinanceTurn('Vou pagar 800 ou 850 da moto dia 25',state,today);assert.equal(d?.intent,'CLARIFY');assert.match(d!.question,/valor/);
 assert.equal(normalizeAssistantText('Foi 800 reais, não, 850 reais'),'Foi 850 reais');
 assert.ok(fastWhatsappQuery('Quanto paguei da moto este mês?',today));
});
test('transcrição vazia ou falha informa problema de áudio sem interpretar valores',async()=>{
 for(const transport of [async()=>Response.json({text:''}),async()=>Response.json({text:'   '}),async()=>new Response('',{status:503}),async()=>{throw Error('transport-private-error');}] as (typeof fetch)[]){
  await assert.rejects(()=>transcribeExpense(new Uint8Array(64),'audio/ogg','synthetic',transport),/áudio|transcrever/);
 }
});
test('compra e venda separa fluxos, calcula líquido e nunca cria uma segunda receita de lucro',async()=>{
 const text='Comprei por 500 e vendi por 800',draft=await extractFinance(text,state,'synthetic',today,noModel);
 const plan=prepareFinanceDraft(draft,text,state,randomUUID(),randomUUID(),today);
 assert.equal(plan.expenses.length,1);assert.equal(plan.documents.length,1);
 assert.equal(plan.expenses[0].payload.amount_cents,50000);assert.equal(plan.documents[0].document.amount_cents,80000);
 const simulated:FinanceState={expenses:plan.expenses.map(e=>({...e.payload,user_id:randomUUID(),active:true,origin:'WHATSAPP',created_at:today,updated_at:today})),documents:plan.documents.map(d=>({...d.document,updated_at:today}))};
 assert.equal(financeSnapshot(simulated,today).balance_cents,30000);
});
test('duas compras legítimas idênticas usam operações distintas; tentativa técnica conserva o ID',async()=>{
 const user=randomUUID(),secret='synthetic',requestId=randomUUID(),text='Paguei 800 da moto hoje',first=await assistantTurn({user,secret,requestId,text,state,key:'synthetic',today,transport:noModel});
 const p=readFinance(first.pending!.confirmation,user,secret),saved:FinanceState={documents:[],expenses:p.expenses.map(e=>({...e.payload,user_id:user,active:true,origin:'WHATSAPP',created_at:today,updated_at:today}))};
 const replay=await assistantTurn({user,secret,requestId,text,state:saved,key:'synthetic',today,conversation:first.conversation_id,transport:noModel});assert.match(replay.answer!,/já está registrado/);
 const next=await assistantTurn({user,secret,requestId:randomUUID(),text,state:saved,key:'synthetic',today,conversation:first.conversation_id,transport:noModel});assert.ok(next.pending);assert.notEqual(readFinance(next.pending!.confirmation,user,secret).expenses[0].payload.id,p.expenses[0].payload.id);
});
test('data repetida concordante não vira dinheiro nem questiona; última parcela do modelo nunca vira série',()=>{
 const text='Vou pagar 800 da última parcela da moto dia 25, ou seja, 25/10/2026';
 const draft=naturalFinanceTurn(text,state,today)!;assert.equal(draft.intent,'COMMAND');
 const c=draft.command as FinanceCommand;
 const plan=prepareFinanceDraft({...draft,command:{...c,action:'expense_schedule',recurring:true,schedule_type:'MENSAL'}},text,state,randomUUID(),randomUUID(),today);
 assert.equal(plan.expenses.length,1);assert.equal(plan.documents.length,0);assert.equal(plan.expenses[0].payload.entry_date,'2026-10-25');
});
test('uma interpretação estruturada basta para renda futura; rótulo opcional inferido não causa pergunta',async()=>{
 const text='Amanhã vai cair na minha conta 1500 reais, pagamento de um serviço que prestei.';let calls=0;
 const transport:typeof fetch=async(_url,init)=>{calls++;const body=JSON.parse(String(init?.body));assert.equal(body.text.format.strict,true);assert.ok(body.instructions.includes(today));return Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({intent:'COMMAND',confidence:'ALTA',question:'',query:'',target_excerpt:'',command:{action:'income_upsert',description:'Pagamento de serviço',amount_cents:150000,date:'2026-10-17',status:'PREVISTO',activity:'Serviço prestado'},money_evidence:[{field:'amount_cents',excerpt:'1500 reais'}],date_evidence:[{field:'date',excerpt:'Amanhã'}]})}]}]});};
 const d=await extractFinance(text,state,'synthetic',today,transport),p=prepareFinanceDraft(d,text,state,randomUUID(),randomUUID(),today);assert.equal(calls,1);assert.equal(p.documents[0].document.status,'PREVISTO');assert.equal(p.documents[0].document.amount_cents,150000);assert.equal(p.documents[0].document.details.activity,undefined);
});
