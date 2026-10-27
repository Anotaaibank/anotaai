import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdirSync,writeFileSync} from 'node:fs';
import {extractFinance,localFinanceInterpretation,prepareFinanceDraft,type FinanceDraft} from '../lib/finance-ai.ts';
import {sourceWithVerifiedTarget} from '../lib/conversation-language.ts';
import {buildFinancePlan,financeSnapshot,readFinance,type FinanceCommand,type FinancePlan,type FinanceState} from '../lib/finance.ts';
import {registerLocal} from '../lib/local-db.ts';
import {applyLocalFinance,localFinanceState} from '../lib/finance-store.ts';
import {whatsappPending,confirmedWhatsappPlan,cancelledWhatsappPlan} from '../lib/whatsapp-finance.ts';
import {whatsappConversationContext} from '../lib/whatsapp-context.ts';
import type {Inbox} from '../lib/whatsapp-store.ts';

// Independent QA matrix fixed BEFORE reading 6e8bae1. No ASR, paid model,
// provider, production data, or real WhatsApp. Fallback is explicitly UNEVALUATED.
process.env.ANOTA_STORAGE='local';process.env.ANOTA_DATABASE_PATH=':memory:';
const TODAY='2026-10-27',NOW=Date.parse('2026-10-27T15:00:00.000Z');
const SECRET='synthetic-independent-archive-secret-32-chars';
const PHONE_A='5511900000041',PHONE_PARTNER='5511900000042';
const phase=process.env.IW_D_PHASE==='after'?'after':'before';
const observations:Record<string,unknown>[]=[];
function record(row:Record<string,unknown>){
 observations.push(row);mkdirSync('.data',{recursive:true});
 writeFileSync('.data/income-archive-independent-'+phase+'.json',JSON.stringify({
  phase,reference_day:TODAY,clock:NOW,revision:process.env.IW_D_REVISION||'not-specified',
  paid_calls:0,asr_tested:false,real_whatsapp_tested:false,observations
 },null,2));
}
const account=()=>registerLocal(randomUUID()+'@example.invalid','synthetic-qa-password','Pessoa Sintética').user.id;
function seed(){
 const a=account(),b=account(),plans:Record<string,FinancePlan>={};
 const add=(owner:string,name:string,c:FinanceCommand)=>{const p=buildFinancePlan(c,localFinanceState(owner),owner,randomUUID(),TODAY);applyLocalFinance(owner,p,'MANUAL');plans[name]=p;return p;};
 for(const owner of [a,b])add(owner,'profile-'+owner,{action:'profile_upsert',profile:{opening_balance_cents:100000,opening_date:'2026-10-01'}});
 for(const [name,description,amount_cents,date,status] of [
  ['lesson','Aula',7500,'2026-10-26','REALIZADO'],
  ['commission','Comissão',18000,'2026-10-25','REALIZADO'],
  ['commission2','Comissão',22000,'2026-10-27','REALIZADO'],
  ['rent','Aluguel',80000,'2026-10-26','REALIZADO'],
  ['repair','Conserto',30000,'2026-10-28','PREVISTO']
 ] as const)add(a,name,{action:'income_upsert',description,amount_cents,date,status});
 add(a,'matching-expense',{action:'expense_create',description:'Aluguel',category:'Aluguel / moradia',amount_cents:80000,date:'2026-10-26'});
 add(b,'foreign',{action:'income_upsert',description:'Oficina',amount_cents:4000,date:'2026-10-26'});
 return {a,b,plans,id:(name:string)=>plans[name].documents[0].document.id};
}
function receipt(owner:string,plan:FinancePlan,phone=PHONE_A,at=NOW-30000):Inbox{
 return {id:randomUUID(),user_id:owner,provider_id:randomUUID(),sender:phone,type:'text',text:'1',transcript:'1',
  status:'LANCADO',entry_id:null,reply:'Recibo sintético',reply_status:'ACEITO',created_at:new Date(at).toISOString(),
  lease:null,claimed_at:null,...whatsappPending(plan,owner,phone,SECRET,at-1000),confirmation_used:true};
}
function context(rows:Inbox[],owner:string,phone=PHONE_A){return {channel:'whatsapp',...whatsappConversationContext(rows,owner,phone,SECRET,NOW)};}
const noModel:typeof fetch=async()=>{throw Error('UNEXPECTED_MODEL_FALLBACK');};
function fakeModel(target:string){
 let calls=0;
 const draft:FinanceDraft={intent:'COMMAND',command:{action:'document_archive',target_id:target},question:'',query:'',confidence:'ALTA',target_excerpt:target,money_evidence:[],date_evidence:[]};
 const transport:typeof fetch=async url=>{calls++;assert.equal(String(url),'https://api.openai.com/v1/responses');return Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(draft)}]}]});};
 return {transport,calls:()=>calls};
}
const prepare=(draft:FinanceDraft,text:string,state:FinanceState,owner:string)=>prepareFinanceDraft(draft,sourceWithVerifiedTarget(text,draft),state,owner,randomUUID(),TODAY);

for(const text of ['Esse crédito ficou confuso aqui.','Cancela a grana que eu disse.'])test('adversarial model cannot turn its own UUID into target evidence: '+text,async()=>{
 const f=seed(),state=localFinanceState(f.a),before=JSON.stringify(state),model=fakeModel(f.id('rent'));
 const draft=await extractFinance(text,state,'synthetic-only',TODAY,model.transport,undefined,'resumo');
 // A corrected local resolver may stop ambiguity before the supplied model.
 // This safe route does not exercise the model boundary.
 if(model.calls()===0){
  assert.equal(draft.intent,'CLARIFY','A local bypass must ask for the missing target');
  assert.equal(draft.command,null,'Local clarification cannot carry an executable command');
  assert.equal(JSON.stringify(localFinanceState(f.a)),before,'Local clarification must not write');
  record({case:'model-own-target',text,layer:'local clarification before model; model boundary NOT evaluated',calls:0,prepared:false,intent:draft.intent,command:null});
  return;
 }
 assert.equal(model.calls(),1,'SETUP: expected one supplied model response');
 let plan:FinancePlan|undefined,error='';try{plan=prepare(draft,text,state,f.a);}catch(e){error=(e as Error).message;}
 record({case:'model-own-target',text,layer:'model-substituted -> target provenance -> proposal validation',calls:model.calls(),prepared:!!plan,target:plan?.documents[0]?.document.id,error});
 assert.equal(JSON.stringify(localFinanceState(f.a)),before,'preparation must not write');
 assert.equal(plan,undefined,'Unmentioned model UUID became a signed-proposal target inside the same account');
});

test('adversarial foreign UUID stays outside the authenticated account even with appended evidence',async()=>{
 const f=seed(),state=localFinanceState(f.a),beforeA=JSON.stringify(state),beforeB=JSON.stringify(localFinanceState(f.b)),model=fakeModel(f.id('foreign'));
 const text='Esse crédito ficou confuso aqui.',draft=await extractFinance(text,state,'synthetic-only',TODAY,model.transport,undefined,'resumo');
 assert.equal(model.calls(),1);assert.throws(()=>prepare(draft,text,state,f.a));
 assert.equal(JSON.stringify(localFinanceState(f.a)),beforeA);assert.equal(JSON.stringify(localFinanceState(f.b)),beforeB);
 record({case:'model-foreign-target',layer:'server-owned state / target membership',rejected:true,calls:model.calls()});
});

test('legitimate local target requires a fresh signed 1; replay and a second account cannot alter the outcome',async()=>{
 const f=seed(),state=localFinanceState(f.a),beforeB=JSON.stringify(localFinanceState(f.b)),before=JSON.stringify(state);
 const text='Por favor, exclua a receita do aluguel do dia 26.';
 const draft=await extractFinance(text,state,'synthetic-only',TODAY,noModel,undefined,'resumo');
 assert.equal(draft.intent,'COMMAND',draft.question);const plan=prepare(draft,text,state,f.a);
 assert.equal(plan.documents.length,1);assert.equal(plan.documents[0].document.id,f.id('rent'));assert.equal(plan.documents[0].document.active,false);
 assert.equal(JSON.stringify(localFinanceState(f.a)),before);
 const pending={user_id:f.a,sender:PHONE_A,...whatsappPending(plan,f.a,PHONE_A,SECRET,NOW)};
 assert.throws(()=>confirmedWhatsappPlan('1',[pending],f.b,PHONE_A,SECRET,NOW+1));
 assert.throws(()=>confirmedWhatsappPlan('1',[pending],f.a,PHONE_PARTNER,SECRET,NOW+1));
 assert.throws(()=>confirmedWhatsappPlan('1',[pending],f.a,PHONE_A,SECRET,NOW+600001));
 const confirmed=confirmedWhatsappPlan('1',[pending],f.a,PHONE_A,SECRET,NOW+1);assert.ok(confirmed);
 assert.throws(()=>applyLocalFinance(f.b,confirmed.plan,'WHATSAPP'));
 applyLocalFinance(f.a,confirmed.plan,'WHATSAPP');const after=localFinanceState(f.a);
 assert.equal(financeSnapshot(after,TODAY).balance_cents,financeSnapshot(state,TODAY).balance_cents-80000);
 assert.equal(financeSnapshot(after,TODAY).profile.opening_balance_cents,100000);assert.deepEqual(after.expenses,state.expenses);
 assert.equal(applyLocalFinance(f.a,confirmed.plan,'WHATSAPP').replayed,true);
 assert.deepEqual(localFinanceState(f.a),after);assert.equal(JSON.stringify(localFinanceState(f.b)),beforeB);
 record({case:'local-legitimate-confirm-replay',layer:'local rules + signature + local persistence',saved_after_1:true,replayed_without_duplicate:true,foreign_owner_rejected:true});
});

test('own conversational origin survives an unrelated newer spouse record; reset and foreign sender do not inherit it',async()=>{
 const f=seed(),own=receipt(f.a,f.plans.commission,PHONE_A,NOW-30000),partner=receipt(f.a,f.plans.rent,PHONE_PARTNER,NOW-1000),state=localFinanceState(f.a);
 const text='Exclui minha última receita.';
 const draft=await extractFinance(text,state,'synthetic-only',TODAY,noModel,undefined,'resumo',context([partner,own],f.a));
 assert.equal(draft.intent,'COMMAND',draft.question);assert.equal((draft.command as FinanceCommand).target_id,f.id('commission'));
 for(const rows of [[partner],[{...own,context_reset_at:new Date(NOW).toISOString()}],[{...own,user_id:f.b}]]){
  const denied=await extractFinance(text,state,'synthetic-only',TODAY,noModel,undefined,'resumo',context(rows,f.a));assert.equal(denied.intent,'CLARIFY');
 }
 record({case:'origin-spouse-reset',layer:'signed sender provenance / context reset',own_selected:true,other_sender_not_borrowed:true});
});

test('a JSON clone does not carry local target provenance merely because its fields look identical',async()=>{
 const f=seed(),state=localFinanceState(f.a),text='Exclui minha última receita.';
 const draft=await extractFinance(text,state,'synthetic-only',TODAY,noModel,undefined,'resumo',context([receipt(f.a,f.plans.commission)],f.a));
 assert.equal(draft.intent,'COMMAND',draft.question);assert.ok(prepare(draft,text,state,f.a));
 const cloned=JSON.parse(JSON.stringify(draft)) as FinanceDraft;let forged:FinancePlan|undefined;try{forged=prepare(cloned,text,state,f.a);}catch{}
 record({case:'serialized-provenance',layer:'local draft -> JSON -> source evidence',clone_prepared:!!forged});
 assert.equal(forged,undefined,'Serializable model-like fields must not confer server-local provenance');
});

test('pending cancellation by signed code does not archive an already saved income',()=>{
 const f=seed(),state=localFinanceState(f.a),before=JSON.stringify(state),proposal=buildFinancePlan({action:'income_upsert',description:'Receita ainda proposta',amount_cents:9900},state,f.a,randomUUID(),TODAY);
 const pending={user_id:f.a,sender:PHONE_A,...whatsappPending(proposal,f.a,PHONE_A,SECRET,NOW)};
 assert.ok(cancelledWhatsappPlan('CANCELAR '+pending.confirmation_code,[pending],f.a,PHONE_A,SECRET,NOW));
 assert.equal(cancelledWhatsappPlan('Cancele a entrada do aluguel que teve dia 26.',[pending],f.a,PHONE_A,SECRET,NOW),null);
 assert.equal(JSON.stringify(localFinanceState(f.a)),before);
 assert.throws(()=>readFinance(pending.finance_confirmation,f.a,SECRET,NOW));
 record({case:'pending-versus-record',layer:'confirmation routing',financial_state_untouched:true});
});

test('independent holdout reports local misses separately from unevaluated model fallback',()=>{
 const f=seed(),state=localFinanceState(f.a),before=JSON.stringify(state),own=receipt(f.a,f.plans.commission);
 const cases=[
  {id:'description-date',text:'Apaga aquele dinheiro da aula que caiu ontem, 75 reais.',target:f.id('lesson')},
  {id:'received-clause',text:'Tira a comissão que recebi no dia 25.',target:f.id('commission')},
  {id:'happened-clause',text:'Cancele a entrada do aluguel que teve dia 26.',target:f.id('rent')},
  {id:'projected-cancel',text:'Dá baixa na renda de amanhã do conserto, não vou receber mais.',target:f.id('repair')},
  {id:'own-source',text:'Anula só a última grana que eu registrei aqui.',target:f.id('commission'),rows:[own]},
  {id:'negation',text:'Não apague a entrada da aula.',noArchive:true},
  {id:'query',text:'Eu só quero saber qual foi minha última entrada.',noArchive:true},
  {id:'multiple',text:'Apaga todas as comissões.',noArchive:true},
  {id:'date-ambiguous',text:'Exclui a entrada do dia 26.',noArchive:true},
  {id:'foreign-owner',text:'Exclui a renda de 40 da oficina de ontem.',noArchive:true},
  {id:'couple-source',text:'Apaga essa entrada que você lançou.',noArchive:true,rows:[receipt(f.a,f.plans.rent,PHONE_PARTNER)]},
  {id:'reset-source',text:'Apaga essa entrada que você lançou.',noArchive:true,rows:[{...own,context_reset_at:new Date(NOW).toISOString()}]},
  {id:'pending-not-record',text:'Cancele esse lançamento que você acabou de preparar.',noArchive:true},
  {id:'day-vs-money',text:'Tira a comissão de 25, a que foi de 180 reais.',target:f.id('commission')}
 ];
 const results=cases.map(c=>{
  const draft=localFinanceInterpretation(c.text,state,TODAY,context(c.rows||[],f.a));
  const command=draft?.command as FinanceCommand|null|undefined;
  const actualArchive=draft?.intent==='COMMAND'&&command?.action==='document_archive';
  const correct=draft===null?null:c.target?actualArchive&&command?.target_id===c.target:!actualArchive;
  return {id:c.id,text:c.text,layer:'local rules only',intent:draft?.intent||'MODEL_FALLBACK_UNEVALUATED',target:command?.target_id,expected_target:c.target,semantic_correct:correct,question:draft?.question};
 });
 record({case:'holdout-matrix',results,model_fallback_is_not_a_language_pass:true});
 assert.equal(JSON.stringify(localFinanceState(f.a)),before);
 const failures=results.filter(r=>r.semantic_correct===false);
 assert.deepEqual(failures,[],'A terminal local rule blocked or misselected a complete clear request; fallback rows remain unevaluated');
});
