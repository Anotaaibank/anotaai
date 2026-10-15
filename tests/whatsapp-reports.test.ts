import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {fastWhatsappQuery,whatsappQueryAnswer} from '../lib/whatsapp-reports.ts';
import {financeReport} from '../lib/finance-report.ts';
import {financeDate} from '../lib/finance-date.ts';
import {buildFinancePlan,type FinanceCommand,type FinanceState} from '../lib/finance.ts';
const today='2026-10-10',owner=randomUUID();
function fixture(){const state:FinanceState={documents:[],expenses:[]},add=(c:FinanceCommand)=>{const p=buildFinancePlan(c,state,owner,randomUUID(),today);for(const d of p.documents)state.documents.push({...d.document,updated_at:today});for(const e of p.expenses)state.expenses.push({...e.payload,user_id:owner,active:true,origin:'MANUAL',created_at:today,updated_at:today});return p;};
 add({action:'profile_upsert',profile:{salary_cents:1000000,opening_balance_cents:600000,opening_date:'2026-10-01'}});
 add({action:'extra_activity',activity:'Uber',amount_cents:8000,cost_cents:2500,date:today});
 add({action:'expense_create',description:'Sorvete',category:'Restaurante',amount_cents:2500,date:today});
 add({action:'expense_schedule',description:'Aluguel mensal',category:'Aluguel / moradia',date:'2026-10-20',count:2,amount_cents:100000,schedule_type:'MENSAL',amount_mode:'PARCELA'});
 add({action:'expense_create',description:'Aluguel avulso',category:'Aluguel / moradia',date:today,amount_cents:5000});
 add({action:'appointment_upsert',description:'Reunião',date:'2026-10-11',time:'14:00'});
 return {state,add};}
test('consultas comuns do WhatsApp escolhem os leitores sem usar IA',()=>{
 for(const [text,topic] of [['Qual é meu salário fixo?','salario'],['Qual é meu saldo na conta?','saldo'],['Quanto tenho de contas a pagar?','pagamentos'],['Quanto tenho de rendas complementares?','rendas'],['Quanto tenho de contas a pagar no mês inteiro?','pagamentos'],['Me faz um relatório geral de quanto eu gastei até o momento.','gastos'],['Me faz um relatório geral de qual é meu saldo atual.','saldo'],['Qual é minha agenda desta semana?','agenda'],['Quanto tenho de reservas?','reservas'],['Quanto posso investir?','investir'],['Qual é minha projeção?','projecao'],['Me manda um resumo financeiro.','resumo']]){const raw=fastWhatsappQuery(text);assert.ok(raw,text);assert.equal(JSON.parse(raw).topic,topic,text);}
});
test('comandos, escopo empresarial, datas explícitas e filtros especiais não perdem informações no caminho rápido',()=>{
 for(const text of ['Agenda pra mim meu evento dia 10 do mês 11 às 14 horas.','Agende minha reunião amanhã.','Gastei 25 reais de sorvete.','Qual é meu saldo da loja?','Quanto gastei com minha família?','Quanto gastei na viagem Férias?','Quanto gastei em setembro?','Quanto gastei ontem?','Como eu cadastro meu salário?'])assert.equal(fastWhatsappQuery(text),null,text);
 assert.equal(JSON.parse(fastWhatsappQuery('Quanto gastei com gasolina neste mês?')!).category,'Combustível');
});
test('relatórios escritos preservam os cálculos do painel e não alteram dados',()=>{
 const {state}=fixture(),before=JSON.stringify(state),balance=whatsappQueryAnswer(state,fastWhatsappQuery('Qual meu saldo?')!,today);assert.ok(balance.endsWith(financeReport(state,{topic:'saldo',period:'mes_atual'},today).answer));assert.match(balance,/^\*💰 Saldo da conta\*\n\n/);
 assert.match(whatsappQueryAnswer(state,fastWhatsappQuery('Qual é meu salário fixo?')!,today),/10\.000,00/);
 assert.match(whatsappQueryAnswer(state,fastWhatsappQuery('Quanto tenho de rendas complementares?')!,today),/55,00 líquidos/);
 assert.match(whatsappQueryAnswer(state,fastWhatsappQuery('Quanto tenho de contas a pagar no mês inteiro?')!,today),/1\.000,00 em 1 pagamento/);
 assert.match(whatsappQueryAnswer(state,fastWhatsappQuery('Qual minha agenda desta semana?')!,today),/11\/10\/2026 às 14:00: Reunião/);
 const report=whatsappQueryAnswer(state,fastWhatsappQuery('Relatório dos gastos até o momento')!,today);assert.match(report,/Restaurante:.*25,00/);assert.match(report,/custos de renda extra/);assert.equal(JSON.stringify(state),before);
});
test('despesa pessoal exclui custo de renda extra e usa blocos curtos no WhatsApp',()=>{
 const {state}=fixture(),q=fastWhatsappQuery('Qual o valor das minhas despesas pessoais?');assert.ok(q);assert.equal(JSON.parse(q).topic,undefined);
 const reply=whatsappQueryAnswer(state,q,today);assert.match(reply,/Total:.*75,00 em 2 registros/);assert.match(reply,/\n\n\*Por categoria\*\n• /);assert.doesNotMatch(reply,/Custo · Uber|25,00 em custos|2000|2100/);
 const agenda=whatsappQueryAnswer(state,fastWhatsappQuery('Qual minha agenda desta semana?')!,today);assert.match(agenda,/\n\n• 11\/10\/2026 às 14:00: Reunião/);
 for(const topic of ['agenda','pagamentos'])assert.doesNotMatch(whatsappQueryAnswer({documents:[],expenses:[]},JSON.stringify({topic,period:'mes_atual'}),today),/\.\./);
});
test('despesas fixas usam cadastro mensal, sem classificar aluguel avulso como recorrente',()=>{
 const {state}=fixture(),report=whatsappQueryAnswer(state,fastWhatsappQuery('Me manda um relatório das despesas fixas deste mês.')!,today);assert.match(report,/A pagar no período:.*1\.000,00 \(1\)/);assert.doesNotMatch(report,/Aluguel avulso|novembro/);
 const empty=whatsappQueryAnswer(state,JSON.stringify({report:'fixed',period:'mes_atual',category:'Água'}),today);assert.match(empty,/0,00 \(0\)/);assert.doesNotMatch(empty,/Aluguel mensal/);
 const filtered=whatsappQueryAnswer(state,JSON.stringify({topic:'gastos',period:'mes_atual',filters:{category:'Água'}}),today,'Relatório das despesas fixas de água');assert.doesNotMatch(filtered,/Aluguel mensal/);assert.match(filtered,/0,00 \(0\)/);
});
test('filtros do intérprete são normalizados para o relatório escrito, sem nulls e períodos inválidos',()=>{
 const {state}=fixture(),query=JSON.stringify({topic:'gastos',period:'hoje',filters:{category:'Restaurante'},from:null,to:null});assert.match(whatsappQueryAnswer(state,query,today),/25,00 em 1 registros/);assert.throws(()=>whatsappQueryAnswer(state,JSON.stringify({topic:'saldo',user_id:randomUUID()}),today));
});
test('data dita como dia e número do mês preserva data e virada do ano',()=>{
 assert.equal(financeDate('dia 10 do mês 11',today,true),'2026-11-10');assert.equal(financeDate('dia dez do mês onze',today,true),'2026-11-10');assert.equal(financeDate('dia 10 do mês 1','2026-12-31',true),'2027-01-10');assert.equal(financeDate('dia 10 do mês 11 de 2026',today,true),'2026-11-10');assert.throws(()=>financeDate('dia 31 do mês 11',today,true));
 assert.equal(financeDate('dia 10 do mês que vem',today,true),'2026-11-10');assert.equal(financeDate('dia 10 do mês atual',today,true),today);
});
