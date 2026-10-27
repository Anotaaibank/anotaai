import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {registerHooks} from 'node:module';
import {registerLocal,localDb} from '../lib/local-db.ts';
import {localFinanceState} from '../lib/finance-store.ts';
import {financeSnapshot} from '../lib/finance.ts';
import {seal} from '../lib/secret-box.ts';

process.env.ANOTA_STORAGE='local';process.env.ANOTA_DATABASE_PATH=':memory:';
const today='2026-10-27';
async function modules(){const h=registerHooks({resolve(s,c,next){return next(s==='next/headers'?'next/headers.js':s,c);}});try{return {store:await import('../lib/whatsapp-store.ts'),worker:await import('../lib/whatsapp-worker.ts'),server:await import('../lib/whatsapp-server.ts')};}finally{h.deregister();}}

for(const kind of ['text','audio'] as const)test('IW-A: fila '+kind+' isolada confirma atividade e corrige registro sem duplicação',async(t)=>{
 const oldFetch=globalThis.fetch,oldKey=process.env.OPENAI_API_KEY,oldUrl=process.env.ANOTA_WHATSAPP_URL;
 const m=await modules(),users:string[]=[];let spoken='',target='',modelCalls=0,transcriptions=0,tick=0;
 process.env.OPENAI_API_KEY='synthetic-only';process.env.ANOTA_WHATSAPP_URL='https://provider.example';
 globalThis.fetch=async(url,options)=>{const path=String(url);
  if(path.endsWith('/message/download'))return Response.json({mimetype:'audio/ogg',base64Data:Buffer.alloc(64).toString('base64')});
  if(path.endsWith('/audio/transcriptions')){transcriptions++;return Response.json({text:spoken});}
  if(path.endsWith('/responses')){modelCalls++;assert.ok(target,'Comando literal de atividade não deve chamar o modelo');assert.match(String(options?.body),/Corrige o almoço/);return Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({intent:'COMMAND',command:{action:'expense_update',target_id:target,amount_cents:3000},confidence:'ALTA',question:'',query:'',target_excerpt:'almoço',money_evidence:[{field:'amount_cents',excerpt:'30 reais'}],date_evidence:[]})}]}]});}
  assert.ok(/\/send\/(?:text|menu)$/.test(path),'Transporte inesperado '+path);return Response.json({id:randomUUID()});
 };
 try{
  for(let account=0;account<2;account++){
   const user=registerLocal(randomUUID()+'@example.test','synthetic-password','Conta sintética').user.id;users.push(user);
   const first='55119000000'+String(account*2+11),second='55119000000'+String(account*2+12);
   await m.store.putBot({user_id:user,phone:'5511800000000',allowed_phones:[first,second],enabled:true,status:'PRONTO',instance_id:'synthetic-'+account,token_cipher:seal('synthetic-token',m.server.encryptionSecret(),'anota-ai-bot:'+user),hook_cipher:'unused-test',updated_at:new Date().toISOString()},null);
   async function ask(text:string,sender=first,type:'text'|'audio'=kind){spoken=text;const id=await m.store.enqueue(user,{provider_id:randomUUID(),sender,type,text:type==='text'?text:'',sent_at:'2026-10-27T12:00:00Z'});assert.ok(id);localDb().prepare("UPDATE inbox SET data=json_set(data,'$.created_at',?) WHERE id=?").run(new Date(Date.parse('2026-10-27T12:00:00Z')+(++tick)*1000).toISOString(),id);const row=await m.store.claimMessage();assert.equal(row?.id,id);await m.worker.processMessage(row!);return (await m.store.history(user)).find(r=>r.id===id)!;}
   const previous=users.slice(0,-1).map(id=>JSON.stringify(localFinanceState(id)));
   target='';
   const a=await ask('Entrada 72 reais trabalhei de Uber ontem');assert.equal(a.status,'ESCLARECER',a.reply);assert.equal(localFinanceState(user).documents.length,0);
   await ask('CONFIRMAR '+a.confirmation_code,second,'text');assert.equal(localFinanceState(user).documents.length,0,'Outro remetente não confirma a proposta');
   assert.equal((await ask('1',first,'text')).status,'LANCADO');await ask('CONFIRMAR '+a.confirmation_code,first,'text');
   const b=await ask('Entrada 150 reais fiz um bico de garçom',second);assert.equal(b.status,'ESCLARECER',b.reply);await ask('1',second,'text');
   const c=await ask('Saída 19 reais gasolina fazendo Uber ontem');assert.equal(c.status,'ESCLARECER',c.reply);await ask('1',first,'text');await ask('CONFIRMAR '+c.confirmation_code,first,'text');
   const d=await ask('Saída 25 reais transporte para o bico de garçom',second);assert.equal(d.status,'ESCLARECER',d.reply);await ask('1',second,'text');
   let state=localFinanceState(user),snapshot=financeSnapshot(state,today);assert.equal(state.documents.filter(d=>d.kind==='INCOME').length,2);assert.equal(state.expenses.length,2);assert.equal(snapshot.balance_cents,17800);assert.equal(snapshot.extra_net_month_cents,17800);assert.equal(snapshot.paid_month_cents,0);assert.equal(state.expenses.find(e=>e.details.income_activity==='Uber')?.entry_date,'2026-10-26');assert.equal(state.documents.find(d=>d.details.activity==='garçom')?.date,today);
   const lunch=await ask('Saída 25 reais almoço ontem');assert.equal(lunch.status,'ESCLARECER',lunch.reply);await ask('1',first,'text');target=localFinanceState(user).expenses.find(e=>/almoço/.test(e.description))!.id;
   const before=JSON.stringify(localFinanceState(user));const status=await ask('Você já lançou?',first,'text');assert.equal(status.status,'RESOLVIDO',status.reply);assert.equal(JSON.stringify(localFinanceState(user)),before);
   const correction=await ask('Corrige o almoço que você lançou ontem para 30 reais');assert.equal(correction.status,'ESCLARECER',correction.reply);assert.match(correction.reply,/30,00/);assert.equal(JSON.stringify(localFinanceState(user)),before,'Correção ainda exige confirmar');
   await ask('1',first,'text');await ask('CONFIRMAR '+correction.confirmation_code,first,'text');state=localFinanceState(user);snapshot=financeSnapshot(state,today);assert.equal(state.expenses.length,3);assert.equal(state.expenses.find(e=>e.id===target)?.amount_cents,3000);assert.equal(snapshot.balance_cents,14800);assert.equal(snapshot.paid_month_cents,3000);assert.equal(snapshot.extra_net_month_cents,17800);
   assert.deepEqual(users.slice(0,-1).map(id=>JSON.stringify(localFinanceState(id))),previous,'Outra conta permanece intacta');
  }
  assert.equal(modelCalls,2,'Uma interpretação simulada da correção por conta');assert.equal(transcriptions,kind==='audio'?12:0);t.diagnostic('ASR simulado: '+transcriptions+'; intérprete simulado: '+modelCalls+'; contas: 2; remetentes por conta: 2; transporte externo real: 0');
 }finally{
  for(const user of users){localDb().prepare('DELETE FROM inbox WHERE user_id=?').run(user);localDb().prepare('DELETE FROM bots WHERE user_id=?').run(user);}
  globalThis.fetch=oldFetch;if(oldKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=oldKey;if(oldUrl===undefined)delete process.env.ANOTA_WHATSAPP_URL;else process.env.ANOTA_WHATSAPP_URL=oldUrl;
 }
});
