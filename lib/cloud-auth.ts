import {randomBytes,createHash,scryptSync,timingSafeEqual} from 'node:crypto';
import {localDb} from './local-db.ts';
import {AppError,type User} from './model.ts';
import {config,service} from './server.ts';
import {personalSecret} from './whatsapp-members.ts';
import {seal,unseal} from './secret-box.ts';
import {savedAssistantName} from './assistant-name.ts';
export type CloudUser={id:string;email:string;created_at?:string;user_metadata?:{name?:string;assistant_name?:string}};
export type CloudTokens={access_token:string;refresh_token:string;expires_in:number;user:CloudUser};
export function cloudUser(user:CloudUser):User{return {id:user.id,email:user.email,name:user.user_metadata?.name||user.email.split('@')[0],assistant_name:savedAssistantName(user.user_metadata?.assistant_name)};}
export async function authFetch(path:string,method='GET',data?:unknown,bearer?:string,admin=false){
 const {url,key}=config(),access=admin?process.env.SUPABASE_SERVICE_ROLE_KEY:bearer;
 if(admin&&!access)throw new AppError('Configure o acesso do cadastro no servidor.',503);
 return fetch(url+'/auth/v1/'+path,{method,headers:{apikey:admin?access!:key,...(access?{Authorization:'Bearer '+access}:{}),'Content-Type':'application/json'},body:data===undefined?undefined:JSON.stringify(data),cache:'no-store',signal:AbortSignal.timeout(15000)});
}
export async function loginCloud(email:string,password:string):Promise<CloudTokens>{
 let response=await authFetch('token?grant_type=password','POST',{email,password});
 if(!response.ok){
  const legacy=await service<{user_id:string;email:string;password_hash:string}|null>('rpc/anota_legacy_login','POST',{p_email:email});
  const encoded=legacy?.password_hash||'00000000000000000000000000000000:'+('00'.repeat(64));
  if(! /^[a-f0-9]{32}:[a-f0-9]{128}$/.test(encoded))throw new AppError('E-mail ou senha inválidos.',401);
  const [salt,hash]=encoded.split(':'),valid=timingSafeEqual(scryptSync(password,salt,64),Buffer.from(hash,'hex'));
  if(!legacy||!valid)throw new AppError('E-mail ou senha inválidos.',401);
  const lookup=await authFetch('admin/users/'+legacy.user_id,'GET',undefined,undefined,true);
  if(!lookup.ok||(await lookup.json() as CloudUser).email!==email)throw new AppError('E-mail ou senha inválidos.',401);
  const update=await authFetch('admin/users/'+legacy.user_id,'PUT',{password},undefined,true);
  if(!update.ok)throw new AppError('Não foi possível concluir a migração do acesso. Tente novamente.',503);
  response=await authFetch('token?grant_type=password','POST',{email,password});
 }
 if(!response.ok)throw new AppError('E-mail ou senha inválidos.',401);
 const tokens=await response.json() as CloudTokens;
 if(!tokens.access_token||!tokens.refresh_token||!tokens.user?.id)throw new AppError('Não foi possível iniciar sua sessão.',503);
 await service('rpc/anota_clear_legacy_login','POST',{p_user:tokens.user.id});return tokens;
}
function sessions(){const db=localDb();db.exec('CREATE TABLE IF NOT EXISTS cloud_sessions(hash TEXT PRIMARY KEY,user_id TEXT NOT NULL,cipher TEXT NOT NULL,expires INTEGER NOT NULL)');return db;}
const sessionHash=(token:string)=>createHash('sha256').update(token).digest('hex');
function sessionCipher(hash:string,tokens:CloudTokens){return seal(JSON.stringify({...tokens,access_expires:Date.now()+Number(tokens.expires_in||3600)*1000}),personalSecret(),'anotei-cloud-session:'+hash);}
export function createCloudSession(tokens:CloudTokens){const token=randomBytes(32).toString('base64url'),hash=sessionHash(token);sessions().prepare('INSERT INTO cloud_sessions VALUES(?,?,?,?)').run(hash,tokens.user.id,sessionCipher(hash,tokens),Date.now()+86400000);return {token,user:cloudUser(tokens.user)};}
const refreshing=new Map<string,Promise<CloudTokens>>();
export async function cloudSession(token:string){
 if(! /^[A-Za-z0-9_-]{43}$/.test(token))throw new AppError('Entre na sua conta para continuar.',401);
 const hash=sessionHash(token),row=sessions().prepare('SELECT user_id,cipher FROM cloud_sessions WHERE hash=? AND expires>?').get(hash,Date.now()) as {user_id:string;cipher:string}|undefined;
 if(!row)throw new AppError('Sua sessão expirou. Entre novamente.',401);
 let tokens=JSON.parse(unseal(row.cipher,personalSecret(),'anotei-cloud-session:'+hash)) as CloudTokens&{access_expires:number};
 if(tokens.access_expires<Date.now()+30000){
  let pending=refreshing.get(hash);
  if(!pending){pending=(async()=>{const r=await authFetch('token?grant_type=refresh_token','POST',{refresh_token:tokens.refresh_token});if(!r.ok)throw new AppError('Sua sessão expirou. Entre novamente.',401);const fresh=await r.json() as CloudTokens;if(fresh.user?.id!==row.user_id||!fresh.access_token||!fresh.refresh_token)throw new AppError('Sessão inválida.',401);sessions().prepare('UPDATE cloud_sessions SET cipher=? WHERE hash=?').run(sessionCipher(hash,fresh),hash);return fresh;})();refreshing.set(hash,pending);}
  try{tokens={...await pending,access_expires:Date.now()+3600000};}finally{refreshing.delete(hash);}
 }
 const verified=await authFetch('user','GET',undefined,tokens.access_token);if(!verified.ok)throw new AppError('Sua sessão expirou. Entre novamente.',401);
 const user=await verified.json() as CloudUser;if(user.id!==row.user_id)throw new AppError('Sessão inválida.',401);
 return {user:cloudUser(user),token:tokens.access_token};
}
export async function logoutCloud(token:string){const hash=sessionHash(token),row=sessions().prepare('SELECT cipher FROM cloud_sessions WHERE hash=?').get(hash) as {cipher:string}|undefined;sessions().prepare('DELETE FROM cloud_sessions WHERE hash=?').run(hash);if(row){try{const tokens=JSON.parse(unseal(row.cipher,personalSecret(),'anotei-cloud-session:'+hash)) as CloudTokens;await authFetch('logout','POST',undefined,tokens.access_token);}catch{}}}
