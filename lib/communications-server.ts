import {AppError,uuid} from './model.ts';
import {localMode,service} from './server.ts';
import {requireManager} from './commerce.ts';
import {personalInvitations,rawPersonalBot} from './whatsapp-members.ts';
import {communicationInput,type Communication,type CommunicationContact,type CommunicationDetail} from './communications.ts';
async function all<T>(path:string){const result:T[]=[];for(let offset=0;offset<100000;offset+=1000){const page=await service<T[]>(path+'&limit=1000&offset='+offset);result.push(...page);if(page.length<1000)return result;}throw new AppError('Divida a consulta em grupos menores.',413);}
export async function communicationData(owner:string){
 requireManager(owner);if(localMode())throw new AppError('O canal de comunicação está disponível na gestão online.',503);
 const [invites,master,subscriptions,disabled,jobs]=await Promise.all([personalInvitations(owner),rawPersonalBot(owner),all<{user_id:string;status:string;plan_code:string}>('anota_subscriptions?select=user_id,status,plan_code&order=user_id'),all<{user_id:string}>('anota_access_accounts?disabled_at=not.is.null&select=user_id&order=user_id'),service<Communication[]>('rpc/anota_communication_history','POST',{p_owner:owner})]);
 const blocked=new Set(disabled.map(d=>d.user_id)),contacts:CommunicationContact[]=invites.filter(i=>i.active&&i.user_id&&i.user_id!==owner&&!blocked.has(i.user_id)&&master?.allowed_phones.includes(i.phone)).map(i=>{const sub=subscriptions.find(s=>s.user_id===i.user_id);return {id:i.id,name:i.subscriber_name||'Assinante',phone:i.phone,plan_code:sub?.plan_code||i.plan_code||'BASICO',subscription_status:sub?.status||'SEM_ASSINATURA'};});
 return {contacts,jobs,configured:!!master?.enabled&&master.status==='PRONTO'};
}
export async function communicationDetail(owner:string,id:unknown,offset=0):Promise<CommunicationDetail>{
 requireManager(owner);if(!uuid(id)||!Number.isSafeInteger(offset)||offset<0||offset>10000)throw new AppError('Selecione um comunicado.');
 const jobs=await service<Communication[]>('rpc/anota_communication_history','POST',{p_owner:owner}),job=jobs.find(c=>c.id===id);
 if(!job)throw new AppError('Comunicado não encontrado.',404);
 const recipients=await service<CommunicationDetail['recipients']>('anota_communication_recipients?communication_id=eq.'+id+'&select=id,name,phone,status,updated_at&order=name,id&limit=200&offset='+offset);
 return {job,recipients,offset};
}
export async function prepareCommunication(owner:string,raw:unknown){requireManager(owner);const input=communicationInput(raw);await service('rpc/anota_prepare_communication','POST',{p_owner:owner,p_id:input.id,p_message:input.message,p_invitations:input.invitations});return communicationDetail(owner,input.id);}
export async function confirmCommunication(owner:string,id:unknown,cancel=false){requireManager(owner);if(!uuid(id))throw new AppError('Selecione um comunicado.');await service('rpc/anota_confirm_communication','POST',{p_owner:owner,p_id:id,p_cancel:cancel});return communicationDetail(owner,id);}
