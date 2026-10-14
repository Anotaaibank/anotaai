import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createPersonalPortal} from '../scripts/personal-portal-bridge.mjs';
test('portal público exige convite ou sessão pessoal e bloqueia gestão, demonstração, worker e origem falsa',async()=>{
 const calls:{path:string;cookie:string}[]=[],token='a'.repeat(43),handler=createPersonalPortal({upstream:'http://127.0.0.1:3100',publicOrigin:()=> 'https://anotei.example',authorized:(cookie:string)=>cookie==='personal=approved',invitationValid:(value:string)=>value===token,loginAllowed:(email:string)=>email==='member@example.test',transport:async(url,init)=>{const headers=init?.headers as Record<string,string>;assert.equal(headers['x-anotei-public-portal'],'1');calls.push({path:new URL(String(url)).pathname,cookie:headers.cookie||''});return Response.json({ok:true},{headers:{'Set-Cookie':'anota-ai-session=synthetic; Secure; HttpOnly'}});}}),server=createServer(handler);
 await new Promise<void>(ok=>server.listen(0,'127.0.0.1',ok));const address=server.address() as {port:number},origin='http://127.0.0.1:'+address.port;
 try{for(const path of ['/demo','/gestao','/api/gestao','/api/whatsapp/worker','/api/whatsapp/webhook','/api/%67estao'])assert.equal((await fetch(origin+path,{headers:{cookie:'personal=approved'}})).status,404,path);
  assert.equal((await fetch(origin+'/api/finance')).status,401);assert.equal((await fetch(origin+'/api/finance',{headers:{cookie:'owner=not-approved'}})).status,401);
  assert.equal((await fetch(origin+'/api/expenses/schedule')).status,401);assert.equal((await fetch(origin+'/api/expenses/schedule',{headers:{cookie:'personal=approved'}})).status,200);
  assert.equal((await fetch(origin+'/api/expenses',{method:'PATCH',headers:{cookie:'personal=approved',Origin:'https://anotei.example','Content-Type':'application/json'},body:'{}'})).status,200);
  assert.equal((await fetch(origin+'/cadastro/'+token)).status,200);
  const chunk='/_next/static/chunks/app/cadastro/%5Btoken%5D/page.js';assert.equal((await fetch(origin+chunk+'?v=123')).status,200);assert.equal(calls.at(-1)!.path,chunk);
  for(const path of ['/_next/static/%2e%2e/gestao','/_next/static/chunks/%2fapi/gestao','/_next/static/chunks/%255Btoken%255D/page.js','/api/%67estao'])assert.equal((await fetch(origin+path)).status,404,path);
  const post=(data:object,requestOrigin='https://anotei.example')=>fetch(origin+'/api/session',{method:'POST',headers:{'Content-Type':'application/json',Origin:requestOrigin},body:JSON.stringify(data)});
  assert.equal((await post({action:'register'})).status,403);assert.equal((await post({action:'login',email:'owner@example.test'})).status,401);assert.equal((await post({action:'register',invitation:token},'https://evil.example')).status,403);
  const created=await post({action:'register',invitation:token});assert.equal(created.status,200);assert.match(created.headers.get('set-cookie')!,/Secure; HttpOnly/);
  assert.equal((await post({action:'login',email:'member@example.test'})).status,200);
  assert.equal((await fetch(origin+'/api/finance',{headers:{cookie:'personal=approved'}})).status,200);assert.equal(calls.at(-1)!.cookie,'personal=approved');assert.equal(calls.some(c=>c.path==='/gestao'||c.path==='/demo'),false);
 }finally{server.closeAllConnections();await new Promise<void>(ok=>server.close(()=>ok()));}
});
