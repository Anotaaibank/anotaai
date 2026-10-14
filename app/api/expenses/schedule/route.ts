import {createHash} from 'node:crypto';
import {adminInput} from '@/lib/expenses';
import {fixedCategories} from '@/lib/personal-expenses';
import {AppError} from '@/lib/model';
import {monthlyDates} from '@/lib/model';
import {authorize,body,failure,json,localMode,query,sameOrigin} from '@/lib/server';
import {saveLocal,transaction} from '@/lib/local-db';
export const runtime='nodejs';
export async function POST(req:Request){try{sameOrigin(req);const auth=await authorize(),input=await body(req),{expected_updated_at:_,...base}=adminInput({...input.payload as Record<string,unknown>,kind:'MENSAL',status:'PREVISTO'});void _;if(!(fixedCategories as readonly string[]).includes(base.category))throw new AppError('Escolha uma categoria de despesa fixa. Gastos variáveis podem ser anotados pela IA ou WhatsApp quando acontecerem.');const dates=monthlyDates(base.entry_date,Number(input.months));const payloads=dates.map((date,index)=>{const hash=createHash('sha256').update(base.id+':'+index).digest('hex');const id=index===0?base.id:hash.slice(0,8)+'-'+hash.slice(8,12)+'-4'+hash.slice(13,16)+'-8'+hash.slice(17,20)+'-'+hash.slice(20,32);return {...base,id,entry_date:date};});const rows=localMode()?transaction(()=>payloads.map(p=>saveLocal(auth.user.id,p,null,'MANUAL'))):await query(auth.token,'rpc/anota_schedule_expenses','POST',{p_payloads:payloads});return json({rows});}catch(e){return failure(e);}}
