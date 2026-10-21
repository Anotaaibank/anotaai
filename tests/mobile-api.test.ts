import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {registerHooks} from 'node:module';
import {sealMobileSession,readMobileSession} from '../lib/mobile-session-codec.ts';
import {registerLocal} from '../lib/local-db.ts';
process.env.ANOTA_DATABASE_PATH=':memory:';
test('sessão nativa é cifrada, autenticada, limitada no tempo e separada do cookie web',()=>{
 const user=randomUUID(),session=randomBytes(32).toString('base64url'),key='native-test-key-with-at-least-32-characters',now=Date.now();
 const sealed=sealMobileSession(user,session,key,now);
 assert.equal(readMobileSession(sealed.token,key,now).user,user);
 assert.ok(!sealed.token.includes(session));assert.ok(!sealed.token.includes(user));
 assert.throws(()=>readMobileSession(sealed.token,key,now+86400000));
 assert.throws(()=>readMobileSession(sealed.token+'a',key,now));
 assert.throws(()=>readMobileSession(sealed.token,'another-long-key-with-at-least-32-characters',now));
 assert.throws(()=>readMobileSession(session,key,now));
});
test('API nativa: desligada por padrão; conta, confirmação e logout isolados sem alterar web',async()=>{
 const hooks=registerHooks({resolve(s,c,next){return next(s==='next/headers'?'next/headers.js':s,c);}});
 let mobile:typeof import('../lib/mobile-api.ts');try{mobile=await import('../lib/mobile-api.ts');}finally{hooks.deregister();}
 const previous={enabled:process.env.ANOTA_MOBILE_API_ENABLED,storage:process.env.ANOTA_STORAGE};
 const call=(input:unknown,token?:string,cookie?:string)=>mobile.mobileRequest(new Request('http://localhost/api/mobile/v1',{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{}),...(cookie?{Cookie:cookie}:{})},body:JSON.stringify(input)}));
 try{
  delete process.env.ANOTA_MOBILE_API_ENABLED;await assert.rejects(()=>call({action:'snapshot'}),/não está habilitado/);
  process.env.ANOTA_MOBILE_API_ENABLED='1';process.env.ANOTA_STORAGE='local';
  const email=randomUUID()+'@example.test',password='test-only-password';registerLocal(email,password,'Native A');
  const emailB=randomUUID()+'@example.test';registerLocal(emailB,password,'Native B');
  const a=await (await call({action:'login',email,password})).json(),b=await (await call({action:'login',email:emailB,password})).json();
  await assert.rejects(()=>call({action:'snapshot'},a.token,'anota-ai-session=fake'),/Entre no aplicativo/);
  await assert.rejects(()=>call({action:'snapshot',user_id:b.user.id},a.token),/campos/);
  const proposal=await (await call({action:'prepare',request_id:randomUUID(),command:{action:'income_upsert',amount_cents:50000,description:'Teste renda nativa',date:new Date().toLocaleDateString('en-CA',{timeZone:'America/Sao_Paulo'}),status:'REALIZADO'}},a.token)).json();
  const before=await (await call({action:'snapshot'},a.token)).json();assert.equal(before.snapshot.balance_cents,0);
  await assert.rejects(()=>call({action:'confirm',confirmation:proposal.pending.confirmation},b.token),/confirmação expirou/);
  await call({action:'confirm',confirmation:proposal.pending.confirmation},a.token);await call({action:'confirm',confirmation:proposal.pending.confirmation},a.token);
  const after=await (await call({action:'snapshot'},a.token)).json();assert.equal(after.snapshot.balance_cents,50000);assert.equal(after.snapshot.documents.filter((d:{kind:string})=>d.kind==='INCOME').length,1);
  assert.equal((await (await call({action:'snapshot'},b.token)).json()).snapshot.balance_cents,0);
  await call({action:'logout'},a.token);await assert.rejects(()=>call({action:'snapshot'},a.token),/Entre na sua conta/);
  assert.equal((await (await call({action:'session'},b.token)).json()).user.id,b.user.id);
 }finally{for(const [k,v] of Object.entries({ANOTA_MOBILE_API_ENABLED:previous.enabled,ANOTA_STORAGE:previous.storage})){if(v===undefined)delete process.env[k];else process.env[k]=v;}}
});
