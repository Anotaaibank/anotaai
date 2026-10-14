import {randomBytes,randomUUID} from 'node:crypto';
import {AppError,brazilDay,object} from './model.ts';
import {assistantName} from './assistant-name.ts';
import {confirmedRegistrationPassword} from './registration-password.ts';
import {registrationMoney} from './invitation-registration.ts';
import {buildFinancePlan,profileInput} from './finance.ts';
import {invitationForToken,invitationHash,personalSecret} from './whatsapp-members.ts';
import {authFetch,loginCloud,createCloudSession,type CloudUser} from './cloud-auth.ts';
import {seal} from './secret-box.ts';
import {service} from './server.ts';
export async function registerCloudInvitation(input:Record<string,unknown>,today=brazilDay()){
 confirmedRegistrationPassword(input.password,input.password_confirmation);
 const email=typeof input.email==='string'?input.email.trim().toLowerCase():'',name=typeof input.name==='string'?input.name.trim():'';
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254||name.length<2||name.length>80||typeof input.invitation!=='string')throw new AppError('Confira nome, e-mail e senha.');
 const invite=await invitationForToken(input.invitation);if(!invite)throw new AppError('Este convite foi utilizado, expirou ou foi cancelado. Peça um novo link.',409);
 const profile=profileInput({salary_cents:registrationMoney(input.salary),opening_balance_cents:registrationMoney(input.balance,true),opening_date:today,salary_day:Number(input.salary_day||5)},today);
 const hash=invitationHash(input.invitation),password=input.password as string;
 const created=await authFetch('admin/users','POST',{email,password,email_confirm:true,user_metadata:{name,assistant_name:assistantName(input.assistant_name)},app_metadata:{anotei_invitation_hash:hash,registration_pending:true}},undefined,true);
 let user:CloudUser;
 if(created.ok)user=await created.json() as CloudUser;
 else{
  if(![400,422].includes(created.status))throw new AppError('Não foi possível criar a conta. Tente novamente.',503);
  const existing=await loginCloud(email,password),lookup=await authFetch('admin/users/'+existing.user.id,'GET',undefined,undefined,true);
  if(!lookup.ok)throw new AppError('Não foi possível conferir este cadastro.',409);
  const found=await lookup.json() as CloudUser&{app_metadata?:Record<string,unknown>};
  if(found.app_metadata?.anotei_invitation_hash!==hash||found.app_metadata?.registration_pending!==true)throw new AppError('Este e-mail já tem cadastro. Entre com sua senha.',409);
  user=found;
 }
 if(!user.id||user.email!==email)throw new AppError('Não foi possível confirmar a conta criada.',503);
 const plan=buildFinancePlan({action:'profile_upsert',profile},{documents:[],expenses:[]},user.id,randomUUID(),today);
 await service('rpc/anota_register_invitation','POST',{p_hash:hash,p_user:user.id,p_hook:seal(randomBytes(32).toString('base64url'),personalSecret(),'anota-ai-hook:'+user.id),p_plan:plan});
 const update=await authFetch('admin/users/'+user.id,'PUT',{app_metadata:{registration_pending:false,anotei_invitation_hash:null}},undefined,true);
 if(!update.ok)console.warn('Cadastro concluído; atualização do estado da conta pendente.');
 return createCloudSession(await loginCloud(email,password));
}
