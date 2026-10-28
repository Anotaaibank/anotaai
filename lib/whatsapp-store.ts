import {randomUUID} from 'node:crypto';
import {localDb,transaction} from './local-db.ts';
import {localMode,service} from './server.ts';
import {localEffectiveBot,rawLocalBot,localBotAuthorized} from './whatsapp-members-local.ts';
import {effectivePersonalBot} from './whatsapp-members.ts';
import type {BotMessage} from './whatsapp-expenses.ts';
import type {Reminder} from './whatsapp-reminder.ts';
import {paymentReminderPrefix,type PaymentReminder} from './payment-reminder.ts';
import {replyVersion,sameReplyFence,canClaimReply,patchedReply} from './whatsapp-reply-state.ts';
import {claimedInbox} from './whatsapp-claim-result.ts';
export type Bot={shared_owner_id?:string;connection_user_id?:string;user_id:string;phone:string;allowed_phones:string[];enabled:boolean;status:'NOVO'|'CRIANDO'|'PRONTO'|'INCERTO'|'FALHOU';instance_id:string|null;token_cipher:string|null;hook_cipher:string;updated_at:string};
export type Inbox={id:string;user_id:string;provider_id:string;sender:string;type:'text'|'audio';text:string;transcript:string;status:'FILA'|'PROCESSANDO'|'LANCADO'|'ESCLARECER'|'ERRO'|'RESOLVIDO';entry_id:string|null;reply:string;reply_status:string;created_at:string;lease:string|null;claimed_at:string|null;reply_version?:number;finance_confirmation?:string;confirmation_code?:string;confirmation_used?:boolean;context_reset_at?:string|null};
export async function rawBot(user:string){if(localMode())return rawLocalBot(user);const [row]=await service<Bot[]>('anota_whatsapp_bots?user_id=eq.'+encodeURIComponent(user));return row||null;}
export async function getBot(user:string){return effectivePersonalBot(user);}
export async function putBot(bot:Bot,expected:string|null){if(localMode()){return transaction(()=>{const db=localDb(),old=db.prepare('SELECT updated_at FROM bots WHERE user_id=?').get(bot.user_id) as {updated_at:string}|undefined;if(old&&old.updated_at!==expected)throw new Error('A configuração mudou. Atualize a página.');db.prepare('INSERT INTO bots VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at').run(bot.user_id,JSON.stringify(bot),bot.updated_at);});}if(expected){const result=await service<Bot[]>('anota_whatsapp_bots?user_id=eq.'+bot.user_id+'&updated_at=eq.'+encodeURIComponent(expected),'PATCH',bot);if(!result.length)throw new Error('A configuração mudou. Atualize a página.');}else await service('anota_whatsapp_bots','POST',bot);}
export async function botPatch(user:string,patch:Partial<Bot>){const b=await rawBot(user);if(!b)throw new Error('Salve os números primeiro.');await putBot({...b,...patch,updated_at:new Date().toISOString()},b.updated_at);}
export async function provisionClaim(user:string){if(localMode())return transaction(()=>{const row=localDb().prepare('SELECT data FROM bots WHERE user_id=?').get(user) as {data:string}|undefined;if(!row)return false;const bot=JSON.parse(row.data) as Bot;if(!['NOVO','FALHOU'].includes(bot.status))return false;bot.status='CRIANDO';bot.updated_at=new Date().toISOString();localDb().prepare('UPDATE bots SET data=?,updated_at=? WHERE user_id=?').run(JSON.stringify(bot),bot.updated_at,user);return true;});return service<boolean>('rpc/anota_provision_claim','POST',{p_user:user});}
// Apply the conversation boundary before LIMIT: another household number must
// not crowd out this sender's pending confirmations or unfinished requests.
export async function history(user:string,sender?:string){
 if(localMode()){
  const where=sender?" AND json_extract(data,'$.sender')=? AND provider_id NOT LIKE 'anotei-reminder:v1:%'":"";
  return (localDb().prepare("SELECT data FROM inbox WHERE user_id=? AND json_extract(data,'$.reply_status')<>'LIMPO'"+where+" ORDER BY rowid DESC LIMIT 50").all(user,...(sender?[sender]:[])) as {data:string}[]).map(r=>JSON.parse(r.data) as Inbox);
 }
 return service<Inbox[]>('anota_whatsapp_inbox?user_id=eq.'+encodeURIComponent(user)+(sender?'&sender=eq.'+encodeURIComponent(sender)+'&provider_id=not.like.anotei-reminder%3Av1%3A*':'')+'&reply_status=neq.LIMPO&order=created_at.desc&limit=50');
}
export async function enqueue(user:string,message:BotMessage){const row:Inbox={id:randomUUID(),user_id:user,provider_id:message.provider_id,sender:message.sender,type:message.type,text:message.text,transcript:message.text,status:'FILA',entry_id:null,reply:'',reply_status:'NAO_ENVIADO',created_at:new Date().toISOString(),lease:null,claimed_at:null};if(localMode()){try{localDb().prepare('INSERT INTO inbox VALUES(?,?,?,?)').run(row.id,user,row.provider_id,JSON.stringify(row));return row.id;}catch{return null;}}const rows=await service<Inbox[]>('anota_whatsapp_inbox?on_conflict=user_id,provider_id','POST',row);return rows[0]?.id||null;}
export async function claimMessage(){if(localMode())return transaction(()=>{const rows=localDb().prepare("SELECT data FROM inbox WHERE json_extract(data,'$.status')='FILA' OR (json_extract(data,'$.status')='PROCESSANDO' AND json_extract(data,'$.claimed_at')<?) ORDER BY rowid LIMIT 1").all(new Date(Date.now()-600000).toISOString()) as {data:string}[];const row=rows[0]?JSON.parse(rows[0].data) as Inbox:null;if(!row)return null;const claimed=patchedReply(row,{status:'PROCESSANDO',lease:randomUUID(),claimed_at:new Date().toISOString()});localDb().prepare('UPDATE inbox SET data=? WHERE id=?').run(JSON.stringify(claimed),row.id);return claimed;});return claimedInbox(await service<unknown>('rpc/anota_claim_message','POST',{}));}
/** false never grants permission to send and never changes the caller's row snapshot. */
export async function patchMessage(row:Inbox,patch:Partial<Inbox>):Promise<boolean>{
 const version=replyVersion(row);
 // A response patch cannot reassign a message or manufacture its revision.
 if(version===null||['id','user_id','sender','provider_id','lease','reply_version'].some(key=>key in patch))return false;
 if(localMode())return transaction(()=>{
  const stored=localDb().prepare('SELECT data FROM inbox WHERE id=?').get(row.id) as {data:string}|undefined;
  if(!stored)return false;const current=JSON.parse(stored.data) as Inbox;if(!sameReplyFence(current,row))return false;
  const next=patchedReply(current,patch);localDb().prepare('UPDATE inbox SET data=? WHERE id=?').run(JSON.stringify(next),row.id);Object.assign(row,next);return true;
 });
 const updated=await service<Inbox[]>('anota_whatsapp_inbox?id=eq.'+encodeURIComponent(row.id)+'&user_id=eq.'+encodeURIComponent(row.user_id)+'&sender=eq.'+encodeURIComponent(row.sender)+'&lease='+(row.lease?'eq.'+encodeURIComponent(row.lease):'is.null')+'&reply_version=eq.'+version,'PATCH',patch);
 if(updated.length!==1||!sameReplyFence(updated[0],patchedReply(row,patch)))return false;
 // The trigger owns reply_version; only a successful database receipt updates our snapshot.
 Object.assign(row,updated[0]);return true;
}
/** Only boolean true grants permission to send this exact reply snapshot. Never send on false. */
export async function replyClaim(row:Inbox):Promise<boolean>{
 const version=replyVersion(row);if(version===null)return false;
 if(localMode())return transaction(()=>{
  const stored=localDb().prepare('SELECT data FROM inbox WHERE id=?').get(row.id) as {data:string}|undefined;
  if(!stored)return false;const current=JSON.parse(stored.data) as Inbox;if(!canClaimReply(current,row))return false;
  current.reply_status='ENVIANDO';localDb().prepare('UPDATE inbox SET data=? WHERE id=?').run(JSON.stringify(current),row.id);Object.assign(row,current);return true;
 });
 const claimed=await service<unknown>('rpc/anota_reply_claim','POST',{p_id:row.id,p_user:row.user_id,p_sender:row.sender,p_lease:row.lease,p_reply_version:version});
 if(claimed!==true)return false;row.reply_status='ENVIANDO';return true;
}
export async function pendingReplies(reminders=false){if(localMode())return (localDb().prepare("SELECT data FROM inbox WHERE json_extract(data,'$.reply_status')='NAO_ENVIADO' AND json_extract(data,'$.status') IN ('LANCADO','RESOLVIDO','ESCLARECER','ERRO') AND "+(reminders?'':'NOT ')+"(provider_id LIKE 'anotei-reminder:v1:%') ORDER BY rowid LIMIT 5").all() as {data:string}[]).map(r=>JSON.parse(r.data) as Inbox);return service<Inbox[]>('anota_whatsapp_inbox?reply_status=eq.NAO_ENVIADO&status=in.(LANCADO,RESOLVIDO,ESCLARECER,ERRO)&provider_id='+(reminders?'like.':'not.like.')+'anotei-reminder%3Av1%3A*&order=created_at&limit=5');}
// Reuse the durable outbox and its unique (owner, provider event) key. No new public table.
export async function enqueueReminder(b:Bot,r:Reminder|PaymentReminder,now=Date.now()){
 if(!b.enabled||b.status!=='PRONTO'||!b.allowed_phones.includes(r.sender))return null;
 const title=r.provider_id.startsWith(paymentReminderPrefix)?'Lembrete de pagamento':'Lembrete da agenda';
 const row:Inbox={id:randomUUID(),user_id:b.user_id,provider_id:r.provider_id,sender:r.sender,type:'text',text:title,transcript:title,status:'RESOLVIDO',entry_id:null,reply:r.reply,reply_status:'NAO_ENVIADO',created_at:new Date(now).toISOString(),lease:null,claimed_at:null};
 if(localMode())return transaction(()=>{const db=localDb(),value=db.prepare('SELECT data FROM bots WHERE user_id=?').get(b.user_id) as {data:string}|undefined,current=value?JSON.parse(value.data) as Bot:null;if(!current||!localBotAuthorized(b.user_id,r.sender))return null;const result=db.prepare('INSERT OR IGNORE INTO inbox VALUES(?,?,?,?)').run(row.id,row.user_id,row.provider_id,JSON.stringify(row));return result.changes?row:null;});
 const current=await getBot(b.user_id);if(!current?.enabled||current.status!=='PRONTO'||!current.allowed_phones.includes(r.sender))return null;
 const rows=await service<Inbox[]>('anota_whatsapp_inbox?on_conflict=user_id,provider_id','POST',row);return rows[0]||null;
}
export async function reminderBots(){
 if(localMode())return (localDb().prepare('SELECT data FROM bots').all() as {data:string}[]).map(r=>localEffectiveBot((JSON.parse(r.data) as Bot).user_id)).filter((b):b is Bot=>!!b&&b.enabled&&b.status==='PRONTO'&&!!b.allowed_phones.length);
 const result:Bot[]=[];for(let offset=0;offset<100000;offset+=1000){const rows=await service<Bot[]>('anota_whatsapp_bots?enabled=eq.true&status=eq.PRONTO&order=user_id&limit=1000&offset='+offset),effective=await Promise.all(rows.map(row=>getBot(row.user_id)));result.push(...effective.filter((bot):bot is Bot=>!!bot&&bot.enabled&&bot.status==='PRONTO'&&!!bot.allowed_phones.length));if(rows.length<1000)return result;}throw new Error('Consulta de lembretes acima do limite.');
}
