import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {registerHooks} from 'node:module';
import {buildFinancePlan} from '../lib/finance.ts';
import {whatsappPending} from '../lib/whatsapp-finance.ts';
import {whatsappConversationContext} from '../lib/whatsapp-context.ts';
import type {Inbox} from '../lib/whatsapp-store.ts';
const user=randomUUID(),sender='5511999999999',key='synthetic-context-only',now=Date.now();
test('contexto salvo exige assinatura, dono, remetente, prazo e confirmação efetiva',()=>{
 const plan=buildFinancePlan({action:'appointment_upsert',description:'Dentista',date:'2026-11-07',time:'15:00'},{documents:[],expenses:[]},user,randomUUID(),'2026-10-15'),row:Inbox={id:randomUUID(),user_id:user,sender,type:'text',provider_id:'synthetic',text:'1',transcript:'1',status:'LANCADO',entry_id:null,reply:'Registrado',reply_status:'ACEITO',created_at:new Date(now-1000).toISOString(),lease:null,claimed_at:null,...whatsappPending(plan,user,sender,key,now-2000),confirmation_used:true};
 assert.equal(whatsappConversationContext([row],user,sender,key,now).focus?.id,plan.id);
 for(const changed of [{...row,user_id:randomUUID()},{...row,sender:'5511999999998'},{...row,confirmation_used:false},{...row,finance_confirmation:row.finance_confirmation+'x'},{...row,created_at:new Date(now-1000000).toISOString()}])assert.equal(whatsappConversationContext([changed],user,sender,key,now).focus,undefined);
 const pending={...row,id:randomUUID(),status:'ESCLARECER' as const,confirmation_used:false,created_at:new Date(now-100).toISOString()};assert.equal(whatsappConversationContext([row,pending],user,sender,key,now).focus,undefined);
});
test('leitura de agenda no servidor filtra dono, tipo e datas sem carregar despesas; recibo inválido não vale como sucesso',async()=>{
 const hooks=registerHooks({resolve(s,c,next){return next(s==='next/headers'?'next/headers.js':s,c);}}),env={storage:process.env.ANOTA_STORAGE,url:process.env.SUPABASE_URL,anon:process.env.SUPABASE_ANON_KEY,service:process.env.SUPABASE_SERVICE_ROLE_KEY},transport=globalThis.fetch;
 try{
  process.env.ANOTA_STORAGE='remote';process.env.SUPABASE_URL='https://db.example';process.env.SUPABASE_ANON_KEY='synthetic';process.env.SUPABASE_SERVICE_ROLE_KEY='synthetic-service';
  const {financeStateForQuery,verifiedFinanceReceipt}=await import('../lib/finance-server.ts');const paths:string[]=[];
  globalThis.fetch=async(url)=>{const parsed=new URL(String(url));paths.push(parsed.pathname);assert.equal(parsed.searchParams.get('user_id'),'eq.'+user);assert.equal(parsed.searchParams.get('data->>kind'),'eq.APPOINTMENT');assert.equal(parsed.searchParams.get('data->>date'),'gte.2026-11-07');return Response.json([]);};
  assert.deepEqual(await financeStateForQuery(user,{topic:'agenda',period:'personalizado',from:'2026-11-07',to:'2026-11-07'}),{documents:[],expenses:[]});assert.deepEqual(paths,['/rest/v1/anota_finance_documents']);
  const plan=buildFinancePlan({action:'expense_create',description:'Gasto',amount_cents:1000},{documents:[],expenses:[]},user,randomUUID());for(const bad of [null,{},false,{ok:true,saved:false,operation_id:plan.id},{ok:true,saved:true,operation_id:randomUUID()}])assert.throws(()=>verifiedFinanceReceipt(bad,plan));assert.ok(verifiedFinanceReceipt({ok:true,saved:true,operation_id:plan.id},plan));
 }finally{hooks.deregister();globalThis.fetch=transport;for(const [name,value]of Object.entries({ANOTA_STORAGE:env.storage,SUPABASE_URL:env.url,SUPABASE_ANON_KEY:env.anon,SUPABASE_SERVICE_ROLE_KEY:env.service})){if(value===undefined)delete process.env[name];else process.env[name]=value;}}
});
