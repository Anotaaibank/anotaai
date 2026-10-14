import {createHmac,timingSafeEqual} from 'node:crypto';
import {AppError} from './model.ts';
import {buildFinancePlan,type FinancePlan,type FinanceCommand,type FinanceState} from './finance.ts';
import {fold,monetaryLiterals,literalMoney,financeDate} from './finance-date.ts';
import {nextMonthlyDay} from './monthly-bills.ts';
export const editingPrefix='edit.v1.';
type Editing={plan:FinancePlan;source:string};
const signature=(body:string,key:string)=>createHmac('sha256',key).update('anotei-whatsapp-edit-v1:'+body).digest();
export function signWhatsappEdit(value:Editing,user:string,sender:string,key:string,now=Date.now()){
 if(!key||value.source.length>6000)throw new AppError('Prepare novamente o pedido.');const body=Buffer.from(JSON.stringify({...value,actor:user+':whatsapp:'+sender,expires:now+600000})).toString('base64url');return editingPrefix+body+'.'+signature(body,key).toString('base64url');
}
export function readWhatsappEdit(token:string,user:string,sender:string,key:string,now=Date.now()):Editing{
 try{if(!token.startsWith(editingPrefix)||token.length>150000||!key)throw Error();const [body,sig,...extra]=token.slice(editingPrefix.length).split('.'),expected=signature(body,key),actual=Buffer.from(sig||'','base64url');if(extra.length||expected.length!==actual.length||!timingSafeEqual(expected,actual))throw Error();const d=JSON.parse(Buffer.from(body,'base64url').toString());if(d.actor!==user+':whatsapp:'+sender||!Number.isSafeInteger(d.expires)||d.expires<=now||d.expires>now+600000||typeof d.source!=='string'||!d.plan?.id)throw Error();return {plan:d.plan,source:d.source};}catch{throw new AppError('A edição expirou ou não pertence a este número. Repita o pedido.');}
}
// Simple corrections reuse only verified signed fields. Complex corrections retain the structured interpreter.
export function quickEditedPlan(edit:Editing,text:string,state:FinanceState,user:string,id:string,today:string):FinancePlan|null{
 const s=fold(text),amounts=monetaryLiterals(text);let c:FinanceCommand;
 const rule=edit.plan.documents.find(d=>d.document.kind==='BILL_RULE'),appointment=edit.plan.documents.length===1&&edit.plan.documents[0].document.kind==='APPOINTMENT'?edit.plan.documents[0]:null;
 if(rule){if(rule.expected||!rule.document.active)return null;const r=rule.document;c={action:'expense_schedule',description:r.description,date:r.date,amount_cents:r.amount_cents,category:String(r.details.category),details:{payment_method:r.details.payment_method},schedule_type:'MENSAL',amount_mode:'PARCELA',recurring:true,due_day:Number(r.details.day)};}
 else if(appointment){const a=appointment.document;c={action:'appointment_upsert',...(appointment.expected?{target_id:a.id}:{}),description:a.description,date:a.date,time:String(a.details.time||''),location:String(a.details.location||''),done:Boolean(a.details.done)};}
 else if(edit.plan.expenses.length===1&&edit.plan.documents.length===0){const e=edit.plan.expenses[0];if(e.active!==undefined)return null;c={action:e.expected?'expense_update':'expense_create',...(e.expected?{target_id:e.payload.id}:{}),description:e.payload.description,date:e.payload.entry_date,amount_cents:e.payload.amount_cents,category:e.payload.category,status:e.payload.status,details:e.payload.details};}
 else return null;
 if(amounts.length===1&&!appointment&&/^(?:o |a |na verdade |corrige |corrija |muda |mude |altera |altere |edita |edite |coloca |coloque |troca |troque |para |pra |valor |valor correto |valor certo |certo |correto |e |era |foi |sao |vai ser |seria |de )*(?:r\$\s*)?[\d.,]+(?:\s*reais?)?[.! ]*$/.test(s)){c.amount_cents=literalMoney(amounts[0]);return buildFinancePlan(c,state,user,id,today);}
 const day=s.match(/^(?:(?:o |a |muda |mude |troca |troque |altera |altere |para |pra |data |vencimento |correto |certo |e |seria |no )*)dia\s+(\d{1,2})[.! ]*$/);if(day&&rule){const n=Number(day[1]);if(n<1||n>31)throw new AppError('Informe um dia entre 1 e 31.');c.due_day=n;c.date=nextMonthlyDay(n,today);return buildFinancePlan(c,state,user,id,today);}
 const time=s.match(/^(?:(?:o |a |muda |mude |troca |troque |altera |altere |para |pra |horario |correto |certo |e |seria |as )*)(\d{1,2})(?::|h)(\d{2})?(?:\s*horas?)?[.! ]*$/);if(time&&appointment){c.time=time[1].padStart(2,'0')+':'+(time[2]||'00');return buildFinancePlan(c,state,user,id,today);}
 const date=s.replace(/^(?:(?:muda|mude|troca|troque|altera|altere) (?:a data )?(?:para |pra )?|(?:a data|o vencimento) (?:correto |certo )?(?:e |sera )?)/,'').replace(/[.! ]+$/,'');
 if(!amounts.length&&(date==='amanha'||date==='hoje'||/^dia \d|^\d{1,4}[/-]/.test(date))&&!rule){try{c.date=financeDate(date,today,!!appointment||c.status==='PREVISTO');return buildFinancePlan(c,state,user,id,today);}catch{return null;}}
 return null;
}
