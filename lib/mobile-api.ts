import {randomUUID} from 'node:crypto';
import {AppError,object,uuid} from './model.ts';
import {body,json,localMode,type Auth} from './server.ts';
import {localSecret,loginLocal,logoutLocal,userLocal,throttleLocal} from './local-db.ts';
import {loginCloud,createCloudSession,cloudSession,logoutCloud} from './cloud-auth.ts';
import {sealMobileSession,readMobileSession} from './mobile-session-codec.ts';
import {requireSubscriptionAccess} from './subscription-access.ts';
import {financeState,financeSecret,applyFinance,verifiedFinanceReceipt} from './finance-server.ts';
import {buildFinancePlan,financeSnapshot,readFinance,signFinance} from './finance.ts';
import {assistantTurn} from './assistant-turn.ts';
import {reserveUsage,settleUsage,usageSummary} from './subscription-usage.ts';

function enabled(){if(process.env.ANOTA_MOBILE_API_ENABLED!=='1')throw new AppError('O aplicativo mobile ainda não está habilitado neste servidor.',503);}
function secret(){return localMode()?localSecret():process.env.ANOTA_MOBILE_SESSION_KEY||'';}
function fields(input:Record<string,unknown>,allowed:string[]){if(Object.keys(input).some(k=>!['action',...allowed].includes(k)))throw new AppError('Confira os campos enviados.');}
export async function mobileIdentity(req:Request):Promise<Auth & {session:string}>{
 enabled();const header=req.headers.get('authorization')||'';
 if(!header.startsWith('Bearer ')||req.headers.has('cookie'))throw new AppError('Entre no aplicativo para continuar.',401);
 const s=readMobileSession(header.slice(7),secret()),auth=localMode()?{user:userLocal(s.session),token:s.session}:await cloudSession(s.session);
 if(auth.user.id!==s.user)throw new AppError('Sessão inválida.',401);
 return {...auth,session:s.session};
}
/** No cookie fallback, client-supplied owner, CORS wildcard, or administrative mobile API. */
export async function mobileRequest(req:Request){
 enabled();const input=object(await body(req,125000));
 if(input.action==='login'){
  fields(input,['email','password']);
  if(req.headers.has('authorization')||req.headers.has('cookie'))throw new AppError('Inicie uma nova sessão.',400);
  const email=typeof input.email==='string'?input.email.trim().toLowerCase():'',password=input.password;
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254||typeof password!=='string'||!password.length||password.length>128)throw new AppError('Confira seu e-mail e senha.');
  // Check key configuration before issuing a backing session.
  if(secret().length<32)throw new AppError('Acesso mobile ainda não configurado.',503);
  throttleLocal('login:'+email,10,600000);
  const result=localMode()?loginLocal(email,password):createCloudSession(await loginCloud(email,password));
  return json({user:result.user,...sealMobileSession(result.user.id,result.token,secret())});
 }
 const auth=await mobileIdentity(req);
 if(input.action==='logout'){fields(input,[]);if(localMode())logoutLocal(auth.session);else await logoutCloud(auth.session);return json({ok:true});}
 if(input.action==='session'){fields(input,[]);return json({user:auth.user,usage:await usageSummary(auth.user.id)});}
 await requireSubscriptionAccess(auth.user.id);
 if(input.action==='snapshot'){fields(input,[]);return json({snapshot:financeSnapshot(await financeState(auth)),usage:await usageSummary(auth.user.id)});}
 if(input.action==='prepare'){
  fields(input,['command','request_id']);if(!uuid(input.request_id))throw new AppError('Pedido inválido.');
  const plan=buildFinancePlan(input.command,await financeState(auth),auth.user.id,input.request_id);
  return json({ok:true,saved:false,pending:{title:plan.title,lines:plan.lines,confirmation:signFinance(plan,auth.user.id,financeSecret())}});
 }
 if(input.action==='confirm'){
  fields(input,['confirmation']);const plan=readFinance(input.confirmation,auth.user.id,financeSecret());
  return json(verifiedFinanceReceipt(await applyFinance(auth,plan),plan));
 }
 if(input.action==='interpret'){
  fields(input,['text','request_id','conversation_id','section']);
  if(typeof input.text!=='string'||input.text.trim().length<2||input.text.length>4000||!uuid(input.request_id))throw new AppError('Escreva um pedido curto.');
  const key=process.env.OPENAI_API_KEY;if(!key)throw new AppError('Assistente ainda não configurada.',503);
  throttleLocal('mobile-interpret:'+auth.user.id,40,3600000);
  const reservation=await reserveUsage(auth.user.id,'REQUEST',input.request_id,1,input.text);
  if(reservation.duplicate){if(reservation.result)return json(reservation.result);throw new AppError('O pedido anterior está em andamento.',409);}
  try{const result=await assistantTurn({user:auth.user.id,text:input.text,state:await financeState(auth),key,secret:financeSecret(),requestId:input.request_id,conversation:input.conversation_id,name:auth.user.assistant_name,section:input.section});await settleUsage(auth.user.id,input.request_id,'REQUEST',1,result);return json(result);}
  catch(error){await settleUsage(auth.user.id,input.request_id,'REQUEST',0).catch(()=>undefined);throw error;}
 }
 throw new AppError('Operação mobile não disponível.');
}
export function mobileFailure(error:unknown){return json({error:error instanceof AppError?error.message:'Não foi possível concluir. Tente novamente.',request_id:randomUUID()},error instanceof AppError?error.status:500);}
