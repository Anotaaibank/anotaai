import {authorize,body,failure,json,sameOrigin} from '@/lib/server';
import {claimVoiceRead} from '@/lib/assistant-server';
import {assistantScreens,assistantVoiceHelp} from '@/lib/assistant-guide';
import {assistantManual} from '@/lib/assistant-manual';
import {AppError,object,uuid} from '@/lib/model';
export const runtime='nodejs';
export async function POST(req:Request){try{sameOrigin(req);const {user}=await authorize(),input=object(await body(req,2000));if(Object.keys(input).some(k=>!['id','arguments','current','navigate','view'].includes(k))||!uuid(input.id)||!assistantScreens.includes(input.current as typeof assistantScreens[number]))throw new AppError('Conversa ou tela inválida.');claimVoiceRead(user.id,input.id);const args=object(input.arguments);if(input.navigate===true&&(Object.keys(args).some(k=>k!=='section')||!assistantScreens.includes(args.section as typeof assistantScreens[number])))throw new AppError('Tela não disponível.');const guide=assistantManual(args,input.current,input.view);return json({...guide,navigate:input.navigate===true,voice_reply:guide.mode==='PASSOS'?{ok:true,answer:guide.answer,current_view:guide.current_view,suggested_step:guide.suggested_step,next_step:guide.next_step}:assistantVoiceHelp({section:guide.section,mode:'EXPLICAR'},input.current)});}catch(e){return failure(e);}}
