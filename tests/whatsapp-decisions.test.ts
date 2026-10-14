import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {buildFinancePlan} from '../lib/finance.ts';
import {whatsappPending,confirmedWhatsappPlan,cancelledWhatsappPlan,whatsappPlanReply} from '../lib/whatsapp-finance.ts';
import {sendText} from '../lib/whatsapp.ts';
import {messageFromWebhook} from '../lib/whatsapp-expenses.ts';
const user=randomUUID(),sender='5511999999999',phone='5511988888888',key='synthetic-decisions-only',now=1000;
const proposal=()=>{const plan=buildFinancePlan({action:'expense_create',description:'Gasolina',amount_cents:15000},{documents:[],expenses:[]},user,randomUUID());return{plan,row:{user_id:user,sender,...whatsappPending(plan,user,sender,key,now)}};};
test('1 e 2 apontam somente a uma proposta assinada, do dono e remetente, dentro do prazo',()=>{
 const {row,plan}=proposal(),before=JSON.stringify(row);
 assert.equal(confirmedWhatsappPlan('1',[row],user,sender,key,2000)?.plan.id,plan.id);assert.equal(cancelledWhatsappPlan('2',[row],user,sender,key,2000),row);assert.equal(JSON.stringify(row),before);
 for(const decision of [confirmedWhatsappPlan,cancelledWhatsappPlan]){
  const text=decision===confirmedWhatsappPlan?'1':'2';
  for(const [rows,owner,from,at]of [[[row],randomUUID(),sender,2000],[[row],user,phone,2000],[[row],user,sender,601001],[[{...row,confirmation_used:true}],user,sender,2000],[[{...row,finance_confirmation:row.finance_confirmation+'x'}],user,sender,2000],[[row,proposal().row],user,sender,2000]] as const)assert.throws(()=>decision(text,rows as any,owner,from,key,at));
 }
 const a=proposal();assert.equal(confirmedWhatsappPlan('CONFIRMAR '+a.row.confirmation_code,[row,a.row],user,sender,key,2000)?.plan.id,a.plan.id);assert.equal(cancelledWhatsappPlan('CANCELAR '+a.row.confirmation_code,[row,a.row],user,sender,key,2000),a.row);
 assert.match(whatsappPlanReply(plan,row.confirmation_code),/\n\n\*1 — Confirmar\*\n\*2 — Cancelar\*/);assert.match(whatsappPlanReply(plan),/^\*✅ Registrado\*/);
 const agenda=buildFinancePlan({action:'appointment_upsert',description:'Consulta',date:'2026-11-10',time:'14:00'},{documents:[],expenses:[]},user,randomUUID());const reply=whatsappPlanReply(agenda,row.confirmation_code);assert.match(reply,/10\/11\/2026 às 14:00/);assert.doesNotMatch(reply,/\n• \n/);
});
test('botão recebe ID exato; webhook continua bloqueando outro dono, grupo e mensagens próprias',()=>{
 const {row}=proposal(),value={EventType:'messages',owner:phone,message:{fromMe:false,isGroup:false,chatid:sender+'@s.whatsapp.net',sender_pn:sender+'@s.whatsapp.net',messageTimestamp:Date.now(),id:'button-1',messageType:'InteractiveResponseMessage',buttonOrListid:'CONFIRMAR '+row.confirmation_code,text:'Confirmar'}};
 assert.equal(messageFromWebhook(value,phone)?.text,'CONFIRMAR '+row.confirmation_code);
 for(const changed of [{...value,owner:sender},{...value,message:{...value.message,isGroup:true}},{...value,message:{...value.message,fromMe:true}},{...value,message:{...value.message,buttonOrListid:'CONFIRMAR FAKE'}},{...value,message:{...value.message,buttonOrListId:'CANCELAR '+row.confirmation_code}}])assert.equal(messageFromWebhook(changed,phone),null);
 const {buttonOrListid,...legacy}=value.message;assert.equal(messageFromWebhook({...value,message:{...legacy,buttonOrListId:buttonOrListid}},phone)?.text,buttonOrListid);
});
test('botões preservam código e não repetem envio incerto; incompatibilidade usa texto com 1/2',async()=>{
 const previous=globalThis.fetch,calls:{url:string;body:any}[]=[],code='ABCDEF1234';let status=200;
 try{
  globalThis.fetch=async(url,init)=>{calls.push({url:String(url),body:JSON.parse(String(init?.body))});return status===200?Response.json({id:'sent'}):new Response('{}',{status});};
  assert.equal(await sendText('https://provider.example','synthetic',sender,'Proposta 1/2',code),'ACEITO');assert.ok(calls[0].url.endsWith('/send/menu'));assert.deepEqual(calls[0].body.choices,['Confirmar|CONFIRMAR '+code,'Cancelar|CANCELAR '+code]);assert.equal(calls[0].body.delay,0);
  calls.length=0;globalThis.fetch=async(url,init)=>{calls.push({url:String(url),body:JSON.parse(String(init?.body))});return String(url).endsWith('/send/menu')?new Response('{}',{status:422}):Response.json({id:'plain'});};assert.equal(await sendText('https://provider.example','synthetic',sender,'Proposta 1/2',code),'ACEITO');assert.equal(calls.length,2);assert.ok(calls[1].url.endsWith('/send/text'));assert.equal(calls[1].body.text,'Proposta 1/2');
  for(const failure of [503,429]){calls.length=0;globalThis.fetch=async(url)=>{calls.push({url:String(url),body:{}});return new Response('{}',{status:failure});};await sendText('https://provider.example','synthetic',sender,'Proposta',code);assert.equal(calls.length,1);}
  calls.length=0;globalThis.fetch=async(url)=>{calls.push({url:String(url),body:{}});throw Error('timeout');};assert.equal(await sendText('https://provider.example','synthetic',sender,'Proposta',code),'INCERTO');assert.equal(calls.length,1);
 }finally{globalThis.fetch=previous;}
});
