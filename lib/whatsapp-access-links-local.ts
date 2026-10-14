import {localDb,transaction} from './local-db.ts';
import {AppError} from './model.ts';
import {phoneBR} from './whatsapp.ts';
import {createPersonalInvitation,localInvitations,rawLocalBot,publicAppOrigin,type PersonalInvitation} from './whatsapp-members-local.ts';

export type AccessLink={id:string;owner_id:string;phone:string;invitation_id:string;status:'NAO_ENVIADO'|'ENVIANDO'|'ACEITO'|'FALHOU'|'INCERTO'|'CANCELADO'|'AUTOMATICO';created_at:string;updated_at:string};
export function accessLinkDb(){const db=localDb();db.exec(`CREATE TABLE IF NOT EXISTS whatsapp_access_links(id TEXT PRIMARY KEY,owner_id TEXT NOT NULL REFERENCES users(id),phone TEXT NOT NULL,invitation_id TEXT NOT NULL REFERENCES whatsapp_invitations(id),status TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL); CREATE INDEX IF NOT EXISTS whatsapp_access_queue ON whatsapp_access_links(status,created_at); CREATE INDEX IF NOT EXISTS whatsapp_access_owner ON whatsapp_access_links(owner_id,phone,created_at);`);return db;}
export function accessLinkInvitation(row:AccessLink){const bot=rawLocalBot(row.owner_id),invite=localInvitations(row.owner_id).find(i=>i.id===row.invitation_id&&i.phone===row.phone);return bot?.enabled&&bot.status==='PRONTO'&&!bot.shared_owner_id&&bot.allowed_phones.includes(row.phone)&&invite?.active?invite:null;}
export function queueAccessLink(owner:string,rawPhone:unknown,requestId:unknown,expected:unknown,now=Date.now()){
 publicAppOrigin();const phone=phoneBR(rawPhone);if(typeof requestId!=='string'||! /^[a-f0-9-]{36}$/i.test(requestId))throw new AppError('Atualize a página e tente enviar novamente.');
 return transaction(()=>{const db=accessLinkDb(),bot=rawLocalBot(owner);if(!bot?.enabled||bot.status!=='PRONTO'||bot.shared_owner_id||!bot.allowed_phones.includes(phone))throw new AppError('Escolha um participante autorizado e mantenha o WhatsApp conectado.',409);
  const prior=db.prepare('SELECT * FROM whatsapp_access_links WHERE id=?').get(requestId) as AccessLink|undefined;
  if(prior){if(prior.owner_id!==owner||prior.phone!==phone)throw new AppError('Pedido de envio indisponível.',409);return prior;}
  if(bot.updated_at!==expected)throw new AppError('A configuração mudou. Atualize a lista.',409);
  let invite=localInvitations(owner).find(i=>i.phone===phone);if(!invite?.active)throw new AppError('Este número não possui convite pessoal ativo.',409);
  const pending=db.prepare("SELECT id FROM whatsapp_access_links WHERE owner_id=? AND phone=? AND status IN ('NAO_ENVIADO','ENVIANDO','INCERTO') LIMIT 1").get(owner,phone);if(pending)throw new AppError('Já existe um envio pendente ou em conferência para este número. Confira o WhatsApp antes de reenviar.',409);
  if(!invite.user_id&&(invite.send_status==='ENVIANDO'||invite.send_status==='INCERTO'))throw new AppError('O convite está em conferência. Confira o WhatsApp antes de reenviar.',409);
  if(!invite.user_id&&(invite.expires_at<=now||invite.send_status==='FALHOU')){createPersonalInvitation(owner,phone,bot.updated_at,now);invite=localInvitations(owner).find(i=>i.phone===phone)!;}
  const status=!invite.user_id&&invite.send_status==='NAO_ENVIADO'?'AUTOMATICO':'NAO_ENVIADO',date=new Date(now).toISOString();
  db.prepare('INSERT INTO whatsapp_access_links VALUES(?,?,?,?,?,?,?)').run(requestId,owner,phone,invite.id,status,date,date);return db.prepare('SELECT * FROM whatsapp_access_links WHERE id=?').get(requestId) as AccessLink;
 });
}
export function accessLinkViews(owner:string){const rows=accessLinkDb().prepare('SELECT * FROM whatsapp_access_links WHERE owner_id=? ORDER BY created_at DESC,rowid DESC').all(owner) as AccessLink[],seen=new Set<string>();return rows.filter(r=>{if(seen.has(r.phone))return false;seen.add(r.phone);return true;}).map(r=>{const invite=accessLinkInvitation(r);return {phone:r.phone,status:!invite?'CANCELADO':r.status==='AUTOMATICO'?invite.send_status:r.status,updated_at:r.updated_at};});}
export function registeredAccessText(invite:PersonalInvitation){if(!invite.user_id)throw new AppError('Conclua o cadastro pessoal.');return '*Seu acesso ao Anotei na Hora*\n\nAbra o aplicativo no celular:\n'+publicAppOrigin()+'/\n\nEntre com o e-mail e a senha que você cadastrou. Sua conta, seu saldo e seus lançamentos continuam os mesmos.\n\n*Como usar - manual ilustrado:*\n'+publicAppOrigin()+'/manual\n\nVocê pode ler online, baixar o PDF e adicionar o aplicativo à tela inicial do celular.';}
