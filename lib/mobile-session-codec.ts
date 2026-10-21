import {createCipheriv,createDecipheriv,createHash,randomBytes} from 'node:crypto';
import {AppError,uuid} from './model.ts';

const purpose='anotei.native.session.v1';
type Session={user:string;session:string;expires:number};
function key(secret:string){if(secret.length<32)throw new AppError('Acesso mobile ainda não configurado.',503);return createHash('sha256').update(purpose+'\0'+secret).digest();}
/** Native tokens cannot be substituted for web cookies or Supabase JWTs. */
export function sealMobileSession(user:string,session:string,secret:string,now=Date.now()){
 if(!uuid(user)||!/^[A-Za-z0-9_-]{43}$/.test(session))throw new AppError('Sessão inválida.',401);
 const expires=now+86400000,iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key(secret),iv);cipher.setAAD(Buffer.from(purpose));
 const encrypted=Buffer.concat([cipher.update(JSON.stringify({user,session,expires})),cipher.final()]);
 return {token:'anm1.'+Buffer.concat([iv,cipher.getAuthTag(),encrypted]).toString('base64url'),expires_at:new Date(expires).toISOString()};
}
export function readMobileSession(token:unknown,secret:string,now=Date.now()):Session{
 const secretKey=key(secret);
 try{
  if(typeof token!=='string'||!/^anm1\.[A-Za-z0-9_-]{80,900}$/.test(token))throw Error();
  const b=Buffer.from(token.slice(5),'base64url'),decipher=createDecipheriv('aes-256-gcm',secretKey,b.subarray(0,12));decipher.setAAD(Buffer.from(purpose));decipher.setAuthTag(b.subarray(12,28));
  const s=JSON.parse(Buffer.concat([decipher.update(b.subarray(28)),decipher.final()]).toString()) as Session;
  if(!uuid(s.user)||!/^[A-Za-z0-9_-]{43}$/.test(s.session)||!Number.isSafeInteger(s.expires)||s.expires<=now||s.expires>now+86400000)throw Error();
  return s;
 }catch{throw new AppError('Sua sessão expirou. Entre novamente.',401);}
}
