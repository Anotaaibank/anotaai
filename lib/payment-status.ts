import {brazilDay} from './model.ts';
import type {AdminEntry} from './expenses.ts';

export function paymentStatus(row:AdminEntry,today=brazilDay()) {
 if(!row.active)return {kind:'archived' as const,label:'Arquivada',days:0};
 if(row.status==='REALIZADO')return {kind:'paid' as const,label:'Pago',days:0};
 if(row.entry_date<today)return {kind:'overdue' as const,label:'Em atraso',days:Math.round((Date.parse(today+'T12:00:00Z')-Date.parse(row.entry_date+'T12:00:00Z'))/86400000)};
 if(row.entry_date===today)return {kind:'today' as const,label:'Vence hoje',days:0};
 return {kind:'upcoming' as const,label:'A vencer',days:0};
}
export function pendingPayments(rows:AdminEntry[]){return rows.filter(row=>row.active&&row.status==='PREVISTO').sort((a,b)=>a.entry_date.localeCompare(b.entry_date)||a.id.localeCompare(b.id));}
