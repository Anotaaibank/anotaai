import {runWhatsappTick} from '@/lib/whatsapp-worker';
import {secureEqual} from '@/lib/whatsapp-expenses';
import {json} from '@/lib/server';
export const runtime='nodejs';
export const maxDuration=180;
export async function POST(req:Request){const key=process.env.ANOTA_WORKER_SECRET;if(!key||!secureEqual(req.headers.get('authorization'),'Bearer '+key))return json({error:'Acesso não autorizado.'},403);const task=req.headers.get('x-anotei-task')||'messages';if(task!=='messages'&&task!=='reminders'&&task!=='invitations')return json({error:'Tarefa inválida.'},400);return json(await runWhatsappTick(task));}
