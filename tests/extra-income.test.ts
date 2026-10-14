import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {buildFinancePlan,financeSnapshot,type FinanceState} from '../lib/finance.ts';
import {applyLocalFinance,localFinanceState} from '../lib/finance-store.ts';
import {registerLocal} from '../lib/local-db.ts';
import {brazilDay} from '../lib/model.ts';
import {draftCommand,type FinanceDraft} from '../lib/finance-ai.ts';
import {personalSummary,fixedCategories} from '../lib/personal-expenses.ts';
import {adminInput} from '../lib/expenses.ts';
process.env.ANOTA_DATABASE_PATH=':memory:';
const today=brazilDay(),empty:FinanceState={expenses:[],documents:[]};
const user=()=>registerLocal(randomUUID()+'@example.test','extra-income-test-password','Teste privado').user.id;
test('Uber 80 menos custo 25 resulta em 55, uma vez no caixa, separado das despesas pessoais',()=>{
 const u=user(),p=buildFinancePlan({action:'extra_activity',activity:'Uber',amount_cents:8000,cost_cents:2500,date:today},empty,u,randomUUID());
 applyLocalFinance(u,p,'WHATSAPP');applyLocalFinance(u,p,'WHATSAPP');
 let s=financeSnapshot(localFinanceState(u));assert.equal(s.balance_cents,5500);assert.equal(s.extra_received_month_cents,8000);assert.equal(s.extra_cost_month_cents,2500);assert.equal(s.extra_net_month_cents,5500);assert.equal(s.paid_month_cents,0);assert.equal(personalSummary(s.expenses).amount_cents,0);assert.equal(s.income_activities[0].net_cents,5500);
 const cost=s.expenses[0];applyLocalFinance(u,buildFinancePlan({action:'expense_archive',target_id:cost.id},localFinanceState(u),u,randomUUID()),'MANUAL');s=financeSnapshot(localFinanceState(u));assert.equal(s.balance_cents,8000);assert.equal(s.extra_cost_month_cents,0);
 assert.throws(()=>applyLocalFinance(user(),p,'VOICE')); 
});
test('custo isolado e renda futura mantêm contexto e não antecipam recebimento',()=>{
 const u=user();for(const c of [{action:'income_upsert' as const,description:'Freela previsto',activity:'Uber',amount_cents:8000,status:'PREVISTO' as const,date:today},{action:'extra_activity' as const,activity:'uber',cost_cents:2500,date:today}])applyLocalFinance(u,buildFinancePlan(c,localFinanceState(u),u,randomUUID()),'MANUAL');
 let s=financeSnapshot(localFinanceState(u));assert.equal(s.balance_cents,-2500);assert.equal(s.extra_expected_month_cents,8000);
 const income=s.documents.find(d=>d.kind==='INCOME')!;applyLocalFinance(u,buildFinancePlan({action:'income_receive',target_id:income.id,date:today},localFinanceState(u),u,randomUUID()),'MANUAL');s=financeSnapshot(localFinanceState(u));assert.equal(s.balance_cents,5500);assert.equal(s.income_activities.length,1);assert.equal(s.income_activities[0].net_cents,5500);
});
test('IA verifica ganho e custo literais e impede troca dos valores e Uber passageiro',()=>{
 const text='Ganhei 80 reais fazendo Uber e gastei 25 reais de gasolina';
 const d:FinanceDraft={intent:'COMMAND',confidence:'ALTA',question:'',query:'',target_excerpt:'',date_evidence:[],money_evidence:[{field:'amount_cents',excerpt:'80 reais'},{field:'cost_cents',excerpt:'25 reais'}],command:{action:'extra_activity',activity:'Uber',amount_cents:8000,cost_cents:2500}};
 assert.equal(draftCommand(d,text,empty).cost_cents,2500);
 assert.equal(draftCommand({...d,command:{action:'extra_activity',activity:'pintura',amount_cents:20000,cost_cents:5000},money_evidence:[{field:'amount_cents',excerpt:'200 reais'},{field:'cost_cents',excerpt:'50 reais'}]},'Ganhei 200 reais prestando serviço de pintura e gastei 50 reais com material',empty).cost_cents,5000);
 assert.equal(draftCommand({...d,command:{action:'extra_activity',activity:'Uber',amount_cents:8000,cost_cents:8000},money_evidence:[{field:'amount_cents',excerpt:'80 reais'},{field:'cost_cents',excerpt:'80 reais'}]},'Ganhei 80 reais fazendo Uber e gastei 80 reais de gasolina',empty).cost_cents,8000);
 assert.equal(draftCommand({...d,command:{action:'extra_activity',activity:'Uber',amount_cents:8000},money_evidence:[{field:'amount_cents',excerpt:'80 reais'}]},'Acabei de ganhar 80 reais fazendo Uber',empty).amount_cents,8000);
 assert.equal(draftCommand({...d,command:{action:'extra_activity',activity:'Uber',cost_cents:2500},money_evidence:[{field:'cost_cents',excerpt:'25 reais'}]},'Acabei de gastar 25 reais fazendo Uber',empty).cost_cents,2500);
 assert.throws(()=>draftCommand({...d,command:{action:'extra_activity',activity:'Uber',amount_cents:2500,cost_cents:8000},money_evidence:[{field:'amount_cents',excerpt:'25 reais'},{field:'cost_cents',excerpt:'80 reais'}]},text,empty));
 assert.throws(()=>draftCommand({...d,command:{action:'extra_activity',activity:'Uber',cost_cents:2500},money_evidence:[{field:'cost_cents',excerpt:'25 reais'}]},'Paguei 25 reais para pegar Uber',empty));
 assert.throws(()=>draftCommand({...d,command:{action:'extra_activity',activity:'Uber',amount_cents:8000,status:'PREVISTO'},money_evidence:[{field:'amount_cents',excerpt:'80 reais'}]},'Vou ganhar 80 reais fazendo Uber',empty));
});
test('boleto permitido e categorias fixas excluem lazer, hospedagem e supermercado',()=>{
 const p=adminInput({id:randomUUID(),entry_date:today,description:'Aluguel',category:'Aluguel / moradia',amount_cents:10000,details:{payment_method:'BOLETO'}});assert.equal(p.details.payment_method,'BOLETO');
 for(const c of ['Lazer','Viagem / hospedagem','Supermercado'])assert.ok(!(fixedCategories as readonly string[]).includes(c));
 assert.throws(()=>buildFinancePlan({action:'profile_upsert',profile:{has_extra_income:'sim' as unknown as boolean}},empty,user(),randomUUID()));
});
