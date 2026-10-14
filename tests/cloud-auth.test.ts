import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {randomUUID,scryptSync} from 'node:crypto';
import {registerHooks} from 'node:module';
import type {CloudTokens} from '../lib/cloud-auth.ts';
const cloudHooks=registerHooks({resolve(specifier,context,next){return next(specifier==='next/headers'?'next/headers.js':specifier,context);}});
const {createCloudSession,cloudSession,loginCloud,logoutCloud}=await import('../lib/cloud-auth.ts');
cloudHooks.deregister();
function context(){
 const names=['ANOTA_STORAGE','SUPABASE_URL','SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY','ANOTA_WHATSAPP_ENCRYPTION_KEY'];
 const env=Object.fromEntries(names.map(key=>[key,process.env[key]])),fetch=globalThis.fetch,global=globalThis as unknown as {anotaDb?:DatabaseSync;anotaInvitationsReady?:boolean},oldDb=global.anotaDb,oldReady=global.anotaInvitationsReady,db=new DatabaseSync(':memory:');
 global.anotaDb=db;global.anotaInvitationsReady=false;
 Object.assign(process.env,{ANOTA_STORAGE:'supabase',SUPABASE_URL:'https://cloud.example',SUPABASE_ANON_KEY:'synthetic-anon',SUPABASE_SERVICE_ROLE_KEY:'synthetic-service',ANOTA_WHATSAPP_ENCRYPTION_KEY:'synthetic-cloud-session-key-1234567890'});
 return {db,restore(){globalThis.fetch=fetch;db.close();global.anotaDb=oldDb;global.anotaInvitationsReady=oldReady;for(const key of names){if(env[key]===undefined)delete process.env[key];else process.env[key]=env[key];}}};
}
test('sessão cloud guarda tokens cifrados, renova uma vez em concorrência e encerra ao sair',async()=>{
 const c=context();try{
  const id=randomUUID(),tokens:CloudTokens={access_token:'synthetic-access-old',refresh_token:'synthetic-refresh',expires_in:-1,user:{id,email:'session@example.invalid',user_metadata:{name:'Sessão de teste'}}};
  const session=createCloudSession(tokens);assert.match(session.token,/^[A-Za-z0-9_-]{43}$/);
  const stored=c.db.prepare('SELECT cipher FROM cloud_sessions').get() as {cipher:string};assert.equal(stored.cipher.includes(tokens.access_token),false);assert.equal(stored.cipher.includes(tokens.refresh_token),false);
  let refreshed=0,revoked=0;
  globalThis.fetch=async(url,init)=>{const path=new URL(String(url)).pathname;
   if(path.endsWith('/token')){refreshed++;await new Promise(done=>setTimeout(done,10));return Response.json({...tokens,access_token:'synthetic-access-new',refresh_token:'synthetic-refresh-new',expires_in:3600});}
   if(path.endsWith('/user')){assert.equal(new Headers(init?.headers).get('Authorization'),'Bearer synthetic-access-new');return Response.json(tokens.user);}
   if(path.endsWith('/logout')){revoked++;return new Response(null,{status:204});}throw Error('Unexpected request');};
  const concurrent=await Promise.all([cloudSession(session.token),cloudSession(session.token),cloudSession(session.token)]);assert.equal(refreshed,1);assert.ok(concurrent.every(value=>value.user.id===id));
  await logoutCloud(session.token);assert.equal(revoked,1);await assert.rejects(()=>cloudSession(session.token),/expirou/);
 }finally{c.restore();}
});
test('renovação não pode trocar o dono da sessão',async()=>{
 const c=context();try{
  const tokens:CloudTokens={access_token:'synthetic-access',refresh_token:'synthetic-refresh',expires_in:-1,user:{id:randomUUID(),email:'owner@example.invalid'}},session=createCloudSession(tokens);
  globalThis.fetch=async()=>Response.json({...tokens,expires_in:3600,user:{...tokens.user,id:randomUUID()}});
  await assert.rejects(()=>cloudSession(session.token),/inválida/);
 }finally{c.restore();}
});
test('senha local migra só depois da verificação e não permite tomar uma conta com outro e-mail',async()=>{
 const c=context();try{
  const id=randomUUID(),password='synthetic-password-123',salt='01'.repeat(16),hash=salt+':'+scryptSync(password,salt,64).toString('hex');let updates=0,grants=0,cleared=0;
  globalThis.fetch=async(url,init)=>{const u=new URL(String(url));
   if(u.pathname.endsWith('/anota_legacy_login'))return Response.json({user_id:id,email:'legacy@example.invalid',password_hash:hash});
   if(u.pathname.endsWith('/anota_clear_legacy_login')){cleared++;return new Response(null,{status:204});}
   if(u.pathname.endsWith('/token')){grants++;return updates?Response.json({access_token:'synthetic-access',refresh_token:'synthetic-refresh',expires_in:3600,user:{id,email:'legacy@example.invalid'}}):Response.json({}, {status:400});}
   if(u.pathname.endsWith('/admin/users/'+id)){if(init?.method==='PUT'){updates++;return Response.json({id,email:'legacy@example.invalid'});}return Response.json({id,email:'legacy@example.invalid'});}throw Error('Unexpected request');};
  await assert.rejects(()=>loginCloud('legacy@example.invalid','incorrect-password'),/inválidos/);assert.equal(updates,0);
  const tokens=await loginCloud('legacy@example.invalid',password);assert.equal(tokens.user.id,id);assert.equal(updates,1);assert.equal(cleared,1);assert.equal(grants,3);
 }finally{c.restore();}
});
