import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {whatsappIntegrationReady,whatsappWebhookOrigin} from '../lib/whatsapp-config.ts';
import {createWebhookBridge} from '../scripts/whatsapp-webhook-bridge.mjs';
import {integrationReadiness} from '../scripts/check-integrations.mjs';

test('receptor HTTPS separado preserva origem local e rejeita endereços inválidos',()=>{
 const env={APP_URL:'http://localhost:3100',ANOTA_WHATSAPP_WEBHOOK_URL:'https://receiver.example',ANOTA_WHATSAPP_URL:'https://provider.example',ANOTA_WHATSAPP_ADMIN_TOKEN:'test-only',ANOTA_WORKER_SECRET:'a'.repeat(32),OPENAI_API_KEY:'test-only',ANOTA_STORAGE:'local'};
 assert.equal(whatsappWebhookOrigin(env),'https://receiver.example');assert.equal(whatsappIntegrationReady(env),true);assert.equal(integrationReadiness(env).whatsapp.state,'configured');
 for(const url of ['http://receiver.example','https://receiver.example/demo','https://user:password@receiver.example','https://receiver.example/?key=private']){assert.throws(()=>whatsappWebhookOrigin({...env,ANOTA_WHATSAPP_WEBHOOK_URL:url}));assert.equal(whatsappIntegrationReady({...env,ANOTA_WHATSAPP_WEBHOOK_URL:url}),false);}
 assert.equal(whatsappIntegrationReady({...env,ANOTA_WHATSAPP_WEBHOOK_URL:undefined}),false);
});

test('ponte publica somente recebimento autorizado, sem painel, cookies ou credenciais na URL interna',async()=>{
 const user='11111111-1111-4111-8111-111111111111',key='k'.repeat(43),calls:{url:string;options:RequestInit}[]=[];
 const bridge=createServer(createWebhookBridge({upstream:'http://localhost:3100',authorize:(u:string,k:string)=>u===user&&k===key,transport:async(url:Parameters<typeof fetch>[0],options?:Parameters<typeof fetch>[1])=>{calls.push({url:String(url),options:options||{}});return Response.json({queued:true});}}));
 await new Promise<void>(ok=>bridge.listen(0,'127.0.0.1',ok));const address=bridge.address();assert.ok(address&&typeof address==='object');const origin='http://127.0.0.1:'+address.port,hook=origin+'/api/whatsapp/webhook?account='+user+'&key='+key;
 try{
  for(const path of ['/','/painel','/demo','/api/finance','/api/whatsapp/worker'])assert.equal((await fetch(origin+path)).status,404);
  assert.equal((await fetch(hook.replace(key,'x'.repeat(43)),{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,403);assert.equal(calls.length,0);
  assert.equal((await fetch(hook,{method:'POST',headers:{'Content-Type':'application/json',Cookie:'private-session',Authorization:'Bearer private'},body:'{"message":"synthetic"}'})).status,200);
  assert.equal(calls.length,1);assert.equal(calls[0].url,'http://localhost:3100/api/whatsapp/webhook');const headers=new Headers(calls[0].options.headers);assert.equal(headers.get('cookie'),null);assert.equal(headers.get('authorization'),null);assert.equal(headers.get('x-anota-account'),user);assert.equal(headers.get('x-anota-hook-key'),key);
  assert.equal((await fetch(hook,{method:'POST',headers:{'Content-Type':'application/json'},body:'x'.repeat(50001)})).status,413);assert.equal(calls.length,1);
  assert.equal((await fetch(hook+'&account='+user,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,403);
 }finally{await new Promise<void>((ok,fail)=>bridge.close(e=>e?fail(e):ok()));}
 assert.throws(()=>createWebhookBridge({upstream:'https://external.example',authorize:()=>true}));
});
