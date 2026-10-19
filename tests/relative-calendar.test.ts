import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {financeDate} from '../lib/finance-date.ts';
import {appointmentFacts} from '../lib/appointment-language.ts';
import {extractFinance,prepareFinanceDraft,type FinanceDraft} from '../lib/finance-ai.ts';
import {assistantTurn} from '../lib/assistant-turn.ts';
import {readFinance} from '../lib/finance.ts';
import {brazilDay} from '../lib/model.ts';

const today='2026-10-19',state={documents:[],expenses:[]};
const noModel:typeof fetch=async()=>{throw Error('Calendário literal completo não precisa de chamada remota');};
const dates=[
 ['ontem','2026-10-18'],['hoje','2026-10-19'],['amanhã','2026-10-20'],['anteontem','2026-10-17'],['antes de ontem','2026-10-17'],['depois de amanhã','2026-10-21'],
 ['na próxima segunda','2026-10-26'],['próxima sexta-feira','2026-10-23'],['no próximo sábado','2026-10-24'],['segunda','2026-10-19'],['segunda-feira passada','2026-10-12'],['sexta passada','2026-10-16'],['última sexta-feira','2026-10-16'],['sexta que vem','2026-10-23'],
 ['terça da semana que vem','2026-10-27'],['sexta na próxima semana','2026-10-30'],['domingo da semana passada','2026-10-18'],['quarta desta semana','2026-10-21'],['semana que vem na segunda','2026-10-26'],
 ['daqui a duas semanas','2026-11-02'],['em dois dias','2026-10-21'],['daqui a quinze dias','2026-11-03'],['há três dias','2026-10-16'],['duas semanas atrás','2026-10-05'],['daqui a um mês','2026-11-19'],
 ['primeiro domingo do mês que vem','2026-11-01'],['segunda terça do mês que vem','2026-11-10'],['terceira quarta-feira do mês que vem','2026-11-18'],['quarta quinta-feira do mês que vem','2026-11-26'],['última sexta do mês que vem','2026-11-27'],['penúltimo domingo do mês que vem','2026-11-22'],['2ª segunda-feira do mês que vem','2026-11-09'],
 ['último dia do mês','2026-10-31'],['penúltimo dia do mês','2026-10-30'],['primeiro dia do mês que vem','2026-11-01'],['fim do mês que vem','2026-11-30'],['18 do 11','2026-11-18']
] as const;
test('calendário resolve expressões relativas completas com datas esperadas independentes',()=>{
 for(const [text,date] of dates)assert.equal(financeDate(text,today,true),date,text);
});
test('viradas de mês ano e fuso não deslocam o dia do calendário',()=>{
 for(const [text,base,date] of [['ontem','2026-01-01','2025-12-31'],['amanhã','2026-12-31','2027-01-01'],['primeiro domingo do mês que vem','2026-12-31','2027-01-03'],['último dia do mês que vem','2028-01-31','2028-02-29'],['daqui a um mês','2026-01-31','2026-02-28'],['daqui a um mês','2028-01-31','2028-02-29']] as const)assert.equal(financeDate(text,base,true),date);
 assert.equal(financeDate('ontem',brazilDay(new Date('2026-10-20T02:59:59Z'))),'2026-10-18');
 assert.equal(financeDate('ontem',brazilDay(new Date('2026-10-20T03:00:00Z'))),'2026-10-19');
 assert.equal(financeDate('próxima sexta','2026-10-23',true),'2026-10-30');
 assert.equal(financeDate('sexta passada','2026-10-23',true),'2026-10-16');
 assert.equal(financeDate('primeiro domingo de janeiro',today,true),'2027-01-03');
 assert.equal(financeDate('quinto domingo de janeiro',today,true),'2027-01-31');
 assert.equal(financeDate('primeiro domingo de outubro',today,true),'2027-10-03');
 assert.equal(financeDate('último dia de janeiro',today,true),'2027-01-31');
});
test('captura o trecho inteiro sem interpretar ordinal dia ou semana como valor monetário',async()=>{
 for(const [text,date] of dates.filter(([s])=>!/ontem|passad|ultima sexta|antes de/.test(s.normalize('NFD').replace(/\p{M}/gu,'')))){
  const input='Agenda 250 reais da compra '+text;
  const d=await extractFinance(input,state,'synthetic',today,noModel),p=prepareFinanceDraft(d,input,state,randomUUID(),randomUUID(),today);
  assert.equal(p.expenses.length,1,input);assert.equal(p.expenses[0].payload.amount_cents,25000,input);assert.equal(p.expenses[0].payload.entry_date,date,input);assert.equal(p.expenses[0].payload.status,'PREVISTO',input);
 }
 for(const text of ['Agenda dentista no primeiro domingo do mês que vem às 15h','Agende uma consulta na terça da semana que vem às quinze horas']){
  const d=await extractFinance(text,state,'synthetic',today,noModel),p=prepareFinanceDraft(d,text,state,randomUUID(),randomUUID(),today);assert.equal(p.expenses.length,0);assert.equal(p.documents[0].document.details.time,'15:00');assert.match(p.documents[0].document.date,/^2026-(?:11-01|10-27)$/);
 }
});
test('ontem prevalece sobre hoje inclusive em entrada e saída e previsão futura não debita caixa',async()=>{
 for(const text of ['Saída 25 reais almoço ontem','Entrada 250 vendi a cadeira ontem','Ontem gastei 25 reais no restaurante']){
  const d=await extractFinance(text,state,'synthetic',today,noModel),p=prepareFinanceDraft(d,text,state,randomUUID(),randomUUID(),today),date=p.expenses[0]?.payload.entry_date||p.documents[0]?.document.date;assert.equal(date,'2026-10-18',text);
 }
 const text='Saída 250 reais luz na próxima sexta',d=await extractFinance(text,state,'synthetic',today,noModel),p=prepareFinanceDraft(d,text,state,randomUUID(),randomUUID(),today);assert.equal(p.expenses[0].payload.status,'PREVISTO');assert.equal(p.expenses[0].payload.entry_date,'2026-10-23');
});
test('semana ou mês sem dia pergunta só o dia e completa sem perder hora e valor',async()=>{
 for(const [text,reply,date] of [['Agenda dentista semana que vem às 15h','terça','2026-10-27'],['Vou pagar 800 da moto semana que vem','sexta','2026-10-30'],['Agenda 250 reais conta mês que vem','dia 5','2026-11-05']] as const){
  const user=randomUUID(),secret='synthetic-calendar',first=await assistantTurn({text,state,user,key:'',secret,today,transport:noModel});assert.match(first.answer||'',/Em qual dia dess/);assert.equal(first.pending,undefined);
  const next=await assistantTurn({text:reply,state,user,key:'',secret,today,transport:noModel,conversation:first.conversation_id});assert.ok(next.pending,next.answer);const p=readFinance(next.pending.confirmation,user,secret);assert.equal(p.expenses[0]?.payload.entry_date||p.documents[0]?.document.date,date);if(p.documents.length)assert.equal(p.documents[0].document.details.time,'15:00');
 }
 assert.throws(()=>financeDate('semana que vem',today,true),/Em qual dia dessa semana/);
});
test('data inválida ou contraditória nunca é ignorada por um modelo que sugeriu hoje',()=>{
 assert.throws(()=>financeDate('quinto domingo de fevereiro de 2027',today,true),/não ocorre/);
 assert.equal(appointmentFacts('Agenda consulta dia 18 do 11 na próxima sexta',today),null);
 assert.equal(appointmentFacts('Agenda consulta amanhã na semana que vem',today),null);
 const draft:FinanceDraft={intent:'COMMAND',command:{action:'expense_create',description:'Luz',amount_cents:2500,date:today,status:'REALIZADO'},confidence:'ALTA',question:'',query:'',target_excerpt:'',money_evidence:[{field:'amount_cents',excerpt:'25 reais'}],date_evidence:[]};
 assert.throws(()=>prepareFinanceDraft(draft,'Vou pagar 25 reais de luz amanhã, ontem',state,randomUUID(),randomUUID(),today),/data/);
 assert.throws(()=>prepareFinanceDraft(draft,'Vou pagar 25 reais de luz semana que vem',state,randomUUID(),randomUUID(),today),/Em qual dia/);
 const p=prepareFinanceDraft(draft,'Vou pagar 25 reais de luz na próxima sexta',state,randomUUID(),randomUUID(),today);assert.equal(p.expenses[0].payload.entry_date,'2026-10-23');assert.equal(p.expenses[0].payload.status,'PREVISTO');
 assert.throws(()=>prepareFinanceDraft(draft,'Gastei 25 reais de luz na próxima sexta',state,randomUUID(),randomUUID(),today),/já foi pago/);
});
