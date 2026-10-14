import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {localDb,localSecret,transaction} from './local-db.ts';
import {seal,unseal} from './secret-box.ts';
import {AppError} from './model.ts';
import {phoneBR} from './whatsapp.ts';
import {authorizedPhones} from './whatsapp-contacts.ts';
import {isManager} from './commerce.ts';
import type {Bot} from './whatsapp-store.ts';

export type PersonalInvitation={id:string;owner_id:string;phone:string;user_id:string|null;token_hash:string;token_cipher:string;expires_at:number;send_status:'NAO_ENVIADO'|'ENVIANDO'|'ACEITO'|'INCERTO'|'FALHOU';active:number;created_at:string;updated_at:string};
const tokenHash=(token:string)=>createHash('sha256').update(token).digest('hex');
export function publicAppOrigin(raw=process.env.ANOTA_PUBLIC_URL){try{const u=new URL(raw||'');if(u.protocol!=='https:'||u.username||u.password||u.pathname!=='/'||u.search||u.hash||/^(localhost|127\.|\[|10\.|192\.168\.)/.test(u.hostname))throw Error();return u.origin;}catch{throw new AppError('Ative o endereço público do cadastro antes de enviar convites.',503);}}
export function rawLocalBot(user:string):Bot|null{const row=localDb().prepare('SELECT data FROM bots WHERE user_id=?').get(user) as {data:string}|undefined;return row?JSON.parse(row.data):null;}
export function localInvitations(owner:string){return localDb().prepare('SELECT * FROM whatsapp_invitations WHERE owner_id=? ORDER BY created_at,id').all(owner) as PersonalInvitation[];}
export function personalRecipient(owner:string,phone:string):string|null{
 const bot=rawLocalBot(owner);if(!bot?.enabled||bot.status!=='PRONTO'||bot.shared_owner_id||!bot.allowed_phones.includes(phone))return null;
 const invite=localDb().prepare('SELECT * FROM whatsapp_invitations WHERE owner_id=? AND phone=?').get(owner,phone) as PersonalInvitation|undefined;
 if(!invite)return owner;
 const member=invite.user_id?rawLocalBot(invite.user_id):null;
 return invite.active&&member?.enabled&&member.status==='PRONTO'&&member.shared_owner_id===owner&&member.allowed_phones.length<=2&&member.allowed_phones.includes(phone)?invite.user_id:null;
}
export function localBotAuthorized(user:string,phone:string){const bot=rawLocalBot(user);if(!bot?.enabled||bot.status!=='PRONTO'||!bot.allowed_phones.includes(phone))return false;return personalRecipient(bot.shared_owner_id||user,phone)===user;}
export function localEffectiveBot(user:string):Bot|null{
 const own=rawLocalBot(user);if(!own)return null;
 if(!own.shared_owner_id){const pending=new Set(localInvitations(user).map(i=>i.phone));return {...own,allowed_phones:own.allowed_phones.filter(p=>!pending.has(p))};}
 const master=rawLocalBot(own.shared_owner_id);if(!master||master.shared_owner_id)return {...own,enabled:false};
 return {...own,phone:master.phone,status:master.status,enabled:own.allowed_phones.length>=1&&own.allowed_phones.length<=2&&localBotAuthorized(user,own.allowed_phones[0]),token_cipher:master.token_cipher,connection_user_id:master.user_id};
}
export function createPersonalInvitation(owner:string,rawPhone:unknown,expected:string,now=Date.now()){
 publicAppOrigin();const phone=phoneBR(rawPhone);
 return transaction(()=>{const db=localDb(),bot=rawLocalBot(owner);if(!bot||bot.shared_owner_id||!bot.enabled||bot.status!=='PRONTO')throw new AppError('Conecte e ative o WhatsApp da IA antes de convidar.',409);if(bot.updated_at!==expected)throw new AppError('A configuração mudou. Atualize a lista.',409);
  const previous=db.prepare('SELECT * FROM whatsapp_invitations WHERE phone=?').get(phone) as PersonalInvitation|undefined;
  if(previous&&previous.owner_id!==owner)throw new AppError('Este número já está vinculado a outra conta.',409);
  if(previous?.user_id){const numbers=bot.allowed_phones.includes(phone)?bot.allowed_phones:authorizedPhones([...bot.allowed_phones,phone],bot.phone,isManager(owner)?Infinity:100),date=new Date(Math.max(now,Date.parse(bot.updated_at)+1)).toISOString();db.prepare('UPDATE bots SET data=?,updated_at=? WHERE user_id=?').run(JSON.stringify({...bot,allowed_phones:numbers,updated_at:date}),date,owner);db.prepare('UPDATE whatsapp_invitations SET active=1 WHERE id=?').run(previous.id);return previous;}
  if(previous&&(previous.send_status==='INCERTO'||previous.send_status==='ENVIANDO'))throw new AppError('O envio está em conferência. Confira o WhatsApp antes de reenviar.',409);
  if(previous&&previous.active&&previous.expires_at>now&&bot.allowed_phones.includes(phone)){if(previous.send_status==='FALHOU')db.prepare("UPDATE whatsapp_invitations SET send_status='NAO_ENVIADO' WHERE id=?").run(previous.id);return previous;}
  const numbers=bot.allowed_phones.includes(phone)?bot.allowed_phones:authorizedPhones([...bot.allowed_phones,phone],bot.phone,isManager(owner)?Infinity:100);
  if(phone===bot.phone)throw new AppError('O número da IA deve ser diferente do convidado.');
  const token=randomBytes(32).toString('base64url'),id=previous?.id||randomUUID(),date=new Date(Math.max(now,Date.parse(bot.updated_at)+1)).toISOString();
  db.prepare('INSERT INTO whatsapp_invitations VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET token_hash=excluded.token_hash,token_cipher=excluded.token_cipher,expires_at=excluded.expires_at,send_status=excluded.send_status,active=1,updated_at=excluded.updated_at').run(id,owner,phone,null,tokenHash(token),seal(token,localSecret(),'anotei-invitation:'+id),now+7*86400000,'NAO_ENVIADO',1,previous?.created_at||date,date);
  const updated={...bot,allowed_phones:numbers,updated_at:date};db.prepare('UPDATE bots SET data=?,updated_at=? WHERE user_id=?').run(JSON.stringify(updated),date,owner);
  return db.prepare('SELECT * FROM whatsapp_invitations WHERE id=?').get(id) as PersonalInvitation;
 });
}
export function invitationForToken(token:unknown,now=Date.now()):PersonalInvitation|null{if(typeof token!=='string'||! /^[A-Za-z0-9_-]{43}$/.test(token))return null;const invite=localDb().prepare('SELECT * FROM whatsapp_invitations WHERE token_hash=?').get(tokenHash(token)) as PersonalInvitation|undefined;const bot=invite?rawLocalBot(invite.owner_id):null;return invite&&invite.active&&!invite.user_id&&invite.expires_at>now&&bot?.allowed_phones.includes(invite.phone)?invite:null;}
export function bindPersonalInvitation(token:string,user:string,now=Date.now()){
 return transaction(()=>{const invitation=invitationForToken(token,now),db=localDb();if(!invitation||rawLocalBot(user))throw new AppError('Convite indisponível. Peça um novo link.',409);const master=rawLocalBot(invitation.owner_id)!;
  if(user===master.user_id)throw new AppError('O convite cria uma conta pessoal separada.',409);
  const updated=new Date(now).toISOString(),member:Bot={user_id:user,shared_owner_id:master.user_id,phone:master.phone,allowed_phones:[invitation.phone],enabled:true,status:'PRONTO',instance_id:null,token_cipher:null,hook_cipher:seal(randomBytes(32).toString('base64url'),localSecret(),'anota-ai-hook:'+user),updated_at:updated};
  db.prepare('INSERT INTO bots VALUES(?,?,?)').run(user,JSON.stringify(member),updated);
  const result=db.prepare('UPDATE whatsapp_invitations SET user_id=?,token_cipher=\'\',updated_at=? WHERE id=? AND user_id IS NULL AND active=1').run(user,updated,invitation.id);if(!result.changes)throw new AppError('Convite já utilizado.',409);return invitation.phone;
 });
}
export function invitationText(invite:PersonalInvitation){const token=unseal(invite.token_cipher,localSecret(),'anotei-invitation:'+invite.id);return '*Bem-vindo ao Anotei na Hora!*\n\nCrie sua conta pessoal e cadastre seu salário e saldo atual:\n'+new URL('/cadastro/'+token,publicAppOrigin()).href+'\n\nSuas finanças ficam separadas das outras pessoas. Depois do cadastro, você poderá conversar comigo por áudio ou texto neste WhatsApp.\n\nO convite é individual e vale por 7 dias.';}
export function localInvitationViews(owner:string){return localInvitations(owner).map(i=>({phone:i.phone,registered:!!i.user_id,active:!!i.active&&!!i.user_id&&localBotAuthorized(i.user_id,i.phone),send_status:i.send_status,expired:i.expires_at<=Date.now()}));}
