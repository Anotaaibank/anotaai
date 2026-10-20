import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {registerHooks} from 'node:module';
import {subscriberResetInput} from '../lib/subscriber-controls.ts';
import {registerLocal,localDb} from '../lib/local-db.ts';
import {buildFinancePlan} from '../lib/finance.ts';
import {localFinanceState,applyLocalFinance,applyLocalWhatsappFinance} from '../lib/finance-store.ts';
import {whatsappPending} from '../lib/whatsapp-finance.ts';
import type {Inbox,Bot} from '../lib/whatsapp-store.ts';
process.env.ANOTA_DATABASE_PATH=':memory:';
async function modules(){const hooks=registerHooks({resolve(s,c,next){return next(s==='next/headers'?'next/headers.js':s,c);}});try{return {reset:await import('../lib/subscriber-reset.ts'),store:await import('../lib/whatsapp-store.ts'),worker:await import('../lib/whatsapp-worker.ts'),server:await import('../lib/whatsapp-server.ts')};}finally{hooks.deregister();}}

test('reinício exige confirmação explícita, versão, idempotência e não aceita dono no corpo',()=>{
 const input={phone:'11999999999',expected:new Date().toISOString(),request_id:randomUUID(),confirmed:true};assert.equal(subscriberResetInput(input).phone,'5511999999999');
 for(const bad of [{...input,confirmed:false},{...input,confirmed:'true'},{...input,expected:''},{...input,request_id:''},{...input,user_id:randomUUID()},{...input,actor:randomUUID()}])assert.throws(()=>subscriberResetInput(bad));
});

test('reinício por contato revoga propostas e leases sem apagar finanças, login, histórico, lembretes nem outro remetente',async()=>{
 const names=['ANOTA_STORAGE','ANOTA_MANAGER_USER_IDS','ANOTA_WHATSAPP_URL','OPENAI_API_KEY'] as const,old=Object.fromEntries(names.map(k=>[k,process.env[k]])),transport=globalThis.fetch;
 process.env.ANOTA_STORAGE='local';process.env.ANOTA_WHATSAPP_URL='https://provider.example';delete process.env.OPENAI_API_KEY;
 const m=await modules(),owner=registerLocal(randomUUID()+'@example.test','synthetic-password','Gestor').user.id,member=registerLocal(randomUUID()+'@example.test','synthetic-password','Pessoa Teste').user.id,outsider=randomUUID(),phone='5511987654321',second='5511987654322',date=new Date().toISOString(),inviteId=randomUUID();
 process.env.ANOTA_MANAGER_USER_IDS=owner;
 const master:Bot={user_id:owner,phone:'5511988888888',allowed_phones:[phone,second],enabled:true,status:'PRONTO',instance_id:'fixture-reset',token_cipher:'unused',hook_cipher:'unused',updated_at:date};
 await m.store.putBot(master,null);const bot:Bot={...master,user_id:member,shared_owner_id:owner,allowed_phones:[phone,second],instance_id:null,token_cipher:null};await m.store.putBot(bot,null);
 localDb().prepare('INSERT INTO whatsapp_invitations VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(inviteId,owner,phone,member,randomUUID(),'unused',Date.now()+86400000,'ACEITO',1,date,date);
 const inserted:string[]=[];
 async function row(sender=phone,provider_id:string=randomUUID(),status:Inbox['status']='ESCLARECER'){
  const id=await m.store.enqueue(member,{sender,provider_id,type:'text',text:'Saída 25 reais de sorvete',sent_at:date});assert.ok(id);inserted.push(id);const value=(await m.store.history(member)).find(r=>r.id===id)!;
  const updated={...value,status,lease:randomUUID(),claimed_at:date,reply:'Resumo anterior',...whatsappPending(buildFinancePlan({action:'expense_create',description:'sorvete',amount_cents:2500},{documents:[],expenses:[]},member,randomUUID()),member,sender,'synthetic-reset-key')};localDb().prepare('UPDATE inbox SET data=? WHERE id=?').run(JSON.stringify(updated),id);return updated;
 }
 try{
  const finance=buildFinancePlan({action:'appointment_upsert',description:'Dentista',date:'2026-11-07',time:'15:00'},localFinanceState(member),member,randomUUID());applyLocalFinance(member,finance,'MANUAL');const before=JSON.stringify(localFinanceState(member)),userBefore=localDb().prepare('SELECT * FROM users WHERE id=?').get(member);
  const editing=await row(),processing=await row(phone,randomUUID(),'PROCESSANDO'),other=await row(second),reminder=await row(phone,'anotei-reminder:v1:synthetic','RESOLVIDO');
  const input={phone,expected:date,request_id:randomUUID(),confirmed:true},auth={token:'fixture',user:{id:owner,name:'Gestor',email:'manager@example.test'}};
  await assert.rejects(m.reset.resetSubscriberConversation({token:'fixture',user:{id:outsider,name:'Outro',email:'other@example.test'}},input),/exclusiva/);
  await assert.rejects(m.reset.resetSubscriberConversation(auth,{...input,phone:'5511987654329'}),/não encontrado/);
  await assert.rejects(m.reset.resetSubscriberConversation(auth,{...input,expected:'2020-01-01T00:00:00Z'}),/mudou/);
  const result=await m.reset.resetSubscriberConversation(auth,input);assert.equal(result.affected_messages,2);
  assert.equal(JSON.stringify(localFinanceState(member)),before);assert.deepEqual(localDb().prepare('SELECT * FROM users WHERE id=?').get(member),userBefore);
  const history=await m.store.history(member),cleared=history.find(r=>r.id===editing.id)!;assert.ok(cleared.context_reset_at);assert.equal(cleared.finance_confirmation,'');assert.equal(cleared.confirmation_used,true);assert.equal(history.find(r=>r.id===processing.id)?.status,'RESOLVIDO');assert.equal(history.find(r=>r.id===processing.id)?.reply_status,'CANCELADO');
  assert.deepEqual(history.find(r=>r.id===other.id),other);assert.deepEqual(history.find(r=>r.id===reminder.id),reminder);assert.equal(history.length,4);
  assert.equal(await m.store.patchMessage(processing,{reply:'Resposta obsoleta'}),false);assert.throws(()=>applyLocalWhatsappFinance(member,finance,{id:processing.id,lease:processing.lease,sender:phone}),/expirou/);
  assert.equal(await m.store.enqueue(member,{provider_id:editing.provider_id,sender:phone,type:'text',text:'Replay',sent_at:date}),null);
  const fresh=await m.store.enqueue(member,{provider_id:randomUUID(),sender:phone,type:'text',text:'Entrada 80 reais vendi cadeira',sent_at:date});assert.ok(fresh);inserted.push(fresh);
  assert.deepEqual(await m.reset.resetSubscriberConversation(auth,input),result);assert.equal((await m.store.history(member)).find(r=>r.id===fresh)?.context_reset_at,undefined);
  assert.equal(localDb().prepare('SELECT active,user_id FROM whatsapp_invitations WHERE id=?').get(inviteId)?.user_id,member);assert.deepEqual(await m.store.rawBot(owner),master);assert.deepEqual(await m.store.rawBot(member),bot);
  await assert.rejects(m.reset.resetSubscriberConversation(auth,{...input,request_id:randomUUID()}),/mudou/);
 }finally{for(const id of inserted)localDb().prepare('DELETE FROM inbox WHERE id=?').run(id);localDb().prepare('DELETE FROM whatsapp_invitations WHERE id=?').run(inviteId);localDb().prepare('DELETE FROM bots WHERE user_id IN (?,?)').run(owner,member);globalThis.fetch=transport;for(const k of names){if(old[k]===undefined)delete process.env[k];else process.env[k]=old[k];}}
});

test('conversas reiniciadas não voltam ao contexto mesmo dentro da janela de quinze minutos',async()=>{
 const {whatsappConversationContext}=await import('../lib/whatsapp-context.ts'),user=randomUUID(),sender='5511999999999',now=Date.now(),row:Inbox={id:randomUUID(),user_id:user,sender,provider_id:randomUUID(),type:'text',text:'Agenda dentista amanhã',transcript:'Agenda dentista amanhã',status:'ESCLARECER',reply:'Qual horário?',reply_status:'ACEITO',entry_id:null,lease:null,claimed_at:null,created_at:new Date(now-100).toISOString(),context_reset_at:new Date(now).toISOString()};
 assert.deepEqual(whatsappConversationContext([row],user,sender,'fixture',now).turns,[]);
});
