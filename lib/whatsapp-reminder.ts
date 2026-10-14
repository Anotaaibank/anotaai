import {realDate,uuid,brazilDay} from './model.ts';
import type {FinanceDocument} from './finance.ts';
export const reminderPrefix='anotei-reminder:v1:';
export type Reminder={appointment_id:string;date:string;time:string;hours:24|5;sender:string;provider_id:string;reply:string};
// Dates in the program use São Paulo. Convert with Intl rather than host timezone.
export function appointmentInstant(d:FinanceDocument){
 const time=d.details.time;if(d.kind!=='APPOINTMENT'||!d.active||d.details.done||!realDate(d.date)||typeof time!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))return null;
 const base=Date.parse(d.date+'T'+time+':00Z'),fmt=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
 let instant=base;for(let i=0;i<2;i++){const p=fmt.formatToParts(instant),part=(name:string)=>p.find(x=>x.type===name)?.value;const wall=Date.parse(`${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}:00Z`);instant+=base-wall;}
 return Number.isFinite(instant)?instant:null;
}
export function reminderStage(d:FinanceDocument,now=Date.now()):24|5|null{
 const at=appointmentInstant(d);if(at===null||now>=at||now<at-24*3600000)return null;
 return now<at-5*3600000?24:5;
}
export function reminderMessage(d:FinanceDocument,now=Date.now()){
 const today=brazilDay(new Date(now)),tomorrow=new Date(today+'T12:00:00Z');tomorrow.setUTCDate(tomorrow.getUTCDate()+1);
 const when=d.date===today?'Hoje':d.date===tomorrow.toISOString().slice(0,10)?'Amanhã':d.date.split('-').reverse().join('/');
 return `🔔 Lembrete: ${when.toLowerCase()}, às ${d.details.time}, você tem ${d.description}.${d.details.location?' Local: '+d.details.location+'.':''}`;
}
export function appointmentReminders(documents:FinanceDocument[],senders:string[],now=Date.now()):Reminder[]{
 const out:Reminder[]=[];for(const d of documents){const hours=reminderStage(d,now);if(!hours||!uuid(d.id))continue;for(const sender of new Set(senders)){const time=String(d.details.time);out.push({appointment_id:d.id,date:d.date,time,hours,sender,provider_id:`${reminderPrefix}${d.id}:${d.date}:${time.replace(':','')}:${hours}:${sender}`,reply:reminderMessage(d,now)});}}return out;
}
export function currentReminder(providerId:string,sender:string,documents:FinanceDocument[],now=Date.now()){
 const match=providerId.match(/^anotei-reminder:v1:([a-f0-9-]{36}):(\d{4}-\d{2}-\d{2}):(\d{4}):(24|5):(\d+)$/);if(!match||!uuid(match[1])||match[5]!==sender)return null;
 const d=documents.find(d=>d.id===match[1]&&d.date===match[2]&&d.details.time===match[3].slice(0,2)+':'+match[3].slice(2));return d&&reminderStage(d,now)===Number(match[4])?reminderMessage(d,now):null;
}
