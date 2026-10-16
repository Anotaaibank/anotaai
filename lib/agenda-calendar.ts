import type {FinanceDocument} from './finance.ts';
import type {AdminEntry} from './expenses.ts';
export type CalendarEntry={id:string;date:string;description:string;kind:'appointment'|'payable'|'receivable'|'income';amount_cents?:number;done:boolean;document?:FinanceDocument;expense?:AdminEntry};
export function calendarEntries(appointments:FinanceDocument[],payments:AdminEntry[],incomes:FinanceDocument[],archived=false):CalendarEntry[]{
 const entries:CalendarEntry[]=appointments.filter(d=>d.kind==='APPOINTMENT'&&d.active!==archived).map(d=>({id:d.id,date:d.date,description:d.description,kind:'appointment',done:!!d.details.done,document:d}));
 if(!archived){entries.push(...payments.filter(e=>e.active&&e.status==='PREVISTO').map(e=>({id:e.id,date:e.entry_date,description:e.description,kind:'payable' as const,amount_cents:e.amount_cents,done:false,expense:e})));entries.push(...incomes.filter(d=>d.active&&d.kind==='INCOME').map(d=>({id:d.id,date:d.date,description:d.description,kind:d.status==='REALIZADO'?'income' as const:'receivable' as const,amount_cents:d.amount_cents,done:d.status==='REALIZADO',document:d})));}
 return entries.sort((a,b)=>a.date.localeCompare(b.date)||String(a.document?.details.time||'99:99').localeCompare(String(b.document?.details.time||'99:99'))||a.id.localeCompare(b.id));
}
export function calendarDays(month:string):(string|null)[]{
 if(!/^\d{4}-(?:0[1-9]|1[0-2])$/.test(month))throw new Error('Mês inválido.');
 const [year,m]=month.split('-').map(Number),offset=new Date(Date.UTC(year,m-1,1)).getUTCDay(),count=new Date(Date.UTC(year,m,0)).getUTCDate();
 return Array.from({length:Math.ceil((offset+count)/7)*7},(_,i)=>i>=offset&&i<offset+count?month+'-'+String(i-offset+1).padStart(2,'0'):null);
}
export function moveCalendarMonth(month:string,step:number){const [year,m]=month.split('-').map(Number);return new Date(Date.UTC(year,m-1+step,1)).toISOString().slice(0,7);}
export function nextCalendarDays(start:string,count=10):string[]{
 if(!/^\d{4}-\d{2}-\d{2}$/.test(start)||!calendarDays(start.slice(0,7)).includes(start)||!Number.isInteger(count)||count<1||count>31)throw new Error('Período inválido.');
 const first=Date.parse(start+'T12:00:00Z');return Array.from({length:count},(_,i)=>new Date(first+i*86400000).toISOString().slice(0,10));
}
