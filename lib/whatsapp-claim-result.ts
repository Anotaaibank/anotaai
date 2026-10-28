import {uuid} from './model.ts';
import {replyVersion} from './whatsapp-reply-state.ts';
import type {Inbox} from './whatsapp-store.ts';

/** PostgREST can represent a composite result as a row collection, including
 * an all-null composite for an empty claim. A truthy collection is not a job. */
export function claimedInbox(result:unknown):Inbox|null{
 if(result==null)return null;
 if(Array.isArray(result)){
  if(result.length===0)return null;
  if(result.length!==1)throw new Error('Recibo da fila de WhatsApp inválido.');
  result=result[0];if(result==null)return null;
 }
 if(typeof result!=='object'||Array.isArray(result))throw new Error('Recibo da fila de WhatsApp inválido.');
 const row=result as Record<string,unknown>;
 if('id' in row&&'user_id' in row&&Object.values(row).every(value=>value===null))return null;
 if(!uuid(row.id)||!uuid(row.user_id)||!uuid(row.lease)||row.status!=='PROCESSANDO'
  ||typeof row.sender!=='string'||!/^55\d{10,11}$/.test(row.sender)
  ||typeof row.provider_id!=='string'||!row.provider_id
  ||(row.type!=='text'&&row.type!=='audio')||typeof row.text!=='string'||typeof row.transcript!=='string'
  ||typeof row.reply!=='string'||typeof row.reply_status!=='string'
  ||typeof row.created_at!=='string'||!Number.isFinite(Date.parse(row.created_at))
  ||typeof row.claimed_at!=='string'||!Number.isFinite(Date.parse(row.claimed_at))
  ||replyVersion(row as unknown as Inbox)===null)throw new Error('Recibo da fila de WhatsApp inválido.');
 return row as unknown as Inbox;
}
