import {service} from './server.ts';
import {invitationText,publicAppOrigin,rawPersonalBot,type PersonalInvitation} from './whatsapp-members.ts';
import {accessLinkInvitation,registeredAccessText,type AccessLink} from './whatsapp-access-links.ts';
import {credentials} from './whatsapp-server.ts';
import {sendText} from './whatsapp.ts';
export async function processCloudInvitations(now=Date.now()){
 try{publicAppOrigin();}catch{return 0;}
 let count=0;
 const invites=await service<PersonalInvitation[]>('anota_whatsapp_invitations?send_status=eq.NAO_ENVIADO&active=eq.1&user_id=is.null&expires_at=gt.'+now+'&order=created_at&limit=3');
 for(const invite of invites){
  const master=await rawPersonalBot(invite.owner_id);if(!master?.enabled||master.shared_owner_id||master.status!=='PRONTO'||!master.allowed_phones.includes(invite.phone))continue;
  const claimed=await service<PersonalInvitation[]>('anota_whatsapp_invitations?id=eq.'+invite.id+'&send_status=eq.NAO_ENVIADO&active=eq.1&user_id=is.null','PATCH',{send_status:'ENVIANDO'});if(!claimed[0])continue;
  let status:'ACEITO'|'INCERTO'|'FALHOU'='INCERTO';
  try{const current=await rawPersonalBot(invite.owner_id),[active]=await service<PersonalInvitation[]>('anota_whatsapp_invitations?id=eq.'+invite.id+'&active=eq.1&send_status=eq.ENVIANDO');if(active&&current?.enabled&&current.status==='PRONTO'&&!current.shared_owner_id&&current.allowed_phones.includes(invite.phone)){const connection=credentials(current);status=await sendText(connection.url,connection.token,invite.phone,invitationText(active));}else status='FALHOU';}catch{}
  await service('anota_whatsapp_invitations?id=eq.'+invite.id+'&send_status=eq.ENVIANDO','PATCH',{send_status:status,updated_at:new Date(now).toISOString()});count++;
 }
 const links=await service<AccessLink[]>('anota_whatsapp_access_links?status=eq.NAO_ENVIADO&order=created_at&limit=3');
 for(const link of links){
  const invite=await accessLinkInvitation(link);
  if(!invite||!invite.user_id&&invite.expires_at<=now){await service('anota_whatsapp_access_links?id=eq.'+link.id+'&status=eq.NAO_ENVIADO','PATCH',{status:'CANCELADO'});continue;}
  const claimed=await service<AccessLink[]>('anota_whatsapp_access_links?id=eq.'+link.id+'&status=eq.NAO_ENVIADO','PATCH',{status:'ENVIANDO'});if(!claimed[0])continue;
  let status:'ACEITO'|'INCERTO'|'FALHOU'|'CANCELADO'='INCERTO';
  try{const currentInvite=await accessLinkInvitation(link),master=await rawPersonalBot(link.owner_id);if(!currentInvite||!master)status='CANCELADO';else{const connection=credentials(master);status=await sendText(connection.url,connection.token,link.phone,currentInvite.user_id?registeredAccessText(currentInvite):invitationText(currentInvite));}}catch{}
  await service('anota_whatsapp_access_links?id=eq.'+link.id+'&status=eq.ENVIANDO','PATCH',{status,updated_at:new Date(now).toISOString()});count++;
 }
 return count;
}
