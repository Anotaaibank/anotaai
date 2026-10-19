import {authorize,body,failure,json,sameOrigin} from '@/lib/server';
import {voiceInput} from '@/lib/assistant-session';
import {closeVoice,startVoice,voiceConfigured} from '@/lib/assistant-server';
import {uuid,AppError} from '@/lib/model';
import {localeFromCookie} from '@/lib/locale';
export const runtime='nodejs';
export async function GET(){try{await authorize();return json({configured:voiceConfigured()});}catch(e){return failure(e);}}
export async function POST(req:Request){try{sameOrigin(req);const {user}=await authorize(),input=voiceInput(await body(req,65000));return json(await startVoice(user.id,input,req.signal,user.assistant_name,localeFromCookie(req.headers.get('cookie'))));}catch(e){return failure(e);}}
export async function DELETE(req:Request){try{sameOrigin(req);const {user}=await authorize(),id=new URL(req.url).searchParams.get('id');if(!uuid(id))throw new AppError('Conversa inválida.');await closeVoice(user.id,id);return json({closed:true});}catch(e){return failure(e);}}
