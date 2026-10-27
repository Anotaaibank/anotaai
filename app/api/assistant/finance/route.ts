import {authorize,body,failure,json,sameOrigin} from '@/lib/server';
import {claimVoiceRead} from '@/lib/assistant-server';
import {financeState,financeSecret,assistantFinanceData,applyFinance,verifiedFinanceReceipt} from '@/lib/finance-server';
import {assistantTurn,assistantSavedContext} from '@/lib/assistant-turn';
import {readFinance} from '@/lib/finance';
import {throttleLocal} from '@/lib/local-db';
import {AppError,object} from '@/lib/model';
export const runtime='nodejs';
export const maxDuration=60;
export async function POST(req:Request){try{sameOrigin(req);const auth=await authorize(),input=await body(req,125000);claimVoiceRead(auth.user.id,String(input.id||''));
 if(input.confirmation){const plan=readFinance(input.confirmation,auth.user.id,financeSecret()),result=verifiedFinanceReceipt(await applyFinance(auth,plan,'VOICE'),plan);let context:unknown={saved:true,title:plan.title,lines:plan.lines};try{context=assistantSavedContext(auth.user.id,String(input.id),await financeState(auth),plan);}catch{/* A verified write remains successful if optional conversation context is unavailable. */}return json({...result,assistant_context:context});}
 if(input.read===true)return json({ok:true,...assistantFinanceData(await financeState(auth),input.arguments??{})});
 const args=object(input.arguments);if(Object.keys(args).some(k=>k!=='transcript')||typeof args.transcript!=='string'||args.transcript.length<2||args.transcript.length>4000)throw new AppError('Diga o que deseja registrar ou alterar.');
 const key=process.env.OPENAI_API_KEY;if(!key)throw new AppError('A IA precisa ser ativada.',503);throttleLocal('prepare:'+auth.user.id,40,3600000);
 return json(await assistantTurn({user:auth.user.id,text:args.transcript,state:await financeState(auth),key,secret:financeSecret(),conversation:input.id,scope:'voice',requestId:input.request_id,name:auth.user.assistant_name}));
 }catch(e){return failure(e);}}
