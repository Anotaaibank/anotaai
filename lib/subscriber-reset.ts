import {requireManager} from './commerce.ts';
import {AppError} from './model.ts';
import {localMode,service,type Auth} from './server.ts';
import {localDb,transaction} from './local-db.ts';
import {subscriberResetInput} from './subscriber-controls.ts';
import {rawLocalBot,type PersonalInvitation} from './whatsapp-members-local.ts';
import type {Inbox} from './whatsapp-store.ts';

export type ConversationReset={affected_messages:number;reset_at:string};
export function resetConversationRow(row:Inbox,reset_at:string):Inbox{
 const pending=['FILA','PROCESSANDO'].includes(row.status);
 return {...row,context_reset_at:reset_at,finance_confirmation:'',confirmation_code:'',confirmation_used:true,lease:null,claimed_at:null,
  ...(pending?{status:'RESOLVIDO' as const,reply:'Conversa reiniciada pela gestão. Envie um novo pedido.'}:{}),
  ...((pending||['NAO_ENVIADO','ENVIANDO'].includes(row.reply_status))?{reply_status:'CANCELADO'}:{})};
}
export async function resetSubscriberConversation(auth:Auth,raw:unknown):Promise<ConversationReset>{
 requireManager(auth.user.id);const input=subscriberResetInput(raw);
 if(!localMode())try{return await service<ConversationReset>('rpc/anota_reset_whatsapp_context','POST',{p_actor:auth.user.id,p_phone:input.phone,p_expected:input.expected,p_request:input.request_id});}catch(error){if(error instanceof AppError&&error.status===409)throw new AppError('O cadastro mudou. Atualize a lista.',409);throw error;}
 return transaction(()=>{
  const db=localDb(),invite=db.prepare('SELECT * FROM whatsapp_invitations WHERE owner_id=? AND phone=?').get(auth.user.id,input.phone) as PersonalInvitation|undefined,master=rawLocalBot(auth.user.id);
  if(!master||master.shared_owner_id||!invite?.user_id)throw new AppError('Cadastro não encontrado para reiniciar a conversa.',403);
  const prior=db.prepare('SELECT user_id,entity_id,action,details FROM audit WHERE id=?').get(input.request_id) as {user_id:string;entity_id:string;action:string;details:string}|undefined;
  if(prior){if(prior.user_id!==auth.user.id||prior.entity_id!==invite.id||prior.action!=='CONVERSA_IA_REINICIADA')throw new AppError('Acesso não autorizado.',403);return JSON.parse(prior.details) as ConversationReset;}
  if(invite.updated_at!==input.expected)throw new AppError('O cadastro mudou. Atualize a lista.',409);
  const reset_at=new Date(Math.max(Date.now(),Date.parse(invite.updated_at)+1)).toISOString();let affected_messages=0;
  for(const entry of db.prepare('SELECT id,data FROM inbox WHERE user_id=?').all(invite.user_id) as {id:string;data:string}[]){const row=JSON.parse(entry.data) as Inbox;if(row.sender!==input.phone||row.provider_id.startsWith('anotei-reminder:v1:'))continue;db.prepare('UPDATE inbox SET data=? WHERE id=? AND user_id=?').run(JSON.stringify(resetConversationRow(row,reset_at)),entry.id,invite.user_id);affected_messages++;}
  db.prepare('UPDATE whatsapp_invitations SET updated_at=? WHERE id=?').run(reset_at,invite.id);
  const result={affected_messages,reset_at};db.prepare('INSERT INTO audit VALUES(?,?,?,?,?,?)').run(input.request_id,auth.user.id,invite.id,'CONVERSA_IA_REINICIADA',JSON.stringify(result),reset_at);return result;
 });
}
