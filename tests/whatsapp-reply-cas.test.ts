import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {registerHooks} from 'node:module';
import {localDb} from '../lib/local-db.ts';
import type {Inbox} from '../lib/whatsapp-store.ts';

// Cloud tests below are a transport/contract stub, not an execution of Postgres SQL.
type VersionedInbox=Inbox & {reply_version?:number};
const headersModule='data:text/javascript,export async function cookies(){throw Error("No request cookies in CAS tests")}';
async function store(){const hook=registerHooks({resolve(s,c,next){return next(s==='next/headers'?headersModule:s,c);}});try{return await import('../lib/whatsapp-store.ts');}finally{hook.deregister();}}
async function worker(){const hook=registerHooks({resolve(s,c,next){return next(s==='next/headers'?headersModule:s,c);}});try{return await import('../lib/whatsapp-worker.ts');}finally{hook.deregister();}}
function message(overrides:Partial<VersionedInbox>={}):VersionedInbox{return {id:randomUUID(),user_id:randomUUID(),provider_id:randomUUID(),sender:'5511999999999',type:'text',text:'teste',transcript:'teste',status:'RESOLVIDO',entry_id:null,reply:'Resposta atual',reply_status:'NAO_ENVIADO',created_at:new Date().toISOString(),lease:randomUUID(),claimed_at:new Date().toISOString(),reply_version:0,...overrides};}
function read(id:string){const result=localDb().prepare('SELECT data FROM inbox WHERE id=?').get(id) as {data:string};return JSON.parse(result.data) as VersionedInbox;}
function persist(row:VersionedInbox){localDb().prepare('INSERT OR REPLACE INTO inbox VALUES(?,?,?,?)').run(row.id,row.user_id,row.provider_id,JSON.stringify(row));}
async function context(mode:'local'|'cloud'){
 const names=['ANOTA_STORAGE','ANOTA_DATABASE_PATH','SUPABASE_URL','SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY'] as const;
 const before=Object.fromEntries(names.map(k=>[k,process.env[k]])),fetch=globalThis.fetch;
 process.env.ANOTA_STORAGE=mode;process.env.ANOTA_DATABASE_PATH=':memory:';process.env.SUPABASE_URL='https://cas.example.invalid';process.env.SUPABASE_ANON_KEY='synthetic-anon';process.env.SUPABASE_SERVICE_ROLE_KEY='synthetic-service';
 const api=await store();if(mode==='local')localDb().exec('SAVEPOINT reply_cas_fixture');
 return {api,close(){if(mode==='local')localDb().exec('ROLLBACK TO reply_cas_fixture; RELEASE reply_cas_fixture');globalThis.fetch=fetch;for(const k of names){if(before[k]===undefined)delete process.env[k];else process.env[k]=before[k];}}};
}
function cloud(initial:VersionedInbox){
 let saved=structuredClone(initial);const calls:{path:string;body:Record<string,unknown>}[]=[];
 globalThis.fetch=async(input,options)=>{
  const url=new URL(String(input)),body=JSON.parse(String(options?.body||'{}'));calls.push({path:url.pathname,body});
  if(url.pathname==='/rest/v1/rpc/anota_claim_message'){
   if(saved.status!=='FILA')return Response.json(null);
   saved={...saved,status:'PROCESSANDO',lease:randomUUID(),claimed_at:new Date().toISOString(),reply_version:(saved.reply_version??0)+1};return Response.json(saved);
  }
  if(url.pathname==='/rest/v1/rpc/anota_reply_claim'){
   // Old deployed signature deliberately models the unsafe ID-only claim, so the
   // regression fails before the implementation starts sending the CAS fields.
   const legacy=Object.keys(body).length===1;
   const matches=legacy||body.p_user===saved.user_id&&body.p_sender===saved.sender&&body.p_lease===saved.lease&&body.p_reply_version===(saved.reply_version??0);
   const claimed=body.p_id===saved.id&&matches&&saved.reply_status==='NAO_ENVIADO'&&!!saved.reply&&['LANCADO','RESOLVIDO','ESCLARECER','ERRO'].includes(saved.status);
   if(claimed)saved.reply_status='ENVIANDO';return Response.json(claimed);
  }
  assert.equal(url.pathname,'/rest/v1/anota_whatsapp_inbox');assert.equal(options?.method,'PATCH');
  const q=url.searchParams,lease=q.get('lease'),version=q.get('reply_version');
  const matches=q.get('id')==='eq.'+saved.id&&q.get('user_id')==='eq.'+saved.user_id&&(q.get('sender')===null||q.get('sender')==='eq.'+saved.sender)&&(lease===(saved.lease?'eq.'+saved.lease:'is.null'))&&(version===null||version==='eq.'+(saved.reply_version??0));
  if(!matches)return Response.json([]);
  const next={...saved,...body};
  if(['status','reply','finance_confirmation','confirmation_code','confirmation_used','context_reset_at'].some(k=>JSON.stringify((next as unknown as Record<string,unknown>)[k]??null)!==JSON.stringify((saved as unknown as Record<string,unknown>)[k]??null)))next.reply_version=(saved.reply_version??0)+1;
  saved=next;return Response.json([saved]);
 };
 return {get saved(){return saved;},calls};
}

for(const mode of ['local','cloud'] as const){
 test(mode+': claim inicial e preparação avançam as mesmas versões da resposta',async()=>{
  const c=await context(mode);try{const queued=message({status:'FILA',reply:'',lease:null});if(mode==='local'){localDb().exec('DELETE FROM inbox');persist(queued);}else cloud(queued);
   const current=await c.api.claimMessage();assert.ok(current);assert.equal(current.id,queued.id);assert.equal(current.reply_version,1);
   assert.equal(await c.api.patchMessage(current,{status:'RESOLVIDO',reply:'Resposta preparada'}),true);assert.equal(current.reply_version,2);
  }finally{c.close();}
 });
 test(mode+': processador A perde lease, B assume; A não reivindica a resposta de B',async()=>{
  const c=await context(mode);try{const a=message(),b={...a,lease:randomUUID(),reply:'Resposta de B',reply_version:2};let transport:ReturnType<typeof cloud>|undefined;if(mode==='local')persist(b);else transport=cloud(b);
   const before=structuredClone(a);assert.equal(await c.api.replyClaim(a),false);assert.deepEqual(a,before);assert.equal(mode==='local'?read(b.id).reply_status:transport!.saved.reply_status,'NAO_ENVIADO');
   assert.equal(await c.api.replyClaim(b),true);assert.equal(await c.api.replyClaim(b),false);
  }finally{c.close();}
 });
 test(mode+': patch que perde lease retorna false sem fabricar resposta no objeto A',async()=>{
  const c=await context(mode);try{const a=message({status:'PROCESSANDO',reply:''}),b={...a,lease:randomUUID(),reply:'Nova resposta',status:'RESOLVIDO' as const,reply_version:1};if(mode==='local')persist(b);else cloud(b);
   const before=structuredClone(a);assert.equal(await c.api.patchMessage(a,{status:'RESOLVIDO',reply:'Resposta obsoleta'}),false);assert.deepEqual(a,before);assert.equal(await c.api.replyClaim(a),false);
  }finally{c.close();}
 });
 test(mode+': nova versão no mesmo lease rejeita patch e claim antigos',async()=>{
  const c=await context(mode);try{const stale=message(),current={...stale,reply:'Resumo editado',reply_version:1};if(mode==='local')persist(current);else cloud(current);
   const before=structuredClone(stale);assert.equal(await c.api.patchMessage(stale,{reply:'Sobrescrita obsoleta'}),false);assert.deepEqual(stale,before);assert.equal(await c.api.replyClaim(stale),false);
  }finally{c.close();}
 });
 test(mode+': dono, remetente e versão precisam ser os mesmos, inclusive com lease nulo',async()=>{
  const c=await context(mode);try{const current=message({lease:null});if(mode==='local')persist(current);else cloud(current);
   for(const patch of [{user_id:randomUUID()},{sender:'5511888888888'},{reply_version:-1},{reply_version:1},{lease:randomUUID()}])assert.equal(await c.api.replyClaim({...current,...patch}),false);
   assert.equal(await c.api.replyClaim(current),true);
  }finally{c.close();}
 });
 test(mode+': atualização legítima avança versão, status de entrega não a avança',async()=>{
  const c=await context(mode);try{const current=message();if(mode==='local')persist(current);else cloud(current);
   assert.equal(await c.api.patchMessage(current,{reply:'Resumo novo',confirmation_code:'abcdefghij'}),true);assert.equal(current.reply_version,1);
   assert.equal(await c.api.replyClaim(current),true);assert.equal(current.reply_status,'ENVIANDO');assert.equal(current.reply_version,1);
   assert.equal(await c.api.patchMessage(current,{reply_status:'ACEITO'}),true);assert.equal(current.reply_version,1);
  }finally{c.close();}
 });
 test(mode+': uma resposta vazia ou ainda em processamento não pode ser enviada',async()=>{
  const c=await context(mode);try{for(const patch of [{reply:''},{status:'PROCESSANDO' as const},{reply_status:'INCERTO'}]){const current=message(patch);if(mode==='local')persist(current);else cloud(current);assert.equal(await c.api.replyClaim(current),false);}}
  finally{c.close();}
 });
}
test('local: mudanças nos dados da confirmação invalidam a versão anterior',async()=>{
 const c=await context('local');try{for(const patch of [{status:'ESCLARECER' as const},{finance_confirmation:'signed-synthetic'},{confirmation_code:'abcdefghij'},{confirmation_used:true},{context_reset_at:new Date().toISOString()}]){
  const current=message(),stale=structuredClone(current);persist(current);assert.equal(await c.api.patchMessage(current,patch),true);assert.equal(current.reply_version,1);assert.equal(await c.api.replyClaim(stale),false);assert.equal(await c.api.replyClaim(current),true);
 }}finally{c.close();}
});
test('cloud: contrato RPC inclui a versão e recusa resultado diferente de boolean true',async()=>{
 const c=await context('cloud');try{const current=message({reply_version:3}),transport=cloud(current);assert.equal(await c.api.replyClaim(current),true);assert.deepEqual(transport.calls[0].body,{p_id:current.id,p_user:current.user_id,p_sender:current.sender,p_lease:current.lease,p_reply_version:3});
  globalThis.fetch=async()=>Response.json('true');const before=structuredClone(current);assert.equal(await c.api.replyClaim(current),false);assert.deepEqual(current,before);
 }finally{c.close();}
});
test('cloud: recibo PATCH incompatível não contamina o snapshot do processador',async()=>{
 const c=await context('cloud');try{for(const changed of [{user_id:randomUUID()},{sender:'5511888888888'},{lease:randomUUID()},{reply_version:0}]){
  const current=message(),before=structuredClone(current);
  globalThis.fetch=async()=>Response.json([{...current,reply:'Texto novo',reply_version:1,...changed}]);
  assert.equal(await c.api.patchMessage(current,{reply:'Texto novo'}),false);assert.deepEqual(current,before);
 }}finally{c.close();}
});
test('cloud: processQueue encerra claim vazio sem consultar bot ou escrever',async()=>{
 const c=await context('cloud');try{
  const api=await worker(),empty=Object.fromEntries(Object.keys(message()).map(key=>[key,null]));
  for(const payload of [null,[],[null],empty,[empty]]){
   const calls:string[]=[];
   globalThis.fetch=async(input,options)=>{
    const url=new URL(String(input));assert.equal(url.origin,'https://cas.example.invalid');
    calls.push(url.pathname);
    if(url.pathname==='/rest/v1/anota_whatsapp_inbox'&&options?.method==='GET')return Response.json([]);
    if(url.pathname==='/rest/v1/rpc/anota_claim_message'){
     assert.equal(options?.method,'POST');return Response.json(payload);
    }
    assert.fail('Claim vazio iniciou uma consulta ou escrita inesperada: '+url.pathname);
   };
   assert.equal(await api.processQueue(),0);
   assert.deepEqual(calls,['/rest/v1/anota_whatsapp_inbox','/rest/v1/rpc/anota_claim_message']);
  }
 }finally{c.close();}
});
test('cloud: processQueue desembrulha claim único e preserva titular, lease e revisão no CAS',async()=>{
 const c=await context('cloud');try{
  const api=await worker(),claimed=message({status:'PROCESSANDO',reply:'',reply_version:7}),before=structuredClone(claimed);
  const calls:string[]=[];let patched=false;
  globalThis.fetch=async(input,options)=>{
   const url=new URL(String(input));assert.equal(url.origin,'https://cas.example.invalid');calls.push(url.pathname);
   if(url.pathname==='/rest/v1/anota_whatsapp_inbox'&&options?.method==='GET')return Response.json([]);
   if(url.pathname==='/rest/v1/rpc/anota_claim_message')return Response.json([claimed]);
   if(url.pathname==='/rest/v1/anota_whatsapp_bots'){
    assert.equal(url.searchParams.get('user_id'),'eq.'+claimed.user_id);
    // No authorized bot: exercise the worker's guarded error path without a model or send.
    return Response.json([]);
   }
   assert.equal(url.pathname,'/rest/v1/anota_whatsapp_inbox');assert.equal(options?.method,'PATCH');
   const q=url.searchParams;
   assert.equal(q.get('id'),'eq.'+claimed.id);assert.equal(q.get('user_id'),'eq.'+claimed.user_id);
   assert.equal(q.get('sender'),'eq.'+claimed.sender);assert.equal(q.get('lease'),'eq.'+claimed.lease);
   assert.equal(q.get('reply_version'),'eq.7');
   const patch=JSON.parse(String(options?.body)) as Partial<Inbox>;
   assert.equal(patch.status,'ERRO');assert.equal(patch.lease,undefined);assert.equal(patch.reply_version,undefined);
   patched=true;return Response.json([{...claimed,...patch,reply_version:8}]);
  };
  assert.equal(await api.processQueue(1),1);assert.equal(patched,true);assert.deepEqual(claimed,before);
  assert.deepEqual(calls,['/rest/v1/anota_whatsapp_inbox','/rest/v1/rpc/anota_claim_message','/rest/v1/anota_whatsapp_bots','/rest/v1/anota_whatsapp_inbox']);
 }finally{c.close();}
});
