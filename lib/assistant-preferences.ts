import {config,localMode,type Auth} from './server.ts';
import {localAssistantName,setLocalAssistantName} from './local-db.ts';
import {assistantName,savedAssistantName} from './assistant-name.ts';
import {AppError,uuid} from './model.ts';

export async function saveAssistantName(auth:Auth,value:unknown){
 const name=assistantName(value);
 if(localMode())return setLocalAssistantName(auth.user.id,name);
 const {url,key}=config(),r=await fetch(url+'/auth/v1/user',{method:'PUT',headers:{apikey:key,Authorization:'Bearer '+auth.token,'Content-Type':'application/json'},body:JSON.stringify({data:{assistant_name:name}}),signal:AbortSignal.timeout(10000),cache:'no-store'});
 if(!r.ok)throw new AppError('Não foi possível salvar o nome. Tente novamente.');
 return name;
}
// Called only after the WhatsApp queue has verified the owner and allowed sender.
export async function assistantNameForBot(user:string){
 if(!uuid(user))throw new AppError('Conta inválida.',403);
 if(localMode())return localAssistantName(user);
 const {url}=config(),key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!key)throw new AppError('Integração ainda não configurada.',503);
 const r=await fetch(url+'/auth/v1/admin/users/'+encodeURIComponent(user),{headers:{apikey:key,Authorization:'Bearer '+key},signal:AbortSignal.timeout(10000),cache:'no-store'});
 if(!r.ok)throw new AppError('Não foi possível consultar o nome da sua IA.');
 const data=await r.json();return savedAssistantName(data.user_metadata?.assistant_name);
}
