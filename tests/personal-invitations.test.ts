import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {registerHooks} from 'node:module';
import {localDb,localSecret,registerLocal,userLocal,loginLocal} from '../lib/local-db.ts';
import {createPersonalInvitation,rawLocalBot,personalRecipient,localBotAuthorized,localEffectiveBot,invitationForToken,bindPersonalInvitation,publicAppOrigin,localInvitations} from '../lib/whatsapp-members-local.ts';
import {seal,unseal} from '../lib/secret-box.ts';
import {registerPersonalInvitation,registrationMoney} from '../lib/invitation-registration.ts';
import {localFinanceState} from '../lib/finance-store.ts';
import {financeSnapshot} from '../lib/finance.ts';
import {brazilDay} from '../lib/model.ts';
import {queueAccessLink,accessLinkViews,accessLinkDb} from '../lib/whatsapp-access-links-local.ts';
process.env.ANOTA_DATABASE_PATH=':memory:';
const ia='5511988888888',primary='5511999999999';
async function fixture(){const old={public:process.env.ANOTA_PUBLIC_URL,storage:process.env.ANOTA_STORAGE,url:process.env.ANOTA_WHATSAPP_URL},fetcher=globalThis.fetch;process.env.ANOTA_PUBLIC_URL='https://anotei.example';process.env.ANOTA_STORAGE='local';process.env.ANOTA_WHATSAPP_URL='https://provider.example';const owner=registerLocal(randomUUID()+'@example.test','synthetic-password','Gestor').user.id,bot={user_id:owner,phone:ia,allowed_phones:[primary],enabled:true,status:'PRONTO',instance_id:randomUUID(),token_cipher:seal('synthetic-provider-token',localSecret(),'anota-ai-bot:'+owner),hook_cipher:'unused',updated_at:new Date().toISOString()};localDb().prepare('INSERT INTO bots VALUES(?,?,?)').run(owner,JSON.stringify(bot),bot.updated_at);
 const hooks=registerHooks({resolve(s,c,next){return next(s==='next/headers'?'next/headers.js':s,c);}});let modules;try{modules={worker:await import('../lib/whatsapp-worker.ts'),store:await import('../lib/whatsapp-store.ts'),invites:await import('../lib/whatsapp-invitations.ts')};}finally{hooks.deregister();}
 return {...modules,owner,bot,invite(number:string){return createPersonalInvitation(owner,number,rawLocalBot(owner)!.updated_at);},token(invite:ReturnType<typeof createPersonalInvitation>){return unseal(invite.token_cipher,localSecret(),'anotei-invitation:'+invite.id);},restore(){globalThis.fetch=fetcher;for(const [key,v]of Object.entries({ANOTA_PUBLIC_URL:old.public,ANOTA_STORAGE:old.storage,ANOTA_WHATSAPP_URL:old.url})){if(v===undefined)delete process.env[key];else process.env[key]=v;}}};}
const registration=(token:string,balance:string)=>({invitation:token,email:randomUUID()+'@example.test',name:'Pessoa de teste',cpf:'52998224725',postal_code:'01001000',street:'Rua de Teste',address_number:'1',complement:'',neighborhood:'Centro',city:'São Paulo',state:'SP',password:'synthetic-password',password_confirmation:'synthetic-password',salary:'6000,00',balance,salary_day:'5',assistant_name:'Lucy'});
test('reenviar acesso preserva convite individual; cadastro concluído recebe login sem alterar finanças',async()=>{
 const c=await fixture();try{const number='5511976543210',invite=c.invite(number),token=c.token(invite),sent:string[]=[];globalThis.fetch=async(_url,init)=>{sent.push(JSON.parse(String(init?.body)).text);return Response.json({id:randomUUID()});};
  const initialId=randomUUID();assert.equal(queueAccessLink(c.owner,number,initialId,rawLocalBot(c.owner)!.updated_at).status,'AUTOMATICO');assert.equal(await c.invites.processInvitations(),1);assert.equal(sent.length,1);
  assert.equal(queueAccessLink(c.owner,number,initialId,'stale').status,'AUTOMATICO');assert.equal(await c.invites.processInvitations(),0);
  const requestId=randomUUID();queueAccessLink(c.owner,number,requestId,rawLocalBot(c.owner)!.updated_at);assert.equal(await c.invites.processAccessLinks(),1);assert.equal(await c.invites.processAccessLinks(),0);assert.equal(sent.length,2);assert.ok(sent[1].includes('/cadastro/'+token));assert.equal(localInvitations(c.owner)[0].token_cipher,invite.token_cipher);
  const member=registerPersonalInvitation(registration(token,'2200')).user.id,before=JSON.stringify(localFinanceState(member));queueAccessLink(c.owner,number,randomUUID(),rawLocalBot(c.owner)!.updated_at);assert.equal(await c.invites.processAccessLinks(),1);assert.match(sent[2],/https:\/\/anotei\.example\/\n/);assert.match(sent[2],/https:\/\/anotei\.example\/manual/);assert.ok(!sent[2].includes('/cadastro/'));assert.equal(JSON.stringify(localFinanceState(member)),before);assert.equal(accessLinkViews(c.owner)[0].status,'ACEITO');
 }finally{c.restore();}
});
test('envio manual recusa número alheio e repetido; revogação e resultado incerto impedem reenvio',async()=>{
 const c=await fixture();try{const number='5511976543211';c.invite(number);globalThis.fetch=async()=>Response.json({id:randomUUID()});await c.invites.processInvitations();
  assert.throws(()=>queueAccessLink(c.owner,primary,randomUUID(),rawLocalBot(c.owner)!.updated_at),/convite pessoal/);assert.throws(()=>queueAccessLink(c.owner,number,randomUUID(),'stale'),/mudou/);
  const id=randomUUID();queueAccessLink(c.owner,number,id,rawLocalBot(c.owner)!.updated_at);assert.throws(()=>queueAccessLink(c.owner,number,randomUUID(),rawLocalBot(c.owner)!.updated_at),/pendente/);
  const other=await fixture();try{assert.throws(()=>queueAccessLink(other.owner,number,id,other.bot.updated_at),/autorizado/);}finally{other.restore();}
  globalThis.fetch=async()=>{throw Error('timeout');};assert.equal(await c.invites.processAccessLinks(),1);assert.equal(await c.invites.processAccessLinks(),0);assert.equal(accessLinkViews(c.owner)[0].status,'INCERTO');assert.throws(()=>queueAccessLink(c.owner,number,randomUUID(),rawLocalBot(c.owner)!.updated_at),/conferência/);
  accessLinkDb().prepare("UPDATE whatsapp_access_links SET status='FALHOU' WHERE id=?").run(id);queueAccessLink(c.owner,number,randomUUID(),rawLocalBot(c.owner)!.updated_at);const bot=rawLocalBot(c.owner)!;localDb().prepare('UPDATE bots SET data=? WHERE user_id=?').run(JSON.stringify({...bot,allowed_phones:[primary]}),c.owner);
  let sends=0;globalThis.fetch=async()=>{sends++;return Response.json({id:randomUUID()});};assert.equal(await c.invites.processAccessLinks(),0);assert.equal(sends,0);assert.equal(accessLinkViews(c.owner)[0].status,'CANCELADO');
 }finally{c.restore();}
});
test('convite individual bloqueia consulta antes do cadastro, é consumido uma vez e cria somente dados próprios',async()=>{
 const c=await fixture();try{const number='5511976543201',invite=c.invite(number),token=c.token(invite);assert.equal(personalRecipient(c.owner,number),null);assert.equal(localBotAuthorized(c.owner,number),false);assert.equal(personalRecipient(c.owner,primary),c.owner);assert.ok(invitationForToken(token));assert.equal(invitationForToken(token,invite.expires_at),null);
  const before=JSON.stringify(localFinanceState(c.owner)),result=registerPersonalInvitation(registration(token,'1250,00'));assert.equal(personalRecipient(c.owner,number),result.user.id);assert.equal(localEffectiveBot(result.user.id)!.connection_user_id,c.owner);assert.equal(localEffectiveBot(c.owner)!.allowed_phones.includes(number),false);
  assert.equal(userLocal(result.token).id,result.user.id);assert.equal(loginLocal(result.user.email,'synthetic-password').user.id,result.user.id);
  assert.equal(financeSnapshot(localFinanceState(result.user.id),brazilDay()).balance_cents,125000);assert.equal(localFinanceState(result.user.id).expenses.length,0);assert.equal(JSON.stringify(localFinanceState(c.owner)),before);assert.equal(invitationForToken(token),null);
  assert.throws(()=>registerPersonalInvitation(registration(token,'99999')),/convite/i);assert.throws(()=>bindPersonalInvitation(token,randomUUID()),/convite/i);
  const raw=rawLocalBot(c.owner)!;localDb().prepare('UPDATE bots SET data=? WHERE user_id=?').run(JSON.stringify({...raw,allowed_phones:[primary]}),c.owner);assert.equal(personalRecipient(c.owner,number),null);assert.equal(localBotAuthorized(result.user.id,number),false);assert.equal(localEffectiveBot(result.user.id)!.enabled,false);
  c.invite(number);assert.equal(personalRecipient(c.owner,number),result.user.id);
 }finally{c.restore();}
});
test('duas pessoas usam o mesmo contato IA e recebem saldos diferentes; confirmações gravam só na própria conta',async()=>{
 const c=await fixture();try{const p1='5511976543202',p2='5511976543203',u1=registerPersonalInvitation(registration(c.token(c.invite(p1)),'1500')).user.id,u2=registerPersonalInvitation(registration(c.token(c.invite(p2)),'3500')).user.id,sent:{number:string;text:string}[]=[];
  globalThis.fetch=async(_url,init)=>{const payload=JSON.parse(String(init?.body));assert.equal((init?.headers as Record<string,string>).token,'synthetic-provider-token');sent.push(payload);return Response.json({id:randomUUID()});};
  const process=async(user:string,number:string,text:string)=>{await c.store.enqueue(user,{provider_id:randomUUID(),sender:number,type:'text',text,sent_at:new Date().toISOString()});await c.worker.processQueue();};
  await process(u1,p1,'Qual meu saldo?');await process(u2,p2,'Qual meu saldo?');assert.match(sent[0].text,/1\.500,00/);assert.match(sent[1].text,/3\.500,00/);assert.equal(sent[0].number,p1);assert.equal(sent[1].number,p2);
  await process(u1,p1,'Gastei 25 reais com sorvete.');await process(u1,p1,'1');assert.equal(localFinanceState(u1).expenses.length,1);assert.equal(localFinanceState(u2).expenses.length,0);assert.equal(localFinanceState(c.owner).expenses.length,0);
  const count=sent.length;await process(c.owner,p1,'Qual meu saldo?');await process(u2,p1,'Qual meu saldo?');assert.equal(sent.length,count);
 }finally{c.restore();}
});
test('envio de convites é durável, único e um envio incerto não é repetido',async()=>{
 const c=await fixture();try{const invite=c.invite('5511976543204');let sends=0;globalThis.fetch=async(_url,init)=>{sends++;const payload=JSON.parse(String(init?.body));assert.equal(payload.number,invite.phone);assert.match(payload.text,/https:\/\/anotei\.example\/cadastro\//);assert.match(payload.text,/https:\/\/anotei\.example\/manual/);return Response.json({id:randomUUID()});};assert.equal(await c.invites.processInvitations(),1);assert.equal(await c.invites.processInvitations(),0);assert.equal(sends,1);assert.equal(localInvitations(c.owner)[0].send_status,'ACEITO');
  c.invite('5511976543205');globalThis.fetch=async()=>{sends++;throw Error('timeout');};assert.equal(await c.invites.processInvitations(),1);assert.equal(await c.invites.processInvitations(),0);assert.equal(localInvitations(c.owner).find(i=>i.phone.endsWith('3205'))!.send_status,'INCERTO');assert.throws(()=>c.invite('5511976543205'),/conferência/);
 }finally{c.restore();}
});
test('cadastro inválido não consome convite; saldo negativo, moeda brasileira e endereço público são validados',async()=>{
 const c=await fixture();try{const invite=c.invite('5511976543206'),token=c.token(invite),count=localDb().prepare('SELECT count(*) AS n FROM users').get()!.n;
  assert.throws(()=>registerPersonalInvitation({...registration(token,'100'),password:'short'}));assert.throws(()=>registerPersonalInvitation(registration(token,'NaN')));assert.equal(localDb().prepare('SELECT count(*) AS n FROM users').get()!.n,count);assert.ok(invitationForToken(token));
  assert.throws(()=>registerPersonalInvitation({...registration(token,'100'),password_confirmation:'different-password'}),/senhas não são iguais/i);
  assert.throws(()=>registerPersonalInvitation({...registration(token,'100'),password_confirmation:undefined}),/senhas não são iguais/i);
  assert.equal(localDb().prepare('SELECT count(*) AS n FROM users').get()!.n,count);assert.ok(invitationForToken(token));
  assert.equal(registrationMoney('6.500,20'),650020);assert.equal(registrationMoney('-25,50',true),-2550);assert.throws(()=>registrationMoney('-1'));assert.throws(()=>publicAppOrigin('http://localhost:3100'));assert.throws(()=>publicAppOrigin('https://example.com/path'));
 }finally{c.restore();}
});
