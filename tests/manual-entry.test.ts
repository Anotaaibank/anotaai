import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {manualExpenseCommand} from '../lib/manual-expense.ts';
import {buildFinancePlan,financeSnapshot,readFinance,signFinance} from '../lib/finance.ts';
import {applyLocalFinance,localFinanceState} from '../lib/finance-store.ts';
import {registerLocal} from '../lib/local-db.ts';
import {brazilDay,monthlyDates} from '../lib/model.ts';

process.env.ANOTA_DATABASE_PATH=':memory:';
const today=brazilDay();
const user=()=>registerLocal(randomUUID()+'@example.test','manual-entry-test-password','Teste manual').user.id;
const input={monthly:false,description:'Almoço',category:'Restaurante',amount:'25,80',date:today,status:'REALIZADO' as const,details:{payment_method:'PIX'}};
function confirmed(u:string,command:Parameters<typeof buildFinancePlan>[0]){
 const plan=buildFinancePlan(command,localFinanceState(u),u,randomUUID()),token=signFinance(plan,u,'manual-entry-test-key');
 applyLocalFinance(u,readFinance(token,u,'manual-entry-test-key'),'MANUAL');return plan;
}

test('cadastro manual: recebimento e saída avulsa só mudam caixa após confirmação, sem duplicação',()=>{
 const u=user();confirmed(u,{action:'income_upsert',description:'Venda recebida',amount_cents:80000,date:today,status:'REALIZADO'});
 const command=manualExpenseCommand(input),plan=buildFinancePlan(command,localFinanceState(u),u,randomUUID());
 assert.equal(financeSnapshot(localFinanceState(u)).balance_cents,80000);
 assert.equal(plan.expenses.length,1);assert.equal(plan.documents.length,0);
 const token=signFinance(plan,u,'manual-entry-test-key'),signed=readFinance(token,u,'manual-entry-test-key');
 applyLocalFinance(u,signed,'MANUAL');assert.equal(applyLocalFinance(u,signed,'MANUAL').replayed,true);
 assert.equal(localFinanceState(u).expenses.length,1);assert.equal(financeSnapshot(localFinanceState(u)).balance_cents,77420);
 assert.throws(()=>readFinance(token,user(),'manual-entry-test-key'));
});

test('cadastro manual: avulsa futura não cria recorrência nem abate caixa; data futura paga é recusada',()=>{
 const u=user(),date=monthlyDates(today,2)[1];
 const command=manualExpenseCommand({...input,description:'Internet',category:'Internet / telefone',date,status:'PREVISTO'});
 const plan=confirmed(u,command);assert.equal(plan.documents.length,0);assert.equal(plan.expenses.length,1);
 assert.equal(plan.expenses[0].payload.entry_date,date);assert.equal(plan.expenses[0].payload.status,'PREVISTO');
 assert.equal(financeSnapshot(localFinanceState(u)).balance_cents,0);
 assert.throws(()=>buildFinancePlan(manualExpenseCommand({...input,date}),localFinanceState(u),u,randomUUID()));
});

test('cadastro manual: fixa cria regra contínua, valor mensal integral e vencimentos curtos corretos',()=>{
 const u=user(),command=manualExpenseCommand({...input,monthly:true,description:'Aluguel',category:'Aluguel / moradia',amount:'1.500,00',date:'2027-01-31'}),plan=confirmed(u,command);
 assert.equal(command.count,undefined);assert.equal(plan.documents[0].document.kind,'BILL_RULE');assert.equal(plan.documents[0].document.details.day,31);
 assert.equal(plan.expenses.length,12);assert.deepEqual(plan.expenses.slice(0,3).map(e=>e.payload.entry_date),['2027-01-31','2027-02-28','2027-03-31']);
 assert.ok(plan.expenses.every(e=>e.payload.kind==='MENSAL'&&e.payload.status==='PREVISTO'&&e.payload.amount_cents===150000));
 assert.equal(financeSnapshot(localFinanceState(u)).balance_cents,0);
 assert.throws(()=>manualExpenseCommand({...input,amount:'inválido'}));
});
