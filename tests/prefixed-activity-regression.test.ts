import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {extractFinance,prepareFinanceDraft} from '../lib/finance-ai.ts';
import {buildFinancePlan,financeSnapshot,type FinanceState} from '../lib/finance.ts';
import {applyLocalFinance,localFinanceState} from '../lib/finance-store.ts';
import {registerLocal} from '../lib/local-db.ts';
import {personalSummary} from '../lib/personal-expenses.ts';

process.env.ANOTA_STORAGE='local';process.env.ANOTA_DATABASE_PATH=':memory:';
const today='2026-10-27';
const noModel:typeof fetch=async()=>{throw Error('Caso literal completo não pode depender do modelo');};
async function proposal(text:string,user:string,state:FinanceState=localFinanceState(user)){
 const draft=await extractFinance(text,state,'synthetic-only',today,noModel);assert.equal(draft.intent,'COMMAND',draft.question);
 return prepareFinanceDraft(draft,text,state,user,randomUUID(),today);
}
function account(){const user=registerLocal(randomUUID()+'@example.test','synthetic-password','Teste isolado').user.id;
 applyLocalFinance(user,buildFinancePlan({action:'profile_upsert',profile:{opening_balance_cents:0,opening_date:'2026-10-01'}},localFinanceState(user),user,randomUUID(),today),'MANUAL');return user;}

test('IW-01: prefixos preservam atividade, data literal, custo separado e líquido sem duplicação',async()=>{
 const cases=[
  {income:'Entrada 96,40 reais trabalhei de Uber ontem',expense:'Saída 18,90 reais de gasolina fazendo Uber ontem',activity:'Uber',gross:9640,cost:1890,date:'2026-10-26'},
  {income:'Entrada 150 reais fiz um bico de garçom',expense:'Saída 25 reais de condução para o bico de garçom',activity:'garçom',gross:15000,cost:2500,date:today},
  {income:'Entrada 300 reais prestei serviço de pintura',expense:'Saída 70 reais material para o serviço de pintura',activity:'pintura',gross:30000,cost:7000,date:today},
 ];
 for(const c of cases){const user=account(),before=JSON.stringify(localFinanceState(user)),income=await proposal(c.income,user),cost=await proposal(c.expense,user);
  assert.equal(JSON.stringify(localFinanceState(user)),before,'Proposta não grava');
  assert.equal(income.documents.length,1);assert.equal(income.documents[0].document.details.activity,c.activity);assert.equal(income.documents[0].document.date,c.date);
  assert.equal(cost.expenses.length,1);assert.equal(cost.expenses[0].payload.details.income_activity,c.activity);assert.equal(cost.expenses[0].payload.entry_date,c.date);
  applyLocalFinance(user,income,'WHATSAPP');applyLocalFinance(user,cost,'WHATSAPP');
  assert.equal(applyLocalFinance(user,income,'WHATSAPP').replayed,true);assert.equal(applyLocalFinance(user,cost,'WHATSAPP').replayed,true);
  const state=localFinanceState(user),snapshot=financeSnapshot(state,today);assert.equal(snapshot.balance_cents,c.gross-c.cost);assert.equal(snapshot.extra_net_month_cents,c.gross-c.cost);assert.equal(snapshot.extra_cost_month_cents,c.cost);assert.equal(snapshot.paid_month_cents,0);assert.equal(personalSummary(state.expenses).amount_cents,0);
  assert.equal(snapshot.income_activities.find(a=>a.activity===c.activity)?.net_cents,c.gross-c.cost);
  const other=account();assert.throws(()=>applyLocalFinance(other,cost,'WHATSAPP'));assert.equal(financeSnapshot(localFinanceState(other),today).balance_cents,0);
 }
});

test('IW-01: lista prefixada mantém o vínculo de cada item e soma o caixa uma única vez',async()=>{
 const user=account(),p=await proposal('Entrada 200 reais trabalhei de garçom; Saída 32 reais transporte para o bico de garçom',user);
 assert.equal(p.documents.length,1);assert.equal(p.expenses.length,1);assert.equal(p.documents[0].document.details.activity,'garçom');assert.equal(p.expenses[0].payload.details.income_activity,'garçom');
 applyLocalFinance(user,p,'VOICE');assert.equal(applyLocalFinance(user,p,'VOICE').replayed,true);const snapshot=financeSnapshot(localFinanceState(user),today);assert.equal(snapshot.balance_cents,16800);assert.equal(snapshot.extra_net_month_cents,16800);assert.equal(snapshot.paid_month_cents,0);
});

test('IW-01: passageiro, salário e venda pessoal não ganham atividade de trabalho por inferência',async()=>{
 const user=account();
 for(const text of ['Saída 35 reais de Uber para ir ao trabalho','Saída 25 reais peguei Uber como passageiro','Saída 100 reais serviço de manicure']){const p=await proposal(text,user);assert.equal(p.expenses.length,1);assert.equal(p.expenses[0].payload.details.income_activity,undefined);}
 const salary=await proposal('Entrada 6000 reais salário',user);assert.equal(salary.documents[0].document.details.salary,true);assert.equal(salary.documents[0].document.details.activity,undefined);
 const sale=await proposal('Entrada 400 reais vendi minha bicicleta',user);assert.equal(sale.documents[0].document.details.activity,undefined);
});
