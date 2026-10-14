import {personalRecipient} from '@/lib/whatsapp-members';
import {rawBot,enqueue} from '@/lib/whatsapp-store';
import {hookKey} from '@/lib/whatsapp-server';
import {messageFromWebhook,secureEqual} from '@/lib/whatsapp-expenses';
import {body,json} from '@/lib/server';
import {uuid} from '@/lib/model';
export const runtime='nodejs';
export async function POST(req:Request){try{const url=new URL(req.url),user=url.searchParams.get('account')||req.headers.get('x-anota-account'),key=url.searchParams.get('key')||req.headers.get('x-anota-hook-key');if(!uuid(user))return json({error:'Webhook inválido'},403);const b=await rawBot(user);if(!b||b.shared_owner_id||!b.enabled||b.status!=='PRONTO'||!secureEqual(key,hookKey(b)))return json({error:'Webhook inválido'},403);const message=messageFromWebhook(await body(req,50000),b.phone);if(!message||!b.allowed_phones.includes(message.sender))return json({ignored:true});const recipient=await personalRecipient(user,message.sender);if(!recipient)return json({ignored:true});const id=await enqueue(recipient,message);return json({queued:!!id});}catch{return json({error:'Não foi possível receber a mensagem.'},400);}}
