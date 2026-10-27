import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {extractFinance,prepareFinanceDraft,type FinanceDraft} from '../lib/finance-ai.ts';
import {sourceWithVerifiedTarget,naturalFinanceTurn} from '../lib/conversation-language.ts';
import type {FinanceState,FinanceCommand} from '../lib/finance.ts';
const today='2026-10-27',user=randomUUID(),target=randomUUID();
const state:FinanceState={expenses:[],documents:[{id:target,kind:'INCOME',description:'Receita não citada no pedido',date:'2026-10-20',amount_cents:4300,status:'REALIZADO',active:true,details:{},updated_at:'2026-10-27T12:00:00Z'}]};
test('IW-D modelo substituído não transforma seu próprio UUID em evidência do pedido',async()=>{
 let calls=0;const text='Esse crédito ficou confuso aqui.',before=JSON.stringify(state),transport:typeof fetch=async()=>{calls++;return Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({intent:'COMMAND',command:{action:'document_archive',target_id:target},question:'',query:'',confidence:'ALTA',target_excerpt:target,money_evidence:[],date_evidence:[]})}]}]});};
 const draft=await extractFinance(text,state,'synthetic-only',today,transport);assert.equal(calls,1);assert.equal(sourceWithVerifiedTarget(text,draft),text);assert.throws(()=>prepareFinanceDraft(draft,sourceWithVerifiedTarget(text,draft),state,user,randomUUID(),today));assert.equal(JSON.stringify(state),before);
});
test('IW-D só objeto original resolvido localmente mantém prova privada de alvo',async()=>{
 const text='cancela a entrada do dia 20',draft=await extractFinance(text,state,'synthetic-only',today,async()=>{throw Error('Local case must not call model');});assert.equal(draft.intent,'COMMAND');assert.match(sourceWithVerifiedTarget(text,draft),new RegExp(target));const clone=JSON.parse(JSON.stringify(draft)) as FinanceDraft;assert.equal(sourceWithVerifiedTarget(text,clone),text);assert.equal(sourceWithVerifiedTarget('cancela a entrada do dia 19',draft),'cancela a entrada do dia 19');const command=draft.command as FinanceCommand;const old=command.target_id;command.target_id=randomUUID();assert.equal(sourceWithVerifiedTarget(text,draft),text);command.target_id=old;const action=command.action;command.action='income_receive';assert.equal(sourceWithVerifiedTarget(text,draft),text);command.action=action;command.reserve_id=randomUUID();assert.equal(sourceWithVerifiedTarget(text,draft),text);delete command.reserve_id;const augmented=sourceWithVerifiedTarget(text,draft);assert.throws(()=>prepareFinanceDraft(clone,augmented,state,user,randomUUID(),today));assert.throws(()=>prepareFinanceDraft(draft,augmented,{...state,documents:state.documents.map(d=>({...d,amount_cents:d.amount_cents+1}))},user,randomUUID(),today));
});
test('IW-D contexto local de compromisso continua resolvendo alvo sem prova enviada pelo modelo',()=>{
 const event={...state.documents[0],id:randomUUID(),kind:'APPOINTMENT' as const,description:'Consulta',amount_cents:0,details:{time:'15:00'}},text='cancela a consulta',own={documents:[event],expenses:[]},draft=naturalFinanceTurn(text,own,today)!;assert.equal(draft.intent,'COMMAND');const source=sourceWithVerifiedTarget(text,draft);assert.match(source,new RegExp(event.id));assert.equal(prepareFinanceDraft(draft,source,own,user,randomUUID(),today).documents[0].document.id,event.id);
});
