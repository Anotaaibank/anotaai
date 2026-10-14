import {authorize,body,failure,json,sameOrigin} from '@/lib/server';
import {financeState,financeSecret} from '@/lib/finance-server';
import {assistantTurn} from '@/lib/assistant-turn';
import {throttleLocal} from '@/lib/local-db';
import {AppError} from '@/lib/model';
import {assistantScreen,assistantScreens} from '@/lib/assistant-guide';
export const runtime='nodejs';
export const maxDuration=60;
export async function POST(req:Request){try{sameOrigin(req);const auth=await authorize(),input=await body(req);if(Object.keys(input).some(k=>!['transcript','section','conversation_id','request_id','view'].includes(k)))throw new AppError('Mensagem inválida.');if(input.section!==undefined&&!assistantScreens.includes(input.section as typeof assistantScreens[number]))throw new AppError('Tela inválida.');if(typeof input.transcript!=='string'||input.transcript.length<2||input.transcript.length>4000)throw new AppError('Informe seu comando.');const key=process.env.OPENAI_API_KEY;if(!key)throw new AppError('A IA precisa ser ativada.',503);throttleLocal('prepare:'+auth.user.id,40,3600000);return json(await assistantTurn({user:auth.user.id,text:input.transcript,state:await financeState(auth),key,secret:financeSecret(),conversation:input.conversation_id,requestId:input.request_id,name:auth.user.assistant_name,section:assistantScreen(input.section),view:input.view}));}catch(e){return failure(e);}}
