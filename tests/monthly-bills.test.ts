import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {quickMonthlyBillDraft,nextMonthlyDay,recurringDay} from '../lib/monthly-bills.ts';
import {prepareFinanceDraft,quickFinanceDraft} from '../lib/finance-ai.ts';
import {readWhatsappEdit,signWhatsappEdit,quickEditedPlan} from '../lib/whatsapp-edit.ts';
import {buildFinancePlan,financeSnapshot} from '../lib/finance.ts';
import {financeDate} from '../lib/finance-date.ts';
import {quickPlannedExpenseDraft} from '../lib/assistant-fast.ts';
const today='2026-10-14',user=randomUUID(),sender='5511999999999',state={documents:[],expenses:[]},key='synthetic-edit-test-only';
test('repetir valor e vencimento reforça uma conta; dias conflitantes ou contas distintas não são unidos',()=>{
 const text='Agenda meu carro, 1500 reais todo dia 5, coloca isso como pagamento, todo dia cinco, 1500 reais.',draft=quickMonthlyBillDraft(text,today);assert.ok(draft);assert.equal(prepareFinanceDraft(draft,text,state,user,randomUUID(),today).expenses.length,12);
 assert.throws(()=>recurringDay('Pago carro 1500 reais todo dia 5, todo dia 6'),/dias diferentes/);
 const list='Pago carro 100 reais todo dia 5; pago internet 100 reais todo dia 20',items=quickFinanceDraft(list,today);assert.ok(items?.items);const plan=prepareFinanceDraft(items,list,state,user,randomUUID(),today);assert.equal(plan.documents.length,2);assert.equal(plan.expenses.length,24);
});
test('mensal com valor e dia não pergunta quantidade, não reparte o valor e não reduz caixa',()=>{
 for(const source of ['Pago meu carro todo dia 22 valor de 1500 reais agenda para mim.','Lança meu aluguel de 1200 reais todo dia 5.','Cadastra internet todo dia dez por 100 reais.','Agenda minha academia de 80 reais todo mês dia 15.']){
  const draft=quickMonthlyBillDraft(source,today);assert.ok(draft,source);const plan=prepareFinanceDraft(draft,source,state,user,randomUUID(),today);assert.equal(plan.expenses.length,12);assert.equal(plan.documents[0].document.kind,'BILL_RULE');assert.ok(plan.expenses.every(e=>e.payload.amount_cents===plan.documents[0].document.amount_cents&&e.payload.status==='PREVISTO'));assert.equal(financeSnapshot(state,today).balance_cents,0);
 }
 assert.equal(quickMonthlyBillDraft('Gastei 25 reais de sorvete.',today),null);assert.equal(quickMonthlyBillDraft('Pago meu carro em 3 parcelas de 1500 reais.',today),null);assert.equal(quickMonthlyBillDraft('Como cadastrar aluguel todo dia 22 de 1500 reais?',today),null);
});
test('conta a pagar avulsa não vira mensal pelo nome internet ou aluguel',()=>{
 for(const source of ['Vou pagar 80 reais de internet dia 22, lança como conta a pagar.','Agenda 1200 reais de aluguel amanhã.']){const draft=quickPlannedExpenseDraft(source,today);assert.ok(draft,source);const plan=prepareFinanceDraft(draft,source,state,user,randomUUID(),today);assert.equal(plan.expenses.length,1);assert.equal(plan.expenses[0].payload.status,'PREVISTO');assert.equal(plan.expenses[0].payload.kind,'PESSOAL');assert.equal(plan.documents.length,0);}
});
test('datas curtas, relativas e por extenso mantêm o calendário brasileiro',()=>{
 assert.equal(financeDate('dia 22',today,true),'2026-10-22');assert.equal(financeDate('dia cinco',today,true),'2026-11-05');assert.equal(financeDate('dia dez do mês onze',today,true),'2026-11-10');assert.equal(financeDate('próxima segunda-feira',today,true),'2026-10-19');assert.equal(financeDate('dia 10 do mês que vem',today,true),'2026-11-10');
 assert.equal(financeDate('amanhã às três da tarde',today,true),'2026-10-15');
});
test('dia 31 fica no fim de fevereiro e volta para 31 em março, sem alterar o dia da regra',()=>{
 assert.equal(nextMonthlyDay(22,today),'2026-10-22');assert.equal(nextMonthlyDay(5,today),'2026-11-05');const source='Agenda meu carro todo dia 31 de 1500 reais.';const d=quickMonthlyBillDraft(source,'2027-02-01')!;const p=prepareFinanceDraft(d,source,state,user,randomUUID(),'2027-02-01');assert.equal(p.expenses[0].payload.entry_date,'2027-02-28');assert.equal(p.expenses[1].payload.entry_date,'2027-03-31');assert.equal(p.documents[0].document.details.day,31);
});
test('edição é assinada, separada da confirmação, vinculada à conta e número e vence em dez minutos',()=>{
 const source='Lança 50 reais de gasolina.',plan=buildFinancePlan({action:'expense_create',description:'Gasolina',amount_cents:5000},state,user,randomUUID(),today),token=signWhatsappEdit({plan,source},user,sender,key,1000);
 const edit=readWhatsappEdit(token,user,sender,key,2000),replacement=quickEditedPlan(edit,'O valor certo é 80 reais',state,user,randomUUID(),today)!;assert.equal(replacement.expenses[0].payload.amount_cents,8000);assert.equal(replacement.expenses[0].payload.category,'Combustível');assert.notEqual(replacement.id,plan.id);
 for(const [v,u,s,at]of [[token+'x',user,sender,2000],[token,randomUUID(),sender,2000],[token,user,'5511988888888',2000],[token,user,sender,601001]] as const)assert.throws(()=>readWhatsappEdit(v,u,s,key,at));
});
