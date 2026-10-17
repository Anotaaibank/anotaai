import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {assistantTurn} from '../lib/assistant-turn.ts';
import {extractFinance,prepareFinanceDraft,localFinanceInterpretation,type FinanceDraft} from '../lib/finance-ai.ts';
import {naturalFinanceTurn} from '../lib/conversation-language.ts';
import {readFinance,type FinanceCommand} from '../lib/finance.ts';
import {fastWhatsappQuery} from '../lib/whatsapp-reports.ts';

const today='2026-10-17',state={documents:[],expenses:[]},user=randomUUID(),base={intent:'COMMAND',question:'',query:'',confidence:'ALTA',target_excerpt:'',date_evidence:[]} as const;
const response=(draft:unknown)=>Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(draft)}]}]});
test('atualiza/ajusta por extenso não é consumido como consulta rápida do WhatsApp',()=>{
 for(const text of ['Atualiza meu saldo de mil e cem para mil e quinhentos.','Ajusta o meu saldo pra novecentos reais.','Atualiza meu saldo de 1.100 para 1.500'])assert.equal(fastWhatsappQuery(text,today),null);
 assert.ok(fastWhatsappQuery('Qual é meu saldo atual?',today));
});
test('regra incompleta não encerra pedido completo: noventa sem reais chega ao modelo e mantém recorrência',async()=>{
 const text='Pago o carro todo dia quinze, noventa';assert.equal(naturalFinanceTurn(text,state,today)?.intent,'CLARIFY');let calls=0;
 const transport:typeof fetch=async()=>{calls++;return response({...base,command:{action:'expense_schedule',description:'Carro',amount_cents:9000,schedule_type:'MENSAL',amount_mode:'PARCELA',recurring:true,due_day:15},money_evidence:[{field:'amount_cents',excerpt:'noventa'}],date_evidence:[{field:'date',excerpt:'todo dia quinze'}]});};
 const d=await extractFinance(text,state,'synthetic',today,transport),plan=prepareFinanceDraft(d,text,state,user,randomUUID(),today);
 assert.equal(calls,1);assert.equal(plan.expenses.length,12);assert.equal(plan.expenses[0].payload.amount_cents,9000);assert.equal(plan.expenses[0].payload.entry_date,'2026-11-15');
});
test('modelo simulado não pode inventar valor ou data nem transformar previsão em pagamento',async()=>{
 const text='A compra da bicicleta vai sair por 600 reais amanhã, deixa anotado.';
 const draft={...base,command:{action:'expense_create',description:'Bicicleta',amount_cents:60000,status:'REALIZADO',date:'2030-01-01'},money_evidence:[{field:'amount_cents',excerpt:'600 reais'}],date_evidence:[{field:'date',excerpt:'amanhã'}]} as FinanceDraft;
 const plan=prepareFinanceDraft(draft,text,state,user,randomUUID(),today);
 assert.equal(plan.expenses[0].payload.entry_date,'2026-10-18');
 // Explicit future evidence must never debit current cash, even if a model says realized.
 assert.equal(plan.expenses[0].payload.status,'PREVISTO');
 assert.throws(()=>prepareFinanceDraft({...draft,command:{...draft.command as FinanceCommand,amount_cents:65000}},text,state,user,randomUUID(),today),/valor/);
});
test('intérprete realista com modelo simulado passa por validação e assinatura sem executar nem duplicar pedido',async()=>{
 const text='O lanche na hamburgueria custou R$ 31,90, pode anotar?',id=randomUUID(),secret='synthetic-audit-secret';let calls=0;
 const transport:typeof fetch=async()=>{calls++;return response({...base,command:{action:'expense_create',description:'Lanche na hamburgueria',amount_cents:3190,status:'REALIZADO',category:'Restaurante'},money_evidence:[{field:'amount_cents',excerpt:'R$ 31,90'}]});};
 const first=await assistantTurn({text,state,user,key:'synthetic',secret,today,requestId:id,transport});assert.ok(first.pending,first.answer);const plan=readFinance(first.pending.confirmation,user,secret);assert.equal(plan.expenses[0].payload.amount_cents,3190);assert.equal(plan.expenses[0].payload.entry_date,today);assert.equal(state.expenses.length,0);
 const again=await assistantTurn({text,state,user,key:'synthetic',secret,today,requestId:id,conversation:first.conversation_id,transport});assert.equal(again.pending?.confirmation,first.pending.confirmation);assert.equal(calls,1);
});
test('horários por extenso após vírgula e dados declarativos completos não perdem a hora',async()=>{
 for(const text of ['Anota minha consulta no dentista amanhã, quinze horas.','Amanhã tenho dentista às 15h']){
  const transport:typeof fetch=async()=>response({...base,command:{action:'appointment_upsert',description:'Dentista',date:'2026-10-18',time:'15:00'},money_evidence:[],date_evidence:[{field:'date',excerpt:'amanhã'}]});
  const d=await extractFinance(text,state,'synthetic',today,transport),p=prepareFinanceDraft(d,text,state,user,randomUUID(),today);assert.equal(p.documents[0].document.details.time,'15:00');
 }
});

test('regra de calendário não pode descartar valor de prestação ou boleto agendado',async()=>{
 for(const text of ['Agende a prestação final do financiamento da moto, R$ 940, para o dia 29. Ainda não paguei.','Marca o pagamento do boleto de 320 reais para amanhã.']){
  const local=localFinanceInterpretation(text,state,today);
  assert.notEqual((local?.command as {action?:string})?.action,'appointment_upsert');
 }
});

test('indisponibilidade da IA interrompe antes da rede sem bloquear comandos locais válidos',async()=>{
 let calls=0;const transport:typeof fetch=async()=>{calls++;throw Error('unexpected network');};
 await assert.rejects(()=>extractFinance('Preciso organizar uma coisa diferente aqui',state,'',today,transport),/indisponível/);
 assert.equal(calls,0);
 const d=await extractFinance('Gastei 25 no mercado',state,'',today,transport);assert.equal(d.intent,'COMMAND');assert.equal(calls,0);
});
