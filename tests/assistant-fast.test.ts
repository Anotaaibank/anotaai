import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {quickExpenseDraft,quickAppointmentDraft,compactVoiceResult} from '../lib/assistant-fast.ts';
import {extractFinance,prepareFinanceDraft} from '../lib/finance-ai.ts';
import {assistantTurn} from '../lib/assistant-turn.ts';
import {readFinance} from '../lib/finance.ts';
import {VoiceResources,answerVoiceTools} from '../lib/assistant-client.ts';
import {financeReport} from '../lib/finance-report.ts';
const today='2026-10-09';
test('agenda completa preserva descrição, data falada e horário sem outra chamada ao modelo',async()=>{
 const state={documents:[],expenses:[]},transport:typeof fetch=async()=>{throw Error('Must not use the model');};
 for(const [text,description,date,time]of [
  ['Por favor agenda pra mim uma reunião no dia 10 do mês 11 às 14 horas.','reunião','2026-11-10','14:00'],
  ['Agende uma consulta dia 11 de novembro de 2026 às 9 horas.','consulta','2026-11-11','09:00'],
  ['Agenda uma reunião amanhã às 10:30.','reunião','2026-10-10','10:30'],
  ['Por favor agenda pra mim, eu tenho um evento no dia dez do mês onze às 14 horas.','evento','2026-11-10','14:00']
 ]){
  const draft=await extractFinance(text,state,'fake',today,transport),plan=prepareFinanceDraft(draft,text,state,randomUUID(),randomUUID(),today),appointment=plan.documents[0].document;
  assert.equal(appointment.kind,'APPOINTMENT');assert.equal(appointment.description,description);assert.equal(appointment.date,date);assert.equal(appointment.details.time,time);
 }
 assert.equal((quickAppointmentDraft('Agende uma reunião dia 10 do mês 11.',today)?.command as {time?:string})?.time,undefined);
 assert.deepEqual(state,{documents:[],expenses:[]});
 for(const text of ['Agende uma reunião às 14 horas.','Agende uma reunião amanhã às 24 horas.','Agende uma reunião amanhã às 14 horas e outra às 16 horas.','Cancele a reunião amanhã às 14 horas.','Agenda uma reunião toda semana às 14 horas.'])assert.equal(quickAppointmentDraft(text,today),null,text);
});
test('sorvete e gastos comuns têm categoria e proposta sem chamada ao segundo modelo',async()=>{
 let calls=0;const transport:typeof fetch=async()=>{calls++;throw Error('Must not use the model');},state={documents:[],expenses:[]},user=randomUUID();
 for(const [text,category]of [['Acabei de gastar 25 reais de sorvete.','Restaurante'],['Lança 25 reais de açaí.','Restaurante'],['Lança pra mim 25 reais de combustível, por favor?','Combustível'],['Gastei vinte e cinco reais de gasolina.','Combustível'],['Ontem gastei 25 reais no supermercado.','Supermercado']]){
  const d=await extractFinance(text,state,'fake',today,transport);assert.equal(d.intent,'COMMAND');const p=prepareFinanceDraft(d,text,state,user,randomUUID(),today);assert.equal(p.expenses[0].payload.category,category);assert.equal(p.expenses[0].payload.amount_cents,2500);assert.equal(p.expenses[0].payload.kind,'PESSOAL');assert.equal(p.expenses[0].payload.entry_date,text.startsWith('Ontem')?'2026-10-08':today);
 }
 assert.equal(calls,0);assert.deepEqual(state,{documents:[],expenses:[]});
});
test('aluguel pago avulso não cria recorrência; contexto delicado mantém interpretação completa',()=>{
 assert.equal((quickExpenseDraft('Paguei 25 reais de aluguel.',today)?.command as {action:string}).action,'expense_create');
 for(const text of ['Lança 25 reais de aluguel todo mês.','Vou pagar 25 reais de sorvete amanhã.','Gastei 25 reais e 30 reais.','Como lanço 25 reais de sorvete?','Gastei 25 reais fazendo Uber.','Gastei 25 reais de sorvete para minha família.','Paguei 25 reais de sorvete no Pix.','Corrige a despesa para 25 reais.','Gastei 25 reais da empresa.','Gastei 25 reais de sorvete mas não paguei.','Gastei 25 reais de sorvete em 08/10/2026.','Gastei 25 reais de sorvete na viagem.'])assert.equal(quickExpenseDraft(text,today),null,text);
 for(const text of ['Gastei 25 reais de sorvete domingo.','Gastei 25 reais de sorvete semana passada.','Gastei 25 reais de sorvete em setembro.','Lança 25 reais de sorvete por quinze meses.'])assert.equal(quickExpenseDraft(text,today),null,text);
});
test('gasto rápido continua com confirmação assinada, sem gravar e sem duplicar a proposta',async()=>{
 const user=randomUUID(),state={documents:[],expenses:[]},secret='synthetic',transport:typeof fetch=async()=>{throw Error('Must not use the model');};
 const a=await assistantTurn({user,state,key:'fake',secret,text:'Acabei de gastar 25 reais de sorvete.',today,transport});assert.ok(a.pending);assert.equal(a.saved,false);
 const plan=readFinance(a.pending.confirmation,user,secret);assert.equal(plan.expenses.length,1);assert.equal(plan.expenses[0].payload.amount_cents,2500);
 const b=await assistantTurn({user,state,key:'fake',secret,text:'Acabei de gastar 25 reais de sorvete.',today,transport,conversation:a.conversation_id});assert.equal(b.pending?.confirmation,a.pending.confirmation);assert.deepEqual(state,{documents:[],expenses:[]});assert.throws(()=>readFinance(a.pending!.confirmation,randomUUID(),secret));
});
test('resposta compacta mantém os números calculados, sem descartar contexto ou erros',()=>{
 const report=financeReport({documents:[],expenses:[]},{topic:'saldo'},today),compact=compactVoiceResult(report) as {answer:string};assert.equal(compact.answer,report.answer);assert.ok(JSON.stringify(compact).length<JSON.stringify(report).length/2);
 const context={ok:true,documents:[{id:'owner-record'}]},error={ok:false,error:'Entre na sua conta.'};assert.equal(compactVoiceResult(context),context);assert.equal(compactVoiceResult(error),error);
});
test('uma resposta pronta usa fala direta sem novas ferramentas nem repetição',async()=>{
 const r=new VoiceResources(),events:Record<string,any>[]=[];r.channel={readyState:'open',send:(s:string)=>events.push(JSON.parse(s)),close:()=>{}} as unknown as RTCDataChannel;
 await answerVoiceTools(r,[{type:'function_call',name:'consultar_financas',call_id:'balance_now',arguments:'{"topic":"saldo"}'}],async()=>({ok:true,saved:false,answer:'Seu saldo atual registrado é R$ 6.000,00.'}));
 const response=events.find(e=>e.type==='response.create');assert.deepEqual(response?.response.tools,[]);assert.equal(response?.response.tool_choice,'none');assert.match(response?.response.instructions,/SOMENTE answer/);r.close();
});
