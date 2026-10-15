import {localMode,service} from './server.ts';
import {rawPersonalBot} from './whatsapp-members.ts';
import {statusBot,credentials} from './whatsapp-server.ts';
import {communicationText} from './communications.ts';
import {sendText} from './whatsapp.ts';
export type CommunicationClaim={id:string;owner_id:string;invitation_id:string;phone:string;message:string;lease:string};
export async function processCommunications(){
 if(localMode())return 0;
 const owners=await service<string[]>('rpc/anota_communication_owners','POST',{});
 let processed=0;
 for(const owner of owners){
  const bot=await rawPersonalBot(owner);if(!bot?.enabled||bot.status!=='PRONTO'||bot.shared_owner_id||!(await statusBot(bot)).connected)continue;
  const row=await service<CommunicationClaim|null>('rpc/anota_claim_communication','POST',{p_owner:owner});if(!row)continue;
  let status:'ACEITO'|'FALHOU'|'INCERTO'|'CANCELADO'='INCERTO';
  try{
   const current=await rawPersonalBot(owner),allowed=await service<boolean>('rpc/anota_check_communication','POST',{p_owner:owner,p_recipient:row.id,p_lease:row.lease});
   if(!allowed||!current?.enabled||current.status!=='PRONTO'||current.shared_owner_id||!current.allowed_phones.includes(row.phone))status='CANCELADO';
   else{const connection=credentials(current);status=await sendText(connection.url,connection.token,row.phone,communicationText(row.message));}
  }catch{/* Unknown delivery is deliberately not retried. */}
  await service('anota_communication_recipients?id=eq.'+row.id+'&lease=eq.'+row.lease+'&status=eq.ENVIANDO','PATCH',{status,updated_at:new Date().toISOString()});processed++;
 }
 return processed;
}
