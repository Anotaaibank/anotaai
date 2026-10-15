import {authorize,body,failure,json,sameOrigin} from '@/lib/server';
import {financeState,financeSecret} from '@/lib/finance-server';
import {assistantTurn} from '@/lib/assistant-turn';
import {throttleLocal} from '@/lib/local-db';
import {AppError} from '@/lib/model';
import {assistantScreen,assistantScreens} from '@/lib/assistant-guide';
import {reserveUsage,settleUsage,usageRequestId} from '@/lib/subscription-usage';
export const runtime='nodejs';
export const maxDuration=60;
export async function POST(req:Request){try{
 sameOrigin(req);const auth=await authorize(),input=await body(req);
 if(Object.keys(input).some(k=>!['transcript','section','conversation_id','request_id','view'].includes(k)))throw new AppError('Mensagem inválida.');
 if(input.section!==undefined&&!assistantScreens.includes(input.section as typeof assistantScreens[number]))throw new AppError('Tela inválida.');
 if(typeof input.transcript!=='string'||input.transcript.length<2||input.transcript.length>4000)throw new AppError('Informe seu comando.');
 const key=process.env.OPENAI_API_KEY;if(!key)throw new AppError('A IA precisa ser ativada.',503);throttleLocal('prepare:'+auth.user.id,40,3600000);
 const id=usageRequestId(input.request_id),usage=await reserveUsage(auth.user.id,'REQUEST',id,1,input.transcript);
 if(usage.duplicate){if(usage.result)return json(usage.result);throw new AppError('Esse pedido já está em processamento. Aguarde a resposta.',409);}
 try{const result=await assistantTurn({user:auth.user.id,text:input.transcript,state:await financeState(auth),key,secret:financeSecret(),conversation:input.conversation_id,requestId:id,name:auth.user.assistant_name,section:assistantScreen(input.section),view:input.view});await settleUsage(auth.user.id,id,'REQUEST',1,result);return json(result);}catch(error){await settleUsage(auth.user.id,id,'REQUEST',0).catch(()=>{});throw error;}
 }catch(e){return failure(e);}}
