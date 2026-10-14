import {authorize,body,failure,json,sameOrigin} from '@/lib/server';
import {saveAssistantName} from '@/lib/assistant-preferences';
import {AppError,object} from '@/lib/model';
import {savedAssistantName} from '@/lib/assistant-name';
export const runtime='nodejs';
export async function GET(){try{const {user}=await authorize();return json({name:savedAssistantName(user.assistant_name)});}catch(e){return failure(e);}}
export async function PATCH(req:Request){try{sameOrigin(req);const auth=await authorize(),input=object(await body(req,1000));if(Object.keys(input).some(k=>k!=='name')||typeof input.name!=='string')throw new AppError('Informe apenas o nome da sua IA.');return json({name:await saveAssistantName(auth,input.name)});}catch(e){return failure(e);}}
