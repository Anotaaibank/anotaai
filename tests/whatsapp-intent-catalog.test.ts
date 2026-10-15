import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {fastWhatsappQuery,whatsappQueryAnswer} from '../lib/whatsapp-reports.ts';
import {quickMonthlyBillDraft,continuedMonthlyBill} from '../lib/monthly-bills.ts';
import {prepareFinanceDraft} from '../lib/finance-ai.ts';
import {calendarDays,moveCalendarMonth} from '../lib/agenda-calendar.ts';
import {buildFinancePlan,financeSnapshot,type FinanceState,type FinanceCommand} from '../lib/finance.ts';
const today='2026-10-15';
const catalog:Record<string,string[]>={
 saldo:['Qual meu saldo?','Quanto tenho no caixa?','Qual o valor do saldo da minha conta?','Confere meu saldo atual','Mostre meu saldo no Anotei','Qual é meu saldo disponível na conta?'],
 salario:['Qual é meu salário fixo?','Quanto é meu salário mensal?','Qual a minha renda fixa?','Me mostra meu salário','Qual renda mensal eu cadastrei?'],
 rendas:['Quanto recebi de renda extra?','Qual o total das minhas rendas complementares?','Quanto ganhei fazendo Uber?','Me mostra minhas rendas extras','Qual o resultado dos meus bicos?'],
 entradas:['Quanto recebi hoje?','Quanto entrou neste mês?','Quais meus recebimentos?','Me mostra minhas entradas','Qual o dinheiro que entrou hoje?'],
 pagamentos:['Eu tenho uma conta para pagar hoje?','Tenho alguma conta pra pagar hoje?','Quais boletos vencem hoje?','Quais contas eu preciso pagar hoje?','Quais são meus pagamentos pendentes?','O que devo pagar neste mês?','Quais parcelas tenho a pagar?'],
 atrasos:['Tenho alguma conta vencida?','Existe boleto atrasado?','Quais dívidas estão em atraso?','Me mostra minhas contas atrasadas','Quanto estou devendo em contas vencidas?'],
 agenda:['Eu tenho alguma agenda de compromisso hoje?','Tenho algum compromisso hoje?','Quais são meus compromissos de hoje?','Tem reunião hoje?','Qual minha agenda de amanhã?','Me mostra meus eventos desta semana','Tenho alguma consulta amanhã?','Quais meus agendamentos hoje?'],
 fixed:['Quais são minhas despesas fixas?','Quais contas fixas cadastrei?','Me mostra meus gastos fixos','Relatório das despesas fixas deste mês'],
 variable:['Quanto gastei em despesas variáveis?','Me manda meus gastos variáveis'],
 gastos:['Quanto gastei até agora?','Qual o total dos meus gastos?','Me faz um relatório geral de quanto eu gastei até o momento','Quanto eu gastei neste mês?'],
 receber:['Tenho contas a receber?','Existe algum dinheiro para receber?','Quais são minhas entradas previstas?','Me mostra recebimentos pendentes'],
 reservas:['Quanto tenho na poupança?','Qual o saldo da minha reserva?','Me mostra minhas reservas','Quanto dinheiro tenho guardado?'],
 custos:['Quais os custos da renda extra?','Quanto gastei para trabalhar?','Qual o custo do Uber?'],
 patrimonio:['Qual meu patrimônio?','Quanto eu tenho ao todo?','Quanto eu tenho no total?'],
 investir:['Quanto posso investir?','Qual o valor livre para investimento?'],
 available:['Quanto sobra neste mês?','Quanto está sobrando?','Quanto eu posso gastar?'],
 projecao:['Qual minha projeção financeira?','Qual meu saldo projetado?'],
 resumo:['Me manda um resumo financeiro','Qual a minha situação financeira?','Como está minha visão geral?'],
 viagens:['Quais são minhas viagens?','Me mostra minhas viagens'],
 feedback:['Quais são meus feedbacks?','Qual o retorno do suporte?']
};
test('catálogo de perguntas dos módulos resolve a intenção sem precisar consultar um modelo',()=>{
 const failures:string[]=[];for(const [expected,phrases]of Object.entries(catalog))for(const phrase of phrases){const raw=fastWhatsappQuery(phrase),query=raw?JSON.parse(raw):{};if((query.topic||query.report)!==expected)failures.push(phrase+' → '+JSON.stringify(query));}assert.deepEqual(failures,[]);
});
test('perguntas de hoje, amanhã e semana preservam período; múltiplas perguntas preservam ambos os assuntos',()=>{
 for(const phrase of catalog.pagamentos.filter(p=>/hoje/.test(p))){const q=JSON.parse(fastWhatsappQuery(phrase)!);assert.equal(q.period,'hoje',phrase);assert.equal(q.payment_state,'HOJE',phrase);}
 const q=JSON.parse(fastWhatsappQuery('Qual meu saldo e minha agenda de hoje?')!);assert.equal(q.report,'multiple');assert.deepEqual(q.queries.map((i:{topic:string})=>i.topic),['saldo','agenda']);assert.equal(q.queries[1].period,'hoje');
 const separate=JSON.parse(fastWhatsappQuery('Qual minha agenda de hoje? Quais contas tenho a pagar no mês inteiro?')!);assert.equal(separate.queries[0].period,'hoje');assert.equal(separate.queries[1].period,'mes_atual');
});
test('perguntas nunca viram comandos e comandos monetários não são respondidos como simples consultas',()=>{
 for(const text of ['Meu salário é seis mil reais','Gastei cinquenta reais com meu almoço','Lança uma despesa de 80 reais','Pago meu carro todo dia 5, 1500','Agenda minha reunião amanhã às 19h','Qual o saldo da empresa?','Como cadastro minhas despesas?'])assert.equal(fastWhatsappQuery(text),null,text);
 for(const text of ['Quanto é meu carro mensal de 1500 reais todo dia 5?','Como cadastrar meu carro mensal 1500 todo dia 5?','Pago meu carro em 3 parcelas de 1500 reais'])assert.equal(quickMonthlyBillDraft(text,today),null,text);
});
test('frase mensal do relato e sigla desconhecida preparam doze vencimentos sem perguntar preço total',()=>{
 for(const text of ['Carro mensal 1500 todo dia 15','Tenho um compromisso todo dia 5 de pagar o BID, 1500 reais','Parcela do Carro BYD mensal 1.500 todo dia 5']){const draft=quickMonthlyBillDraft(text,today);assert.ok(draft,text);const plan=prepareFinanceDraft(draft,text,{documents:[],expenses:[]},randomUUID(),randomUUID(),today);assert.equal(plan.expenses.length,12);assert.ok(plan.expenses.every(e=>e.payload.amount_cents===150000&&e.payload.status==='PREVISTO'));assert.equal(plan.documents.length,1);}
 const result=continuedMonthlyBill('Carro mensal 1500 todo dia 15','Parcela do Carro BYD',today)!;assert.ok(result);assert.equal(prepareFinanceDraft(result.draft,result.source,{documents:[],expenses:[]},randomUUID(),randomUUID(),today).documents[0].document.description,'Parcela do Carro BYD');
 for(const answer of ['1500','É 1500','O valor é 1500 reais'])assert.ok(continuedMonthlyBill('Pago meu carro todo dia 5',answer,today),answer);
 assert.equal(continuedMonthlyBill('Pago meu carro todo dia 5','Lança 30 reais de gasolina',today),null);
});
test('consultas combinadas leem cálculos reais e agenda, sem alterar caixa ou incluir outra conta',()=>{
 const state:FinanceState={documents:[],expenses:[]},user=randomUUID(),add=(c:FinanceCommand)=>{const p=buildFinancePlan(c,state,user,randomUUID(),today);state.documents.push(...p.documents.map(d=>({...d.document,updated_at:today})));state.expenses.push(...p.expenses.map(e=>({...e.payload,user_id:user,active:true,origin:'MANUAL' as const,created_at:today,updated_at:today})));};
 add({action:'profile_upsert',profile:{opening_balance_cents:250000,opening_date:today}});add({action:'appointment_upsert',description:'Consulta de hoje',date:today,time:'19:00'});add({action:'expense_create',description:'Conta de hoje',amount_cents:20000,date:today,status:'PREVISTO'});add({action:'expense_create',description:'Conta de amanhã',amount_cents:90000,date:'2026-10-16',status:'PREVISTO'});
 const before=JSON.stringify(state),reply=whatsappQueryAnswer(state,fastWhatsappQuery('Qual meu saldo e minha agenda de hoje?')!,today);assert.match(reply,/2\.500,00/);assert.match(reply,/Consulta de hoje/);const bills=whatsappQueryAnswer(state,fastWhatsappQuery('Eu tenho uma conta para pagar hoje?')!,today);assert.match(bills,/Conta de hoje/);assert.doesNotMatch(bills,/Conta de amanhã/);assert.equal(JSON.stringify(state),before);assert.equal(financeSnapshot(state,today).balance_cents,250000);
 assert.throws(()=>whatsappQueryAnswer(state,JSON.stringify({report:'multiple',queries:[{topic:'saldo'},{topic:'agenda',user_id:randomUUID()}]}),today));
 const fixedAndAgenda=whatsappQueryAnswer(state,fastWhatsappQuery('Qual minha agenda de hoje e minhas despesas fixas?')!,today);assert.match(fixedAndAgenda,/Sua agenda/);assert.match(fixedAndAgenda,/Consulta de hoje/);assert.match(fixedAndAgenda,/Despesas fixas/);
});
test('calendário alinha dias da semana, ano bissexto e troca de ano sem deslocar o fuso',()=>{
 const october=calendarDays('2026-10');assert.equal(october[4],'2026-10-01');assert.equal(october.filter(Boolean).length,31);assert.equal(calendarDays('2026-11')[0],'2026-11-01');assert.ok(calendarDays('2028-02').includes('2028-02-29'));assert.equal(calendarDays('2027-02').filter(Boolean).length,28);assert.equal(moveCalendarMonth('2026-12',1),'2027-01');assert.equal(moveCalendarMonth('2026-01',-1),'2025-12');
});
