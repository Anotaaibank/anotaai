import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {fastWhatsappQuery,whatsappQueryAnswer} from '../lib/whatsapp-reports.ts';
import {financeReport} from '../lib/finance-report.ts';
import {buildFinancePlan,type FinanceState,type FinanceCommand} from '../lib/finance.ts';
import {whatsappHelp,feedbackRequest} from '../lib/whatsapp-help.ts';
import {signFeedback,readFeedback,feedbackReply} from '../lib/whatsapp-feedback.ts';
import {whatsappPending,whatsappFeedbackChoice} from '../lib/whatsapp-finance.ts';
import {extractFinance} from '../lib/finance-ai.ts';
const today='2026-10-13',owner=randomUUID();
function fixture(){const state:FinanceState={expenses:[],documents:[]};const add=(command:FinanceCommand)=>{const plan=buildFinancePlan(command,state,owner,randomUUID(),today);for(const change of plan.documents)state.documents.push({...change.document,updated_at:today});for(const change of plan.expenses)state.expenses.push({...change.payload,user_id:owner,active:true,origin:'MANUAL',created_at:today,updated_at:today});return plan;};
 add({action:'expense_create',description:'Aluguel vencido',amount_cents:40000,date:'2026-10-09',status:'PREVISTO'});add({action:'expense_create',description:'Conta de setembro',amount_cents:10000,date:'2026-09-10',status:'PREVISTO'});add({action:'expense_create',description:'Conta de hoje',amount_cents:3000,date:today,status:'PREVISTO'});add({action:'expense_create',description:'Conta futura',amount_cents:2000,date:'2026-10-20',status:'PREVISTO'});add({action:'expense_create',description:'Conta paga',amount_cents:9000,date:'2026-10-09'});
 add({action:'income_upsert',description:'Serviço a receber',amount_cents:15000,date:'2026-10-20',status:'PREVISTO',activity:'Serviço'});add({action:'income_upsert',description:'Entrada recebida',amount_cents:12000,date:today});
 add({action:'extra_activity',activity:'Uber',amount_cents:8000,cost_cents:2500,date:today});add({action:'extra_activity',activity:'Garçom',amount_cents:15000,cost_cents:2000,date:today});
 add({action:'expense_create',description:'Hotel',amount_cents:30000,date:today,details:{trip_name:'Férias'}});add({action:'expense_create',description:'Passeio futuro',amount_cents:5000,date:'2026-10-20',status:'PREVISTO',details:{trip_name:'Férias'}});
 return {state,add};}
test('variações de perguntas consultam atraso, receber, vencimentos, custos, viagens e feedback sem IA',()=>{
 const queries:[string,string][]=[['Eu tenho alguma conta em atraso?','atrasos'],['Verifica se eu tenho contas atrasadas.','atrasos'],['Existem pagamentos vencidos?','atrasos'],['Quais são minhas dívidas atrasadas?','atrasos'],['Tenho contas a receber?','receber'],['Quanto tenho de entradas previstas?','receber'],['Tenho dinheiro para receber?','receber'],['Quais contas vencem hoje?','pagamentos'],['Quais são minhas contas a vencer?','pagamentos'],['Quanto gastei com custos de renda extra?','custos'],['Quais são minhas viagens?','viagens']];
 for(const [text,topic]of queries){const query=fastWhatsappQuery(text);assert.ok(query,text);assert.equal(JSON.parse(query).topic,topic,text);}
 assert.equal(JSON.parse(fastWhatsappQuery('Responderam meus feedbacks?')!).report,'feedback');
 for(const text of ['Já paguei a conta em atraso.','Agenda pra mim uma consulta.','Pague minha conta a pagar.','Quero enviar um feedback sobre saldo.','Qual é o meu saldo da empresa?'])assert.equal(fastWhatsappQuery(text),null,text);
});
test('atrasos incluem meses anteriores; consulta nunca inclui pagos, futuros ou arquivados nem altera estado',()=>{
 const {state}=fixture();state.expenses.push({...state.expenses[0],id:randomUUID(),description:'Arquivada',active:false});const before=JSON.stringify(state),query=fastWhatsappQuery('Eu tenho alguma conta em atraso?')!;
 const answer=whatsappQueryAnswer(state,query,today);assert.match(answer,/500,00 em 2 pagamentos em atraso/);assert.match(answer,/Conta de setembro/);assert.doesNotMatch(answer,/Conta paga|Conta futura|Conta de hoje|Arquivada/);
 assert.equal(financeReport(state,{topic:'atrasos',period:'mes_atual'},today).count,1);assert.equal(financeReport(state,{topic:'pagamentos',payment_state:'HOJE',period:'total'},today).count,1);assert.equal(financeReport(state,{topic:'pagamentos',payment_state:'FUTURO',period:'total'},today).count,2);assert.equal(JSON.stringify(state),before);
});

test('saldo e contas vencidas na mesma mensagem retornam as duas consultas sem IA nem alterações',()=>{
 const {state}=fixture(),before=JSON.stringify(state);
 for(const text of ['qual o valor do meu saldo, e se tenho contas vencidas','Eu quero saber se eu tenho algum saldo alguma conta em atraso.']){
  const query=fastWhatsappQuery(text);assert.ok(query);assert.equal(JSON.parse(query).report,'balance_overdue');
  const answer=whatsappQueryAnswer(state,query,today,text);assert.match(answer,/Saldo da conta/);assert.match(answer,/Contas em atraso/);assert.match(answer,/500,00 em 2 pagamentos em atraso/);assert.match(answer,/Conta de setembro/);assert.doesNotMatch(answer,/Conta paga|Conta futura/);
 }
 assert.equal(JSON.stringify(state),before);
 assert.throws(()=>whatsappQueryAnswer(state,JSON.stringify({report:'balance_overdue',user_id:randomUUID()}),today));
 assert.throws(()=>whatsappQueryAnswer(state,JSON.stringify({report:'balance_overdue',kind:'LOJA'}),today));
 assert.equal(fastWhatsappQuery('Qual meu saldo e salário e contas vencidas?'),null);
 assert.equal(fastWhatsappQuery('Pague minhas contas vencidas e veja o saldo.'),null);
 for(const text of ['Quanto eu gastei total esse mês?','Qual o total de gastos desse mês?'])assert.equal(JSON.parse(fastWhatsappQuery(text)!).period,'mes_atual');
});
test('despesas fixas e variáveis mantêm o filtro de atraso e vencimento, sem misturar tipos',()=>{
 const {state,add}=fixture();add({action:'expense_schedule',description:'Conta fixa vencida',date:'2026-10-08',amount_cents:60000,count:1,schedule_type:'MENSAL',amount_mode:'PARCELA'});
 const fixed=whatsappQueryAnswer(state,fastWhatsappQuery('Tenho despesas fixas em atraso?')!,today,'Tenho despesas fixas em atraso?');assert.match(fixed,/600,00 em 1 pagamento/);assert.doesNotMatch(fixed,/Conta futura|Aluguel vencido/);
 const variable=whatsappQueryAnswer(state,fastWhatsappQuery('Tenho despesas variáveis em atraso?')!,today,'Tenho despesas variáveis em atraso?');assert.match(variable,/500,00 em 2 pagamentos/);assert.doesNotMatch(variable,/Conta fixa vencida/);
 assert.equal(JSON.parse(fastWhatsappQuery('Quais contas estão a vencer hoje?')!).payment_state,'HOJE');
 const paid=whatsappQueryAnswer(state,fastWhatsappQuery('Qual o valor das minhas despesas variáveis?')!,today);assert.match(paid,/Despesas variáveis pagas/);assert.doesNotMatch(paid,/Conta fixa vencida|Custo ·/);
 assert.equal(fastWhatsappQuery('Quais contas venceram antes deste mês?'),null);
});
test('interpretação de pergunta fora dos atalhos recebe os leitores novos e preserva período e filtros',async()=>{
 const {state}=fixture(),source='Gostaria de conferir os pagamentos que venceram entre primeiro e nove de outubro.';
 const transport:typeof fetch=async(_url,init)=>{const request=JSON.parse(String(init?.body));assert.match(request.instructions,/topic atrasos/);assert.match(request.instructions,/topic receber/);assert.match(request.instructions,/kind MENSAL/);return Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({intent:'QUERY',command:null,question:'',confidence:'ALTA',target_excerpt:'',money_evidence:[],date_evidence:[],query:JSON.stringify({topic:'atrasos',period:'personalizado',from:'2026-10-01',to:'2026-10-09'})})}]}]});};
 const draft=await extractFinance(source,state,'synthetic-key',today,transport);assert.equal(draft.intent,'QUERY');const answer=whatsappQueryAnswer(state,draft.query,today,source);assert.match(answer,/400,00 em 1 pagamento/);assert.doesNotMatch(answer,/Conta de setembro/);
});
test('consulta de atraso preserva boleto, categoria, nome e filtros do intérprete sem aceitar troca de usuário',()=>{
 const {state,add}=fixture();add({action:'expense_create',description:'Aluguel em boleto',category:'Aluguel / moradia',amount_cents:70000,date:'2026-10-07',status:'PREVISTO',details:{payment_method:'BOLETO'}});
 const answer=whatsappQueryAnswer(state,JSON.stringify({topic:'atrasos',period:'total',filters:{payment_method:'BOLETO',status:'PREVISTO',category:'Aluguel / moradia'}}),today);assert.match(answer,/700,00 em 1 pagamento/);assert.doesNotMatch(answer,/Conta de setembro/);
 const named=financeReport(state,{topic:'atrasos',search:'Aluguel em boleto'},today);assert.equal(named.count,1);assert.match(named.answer,/700,00/);
 const fast=whatsappQueryAnswer(state,fastWhatsappQuery('Tenho contas em atraso no boleto?')!,today,'Tenho contas em atraso no boleto?');assert.match(fast,/700,00 em 1 pagamento/);
 assert.throws(()=>whatsappQueryAnswer(state,JSON.stringify({topic:'atrasos',filters:{user_id:randomUUID()}}),today));
});
test('entradas previstas não viram saldo; custos e resultado de Uber não incluem outro trabalho',()=>{
 const {state}=fixture(),receipts=whatsappQueryAnswer(state,fastWhatsappQuery('Tenho contas a receber?')!,today);assert.match(receipts,/150,00 em 1 entrada/);assert.match(receipts,/só entram no saldo/);assert.doesNotMatch(receipts,/Entrada recebida/);
 const uber=whatsappQueryAnswer(state,fastWhatsappQuery('Quanto tenho de rendas complementares do Uber?')!,today);assert.match(uber,/55,00 líquidos/);assert.doesNotMatch(uber,/130,00 líquidos/);
 const cost=financeReport(state,{topic:'custos',activity:'Uber'},today);assert.match(cost.answer,/25,00/);assert.equal(cost.count,1);
 const trips=whatsappQueryAnswer(state,fastWhatsappQuery('Quais são minhas viagens?')!,today);assert.match(trips,/Férias/);assert.match(trips,/Pago:.*300,00/);assert.match(trips,/A pagar:.*50,00/);
 assert.throws(()=>financeReport(state,{topic:'atrasos',user_id:randomUUID()},today));
});
test('orientação cobre todas as áreas no WhatsApp e não simula leitura ou gravação',()=>{
 const menu=whatsappHelp('menu')!;for(const title of ['Meu dinheiro','Rendas complementares','Contas a pagar','Agenda','Minhas despesas','Despesas fixas','Viagens','Feedback'])assert.ok(menu.includes(title),title);
 assert.match(whatsappHelp('Como eu cadastro uma renda extra?')!,/Ganhei 80 reais/);assert.match(whatsappHelp('Para que serve a aba contas a pagar?')!,/vencimento passou/);
 assert.equal(whatsappHelp('Me explica meu saldo.'),null);assert.equal(feedbackRequest('Qual é meu feedback?'),null);
 const draft=feedbackRequest('Envie um feedback sobre Meu dinheiro: gostaria de mais detalhes do saldo.');assert.equal(draft?.topic,'Meu dinheiro');assert.equal(draft?.message,'gostaria de mais detalhes do saldo.');
});
test('proposta de feedback é assinada, vinculada ao remetente, expira e disputa confirmação com lançamentos',()=>{
 const user=randomUUID(),sender='5511999999999',key='synthetic-whatsapp-key-with-32-characters',now=Date.now(),id=randomUUID(),plan={id,feedback:{id,topic:'Meu dinheiro' as const,kind:'Sugestão' as const,message:'Gostaria de ver mais detalhes do saldo.'}},token=signFeedback(plan,user,sender,key,now),code=id.replaceAll('-','').slice(0,10).toUpperCase(),row={user_id:user,sender,finance_confirmation:token,confirmation_code:code,confirmation_used:false};
 assert.deepEqual(readFeedback(token,user,sender,key,now),plan);assert.throws(()=>readFeedback(token,user,'5511888888888',key,now));assert.throws(()=>readFeedback(token,randomUUID(),sender,key,now));assert.throws(()=>readFeedback(token,user,sender,key,now+600000));assert.throws(()=>readFeedback(token+'x',user,sender,key,now));
 assert.equal(whatsappFeedbackChoice('1',[row],user,sender,key,now)?.cancel,false);assert.equal(whatsappFeedbackChoice('2',[row],user,sender,key,now)?.cancel,true);assert.match(feedbackReply(plan,code),/Ainda não foi enviado/);
 const financial=buildFinancePlan({action:'expense_create',description:'Sorvete',amount_cents:2500}, {documents:[],expenses:[]},user,randomUUID());const other={user_id:user,sender,...whatsappPending(financial,user,sender,key,now)};assert.throws(()=>whatsappFeedbackChoice('1',[row,other],user,sender,key,now),/mais de uma/);assert.ok(whatsappFeedbackChoice('CONFIRMAR '+code,[row,other],user,sender,key,now));
});
