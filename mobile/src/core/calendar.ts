import type {Snapshot} from './contracts.ts';
export type CalendarItem={id:string;date:string;description:string;type:'Compromisso'|'A pagar'|'A receber'|'Recebido';amount?:number};
export function calendarItems(snapshot:Snapshot):CalendarItem[]{return [
 ...snapshot.documents.filter(d=>d.active&&d.kind==='APPOINTMENT').map(d=>({id:d.id,date:d.date,description:d.description+(d.details.time?' · '+String(d.details.time):''),type:'Compromisso' as const})),
 ...snapshot.documents.filter(d=>d.active&&d.kind==='INCOME').map(d=>({id:d.id,date:d.date,description:d.description,type:d.status==='PREVISTO'?'A receber' as const:'Recebido' as const,amount:d.amount_cents})),
 ...snapshot.expenses.filter(e=>e.active&&e.status==='PREVISTO').map(e=>({id:e.id,date:e.entry_date,description:e.description,type:'A pagar' as const,amount:e.amount_cents})),
 ].sort((a,b)=>a.date.localeCompare(b.date)||a.description.localeCompare(b.description));}
export function monthDays(month:string){const [year,m]=month.split('-').map(Number),offset=new Date(Date.UTC(year,m-1,1)).getUTCDay(),count=new Date(Date.UTC(year,m,0)).getUTCDate();return Array.from({length:Math.ceil((offset+count)/7)*7},(_,i)=>i>=offset&&i<offset+count?month+'-'+String(i-offset+1).padStart(2,'0'):null);}

export function moveMonthSelection(month: string, step: number) {
  const [year, m] = month.split('-').map(Number);
  const next = new Date(Date.UTC(year, m - 1 + step, 1)).toISOString().slice(0, 7);
  return {month: next, day: next + '-01'};
}
