// Reproducible language evaluation: no account access and no production writes.
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {assistantTurn} from '../lib/assistant-turn.ts';
import {naturalFinanceTurn,languageGuard,normalizeAssistantText} from '../lib/conversation-language.ts';
import {quickFinanceDraft} from '../lib/finance-ai.ts';
import {buildFinancePlan,financeSnapshot,readFinance} from '../lib/finance.ts';
import {transcribeExpense} from '../lib/whatsapp-ai.ts';
const args=process.argv.slice(2),phase=args[0]||'baseline',mode=args[1]||'local';
const audio=args.includes('--audio');
const fixturePath=args.includes('--holdout')?'tests/fixtures/command-holdout.json':'tests/fixtures/command-audit.json';
if(!['local','real'].includes(mode))throw Error('Use local or real');
if(mode==='real')process.loadEnvFile('.env.server.local');
const raw=readFileSync(fixturePath,'utf8'),fixture=JSON.parse(raw),today=fixture.today,user='11111111-1111-4111-8111-111111111111',secret='audit-only-not-a-production-secret';
const base={documents:[],expenses:[]};
function overlay(state,plan){return {documents:state.documents.filter(d=>!plan.documents.some(c=>c.document.id===d.id)).concat(plan.documents.map(c=>({...c.document,updated_at:today+'T12:00:00.000Z'}))),expenses:state.expenses.filter(e=>!plan.expenses.some(c=>c.payload.id===e.id)).concat(plan.expenses.map(c=>({...c.payload,user_id:user,active:c.active??true,updated_at:today+'T12:00:00.000Z',created_at:today+'T12:00:00.000Z',origin:'MANUAL'})))};}
let seed=overlay(base,buildFinancePlan({action:'profile_upsert',profile:{opening_balance_cents:100000,opening_date:'2026-10-01'}},base,user,randomUUID(),today));
seed=overlay(seed,buildFinancePlan({action:'income_upsert',description:'Recebimento anterior',amount_cents:30000,date:'2026-10-15'},seed,user,randomUUID(),today));
seed=overlay(seed,buildFinancePlan({action:'expense_create',description:'Despesa anterior',amount_cents:20000,category:'Supermercado',date:'2026-10-16'},seed,user,randomUUID(),today));
const results=[];
for(const item of fixture.cases.filter(c=>!audio||existsSync(`tests/fixtures/audio-audit/${c.id}.wav`))){
 const state=structuredClone(seed),normalized=normalizeAssistantText(item.text),natural=naturalFinanceTurn(normalized,state,today),guard=languageGuard(normalized),quick=quickFinanceDraft(normalized,today),calls=[],started=performance.now();
 const transport=async(url,options)=>{
  if(mode==='local')throw Error('MODEL_REQUIRED');
  if(!['https://api.openai.com/v1/responses','https://api.openai.com/v1/audio/transcriptions'].includes(String(url)))throw Error('Unexpected external destination');
  const request=typeof options.body==='string'?JSON.parse(options.body):{model:options.body.get('model')},start=performance.now(),r=await fetch(url,options),d=await r.clone().json();
  const raw=d.output?.filter(i=>i.type==='message').flatMap(i=>i.content||[]).find(c=>c.type==='output_text')?.text;
  calls.push({model:request.model,status:r.status,ms:performance.now()-start,usage:d.usage||null,request_id:r.headers.get('x-request-id'),...(raw?{draft:JSON.parse(raw)}:{})});return r;
 };
 let answer='',plan=null,error='',pass=false,stage='',transcript='',audio_sha256='';
 try{
  if(audio){const bytes=readFileSync(`tests/fixtures/audio-audit/${item.id}.wav`);audio_sha256=createHash('sha256').update(bytes).digest('hex');transcript=await transcribeExpense(bytes,'audio/wav',process.env.OPENAI_API_KEY,transport);}
  const result=await assistantTurn({user,text:audio?transcript:item.text,state,key:mode==='real'?process.env.OPENAI_API_KEY:'synthetic',secret,today,transport,requestId:randomUUID()});
  answer=result.answer||'';
  if(result.pending)plan=readFinance(result.pending.confirmation,user,secret);
  const e=item.expect;
  if(e.type==='query')pass=!plan&&/1\.100,00/.test(answer);
  else if(e.type==='no-write')pass=!plan&&!!answer;
  else if(e.type==='clarify')pass=!plan&&!!answer&&!/MODEL_REQUIRED/.test(answer);
  else if(plan){
   const docs=plan.documents.map(c=>c.document),expenses=plan.expenses.map(c=>c.payload),after=overlay(state,plan),snapshot=financeSnapshot(after,today),original=state.documents.find(d=>d.kind==='PROFILE');
   if(e.type==='adjustment')pass=snapshot.balance_cents===e.balance&&after.documents.find(d=>d.kind==='PROFILE')?.details.opening_balance_cents===original.details.opening_balance_cents&&after.documents.filter(d=>d.kind==='INCOME').length===state.documents.filter(d=>d.kind==='INCOME').length&&docs.length===1&&expenses.length===0&&docs[0].kind!=='PROFILE';
   if(e.type==='income')pass=docs.length===1&&docs[0].kind==='INCOME'&&docs[0].amount_cents===e.amount&&docs[0].status==='REALIZADO'&&docs[0].date===e.date&&expenses.length===0&&snapshot.balance_cents===110000+e.amount;
   if(e.type==='expense')pass=expenses.length===1&&docs.length===0&&expenses[0].amount_cents===e.amount&&expenses[0].status===e.status&&expenses[0].entry_date===e.date&&snapshot.balance_cents===110000-(e.status==='REALIZADO'?e.amount:0);
   if(e.type==='appointment')pass=docs.length===1&&docs[0].kind==='APPOINTMENT'&&docs[0].date===e.date&&docs[0].details.time===e.time&&docs[0].description.toLowerCase().includes(e.contains)&&!expenses.length&&snapshot.balance_cents===110000;
  }
  stage=plan?(pass?'confirmation-ready':'semantic-or-plan'):calls.length?'model-result':'pre-model-rule';
 }catch(e){error=e.message;stage=error.includes('MODEL_REQUIRED')?'model-required':calls.length?'validation-or-model':'pre-model-or-validation';}
 const cost=calls.reduce((n,c)=>{const u=c.usage||{},cached=u.input_tokens_details?.cached_tokens||0;if(c.model==='gpt-4o-mini-transcribe'){const a=u.input_token_details?.audio_tokens||0,t=u.input_token_details?.text_tokens||0;return n+(a*3+t*1.25+(u.output_tokens||0)*5)/1e6;}return n+((u.input_tokens||0)-cached)*.4/1e6+cached*.1/1e6+(u.output_tokens||0)*1.6/1e6;},0);
 const row={id:item.id,text:item.text,expect:item.expect,pass,stage,...(audio?{transcript,audio_sha256}:{}),local:{guard:guard?.intent,natural:natural?.intent,question:natural?.question,quick:quick?.intent},answer,error,plan:plan?{title:plan.title,documents:plan.documents.map(c=>c.document),expenses:plan.expenses.map(c=>c.payload)}:null,ms:performance.now()-started,estimated_usd:cost,calls};results.push(row);
 console.log(JSON.stringify({id:item.id,pass,stage,model_calls:calls.length,ms:Math.round(row.ms)}));
}
const sorted=results.map(r=>r.ms).sort((a,b)=>a-b),sum=results.reduce((n,r)=>n+r.estimated_usd,0),passed=results.filter(r=>r.pass).length;
const summary={phase,mode,audio,fixture_sha256:createHash('sha256').update(raw).digest('hex'),date:new Date().toISOString(),total:results.length,passed,accuracy:passed/results.length,model_calls:results.reduce((n,r)=>n+r.calls.length,0),estimated_usd:sum,cost_per_success_usd:passed?sum/passed:null,p50_ms:sorted[Math.floor(sorted.length*.5)],p95_ms:sorted[Math.floor(sorted.length*.95)]};
mkdirSync('docs/audit-2026-10-17',{recursive:true});writeFileSync(`docs/audit-2026-10-17/${phase}-${audio?'audio-':''}${mode}.json`,JSON.stringify({summary,results},null,2));console.log(JSON.stringify(summary));
