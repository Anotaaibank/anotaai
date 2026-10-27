import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {extractFinance,prepareFinanceDraft} from '../lib/finance-ai.ts';
import {sourceWithVerifiedTarget} from '../lib/conversation-language.ts';
import type {FinanceState} from '../lib/finance.ts';
const today='2026-10-27',user=randomUUID();
function income(date:string,amount_cents=18000,description='Comissão'):FinanceState['documents'][number]{return {id:randomUUID(),kind:'INCOME',description,date,amount_cents,status:'REALIZADO',active:true,details:{},updated_at:'2026-10-27T12:00:00Z'};}
async function resolve(text:string,documents:FinanceState['documents']){const state={documents,expenses:[]},before=JSON.stringify(state),draft=await extractFinance(text,state,'synthetic-only',today,async()=>{throw Error('No external interpretation in local linked-day test');});assert.equal(JSON.stringify(state),before);return {draft,state};}

test('IW-D holdout: referência de25 ligada a comissão conhecida distingue180reais',async()=>{
 const target=income('2026-10-25'),{draft,state}=await resolve('Tira a comissão de 25, a que foi de 180 reais.',[target,income('2026-10-20',2500)]);assert.equal(draft.intent,'COMMAND',draft.question);const plan=prepareFinanceDraft(draft,sourceWithVerifiedTarget('Tira a comissão de 25, a que foi de 180 reais.',draft),state,user,randomUUID(),today);assert.equal(plan.documents[0].document.id,target.id);assert.equal(plan.documents[0].document.amount_cents,18000);assert.equal(plan.documents[0].document.active,false);
});
test('IW-D referência de dia em meses/anos diferentes não escolhe mêsatual ou ordem',async()=>{
 const {draft}=await resolve('Tira a comissão de 25, a que foi de 180 reais.',[income('2025-09-25'),income('2026-10-25')]);assert.equal(draft.intent,'CLARIFY');assert.match(draft.question,/25\/09\/2025/);assert.match(draft.question,/25\/10\/2026/);assert.match(draft.question,/180,00/);assert.match(draft.question,/pedido completo/);
});
test('IW-D mês/ano explícitos permanecem soberanos na referência monetária relativa',async()=>{
 const target=income('2025-09-25');for(const text of ['Tira a comissão de 25/09/2025, a que foi de 180 reais.','Tira a comissão do dia 25 de setembro de 2025, a que foi de 180 reais.']){const {draft,state}=await resolve(text,[target,income('2026-10-25')]);assert.equal(draft.intent,'COMMAND',draft.question);assert.equal(prepareFinanceDraft(draft,sourceWithVerifiedTarget(text,draft),state,user,randomUUID(),today).documents[0].document.id,target.id);}
});
test('IW-D R$25 ou25reais nunca viramdia25 por existir registro nesse dia',async()=>{
 for(const text of ['Tira a comissão de R$25, a que foi de 180 reais.','Tira a comissão de 25 reais, a que foi de 180 reais.','Tira a comissão de 25, a que foi de 180.']){const {draft}=await resolve(text,[income('2026-10-25'),income('2026-10-20',2500)]);assert.equal(draft.intent,'CLARIFY');assert.equal(draft.command,null);assert.match(draft.question,/25,00/);assert.match(draft.question,/180,00/);}
});
test('IW-D valor25 no dia20 e valor25 no dia25 distinguem valor e referência de dia',async()=>{
 const target=income('2026-10-20',2500),other=income('2026-10-25',2500);for(const [text,row]of [['cancela a entrada da comissão de 25 reais do dia 20',target],['Tira a comissão de 25, a que foi de 25 reais.',other]] as const){const {draft,state}=await resolve(text,[target,other]);assert.equal(draft.intent,'COMMAND',draft.question);assert.equal(prepareFinanceDraft(draft,sourceWithVerifiedTarget(text,draft),state,user,randomUUID(),today).documents[0].document.id,row.id);}
});
test('IW-D sem entrada conhecida nesse dia conserva diaevalor no esclarecimento',async()=>{
 const {draft}=await resolve('Tira a comissão de 25, a que foi de 180 reais.',[income('2026-10-20')]);assert.equal(draft.intent,'CLARIFY');assert.match(draft.question,/25/);assert.match(draft.question,/180,00/);assert.doesNotMatch(draft.question,/apenas um valor/);
});

test('IW-D referência ligada não pula autoria exigida de última entrada',async()=>{
 const {draft}=await resolve('Tira a última entrada da comissão de 25, a que foi de 180 reais.',[income('2026-10-25')]);assert.equal(draft.intent,'CLARIFY');assert.equal(draft.command,null);
});
