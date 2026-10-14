import {brazilDay,currency,realDate,uuid} from './model.ts';
import type {AdminEntry} from './expenses.ts';
import {reminderPrefix} from './whatsapp-reminder.ts';
export const paymentReminderPrefix=reminderPrefix+'payment:';
export type PaymentReminder={payment_id:string;date:string;stage:'tomorrow'|'today';sender:string;provider_id:string;reply:string};
export function paymentReminderStage(row:AdminEntry,now=Date.now()):PaymentReminder['stage']|null{
 if(!row.active||row.status!=='PREVISTO'||row.scope!=='PESSOAL'||!realDate(row.entry_date))return null;
 const hour=Number(new Intl.DateTimeFormat('en-US',{timeZone:'America/Sao_Paulo',hour:'2-digit',hourCycle:'h23'}).format(now));
 if(hour<9||hour>=21)return null;
 const today=brazilDay(new Date(now)),tomorrow=new Date(today+'T12:00:00Z');tomorrow.setUTCDate(tomorrow.getUTCDate()+1);
 return row.entry_date===today?'today':row.entry_date===tomorrow.toISOString().slice(0,10)?'tomorrow':null;
}
function paymentReminderMessage(row:AdminEntry,stage:PaymentReminder['stage']){
 return `🔔 *Conta ${stage==='today'?'vence hoje':'a vencer amanhã'}*\n\n*${row.description}*\nValor: ${currency(row.amount_cents)}\nVencimento: ${row.entry_date.split('-').reverse().join('/')}\n${row.details.payment_method?'Forma cadastrada: '+row.details.payment_method+'\n':''}\nSe já pagou, registre o pagamento em Contas a pagar ou peça à IA. Este lembrete não confirma nem realiza o pagamento.`;
}
export function paymentReminders(rows:AdminEntry[],senders:string[],now=Date.now()):PaymentReminder[]{
 const out:PaymentReminder[]=[];
 for(const row of rows){const stage=paymentReminderStage(row,now);if(!stage||!uuid(row.id))continue;for(const sender of new Set(senders))out.push({payment_id:row.id,date:row.entry_date,stage,sender,provider_id:`${paymentReminderPrefix}${row.id}:${row.entry_date}:${stage}:${sender}`,reply:paymentReminderMessage(row,stage)});}
 return out;
}
export function currentPaymentReminder(providerId:string,sender:string,rows:AdminEntry[],now=Date.now()){
 const match=providerId.match(/^anotei-reminder:v1:payment:([a-f0-9-]{36}):(\d{4}-\d{2}-\d{2}):(tomorrow|today):(\d+)$/);
 if(!match||!uuid(match[1])||match[4]!==sender)return null;
 const row=rows.find(row=>row.id===match[1]&&row.entry_date===match[2]);
 return row&&paymentReminderStage(row,now)===match[3]?paymentReminderMessage(row,match[3] as PaymentReminder['stage']):null;
}
