import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {financeDate} from '../lib/finance-date.ts';
import {appointmentFacts,continuedAppointment} from '../lib/appointment-language.ts';
import {extractFinance,prepareFinanceDraft,type FinanceDraft} from '../lib/finance-ai.ts';
import {assistantTurn} from '../lib/assistant-turn.ts';
import {readFinance} from '../lib/finance.ts';
import {transcribeExpense} from '../lib/whatsapp-ai.ts';
const today='2026-10-15',state={documents:[],expenses:[]};
const original='Agenda para mim um compromisso no próximo dia 7 do 11, 7 do mês que vem, um compromisso na igreja, às 19 horas, assistir o filme The Chosen, por favor.';
const repetition='Não, eu quero que você agende um compromisso pra mim, dia 7 do 11, eu tenho um compromisso na igreja, assistir o filme The Chosen.';
const noModel:typeof fetch=async()=>{throw Error('Não deve chamar o intérprete remoto');};
test('fala real com data repetida, hora no meio e nome do filme vira proposta sem nova chamada ao modelo',async()=>{
 for(const text of [original,'Agenda pra mim dia 7 do mês que vem, ou seja, 7 do 11, às 19 horas eu vou assistir um filme do The Chosen na igreja.','Agende assistir The Chosen na igreja dia sete de novembro às dezenove horas.','Agenda dia sete do onze às sete da noite assistir The Chosen na igreja.']){
  const draft=await extractFinance(text,state,'fixture',today,noModel),plan=prepareFinanceDraft(draft,text,state,randomUUID(),randomUUID(),today),event=plan.documents[0].document;
  assert.equal(event.kind,'APPOINTMENT');assert.equal(event.date,'2026-11-07');assert.equal(event.details.time,'19:00');assert.match(event.description,/The Chosen/);assert.match(event.description,/igreja/);assert.doesNotMatch(event.description,/,\s*,/);
 }
 assert.equal(state.documents.length,0);
});
test('calendário aceita dia sete do onze, ano novo e reafirmação consistente, mas rejeita datas conflitantes',()=>{
 for(const text of ['dia 7 do 11','7 do 11','dia sete do onze','no próximo dia 7 do 11, 7 do mês que vem'])assert.equal(financeDate(text,today,true),'2026-11-07');
 assert.equal(financeDate('dia 7 do 1','2026-12-20',true),'2027-01-07');
 assert.throws(()=>financeDate('dia 7 do 11, dia 8 do mês que vem',today,true));assert.throws(()=>financeDate('31 do 11',today,true));
 for(const text of ['Agenda consulta dia 7 do 11 às 18h e às 19h.','Agenda consulta dia 31 do 11 às 19h.','Agenda consulta dia 7 do 11, dia 8 do 11 às 19h.'])assert.equal(appointmentFacts(text,today),null,text);
});
test('intérprete não perde horário literal mesmo se o modelo omitir ou copiar outro horário',()=>{
 for(const time of [undefined,'08:00']){
  const draft:FinanceDraft={intent:'COMMAND',command:{action:'appointment_upsert',description:'Assistir The Chosen na igreja',date:'2026-12-07',...(time?{time}:{})},confidence:'ALTA',question:'',target_excerpt:'',money_evidence:[],date_evidence:[{field:'date',excerpt:'no próximo dia 7 do 11, 7 do mês que vem'}],query:''};
  const event=prepareFinanceDraft(draft,original,state,randomUUID(),randomUUID(),today).documents[0].document;assert.equal(event.date,'2026-11-07');assert.equal(event.details.time,'19:00');
 }
});
test('complemento do mesmo compromisso preserva a hora dita, sem transferir dados para outro evento',()=>{
 const repeated=continuedAppointment(original,repetition,today)!;assert.ok(repeated);const plan=prepareFinanceDraft(repeated.draft,repeated.source,state,randomUUID(),randomUUID(),today);assert.equal(plan.documents[0].document.details.time,'19:00');assert.match(plan.documents[0].document.description,/The Chosen/);
 assert.equal(continuedAppointment(original,'Agenda uma consulta dia 7 do 11.',today),null);
 assert.equal(continuedAppointment(original,repetition.replace('7 do 11','8 do 11'),today),null);
 assert.equal(continuedAppointment(original,'Agenda assistir The Chosen na igreja.',today),null);
 assert.equal(continuedAppointment('Agende consulta dia 7 do 11.','Qual meu saldo?',today),null);
 const completed=continuedAppointment('Agende consulta dia 7 do 11.','Às 19 horas.',today)!;assert.ok(completed);assert.equal(prepareFinanceDraft(completed.draft,completed.source,state,randomUUID(),randomUUID(),today).documents[0].document.details.time,'19:00');
});
test('conversa no aplicativo completa um horário sem outra interpretação e mantém confirmação assinada',async()=>{
 let calls=0;const transport:typeof fetch=async()=>{calls++;return Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({intent:'CLARIFY',command:null,question:'Qual o horário?',confidence:'BAIXA',target_excerpt:'',money_evidence:[],date_evidence:[],query:''})}]}]});};
 const user=randomUUID(),secret='fixture-secret',first=await assistantTurn({user,state,key:'fixture',secret,text:'Agende uma consulta dia 7 do 11.',today,transport});assert.match(first.answer||'',/horário/);
 const second=await assistantTurn({user,state,key:'fixture',secret,text:'Às 19 horas.',today,transport,conversation:first.conversation_id});assert.equal(calls,1);assert.ok(second.pending);assert.equal(readFinance(second.pending.confirmation,user,secret).documents[0].document.details.time,'19:00');assert.equal(state.documents.length,0);
});
test('transcrição mantém português, áudio original e contexto sem resumir nem completar dados',async()=>{
 let calls=0;const result=await transcribeExpense(new Uint8Array(64),'audio/ogg','fixture',async(_url,init)=>{calls++;const form=init?.body as FormData;assert.equal(form.get('language'),'pt');assert.equal(form.get('model'),'gpt-4o-mini-transcribe');assert.match(String(form.get('prompt')),/horários/);assert.match(String(form.get('prompt')),/Não resuma/);assert.match(String(form.get('prompt')),/não complete dados ausentes/);assert.ok(form.get('file') instanceof Blob);return Response.json({text:original});});assert.equal(result,original);assert.equal(calls,1);
});
