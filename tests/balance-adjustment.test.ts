import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {registerLocal} from '../lib/local-db.ts';
import {applyLocalFinance,localFinanceState} from '../lib/finance-store.ts';
import {buildFinancePlan,financeSnapshot,readFinance,signFinance,validateBalancePlan,type FinanceCommand} from '../lib/finance.ts';
import {extractFinance,prepareFinanceDraft} from '../lib/finance-ai.ts';
import {assistantTurn} from '../lib/assistant-turn.ts';
import {financeReport} from '../lib/finance-report.ts';
import {brazilDay} from '../lib/model.ts';
process.env.ANOTA_DATABASE_PATH=':memory:';
const today=brazilDay(),noModel:typeof fetch=async()=>{throw Error('Modelo não esperado');};
function seed(){const user=registerLocal(randomUUID()+'@example.test','balance-audit-only','Teste saldo').user.id;
 const save=(c:FinanceCommand)=>{const p=buildFinancePlan(c,localFinanceState(user),user,randomUUID(),today);applyLocalFinance(user,p,'MANUAL');return p;};
 save({action:'profile_upsert',profile:{opening_balance_cents:100000,opening_date:today,salary_cents:400000}});
 save({action:'income_upsert',description:'Receita anterior',amount_cents:30000,date:today});
 save({action:'expense_create',description:'Gasto anterior',amount_cents:20000,category:'Supermercado',date:today});
 return {user,save};
}
test('ajuste absoluto preserva histórico, renda, salário e saldo inicial; confirmar novamente é idempotente',()=>{
 const {user,save}=seed(),before=localFinanceState(user),plan=buildFinancePlan({action:'balance_adjust',balance_cents:150000},before,user,randomUUID(),today);
 assert.equal(financeSnapshot(before,today).balance_cents,110000);
 assert.equal(localFinanceState(user).documents.length,before.documents.length);
 const secret='synthetic-balance-secret',signed=signFinance(plan,user,secret);
 assert.throws(()=>readFinance(signed,randomUUID(),secret));assert.throws(()=>readFinance(signed,user,secret,Date.now()+700000));
 applyLocalFinance(user,readFinance(signed,user,secret),'VOICE');
 const after=localFinanceState(user),snapshot=financeSnapshot(after,today);
 assert.equal(snapshot.balance_cents,150000);assert.equal(snapshot.adjustment_cents,40000);assert.equal(snapshot.profile.opening_balance_cents,100000);assert.equal(snapshot.profile.salary_cents,400000);
 assert.equal(snapshot.extra_received_month_cents,30000);assert.deepEqual(after.expenses,before.expenses);
 assert.equal(after.documents.filter(d=>d.kind==='INCOME').length,1);
 assert.equal((applyLocalFinance(user,plan,'VOICE') as {replayed?:boolean}).replayed,true);
 assert.equal(localFinanceState(user).documents.filter(d=>d.kind==='BALANCE_ADJUSTMENT').length,1);
 save({action:'income_upsert',description:'Renda nova',amount_cents:50000,date:today});
 save({action:'expense_create',description:'Sorvete',amount_cents:2500,category:'Restaurante',date:today});
 assert.equal(financeSnapshot(localFinanceState(user),today).balance_cents,197500);
 assert.match(financeReport(localFinanceState(user),{topic:'saldo',explain:true},today).answer,/ajustes de conciliação/);
});
test('saldo muda entre resumo e confirmação: rejeita sem escrever, inclusive após nova despesa de outro fluxo',()=>{
 const {user,save}=seed(),plan=buildFinancePlan({action:'balance_adjust',balance_cents:150000},localFinanceState(user),user,randomUUID(),today);
 save({action:'expense_create',description:'Compra entre resumo e confirmação',amount_cents:1000,category:'Supermercado',date:today});
 assert.throws(()=>applyLocalFinance(user,plan,'WHATSAPP'),/saldo mudou/);
 assert.equal(localFinanceState(user).documents.filter(d=>d.kind==='BALANCE_ADJUSTMENT').length,0);
 const fresh=buildFinancePlan({action:'balance_adjust',balance_cents:150000},localFinanceState(user),user,randomUUID(),today);applyLocalFinance(user,fresh,'WHATSAPP');assert.equal(financeSnapshot(localFinanceState(user)).balance_cents,150000);
});
test('servidor recusa ajuste adulterado, alteração de ajuste histórico e alvo pertencente a outra conta',()=>{
 const {user}=seed(),state=localFinanceState(user),plan=buildFinancePlan({action:'balance_adjust',balance_cents:150000},state,user,randomUUID(),today);
 for(const mutate of [(p:typeof plan)=>{p.documents[0].document.details.delta_cents=123;},(p:typeof plan)=>{p.documents[0].document.details.basis_hash='0'.repeat(32);},(p:typeof plan)=>{p.documents[0].document.status='PREVISTO';},(p:typeof plan)=>{p.documents[0].document.details.target_balance_cents='150000';}]){const bad=structuredClone(plan);mutate(bad);assert.throws(()=>applyLocalFinance(user,bad,'MANUAL'));}
 applyLocalFinance(user,plan,'MANUAL');const stored=localFinanceState(user).documents.find(d=>d.kind==='BALANCE_ADJUSTMENT')!;
 assert.throws(()=>buildFinancePlan({action:'document_archive',target_id:stored.id},localFinanceState(user),user,randomUUID(),today));
 assert.throws(()=>validateBalancePlan({...plan,id:randomUUID(),documents:[{document:{...plan.documents[0].document,active:false},expected:stored.updated_at}]},localFinanceState(user)),/históricos/);
 const other=seed();assert.throws(()=>applyLocalFinance(other.user,plan,'MANUAL'));assert.equal(financeSnapshot(localFinanceState(other.user)).balance_cents,110000);
});
test('zero, negativo e aumento são alvos absolutos; correção explícita de saldo inicial continua distinta',async()=>{
 const {user}=seed();
 for(const [text,expected]of [['Ajusta meu saldo atual para zero reais',0],['Ajusta meu saldo atual para menos duzentos reais',-20000],['Atualiza meu saldo de 1.100 para 1.500',150000]] as const){const state=localFinanceState(user),d=await extractFinance(text,state,'synthetic',today,noModel),p=prepareFinanceDraft(d,text,state,user,randomUUID(),today);assert.equal(p.documents[0].document.kind,'BALANCE_ADJUSTMENT');assert.equal(p.documents[0].document.details.target_balance_cents,expected);}
 const initial=buildFinancePlan({action:'profile_upsert',profile:{opening_balance_cents:150000}},localFinanceState(user),user,randomUUID(),today);assert.equal(initial.documents[0].document.kind,'PROFILE');
 const r=await assistantTurn({user,text:'Corrige meu saldo atual para 1500 reais. Isso é ajuste, não receita.',state:localFinanceState(user),key:'synthetic',secret:'synthetic',today,transport:noModel});assert.ok(r.pending,r.answer);
});
