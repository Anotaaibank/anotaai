// Real application queue + confirmations + SQLite. Only OpenAI leaves this process.
// The WhatsApp provider is deliberately simulated: no customer receives a message.
import {readFileSync,writeFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {registerHooks} from 'node:module';
import {performance} from 'node:perf_hooks';
process.loadEnvFile('.env.server.local');
process.env.ANOTA_STORAGE='local';process.env.ANOTA_DATABASE_PATH=':memory:';process.env.ANOTA_WHATSAPP_URL='https://provider.example';
const hooks=registerHooks({resolve(s,c,next){return next(s==='next/headers'?'next/headers.js':s,c);}});
const {registerLocal,localDb}=await import('../lib/local-db.ts'),{localFinanceState,applyLocalFinance}=await import('../lib/finance-store.ts'),{buildFinancePlan,financeSnapshot}=await import('../lib/finance.ts'),{seal}=await import('../lib/secret-box.ts'),{brazilDay}=await import('../lib/model.ts');
const store=await import('../lib/whatsapp-store.ts'),worker=await import('../lib/whatsapp-worker.ts'),server=await import('../lib/whatsapp-server.ts');hooks.deregister();
const fixture=JSON.parse(readFileSync('tests/fixtures/command-audit.json','utf8')),today=brazilDay(),realFetch=globalThis.fetch,results=[];
let audioBytes=null,calls=[],sent=0;
globalThis.fetch=async(url,options)=>{
 const path=String(url);
 if(path.startsWith('https://api.openai.com/v1/')){
  if(!['https://api.openai.com/v1/responses','https://api.openai.com/v1/audio/transcriptions'].includes(path))throw Error('Unexpected OpenAI route');
  const request=typeof options.body==='string'?JSON.parse(options.body):{model:options.body.get('model')},start=performance.now(),r=await realFetch(url,options),d=await r.clone().json();calls.push({model:request.model,status:r.status,ms:performance.now()-start,usage:d.usage||null});return r;
 }
 if(path==='https://provider.example/message/download')return Response.json({mimetype:'audio/wav',base64Data:audioBytes.toString('base64')});
 if(/^https:\/\/provider\.example\/send\/(text|menu)$/.test(path)){sent++;return Response.json({id:randomUUID()});}
 throw Error('Blocked unexpected external destination');
};
try{for(const type of ['text','audio'])for(const id of ['saldo-01','renda-01','gasto-01','moto-01','agenda-01']){
 const item=fixture.cases.find(c=>c.id===id),user=registerLocal(randomUUID()+'@example.invalid','worker-audit-only','Conta sintética').user.id,sender='5511999999999';
 const bot={user_id:user,phone:'5511988888888',allowed_phones:[sender],enabled:true,status:'PRONTO',instance_id:randomUUID(),token_cipher:seal('synthetic-token',server.encryptionSecret(),'anota-ai-bot:'+user),hook_cipher:'unused-audit',updated_at:new Date().toISOString()};await store.putBot(bot,null);
 for(const c of [{action:'profile_upsert',profile:{opening_balance_cents:100000,opening_date:today}},{action:'income_upsert',description:'Receita anterior',amount_cents:30000,date:today},{action:'expense_create',description:'Despesa anterior',amount_cents:20000,date:today,category:'Supermercado'}])applyLocalFinance(user,buildFinancePlan(c,localFinanceState(user),user,randomUUID(),today),'MANUAL');
 async function message(text,kind='text',providerId=randomUUID()){
  const id=await store.enqueue(user,{provider_id:providerId,sender,type:kind,text:kind==='audio'?'':text,sent_at:new Date().toISOString()});if(!id)return null;
  const row=await store.claimMessage();if(!row||row.id!==id)throw Error('Queue ownership mismatch');await worker.processMessage(row);return (await store.history(user)).find(r=>r.id===id);
 }
 calls=[];sent=0;audioBytes=type==='audio'?readFileSync(`tests/fixtures/audio-audit/${id}.wav`):null;
 const before=localFinanceState(user),started=performance.now(),proposed=await message(item.text,type),proposal_ms=performance.now()-started;
 const notWritten=JSON.stringify(localFinanceState(user))===JSON.stringify(before),confirmed=proposed?.finance_confirmation?await message('1'):null,confirmed_ms=performance.now()-started,state=localFinanceState(user),snapshot=financeSnapshot(state),saved=confirmed?.status==='LANCADO';
 const countBefore=state.documents.length+state.expenses.length;if(saved)await message('1');const repeated=localFinanceState(user),noDuplicate=repeated.documents.length+repeated.expenses.length===countBefore;
 const expected=item.expect;let semantic=false;
 if(expected.type==='adjustment')semantic=snapshot.balance_cents===expected.balance&&snapshot.profile.opening_balance_cents===100000&&snapshot.extra_received_month_cents===30000&&state.documents.filter(d=>d.kind==='BALANCE_ADJUSTMENT').length===1;
 if(expected.type==='income')semantic=snapshot.balance_cents===160000&&state.documents.filter(d=>d.kind==='INCOME').length===2;
 if(expected.type==='expense')semantic=state.expenses.length===2&&state.expenses.some(e=>e.amount_cents===expected.amount&&e.status===expected.status&&e.entry_date===expected.date)&&snapshot.balance_cents===(expected.status==='REALIZADO'?107500:110000)&&!state.documents.some(d=>d.kind==='BILL_RULE');
 if(expected.type==='appointment')semantic=state.documents.some(d=>d.kind==='APPOINTMENT'&&d.date===expected.date&&d.details.time===expected.time)&&snapshot.balance_cents===110000;
 const estimated_usd=calls.reduce((n,c)=>{const u=c.usage||{};if(c.model==='gpt-4o-mini-transcribe')return n+((u.input_token_details?.audio_tokens||0)*3+(u.input_token_details?.text_tokens||0)*1.25+(u.output_tokens||0)*5)/1e6;const cache=u.input_tokens_details?.cached_tokens||0;return n+((u.input_tokens||0)-cache)*.4/1e6+cache*.1/1e6+(u.output_tokens||0)*1.6/1e6;},0);
 const row={id,type,pass:saved&&semantic&&notWritten&&noDuplicate,proposal_status:proposed?.status,transcript:proposed?.transcript,reply:proposed?.reply,saved,semantic,noWriteBeforeConfirm:notWritten,noDuplicate,proposal_ms,confirmed_ms,estimated_usd,provider:'simulated',persistence:'SQLite memory',calls,sentSimulated:sent};results.push(row);console.log(JSON.stringify({id,type,pass:row.pass,proposal_ms:Math.round(proposal_ms),confirmed_ms:Math.round(confirmed_ms)}));
 localDb().prepare('DELETE FROM inbox WHERE user_id=?').run(user);localDb().prepare('DELETE FROM bots WHERE user_id=?').run(user);
}}finally{globalThis.fetch=realFetch;}
writeFileSync('docs/audit-2026-10-17/whatsapp-flow-real-ai.json',JSON.stringify({scope:'real OpenAI, real application queue/confirmation/persistence, simulated WhatsApp provider',total:results.length,passed:results.filter(r=>r.pass).length,results},null,2));
console.log(JSON.stringify({total:results.length,passed:results.filter(r=>r.pass).length}));
