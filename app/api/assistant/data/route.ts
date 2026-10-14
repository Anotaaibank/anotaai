import {authorize,body,failure,json,rows,sameOrigin} from '@/lib/server';
import {claimVoiceRead} from '@/lib/assistant-server';
import {expenseReport} from '@/lib/assistant';
export const runtime='nodejs';
export async function GET(req:Request){try{const auth=await authorize(),query=Object.fromEntries(new URL(req.url).searchParams);return json(expenseReport(await rows(auth),query));}catch(e){return failure(e);}}
export async function POST(req:Request){try{sameOrigin(req);const auth=await authorize(),input=await body(req);claimVoiceRead(auth.user.id,String(input.id||''));return json(expenseReport(await rows(auth),input.arguments));}catch(e){return failure(e);}}
