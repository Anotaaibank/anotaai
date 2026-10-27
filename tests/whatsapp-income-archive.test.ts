import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {registerHooks} from 'node:module';
import {registerLocal,localDb} from '../lib/local-db.ts';
import {buildFinancePlan,financeSnapshot} from '../lib/finance.ts';
import {localFinanceState,applyLocalFinance} from '../lib/finance-store.ts';
import {seal} from '../lib/secret-box.ts';
import {brazilDay} from '../lib/model.ts';
process.env.ANOTA_STORAGE='local';process.env.ANOTA_DATABASE_PATH=':memory:';
async function modules(){const h=registerHooks({resolve(s,c,next){return next(s==='next/headers'?'next/headers.js':s,c);}});try{return {store:await import('../lib/whatsapp-store.ts'),worker:await import('../lib/whatsapp-worker.ts'),server:await import('../lib/whatsapp-server.ts')};}finally{h.deregister();}}
for(const type of ['text','audio'] as const)test('IW-D worker '+type+': origem, 2 editar, confirmação e replay sem converter receita',async(t)=>{
 const oldFetch=globalThis.fetch,oldKey=process.env.OPENAI_API_KEY,oldUrl=process.env.ANOTA_WHATSAPP_URL,m=await modules(),user=registerLocal(randomUUID()+'@example.test','synthetic-password','Casa').user.id,other=registerLocal(randomUUID()+'@example.test','synthetic-password','Outra conta').user.id,sender='5511900000011',partner='5511900000012';let spoken='',asr=0;
 process.env.OPENAI_API_KEY='synthetic-only';process.env.ANOTA_WHATSAPP_URL='https://provider.example';
 globalThis.fetch=async url=>{const path=String(url);if(path.endsWith('/message/download'))return Response.json({mimetype:'audio/ogg',base64Data:Buffer.alloc(64).toString('base64')});if(path.endsWith('/audio/transcriptions')){asr++;return Response.json({text:spoken});}assert.ok(/\/send\/(?:text|menu)$/.test(path),'Não chamar modelo ou transporte não simulado: '+path);return Response.json({id:randomUUID()});};
 try{
  await m.store.putBot({user_id:user,phone:'5511800000000',allowed_phones:[sender,partner],enabled:true,status:'PRONTO',instance_id:'synthetic-instance',token_cipher:seal('synthetic-token',m.server.encryptionSecret(),'anota-ai-bot:'+user),hook_cipher:'unused-test',updated_at:new Date().toISOString()},null);
  applyLocalFinance(other,buildFinancePlan({action:'income_upsert',description:'Privado da outra conta',amount_cents:5555},localFinanceState(other),other,randomUUID()),'MANUAL');const foreignBefore=JSON.stringify(localFinanceState(other));
  async function ask(text:string,number=sender,kind:'text'|'audio'=type){spoken=text;const id=await m.store.enqueue(user,{provider_id:randomUUID(),sender:number,type:kind,text:kind==='text'?text:'',sent_at:new Date().toISOString()});assert.ok(id);const row=await m.store.claimMessage();assert.equal(row?.id,id);await m.worker.processMessage(row!);return (await m.store.history(user)).find(r=>r.id===id)!;}
  assert.equal((await ask('Entrada 80 reais trabalhei de Uber')).status,'ESCLARECER');await ask('1',sender,'text');
  assert.equal((await ask('Entrada 140 reais vendi a televisão',partner)).status,'ESCLARECER');await ask('1',partner,'text');
  assert.equal((await ask('Saída 12 reais de padaria')).status,'ESCLARECER');await ask('1',sender,'text');
  const initial=localFinanceState(user),own=initial.documents.find(d=>d.details.activity==='Uber')!,shared=initial.documents.find(d=>/televisão/.test(d.description))!,before=JSON.stringify(initial);assert.equal(financeSnapshot(initial).balance_cents,20800);
  let proposal=await ask('cancela a última entrada que enviei');assert.equal(proposal.status,'ESCLARECER',proposal.reply);assert.match(proposal.reply,/Cancelamento da entrada/);assert.match(proposal.reply,/80,00/);assert.doesNotMatch(proposal.reply,/140,00/);assert.match(proposal.reply,/1 — Confirmar[\s\S]*2 — Editar/);assert.equal(JSON.stringify(localFinanceState(user)),before);
  await ask('2',sender,'text');await ask('valor 100',sender,'text');await ask('1',sender,'text');assert.equal(JSON.stringify(localFinanceState(user)),before,'Editar cancelamento não altera valor nem arquiva');
  proposal=await ask('cancela a entrada do Uber de hoje');assert.equal(proposal.status,'ESCLARECER',proposal.reply);await ask('2',sender,'text');await ask('dia 25',sender,'text');await ask('1',sender,'text');assert.equal(JSON.stringify(localFinanceState(user)),before,'Editar dia não altera data nem arquiva');
  proposal=await ask('cancela a entrada do Uber de hoje');assert.equal(proposal.status,'ESCLARECER',proposal.reply);await ask('CONFIRMAR '+proposal.confirmation_code,partner,'text');assert.equal(JSON.stringify(localFinanceState(user)),before);assert.equal((await ask('1',sender,'text')).status,'LANCADO');await ask('CONFIRMAR '+proposal.confirmation_code,sender,'text');
  const final=localFinanceState(user);assert.equal(final.documents.length,2);assert.equal(final.documents.find(d=>d.id===own.id)?.active,false);assert.equal(final.documents.find(d=>d.id===shared.id)?.active,true);assert.equal(final.documents.find(d=>d.id===own.id)?.amount_cents,8000);assert.equal(final.documents.find(d=>d.id===own.id)?.date,brazilDay());assert.equal(final.expenses.length,1);assert.equal(financeSnapshot(final).balance_cents,12800);assert.equal((localDb().prepare('SELECT count(*) n FROM finance_operations WHERE user_id=?').get(user) as {n:number}).n,4);assert.equal(JSON.stringify(localFinanceState(other)),foreignBefore);assert.equal(asr,type==='audio'?6:0);t.diagnostic('ASR substituído: '+asr+'; modelo de interpretação chamado: 0; provedor real: 0; operações financeiras locais: 4');
 }finally{localDb().prepare('DELETE FROM inbox WHERE user_id=?').run(user);localDb().prepare('DELETE FROM bots WHERE user_id=?').run(user);globalThis.fetch=oldFetch;if(oldKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=oldKey;if(oldUrl===undefined)delete process.env.ANOTA_WHATSAPP_URL;else process.env.ANOTA_WHATSAPP_URL=oldUrl;}
});
