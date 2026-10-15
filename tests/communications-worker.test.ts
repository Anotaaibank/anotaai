import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {randomUUID} from 'node:crypto';
import {seal} from '../lib/secret-box.ts';
const hook=registerHooks({resolve(s,c,next){return next(s==='next/headers'?'next/headers.js':s,c);}});
const {processCommunications}=await import('../lib/communications-worker.ts');hook.deregister();
test('fila de comunicados revalida autorização e conexão; aceite e envio incerto não viram repetição automática',async()=>{
 const keys=['ANOTA_STORAGE','SUPABASE_URL','SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY','ANOTA_WHATSAPP_URL','ANOTA_WHATSAPP_ENCRYPTION_KEY'] as const,old=Object.fromEntries(keys.map(k=>[k,process.env[k]])),original=globalThis.fetch;
 try{
  Object.assign(process.env,{ANOTA_STORAGE:'supabase',SUPABASE_URL:'https://database.example',SUPABASE_ANON_KEY:'fixture',SUPABASE_SERVICE_ROLE_KEY:'fixture',ANOTA_WHATSAPP_URL:'https://provider.example',ANOTA_WHATSAPP_ENCRYPTION_KEY:'fixture-communication-key-'.repeat(3)});
  for(const scenario of [{connected:true,allowed:true,http:200,result:'ACEITO',sends:1},{connected:true,allowed:false,http:200,result:'CANCELADO',sends:0},{connected:true,allowed:true,http:503,result:'INCERTO',sends:1},{connected:false,allowed:true,http:200,result:'',sends:0}]){
   const owner=randomUUID(),phone='5511999999999',bot={user_id:owner,phone:'5511988888888',allowed_phones:[phone],enabled:true,status:'PRONTO',token_cipher:seal('fixture-token',process.env.ANOTA_WHATSAPP_ENCRYPTION_KEY!,'anota-ai-bot:'+owner)},row={id:randomUUID(),owner_id:owner,phone,message:'Aviso de teste',lease:randomUUID(),invitation_id:randomUUID()};let sends=0,claims=0,settled='';
   globalThis.fetch=async(url,init)=>{const path=String(url);
    if(path.endsWith('/rpc/anota_communication_owners'))return Response.json([owner]);
    if(path.includes('/anota_whatsapp_bots?'))return Response.json([bot]);
    if(path.endsWith('/instance/status'))return Response.json({instance:{status:scenario.connected?'connected':'disconnected',owner:bot.phone}});
    if(path.endsWith('/rpc/anota_claim_communication')){claims++;return Response.json(claims===1?row:null);}
    if(path.endsWith('/rpc/anota_check_communication'))return Response.json(scenario.allowed);
    if(path.endsWith('/send/text')){sends++;const payload=JSON.parse(String(init?.body));assert.equal(payload.number,phone);assert.equal(payload.text,'*Anotei na Hora · Comunicado*\n\nAviso de teste');return Response.json({id:'fixture-provider-id'},{status:scenario.http});}
    if(path.includes('/anota_communication_recipients?')&&init?.method==='PATCH'){assert.ok(path.includes('lease=eq.'+row.lease));settled=JSON.parse(String(init.body)).status;return Response.json([]);}
    throw Error('Chamada inesperada no teste');
   };
   await processCommunications();assert.equal(sends,scenario.sends);assert.equal(settled,scenario.result);if(!scenario.connected)assert.equal(claims,0);
   await processCommunications();assert.equal(sends,scenario.sends);
  }
 }finally{globalThis.fetch=original;for(const key of keys){if(old[key]===undefined)delete process.env[key];else process.env[key]=old[key];}}
});
