import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {extractFinance,prepareFinanceDraft,type FinanceDraft} from '../lib/finance-ai.ts';
import {prefixedCommand} from '../lib/command-prefix.ts';
import {assistantTurn} from '../lib/assistant-turn.ts';
import {fastWhatsappQuery} from '../lib/whatsapp-reports.ts';
import {readFinance,type FinanceState} from '../lib/finance.ts';

const today='2026-10-19',user=randomUUID(),state:FinanceState={documents:[],expenses:[]};
const noModel:typeof fetch=async()=>{throw Error('Pedido completo não deve chamar o modelo');};
async function plan(text:string){const d=await extractFinance(text,state,'synthetic',today,noModel);assert.equal(d.intent,'COMMAND',d.question);return prepareFinanceDraft(d,text,state,user,randomUUID(),today);}
test('entrada recebe vendas salário e trabalho sem perguntar finalidade data ou custo',async()=>{
 for(const [text,amount] of [
  ['Entrada 250 reais',25000],['Entrada 250 reais vendi meu PlayStation',25000],['Entrada: R$ 250,50 vendi minha cadeira',25050],
  ['Entrada duzentos e cinquenta reais fiz um bico de garçom',25000],['Entrada 80 trabalhei de Uber',8000],['Entrada 6000 salário',600000]
 ] as const){const p=await plan(text);assert.equal(p.documents.length,1);assert.equal(p.expenses.length,0);const d=p.documents[0].document;assert.equal(d.kind,'INCOME');assert.equal(d.amount_cents,amount);assert.equal(d.date,today);assert.equal(d.status,'REALIZADO');assert.equal(d.details.salary,/salário/.test(text));assert.equal(fastWhatsappQuery(text,today),null);}
});
test('saída é despesa imediata inclusive Pix para familiar e aluguel mensal avulso',async()=>{
 for(const [text,amount,method] of [['Saída 250 reais conta de luz',25000,'OUTRO'],['Saída 25 reais almoço no shopping',2500,'OUTRO'],['Saída Pix de 200 reais para a filha',20000,'PIX'],['SAIDA: 350 aluguel mensal',35000,'OUTRO']] as const){const p=await plan(text);assert.equal(p.expenses.length,1);assert.equal(p.documents.length,0);const d=p.expenses[0].payload;assert.equal(d.amount_cents,amount);assert.equal(d.entry_date,today);assert.equal(d.status,'REALIZADO');assert.equal(d.details.payment_method,method);}
});
test('agenda com compra e valor cria conta prevista mesmo com verbo comprei',async()=>{
 for(const [text,date] of [['Agenda 250 reais do guarda-roupa que eu comprei dia 25 do 6','2027-06-25'],['Agendamento 800 da última parcela da moto amanhã','2026-10-20'],['Agenda 250 guarda-roupa dia 21 do 7','2027-07-21'],['Agenda R$ 90 boleto na próxima sexta-feira','2026-10-23']] as const){const p=await plan(text);assert.equal(p.documents.length,0);assert.equal(p.expenses.length,1);assert.equal(p.expenses[0].payload.status,'PREVISTO');assert.equal(p.expenses[0].payload.entry_date,date);}
});
test('agenda de compromisso resolve calendário datas concordantes e horário sem inventar hora',async()=>{
 for(const [text,date,time] of [['Agenda compromisso tocar na igreja no dia 25 agora, domingo','2026-10-25',''],['Agenda dentista amanhã às 15h','2026-10-20','15:00'],['Agenda reunião terça-feira às 9 horas','2026-10-20','09:00'],['Agenda compromisso na próxima quinta-feira tocar na igreja','2026-10-22',''],['Agendamento consulta dia 21 do 7 às oito da manhã','2027-07-21','08:00']] as const){const p=await plan(text);assert.equal(p.expenses.length,0);const d=p.documents[0].document;assert.equal(d.kind,'APPOINTMENT');assert.equal(d.date,date);assert.equal(d.details.time,time);}
});
test('pedidos incompletos perguntam somente o dado ausente e não herdam de um novo prefixo',async()=>{
 for(const [text,question] of [['Entrada','valor'],['Saída Pix','valor'],['Saída -25','maior que zero'],['Agenda 250 guarda-roupa','vencimento'],['Agenda compromisso tocar na igreja','data'],['Agenda compromisso dia 25 segunda-feira','data correta']] as const){const d=await extractFinance(text,state,'synthetic',today,noModel);assert.equal(d.intent,'CLARIFY');assert.match(d.question,new RegExp(question));}
 const secret='prefix-conversation-test',a=await assistantTurn({text:'Agenda 250 guarda-roupa',state,user,key:'synthetic',secret,today,transport:noModel});
 const b=await assistantTurn({text:'dia 25',state,user,key:'synthetic',secret,today,conversation:a.conversation_id,transport:noModel});assert.ok(b.pending,b.answer);assert.equal(readFinance(b.pending.confirmation,user,secret).expenses[0].payload.entry_date,'2026-10-25');
 const c=await assistantTurn({text:'Entrada 80',state,user,key:'synthetic',secret,today,conversation:a.conversation_id,transport:noModel});assert.ok(c.pending,c.answer);const p=readFinance(c.pending.confirmation,user,secret);assert.equal(p.expenses.length,0);assert.equal(p.documents[0].document.amount_cents,8000);
});
test('validação usa o protocolo literal e não uma operação reescrita pelo modelo',()=>{
 const fake:FinanceDraft={intent:'COMMAND',confidence:'ALTA',question:'',query:'',target_excerpt:'',money_evidence:[],date_evidence:[],command:{action:'profile_upsert',profile:{salary_cents:999999}}};
 const p=prepareFinanceDraft(fake,'Entrada 250 salário',state,user,randomUUID(),today);assert.equal(p.documents[0].document.kind,'INCOME');assert.equal(p.documents[0].document.amount_cents,25000);
 assert.equal(prefixedCommand('Saída 25 almoço; entrada 80 Uber',today),null);
 assert.equal(prefixedCommand('Agenda 100 conta dia 31 do 2',today)?.intent,'CLARIFY');
 assert.equal(prefixedCommand('Agenda da semana',today),null);
 assert.equal(prefixedCommand('Saída 250 pagamento da fatura',today)?.intent,'COMMAND');
});
