import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {extractFinance,prepareFinanceDraft} from '../lib/finance-ai.ts';
import {sourceWithVerifiedTarget} from '../lib/conversation-language.ts';
import type {FinanceState} from '../lib/finance.ts';

const today='2026-10-27',owner=randomUUID();
function income(description:string,status:'REALIZADO'|'PREVISTO',date=status==='REALIZADO'?'2026-10-25':'2026-11-25'):FinanceState['documents'][number]{
 return {id:randomUUID(),kind:'INCOME',description,status,date,amount_cents:18000,active:true,details:{},updated_at:'2026-10-27T12:00:00Z'};
}
async function draft(text:string,documents:FinanceState['documents']){
 const state={documents,expenses:[]},before=JSON.stringify(state);
 const result=await extractFinance(text,state,'synthetic-only',today,async()=>{throw Error('No model calls in status-selector regression');});
 assert.equal(JSON.stringify(state),before,'selection/preparation must not mutate state');
 return {result,state};
}
async function selects(text:string,target:FinanceState['documents'][number],decoy:FinanceState['documents'][number]){
 for(const documents of [[decoy,target],[target,decoy]]){
  const {result,state}=await draft(text,documents);
  assert.equal(result.intent,'COMMAND',result.question);
  const plan=prepareFinanceDraft(result,sourceWithVerifiedTarget(text,result),state,owner,randomUUID(),today);
  assert.equal(plan.documents[0].document.id,target.id,'status qualifier must dominate a similarly named row of the opposite status');
  assert.equal(plan.documents[0].document.active,false);
  assert.equal(plan.documents[0].document.status,target.status);
 }
}

test('linked day: planned qualifier cannot select an already received income named prevista',async()=>{
 const target=income('Comissão','PREVISTO');
 for(const qualifier of ['prevista','agendada'])await selects('Tira a comissão '+qualifier+' de 25, a que foi de 180 reais.',target,income('Comissão '+qualifier,'REALIZADO'));
});

test('linked day: received qualifier cannot select a planned income named recebida',async()=>{
 const target=income('Comissão','REALIZADO');
 for(const qualifier of ['recebida','realizada'])await selects('Tira a comissão '+qualifier+' de 25, a que foi de 180 reais.',target,income('Comissão '+qualifier,'PREVISTO'));
});

test('linked day: grammar vou receber and recebi select the corresponding status',async()=>{
 await selects('Tira a entrada que vou receber da comissão de 25, a que foi de 180 reais.',income('Comissão','PREVISTO'),income('Que vou receber da comissão','REALIZADO'));
 await selects('Tira a entrada que recebi da comissão de 25, a que foi de 180 reais.',income('Comissão','REALIZADO'),income('Que recebi da comissão','PREVISTO'));
});

test('linked day: no eligible planned income asks rather than proposing an opposite-status lookalike',async()=>{
 const {result}=await draft('Tira a comissão prevista de 25, a que foi de 180 reais.',[income('Comissão prevista','REALIZADO')]);
 assert.equal(result.intent,'CLARIFY');assert.equal(result.command,null);
});

test('linked day: status word inside an explicitly introduced description is not a status qualifier',async()=>{
 const target=income('Comissão prevista','REALIZADO');
 await selects('Tira a entrada da comissão prevista de 25, a que foi de 180 reais.',target,income('Comissão','PREVISTO'));
});

test('linked day and explicit date apply the same status selector and eligibility filter',async()=>{
 const target=income('Comissão','PREVISTO','2026-10-25'),wrong=income('Comissão prevista','REALIZADO');
 for(const text of ['Tira a comissão prevista de 25, a que foi de 180 reais.','Tira a comissão prevista do dia 25 de outubro de 2026, a que foi de 180 reais.'])await selects(text,target,wrong);
 const inactive={...target,id:randomUUID(),active:false},futureReceived=income('Comissão prevista','REALIZADO','2026-11-25');
 const {result}=await draft('Tira a comissão prevista de 25, a que foi de 180 reais.',[inactive,futureReceived]);
 assert.equal(result.intent,'CLARIFY');assert.equal(result.command,null);
});
