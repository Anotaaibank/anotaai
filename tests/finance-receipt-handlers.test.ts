import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {registerHooks} from 'node:module';
import {buildFinancePlan,signFinance,readFinance,financeSnapshot} from '../lib/finance.ts';
import {AppError} from '../lib/model.ts';

// Real handlers, signatures, receipt validator and HTTP response helpers. Only
// authentication, persistence transport and optional conversation storage are stubs.
process.env.ANOTA_DATABASE_PATH=':memory:';
const headersHook=registerHooks({resolve(specifier,context,next){return next(specifier==='next/headers'?'next/headers.js':specifier,context);}});
const server=await import('../lib/server.ts');
const {verifiedFinanceReceipt}=await import('../lib/finance-server.ts');
headersHook.deregister();
const user=randomUUID(),secret='synthetic-receipt-handler-secret-at-least-32-characters';
const plan=buildFinancePlan({action:'income_upsert',description:'Receita de teste',amount_cents:50000},{documents:[],expenses:[]},user,randomUUID());
const confirmation=signFinance(plan,user,secret);
const fixture={
 server,buildFinancePlan,signFinance,readFinance,financeSnapshot,verifiedFinanceReceipt,
 receipt:undefined as unknown,applyCalls:0,stateCalls:0,contextCalls:0,contextFails:false,writeFails:false,
 auth:{user:{id:user},token:'synthetic-session'},secret,
 state:()=>({documents:[],expenses:[]}),
};
const fixtureKey=Symbol.for('anotei.finance-receipt-handler-tests');
(globalThis as Record<symbol,unknown>)[fixtureKey]=fixture;
const prefix="const f=globalThis[Symbol.for('anotei.finance-receipt-handler-tests')];";
const sources:Record<string,string>={
 '@/lib/server':prefix+`export const authorize=async()=>f.auth;export const body=f.server.body,failure=f.server.failure,json=f.server.json,sameOrigin=f.server.sameOrigin;`,
 '@/lib/finance':prefix+`export const buildFinancePlan=f.buildFinancePlan,signFinance=f.signFinance,readFinance=f.readFinance,financeSnapshot=f.financeSnapshot;`,
 '@/lib/finance-server':prefix+`export const verifiedFinanceReceipt=f.verifiedFinanceReceipt;export const financeSecret=()=>f.secret;export const financeState=async()=>{f.stateCalls++;return f.state();};export const applyFinance=async()=>{f.applyCalls++;if(f.writeFails)throw Error('Synthetic transport outage');return f.receipt;};export const assistantFinanceData=()=>{throw Error('Unexpected read');};`,
 '@/lib/assistant-server':`export const claimVoiceRead=()=>{};`,
 '@/lib/assistant-turn':prefix+`export const assistantTurn=()=>{throw Error('Unexpected paid model');};export const assistantSavedContext=()=>{f.contextCalls++;if(f.contextFails)throw Error('Synthetic optional context outage');return {saved:true,title:'Receita salva'};};`,
 '@/lib/local-db':`export const throttleLocal=()=>{throw Error('Unexpected prepare');};`,
 '@/lib/model':`export {AppError,object} from ${JSON.stringify(new URL('../lib/model.ts',import.meta.url).href)};`,
};
const hooks=registerHooks({resolve(specifier,context,next){
 if(sources[specifier])return {url:'data:text/javascript,'+encodeURIComponent(sources[specifier]),shortCircuit:true};
 return next(specifier,context);
}});
const manual=await import('../app/api/finance/route.ts');
const voice=await import('../app/api/assistant/finance/route.ts');
hooks.deregister();

function reset(receipt:unknown){fixture.receipt=receipt;fixture.applyCalls=0;fixture.stateCalls=0;fixture.contextCalls=0;fixture.contextFails=false;fixture.writeFails=false;}
const request=(token=confirmation)=>new Request('http://receipt.test/api/finance',{method:'POST',headers:{'Content-Type':'application/json',Origin:'http://receipt.test'},body:JSON.stringify({confirmation:token,id:'synthetic-voice-session'})});
const invalidReceipts:[string,unknown][]=[
 ['null',null],['vazio',{}],['saved falso',{ok:true,saved:false,operation_id:plan.id}],
 ['ok falso',{ok:false,saved:true,operation_id:plan.id}],['ID ausente',{ok:true,saved:true}],
 ['ID de outra operação',{ok:true,saved:true,operation_id:randomUUID()}],
 ['booleanos como texto',{ok:'true',saved:'true',operation_id:plan.id}],
 ['array',[]],['texto','ok'],
];
for(const [channel,handler] of [['manual',manual],['voz',voice]] as const){
 for(const [label,receipt] of invalidReceipts)test(`${channel}: HTTP 200 do transporte com recibo ${label} não confirma gravação`,async()=>{
  reset(receipt);const response=await handler.POST(request()),body=await response.json();
  assert.equal(response.status,503);assert.match(body.error,/gravação não foi confirmada/);
  assert.equal(body.saved,undefined);assert.equal(body.assistant_context,undefined);
  assert.equal(fixture.applyCalls,1);assert.equal(fixture.stateCalls,0);assert.equal(fixture.contextCalls,0);
 });
 test(`${channel}: recibo válido preserva operação e resultado de replay`,async()=>{
  const receipt={ok:true,saved:true,operation_id:plan.id,replayed:true,expense_ids:['synthetic-id']};
  reset(receipt);const response=await handler.POST(request()),body=await response.json();
  assert.equal(response.status,200);for(const [key,value]of Object.entries(receipt))assert.deepEqual(body[key],value);
  assert.equal(fixture.applyCalls,1);assert.equal(fixture.contextCalls,channel==='voz'?1:0);
 });
 test(`${channel}: confirmação adulterada é recusada antes da escrita`,async()=>{
  reset({ok:true,saved:true,operation_id:plan.id});const response=await handler.POST(request(confirmation+'x'));
  assert.notEqual(response.status,200);assert.equal(fixture.applyCalls,0);assert.equal(fixture.contextCalls,0);
 });
 test(`${channel}: falha de transporte não confirma nem cria contexto salvo`,async()=>{
  reset({ok:true,saved:true,operation_id:plan.id});fixture.writeFails=true;
  const response=await handler.POST(request()),body=await response.json();
  assert.notEqual(response.status,200);assert.equal(body.saved,undefined);assert.equal(body.assistant_context,undefined);
  assert.equal(fixture.applyCalls,1);assert.equal(fixture.stateCalls,0);assert.equal(fixture.contextCalls,0);
 });
}
test('voz: indisponibilidade do contexto opcional após recibo válido mantém sucesso verificado',async()=>{
 reset({ok:true,saved:true,operation_id:plan.id});fixture.contextFails=true;
 const response=await voice.POST(request()),body=await response.json();
 assert.equal(response.status,200);assert.equal(body.saved,true);assert.equal(body.assistant_context.saved,true);
 assert.equal(fixture.applyCalls,1);assert.equal(fixture.contextCalls,1);
});
test('validador compartilhado exige o recibo da operação exata',()=>{
 assert.throws(()=>verifiedFinanceReceipt({ok:true,saved:true,operation_id:randomUUID()},plan),AppError);
});
