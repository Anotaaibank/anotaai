import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {registerHooks} from 'node:module';
import {registerLocal,localDb} from '../lib/local-db.ts';
import {localFinanceState,applyLocalFinance} from '../lib/finance-store.ts';
import {buildFinancePlan,type FinanceCommand} from '../lib/finance.ts';
import {brazilDay} from '../lib/model.ts';
import {financeDate} from '../lib/finance-date.ts';
import {seal} from '../lib/secret-box.ts';
import {appointmentReminders} from '../lib/whatsapp-reminder.ts';
import {paymentReminders} from '../lib/payment-reminder.ts';
import {localFeedbacks,saveLocalFeedback} from '../lib/commerce-local.ts';
process.env.ANOTA_DATABASE_PATH=':memory:';
async function modules(){const hooks=registerHooks({resolve(s,c,next){return next(s==='next/headers'?'next/headers.js':s,c);}});try{return {store:await import('../lib/whatsapp-store.ts'),worker:await import('../lib/whatsapp-worker.ts'),server:await import('../lib/whatsapp-server.ts')};}finally{hooks.deregister();}}
const sender='5511999999999',phone='5511988888888';
function add(user:string,c:FinanceCommand){const p=buildFinancePlan(c,localFinanceState(user),user,randomUUID());applyLocalFinance(user,p,'MANUAL');return p;}
async function context(){const old={storage:process.env.ANOTA_STORAGE,url:process.env.ANOTA_WHATSAPP_URL,key:process.env.OPENAI_API_KEY},transport=globalThis.fetch;process.env.ANOTA_STORAGE='local';process.env.ANOTA_WHATSAPP_URL='https://provider.example';delete process.env.OPENAI_API_KEY;const m=await modules(),user=registerLocal(randomUUID()+'@example.test','whatsapp-test-only','Teste').user.id;
 const bot:import('../lib/whatsapp-store.ts').Bot={user_id:user,phone,allowed_phones:[sender],enabled:true,status:'PRONTO',instance_id:'synthetic-instance',token_cipher:seal('synthetic-token',m.server.encryptionSecret(),'anota-ai-bot:'+user),hook_cipher:'unused-test',updated_at:new Date().toISOString()};await m.store.putBot(bot,null);
 return {...m,user,bot,async message(text:string,type:'text'|'audio'='text',number=sender){const id=await m.store.enqueue(user,{provider_id:randomUUID(),sender:number,type,text:type==='audio'?'':text,sent_at:new Date().toISOString()});assert.ok(id);const row=await m.store.claimMessage();assert.ok(row);assert.equal(row.id,id);await m.worker.processMessage(row);return (await m.store.history(user)).find(r=>r.id===id)!;},restore(){localDb().prepare('DELETE FROM inbox WHERE user_id=?').run(user);localDb().prepare('DELETE FROM bots WHERE user_id=?').run(user);globalThis.fetch=transport;for(const [k,v]of Object.entries({ANOTA_STORAGE:old.storage,ANOTA_WHATSAPP_URL:old.url,OPENAI_API_KEY:old.key})){if(v===undefined)delete process.env[k];else process.env[k]=v;}}};
}
test('configuração salva cem números na conta, conserva a conexão e revoga quem foi removido',async()=>{
 const c=await context(),previousManager=process.env.ANOTA_MANAGER_USER_IDS;try{
  await assert.rejects(c.server.saveBot({user:{id:c.user,name:'Teste',email:'test@example.test'},token:'fixture'},{phone,allowed_phones:[sender],enabled:true,expected_updated_at:c.bot.updated_at}),/exclusiva da gestão/);
  process.env.ANOTA_MANAGER_USER_IDS=c.user;
  const auth={user:{id:c.user,name:'Teste',email:'test@example.test'},token:'local-test'},numbers=[sender,...Array.from({length:99},(_,i)=>'55119'+String(10000000+i))];
  await assert.rejects(c.server.saveBot(auth,{phone,allowed_phones:numbers,enabled:true,expected_updated_at:c.bot.updated_at}),/convite pessoal/);
  await c.store.putBot({...c.bot,allowed_phones:numbers},c.bot.updated_at);
  await c.server.saveBot(auth,{phone,allowed_phones:numbers,enabled:true,expected_updated_at:c.bot.updated_at});
  const saved=(await c.store.getBot(c.user))!;assert.deepEqual(saved.allowed_phones,numbers);assert.equal(saved.instance_id,c.bot.instance_id);assert.equal(saved.token_cipher,c.bot.token_cipher);
  await assert.rejects(c.server.saveBot(auth,{phone,allowed_phones:[...numbers,'5511977777777'],enabled:true,expected_updated_at:saved.updated_at}),/convite pessoal/);
  assert.deepEqual((await c.store.getBot(c.user))!.allowed_phones,numbers);
  await c.server.saveBot(auth,{phone,allowed_phones:[sender],enabled:true,expected_updated_at:saved.updated_at});
  assert.deepEqual((await c.store.getBot(c.user))!.allowed_phones,[sender]);assert.equal(await c.store.getBot(randomUUID()),null);
  let sends=0;globalThis.fetch=async()=>{sends++;return Response.json({id:randomUUID()});};
  const rejected=await c.message('Qual meu saldo?','text',numbers[1]);assert.equal(rejected.status,'ERRO');assert.equal(sends,0);
  await assert.rejects(c.server.saveBot(auth,{phone,allowed_phones:numbers,enabled:true,expected_updated_at:saved.updated_at}),/configuração mudou/i);
 }finally{if(previousManager===undefined)delete process.env.ANOTA_MANAGER_USER_IDS;else process.env.ANOTA_MANAGER_USER_IDS=previousManager;c.restore();}
});

test('WhatsApp entrega consultas reais do dono por escrito sem modelo ou busca remota de status',async()=>{
 const c=await context(),sent:{number:string;text:string}[]=[];try{
  add(c.user,{action:'profile_upsert',profile:{salary_cents:1000000,opening_balance_cents:600000,opening_date:brazilDay()}});
  const other=registerLocal(randomUUID()+'@example.test','other-account-test','Outro').user.id;add(other,{action:'profile_upsert',profile:{opening_balance_cents:98765432,opening_date:brazilDay()}});
  globalThis.fetch=async(url,init)=>{assert.ok(String(url).endsWith('/send/text'),String(url));sent.push(JSON.parse(String(init?.body)));return Response.json({id:randomUUID()});};
  const before=JSON.stringify(localFinanceState(c.user));
  for(const text of ['Qual meu saldo na conta?','Qual é meu salário fixo?','Quanto tenho de rendas complementares?','Quantas contas a pagar tenho no mês inteiro?','Me faz um relatório geral de quanto eu gastei até o momento.','Qual minha agenda desta semana?','Me manda relatório das despesas fixas.']){const row=await c.message(text);assert.equal(row.status,'RESOLVIDO',row.reply);assert.equal(row.reply_status,'ACEITO');assert.doesNotMatch(row.reply,/987\.654/);}
  assert.equal(sent.length,7);assert.match(sent[0].text,/6\.000,00/);assert.match(sent[1].text,/10\.000,00/);assert.ok(sent.every(r=>r.number===sender));assert.equal(JSON.stringify(localFinanceState(c.user)),before);
  await c.message('Qual meu saldo?', 'text','5511977777777');assert.equal(sent.length,7);
  const event={provider_id:randomUUID(),sender,type:'text' as const,text:'Qual meu saldo?',sent_at:new Date().toISOString()};assert.ok(await c.store.enqueue(c.user,event));assert.equal(await c.store.enqueue(c.user,event),null);await c.worker.processQueue();assert.equal(sent.length,8);
 }finally{c.restore();}
});
test('gasto simples prepara botões sem IA; 1 salva uma vez e cancelar explicitamente não grava',async()=>{
 const c=await context();try{
  const sent:any[]=[];globalThis.fetch=async(url,init)=>{assert.ok(/\/send\/(?:text|menu)$/.test(String(url)),String(url));sent.push(JSON.parse(String(init?.body)));return Response.json({id:randomUUID()});};
  const p=await c.message('Lança pra mim 150 reais de combustível, por favor?');assert.equal(p.status,'ESCLARECER',p.reply);assert.equal(p.reply_status,'ACEITO');assert.equal(localFinanceState(c.user).expenses.length,0);assert.deepEqual(sent[0].choices,['Confirmar|CONFIRMAR '+p.confirmation_code,'Editar|EDITAR '+p.confirmation_code]);assert.match(p.reply,/150,00/);
  const saved=await c.message('1');assert.equal(saved.status,'LANCADO',saved.reply);assert.equal(localFinanceState(c.user).expenses.length,1);assert.equal(localFinanceState(c.user).expenses[0].amount_cents,15000);await c.message('1');assert.equal(localFinanceState(c.user).expenses.length,1);
  const cancelled=await c.message('Lança 50 reais de gasolina.');assert.equal(cancelled.status,'ESCLARECER');await c.message('CANCELAR '+cancelled.confirmation_code);assert.equal(localFinanceState(c.user).expenses.length,1);await c.message('CONFIRMAR '+cancelled.confirmation_code);assert.equal(localFinanceState(c.user).expenses.length,1);
  await c.message('Lança 25 reais de sorvete.');await c.message('Lança 30 reais de gasolina.');const ambiguous=await c.message('1');assert.match(ambiguous.reply,/mais de uma/);assert.equal(localFinanceState(c.user).expenses.length,1);
 }finally{c.restore();}
});
test('WhatsApp consulta todas as áreas, orienta e envia feedback só após confirmação, com isolamento e idempotência',async()=>{
 const c=await context();try{
  const sent:string[]=[];globalThis.fetch=async(url,init)=>{assert.ok(/\/send\/(?:text|menu)$/.test(String(url)),String(url));sent.push(JSON.parse(String(init?.body)).text);return Response.json({id:randomUUID()});};
  const old=new Date(brazilDay()+'T12:00:00Z');old.setUTCDate(old.getUTCDate()-4);add(c.user,{action:'expense_create',description:'Aluguel em atraso',date:old.toISOString().slice(0,10),amount_cents:40000,status:'PREVISTO'});
  add(c.user,{action:'income_upsert',description:'Serviço previsto',date:brazilDay(),amount_cents:15000,status:'PREVISTO'});
  for(const text of ['Eu tenho alguma conta em atraso?','Tenho contas a receber?','Quais contas vencem hoje?','Quais são minhas viagens?','Quais são meus feedbacks?','Como eu cadastro uma renda extra?','Para que serve a aba contas a pagar?','menu']){const row=await c.message(text);assert.equal(row.status,'RESOLVIDO',row.reply);assert.equal(row.reply_status,'ACEITO');}
  assert.match(sent[0],/400,00 em 1 pagamento em atraso/);assert.match(sent[1],/150,00 em 1 entrada/);
  const before=JSON.stringify(localFinanceState(c.user));
  const other=registerLocal(randomUUID()+'@example.test','other-feedback-test','Outro').user.id;saveLocalFeedback(other,{id:randomUUID(),topic:'Outros',kind:'Sugestão',message:'Feedback privado de outra pessoa.'});
  const proposal=await c.message('Envie um feedback sobre Meu dinheiro: gostaria de mais detalhes do saldo.');assert.equal(proposal.status,'ESCLARECER',proposal.reply);assert.equal(localFeedbacks(c.user).length,0);
  await c.message('1');assert.equal(localFeedbacks(c.user).length,1);await c.message('1');assert.equal(localFeedbacks(c.user).length,1);
  const feedback=await c.message('Quais são meus feedbacks?');assert.match(feedback.reply,/gostaria de mais detalhes do saldo/);assert.doesNotMatch(feedback.reply,/outra pessoa/);
  await c.message('Envie um feedback: gostaria de mudar a cor dos alertas.');await c.message('2');assert.equal(localFeedbacks(c.user).length,1);
  await c.message('Envie um feedback: gostaria de uma nova opção de resumo.');await c.message('Lança 25 reais de sorvete.');const ambiguous=await c.message('1');assert.match(ambiguous.reply,/mais de uma/);assert.equal(localFeedbacks(c.user).length,1);
  assert.equal(JSON.stringify(localFinanceState(c.user)),before);
 }finally{c.restore();}
});
test('áudio agenda com data e horário, exige confirmação e não duplica compromisso',async()=>{
 const c=await context();try{
  process.env.OPENAI_API_KEY='synthetic-only';const source='Por favor agenda pra mim um evento no dia 10 do mês 11 às 14 horas.',date=financeDate('dia 10 do mês 11',brazilDay(),true);
  globalThis.fetch=async(url)=>{const u=String(url);if(u.endsWith('/message/download'))return Response.json({mimetype:'audio/ogg',base64Data:Buffer.alloc(64).toString('base64')});if(u.endsWith('/audio/transcriptions'))return Response.json({text:source});if(u.endsWith('/responses'))return Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({intent:'COMMAND',command:{action:'appointment_upsert',description:'Evento',date,time:'14:00'},confidence:'ALTA',question:'',query:'',target_excerpt:'',money_evidence:[],date_evidence:[{field:'date',excerpt:'dia 10 do mês 11'}]})}]}]});if(u.endsWith('/send/text'))return Response.json({id:randomUUID()});throw Error('Unexpected request');};
  const proposal=await c.message(source,'audio');assert.equal(proposal.status,'ESCLARECER',proposal.reply);assert.ok(proposal.confirmation_code);assert.match(proposal.reply,/24 horas e 5 horas/);assert.equal(localFinanceState(c.user).documents.length,0);
  const confirmed=await c.message('CONFIRMAR '+proposal.confirmation_code);assert.equal(confirmed.status,'LANCADO',confirmed.reply);const appointments=localFinanceState(c.user).documents.filter(d=>d.kind==='APPOINTMENT');assert.equal(appointments.length,1);assert.equal(appointments[0].date,date);assert.equal(appointments[0].details.time,'14:00');
  await c.message('CONFIRMAR '+proposal.confirmation_code);assert.equal(localFinanceState(c.user).documents.filter(d=>d.kind==='APPOINTMENT').length,1);
 }finally{c.restore();}
});
test('lembrete usa fila persistente, é enviado uma vez e cancela se compromisso foi arquivado',async()=>{
 const c=await context();try{
  const at=Date.now()+86400000-60000,date=brazilDay(new Date(at)),time=new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(at);let sends=0;
  globalThis.fetch=async(url)=>{if(String(url).endsWith('/instance/status'))return Response.json({instance:{status:'connected',owner:phone}});assert.ok(String(url).endsWith('/send/text'));sends++;return Response.json({id:randomUUID()});};
  add(c.user,{action:'appointment_upsert',description:'Evento de teste',date,time});const now=Date.now(),d=localFinanceState(c.user).documents.find(d=>d.kind==='APPOINTMENT')!,reminder=appointmentReminders([d],[sender],now)[0];assert.ok(reminder);
  delete (globalThis as any).anoteiReminderSweep;await c.worker.processReminders();assert.equal(sends,1);assert.equal(await c.store.enqueueReminder(c.bot,reminder),null);delete (globalThis as any).anoteiReminderSweep;await c.worker.processReminders();assert.equal(sends,1);
  const p=add(c.user,{action:'appointment_upsert',description:'Evento cancelado',date,time}),id=p.documents[0].document.id,second=localFinanceState(c.user).documents.find(d=>d.id===id)!;assert.ok(await c.store.enqueueReminder(c.bot,appointmentReminders([second],[sender])[0]));add(c.user,{action:'document_archive',target_id:id});delete (globalThis as any).anoteiReminderSweep;await c.worker.processReminders();assert.equal(sends,1);const cancelled=(await c.store.history(c.user)).find(r=>r.provider_id.includes(id))!;assert.equal(cancelled.reply_status,'CANCELADO');
  const before=await c.store.enqueueReminder({...c.bot,allowed_phones:[]},reminder);assert.equal(before,null);
 }finally{c.restore();}
});
test('lembrete com provedor lento não bloqueia consulta e chamadas repetidas compartilham a mesma fila',async()=>{
 const c=await context();let release:()=>void=()=>{};try{
  add(c.user,{action:'profile_upsert',profile:{opening_balance_cents:600000,opening_date:brazilDay()}});
  const at=Date.now()+86400000-60000;add(c.user,{action:'appointment_upsert',description:'Evento independente',date:brazilDay(new Date(at)),time:new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(at)});
  let ready:()=>void=()=>{};const reached=new Promise<void>(ok=>ready=ok),wait=new Promise<void>(ok=>release=ok),sent:string[]=[];
  globalThis.fetch=async(url,init)=>{if(String(url).endsWith('/instance/status')){ready();await wait;return Response.json({instance:{status:'connected',owner:phone}});}assert.ok(String(url).endsWith('/send/text'));sent.push(JSON.parse(String(init?.body)).text);return Response.json({id:randomUUID()});};
  delete (globalThis as any).anoteiReminderSweep;let remindersDone=false;const reminders=c.worker.runWhatsappTick('reminders').then(()=>remindersDone=true);await reached;
  await c.store.enqueue(c.user,{provider_id:randomUUID(),sender,type:'text',text:'Qual meu saldo?',sent_at:new Date().toISOString()});const first=c.worker.runWhatsappTick('messages'),second=c.worker.runWhatsappTick('messages');assert.equal(first,second);await first;assert.equal(remindersDone,false);assert.equal(sent.length,1);assert.match(sent[0],/6\.000,00/);release();await reminders;assert.equal(sent.length,2);
 }finally{release();c.restore();}
});
test('fila descarta permissões revogadas e rejeita lease antigo ou dono diferente',async()=>{
 const c=await context();try{
  let sent=0;globalThis.fetch=async()=>{sent++;return Response.json({id:randomUUID()});};
  const id=await c.store.enqueue(c.user,{provider_id:randomUUID(),sender,type:'text',text:'Qual meu saldo?',sent_at:new Date().toISOString()}),old=await c.store.claimMessage();assert.ok(old);assert.equal(old.id,id);assert.equal(await c.store.patchMessage({...old,user_id:randomUUID()},{reply:'forged'}),false);
  await c.store.patchMessage(old,{claimed_at:new Date(Date.now()-660000).toISOString()});const current=await c.store.claimMessage();assert.ok(current);assert.notEqual(current.lease,old.lease);assert.equal(await c.store.patchMessage(old,{reply:'expired'}),false);
  await c.store.putBot({...c.bot,enabled:false,updated_at:new Date().toISOString()},c.bot.updated_at);await c.worker.processMessage(current);assert.equal(sent,0);
 }finally{c.restore();}
});
test('contas a vencer usam fila durável, não repetem lembrete e cancelam pagamento já confirmado',async()=>{
 const c=await context(),now=Date.parse('2088-10-13T12:00:00Z');try{
  let sends=0;const texts:string[]=[];
  globalThis.fetch=async(url,init)=>{if(String(url).endsWith('/instance/status'))return Response.json({instance:{status:'connected',owner:phone}});assert.ok(String(url).endsWith('/send/text'));const payload=JSON.parse(String(init?.body));assert.equal(payload.number,sender);texts.push(payload.text);sends++;return Response.json({id:randomUUID()});};
  const own=add(c.user,{action:'expense_create',description:'Conta de teste',date:'2088-10-14',amount_cents:40000,status:'PREVISTO'}),id=own.expenses[0].payload.id;
  const other=registerLocal(randomUUID()+'@example.test','other-payment-test','Outro').user.id;add(other,{action:'expense_create',description:'Conta de outro usuário',date:'2088-10-14',amount_cents:9876500,status:'PREVISTO'});
  delete (globalThis as any).anoteiReminderSweep;await c.worker.processReminders(now);assert.equal(sends,1);assert.match(texts[0],/400,00/);assert.doesNotMatch(texts[0],/98\.765/);assert.equal(localFinanceState(c.user).expenses[0].status,'PREVISTO');
  const reminder=paymentReminders(localFinanceState(c.user).expenses,[sender],now)[0];assert.equal(await c.store.enqueueReminder(c.bot,reminder,now),null);delete (globalThis as any).anoteiReminderSweep;await c.worker.processReminders(now+60000);assert.equal(sends,1);
  const day=Date.parse('2088-10-14T12:00:00Z'),due=paymentReminders(localFinanceState(c.user).expenses,[sender],day)[0];assert.ok(await c.store.enqueueReminder(c.bot,due,day));
  add(c.user,{action:'expense_pay',target_id:id,date:brazilDay()});delete (globalThis as any).anoteiReminderSweep;await c.worker.processReminders(day);assert.equal(sends,1);
  const canceled=(await c.store.history(c.user)).find(row=>row.provider_id===due.provider_id)!;assert.equal(canceled.reply_status,'CANCELADO');
 }finally{await c.store.putBot({...c.bot,enabled:false,updated_at:new Date().toISOString()},c.bot.updated_at);c.restore();}
});

test('outbox remoto respeita esquema existente, dono, lease nulo e leituras em paralelo',async()=>{
 const c=await context(),keys=['SUPABASE_URL','SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY'],old=Object.fromEntries(keys.map(k=>[k,process.env[k]]));try{
  process.env.ANOTA_STORAGE='supabase';process.env.SUPABASE_URL='https://database.example';process.env.SUPABASE_ANON_KEY='synthetic-anon';process.env.SUPABASE_SERVICE_ROLE_KEY='synthetic-service';
  const d={id:randomUUID(),kind:'APPOINTMENT' as const,description:'Evento remoto simulado',date:'2026-11-11',amount_cents:0,status:'REALIZADO' as const,active:true,details:{time:'14:00'},updated_at:'2026-10-10T12:00:00Z'},r=appointmentReminders([d],[sender],Date.parse('2026-11-10T17:00:00Z'))[0];let inserted:import('../lib/whatsapp-store.ts').Inbox|undefined;
  globalThis.fetch=async(url,init)=>{const u=new URL(String(url));if(u.pathname.endsWith('/anota_whatsapp_bots')){assert.equal(u.searchParams.get('user_id'),'eq.'+c.user);return Response.json([c.bot]);}if(u.pathname.endsWith('/anota_whatsapp_invitations')){assert.equal(u.searchParams.get('owner_id'),'eq.'+c.user);return Response.json([]);}if(init?.method==='POST'){const row=JSON.parse(String(init.body));assert.equal(row.user_id,c.user);assert.equal(row.entry_id,null);assert.equal(row.lease,null);inserted=row;return Response.json([row]);}if(init?.method==='PATCH'){assert.equal(u.searchParams.get('user_id'),'eq.'+c.user);assert.equal(u.searchParams.get('lease'),'is.null');return Response.json([{...inserted,...JSON.parse(String(init.body))}]);}assert.ok(u.searchParams.get('provider_id')?.includes('anotei-reminder:v1:'));return Response.json([]);};
  const row=await c.store.enqueueReminder(c.bot,r);assert.ok(row);assert.equal(await c.store.patchMessage(row,{reply_status:'CANCELADO'}),true);await c.store.pendingReplies(true);await c.store.pendingReplies(false);
  let docsStarted=false,release:()=>void=()=>{};const gate=new Promise<void>(ok=>release=ok);globalThis.fetch=async(url)=>{const u=new URL(String(url));assert.equal(u.searchParams.get('user_id'),'eq.'+c.user);if(u.pathname.endsWith('/anota_finance_documents')){docsStarted=true;await gate;return Response.json([]);}assert.ok(u.pathname.endsWith('/anota_expenses'));assert.equal(docsStarted,true);release();return Response.json([]);};
  const fs=await import('../lib/finance-server.ts');assert.deepEqual(await fs.financeStateForBot(c.user),{documents:[],expenses:[]});
 }finally{for(const k of keys){if(old[k]===undefined)delete process.env[k];else process.env[k]=old[k];}c.restore();}
});

test('limpeza esconde mensagens antigas sem permitir que o mesmo evento seja lançado novamente',async()=>{
 const c=await context();try{
  const event={provider_id:randomUUID(),sender,type:'text' as const,text:'Mensagem de teste antiga',sent_at:new Date().toISOString()};
  const id=await c.store.enqueue(c.user,event);assert.ok(id);
  const row=(await c.store.history(c.user)).find(message=>message.id===id)!;assert.ok(row);
  localDb().prepare('UPDATE inbox SET data=? WHERE id=? AND user_id=?').run(JSON.stringify({...row,text:'',transcript:'',reply:'',status:'RESOLVIDO',reply_status:'LIMPO',confirmation_used:true}),id,c.user);
  assert.equal((await c.store.history(c.user)).some(message=>message.id===id),false);
  assert.equal(await c.store.enqueue(c.user,event),null);
  const fresh=await c.store.enqueue(c.user,{...event,provider_id:randomUUID(),text:'Nova mensagem'});assert.ok(fresh);
  assert.equal((await c.store.history(c.user)).some(message=>message.id===fresh),true);
 }finally{c.restore();}
});

test('conta mensal por texto segue 2 editar, reconfirma, salva uma vez e continua nos próximos meses',async()=>{
 const c=await context();try{
  globalThis.fetch=async(url)=>{assert.ok(/\/send\/(?:text|menu)$/.test(String(url)));return Response.json({id:randomUUID()});};
  const proposal=await c.message('Pago meu carro todo dia 22 valor de 1500 reais agenda para mim.');assert.equal(proposal.status,'ESCLARECER',proposal.reply);assert.match(proposal.reply,/dia 22/);assert.match(proposal.reply,/2 — Editar/);assert.equal(localFinanceState(c.user).expenses.length,0);
  const editing=await c.message('2');assert.match(editing.reply,/Escreva o que deseja corrigir/);assert.equal(localFinanceState(c.user).expenses.length,0);
  const correction=await c.message('O valor certo é 1600 reais');assert.equal(correction.status,'ESCLARECER',correction.reply);assert.match(correction.reply,/1.600,00/);assert.equal(localFinanceState(c.user).expenses.length,0);
  await c.message('CONFIRMAR '+proposal.confirmation_code);assert.equal(localFinanceState(c.user).expenses.length,0);
  const saved=await c.message('1');assert.equal(saved.status,'LANCADO',saved.reply);let state=localFinanceState(c.user);assert.equal(state.expenses.length,12);assert.ok(state.expenses.every(e=>e.amount_cents===160000&&e.status==='PREVISTO'&&e.kind==='MENSAL'));assert.equal(state.documents.filter(d=>d.kind==='BILL_RULE').length,1);
  await c.message('CONFIRMAR '+correction.confirmation_code);assert.equal(localFinanceState(c.user).expenses.length,12);
  const {expandMonthlyBillsForBot}=await import('../lib/monthly-bills-server.ts');const future=Date.parse(brazilDay().slice(0,8)+'01T12:00:00Z')+400*86400000;assert.ok(await expandMonthlyBillsForBot(c.user,future)>0);state=localFinanceState(c.user);const before=state.expenses.length;assert.equal(await expandMonthlyBillsForBot(c.user,future),0);assert.equal(localFinanceState(c.user).expenses.length,before);
 }finally{c.restore();}
});
test('áudio recorrente usa o mesmo fluxo e edição da agenda não cria dois compromissos',async()=>{
 const c=await context();try{
  process.env.OPENAI_API_KEY='synthetic-only';let transcript='Pago meu carro todo dia 22 valor de 1500 reais agenda para mim.';
  globalThis.fetch=async(url)=>{const u=String(url);if(u.endsWith('/message/download'))return Response.json({mimetype:'audio/ogg',base64Data:Buffer.alloc(64).toString('base64')});if(u.endsWith('/audio/transcriptions'))return Response.json({text:transcript});assert.ok(/\/send\/(?:text|menu)$/.test(u));return Response.json({id:randomUUID()});};
  const bill=await c.message('', 'audio');assert.equal(bill.status,'ESCLARECER',bill.reply);transcript='opção um';await c.message('', 'audio');assert.equal(localFinanceState(c.user).expenses.length,12);
  transcript='Agenda uma consulta dia 10 de novembro às 14h.';const appointment=await c.message('', 'audio');assert.equal(appointment.status,'ESCLARECER',appointment.reply);transcript='opção dois';await c.message('', 'audio');const correction=await c.message('às 15h');assert.equal(correction.status,'ESCLARECER',correction.reply);assert.match(correction.reply,/15:00/);assert.equal(localFinanceState(c.user).documents.filter(d=>d.kind==='APPOINTMENT').length,0);await c.message('1');const appointments=localFinanceState(c.user).documents.filter(d=>d.kind==='APPOINTMENT');assert.equal(appointments.length,1);assert.equal(appointments[0].details.time,'15:00');
 }finally{c.restore();}
});
