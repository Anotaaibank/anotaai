import * as local from './whatsapp-access-links-local.ts';
import {randomBytes} from 'node:crypto';
import {seal} from './secret-box.ts';
import {localMode,service} from './server.ts';
import {AppError,uuid} from './model.ts';
import {phoneBR} from './whatsapp.ts';
import {createPersonalInvitation,personalInvitations,rawPersonalBot,publicAppOrigin,personalSecret,invitationHash,type PersonalInvitation} from './whatsapp-members.ts';
export type {AccessLink} from './whatsapp-access-links-local.ts';
export const registeredAccessText=local.registeredAccessText;
export async function retryAccessLink(owner:string,rawPhone:unknown,request:unknown,expected:string,notReceived:unknown){
 if(localMode())throw new AppError('Use a gestão online para reenviar convites.',503);
 if(!uuid(request)||typeof notReceived!=='boolean')throw new AppError('Confira o pedido de reenvio.');
 publicAppOrigin();const phone=phoneBR(rawPhone),invite=(await personalInvitations(owner)).find(i=>i.phone===phone);
 if(!invite)throw new AppError('Assinante não encontrado.',404);
 const token=randomBytes(32).toString('base64url');
 return service<local.AccessLink>('rpc/anota_retry_access_link','POST',{p_owner:owner,p_phone:phone,p_request:request,p_expected:expected,p_not_received:notReceived,p_candidate:{id:invite.id,token_hash:invitationHash(token),token_cipher:seal(token,personalSecret(),'anotei-invitation:'+invite.id),subscriber_name:invite.subscriber_name||'',plan_code:invite.plan_code||'BASICO'}});
}
export async function accessLinkInvitation(row:local.AccessLink):Promise<PersonalInvitation|null>{
 if(localMode())return local.accessLinkInvitation(row)||null;
 const [master,invites]=await Promise.all([rawPersonalBot(row.owner_id),personalInvitations(row.owner_id)]),invite=invites.find(i=>i.id===row.invitation_id&&i.phone===row.phone);
 return master?.enabled&&master.status==='PRONTO'&&!master.shared_owner_id&&master.allowed_phones.includes(row.phone)&&invite?.active?invite:null;
}
export async function queueAccessLink(owner:string,rawPhone:unknown,request:unknown,expected:unknown,now=Date.now()){
 if(localMode())return local.queueAccessLink(owner,rawPhone,request,expected,now);
 publicAppOrigin();const phone=phoneBR(rawPhone);if(!uuid(request)||typeof expected!=='string')throw new AppError('Atualize a página e tente enviar novamente.');
 const prior=await service<local.AccessLink[]>('anota_whatsapp_access_links?id=eq.'+request);
 if(prior[0]&&(prior[0].owner_id!==owner||prior[0].phone!==phone))throw new AppError('Pedido de envio indisponível.',409);
 const invite=(await personalInvitations(owner)).find(i=>i.phone===phone);
 if(!prior[0]&&invite?.active&&!invite.user_id&&(invite.expires_at<=now||invite.send_status==='FALHOU')){await createPersonalInvitation(owner,phone,expected,now);expected=(await rawPersonalBot(owner))!.updated_at;}
 return service<local.AccessLink>('rpc/anota_queue_access_link','POST',{p_owner:owner,p_phone:phone,p_request:request,p_expected:expected});
}
export async function accessLinkViews(owner:string){
 if(localMode())return local.accessLinkViews(owner);
 const [rows,master,invites]=await Promise.all([service<local.AccessLink[]>('anota_whatsapp_access_links?owner_id=eq.'+encodeURIComponent(owner)+'&order=created_at.desc&limit=1000'),rawPersonalBot(owner),personalInvitations(owner)]),seen=new Set<string>();
 return rows.filter(row=>{if(seen.has(row.phone))return false;seen.add(row.phone);return true;}).map(row=>{const invite=invites.find(i=>i.id===row.invitation_id&&i.phone===row.phone),allowed=master?.enabled&&master.status==='PRONTO'&&!master.shared_owner_id&&master.allowed_phones.includes(row.phone)&&invite?.active;return {phone:row.phone,status:!allowed?'CANCELADO':row.status==='AUTOMATICO'?invite!.send_status:row.status,updated_at:row.updated_at};});
}
