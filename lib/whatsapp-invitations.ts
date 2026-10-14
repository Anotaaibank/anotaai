import {localMode} from './server.ts';
import {localDb,transaction} from './local-db.ts';
import {rawLocalBot,invitationText,publicAppOrigin,type PersonalInvitation} from './whatsapp-members-local.ts';
import {credentials} from './whatsapp-server.ts';
import {sendText} from './whatsapp.ts';
import {accessLinkDb,accessLinkInvitation,registeredAccessText,type AccessLink} from './whatsapp-access-links-local.ts';
export async function processAccessLinks(now=Date.now()){
 if(!localMode())return 0;try{publicAppOrigin();}catch{return 0;}const db=accessLinkDb();let count=0;
 const rows=db.prepare("SELECT * FROM whatsapp_access_links WHERE status='NAO_ENVIADO' ORDER BY created_at LIMIT 3").all() as AccessLink[];
 for(const row of rows){const invite=accessLinkInvitation(row);if(!invite||!invite.user_id&&invite.expires_at<=now){db.prepare("UPDATE whatsapp_access_links SET status='CANCELADO' WHERE id=? AND status='NAO_ENVIADO'").run(row.id);continue;}
  const claimed=transaction(()=>{if(!accessLinkInvitation(row))return 0;return db.prepare("UPDATE whatsapp_access_links SET status='ENVIANDO' WHERE id=? AND status='NAO_ENVIADO'").run(row.id).changes;});if(!claimed)continue;
  let status:'ACEITO'|'FALHOU'|'INCERTO'='INCERTO';try{const c=credentials(rawLocalBot(row.owner_id)!);status=await sendText(c.url,c.token,row.phone,invite.user_id?registeredAccessText(invite):invitationText(invite));}catch{/* Never repeat an uncertain send. */}
  db.prepare("UPDATE whatsapp_access_links SET status=?,updated_at=? WHERE id=? AND status='ENVIANDO'").run(status,new Date(now).toISOString(),row.id);count++;
 }return count;
}
export async function processInvitations(now=Date.now()){
 if(!localMode())return 0;try{publicAppOrigin();}catch{return 0;}let count=0;
 const rows=localDb().prepare("SELECT * FROM whatsapp_invitations WHERE send_status='NAO_ENVIADO' AND active=1 AND user_id IS NULL AND expires_at>? ORDER BY created_at LIMIT 3").all(now) as PersonalInvitation[];
 for(const row of rows){const bot=rawLocalBot(row.owner_id);if(!bot?.enabled||bot.status!=='PRONTO'||!bot.allowed_phones.includes(row.phone))continue;
  const claimed=transaction(()=>localDb().prepare("UPDATE whatsapp_invitations SET send_status='ENVIANDO' WHERE id=? AND send_status='NAO_ENVIADO' AND active=1 AND user_id IS NULL").run(row.id).changes);if(!claimed)continue;
  let status:'ACEITO'|'FALHOU'|'INCERTO'='INCERTO';try{const c=credentials(bot);status=await sendText(c.url,c.token,row.phone,invitationText(row));}catch{/* Do not repeat an uncertain send. */}
  localDb().prepare("UPDATE whatsapp_invitations SET send_status=?,updated_at=? WHERE id=? AND send_status='ENVIANDO'").run(status,new Date(now).toISOString(),row.id);count++;
 }return count+await processAccessLinks(now);
}
