import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import type {AdminEntry} from '../lib/expenses.ts';
import {paymentStatus,pendingPayments} from '../lib/payment-status.ts';
import {paymentReminderStage,paymentReminders,currentPaymentReminder} from '../lib/payment-reminder.ts';
const sender='5511999999999',now=Date.parse('2026-10-13T12:00:00Z');
const bill:AdminEntry={id:randomUUID(),user_id:randomUUID(),kind:'MENSAL',scope:'PESSOAL',description:'Aluguel',category:'Aluguel / moradia',entry_date:'2026-10-14',amount_cents:40000,status:'PREVISTO',active:true,details:{payment_method:'BOLETO'},created_at:'2026-10-01T12:00:00Z',updated_at:'2026-10-01T12:00:00Z',origin:'MANUAL'};
test('vencimento passado vira atraso visual sem mudar pagamento e inclui meses anteriores',()=>{
 const past={...bill,entry_date:'2026-10-09'},old={...bill,id:randomUUID(),entry_date:'2026-09-09'};
 assert.deepEqual(paymentStatus(past,'2026-10-13'),{kind:'overdue',label:'Em atraso',days:4});assert.equal(past.status,'PREVISTO');
 assert.equal(paymentStatus({...bill,entry_date:'2026-10-13'},'2026-10-13').kind,'today');assert.equal(paymentStatus(bill,'2026-10-13').kind,'upcoming');
 assert.equal(paymentStatus({...past,status:'REALIZADO'},'2026-10-13').kind,'paid');assert.equal(paymentStatus({...past,active:false},'2026-10-13').kind,'archived');
 assert.deepEqual(pendingPayments([bill,past,old,{...bill,active:false},{...bill,status:'REALIZADO'}]).map(row=>row.entry_date),['2026-09-09','2026-10-09','2026-10-14']);
});
test('avisos de contas respeitam São Paulo, dia anterior, vencimento e horário das 9h às 21h',()=>{
 assert.equal(paymentReminderStage(bill,now-1),null);assert.equal(paymentReminderStage(bill,now),'tomorrow');
 assert.equal(paymentReminderStage(bill,Date.parse('2026-10-14T12:00:00Z')),'today');assert.equal(paymentReminderStage(bill,Date.parse('2026-10-14T23:59:59Z')),'today');
 assert.equal(paymentReminderStage(bill,Date.parse('2026-10-15T00:00:00Z')),null);assert.equal(paymentReminderStage(bill,Date.parse('2026-10-15T12:00:00Z')),null);
 assert.equal(paymentReminderStage({...bill,entry_date:'2026-10-15'},now),null);assert.equal(paymentReminderStage({...bill,status:'REALIZADO'},now),null);assert.equal(paymentReminderStage({...bill,active:false},now),null);
 const r=paymentReminders([bill],[sender,sender],now);assert.equal(r.length,1);assert.match(r[0].reply,/a vencer amanhã/);assert.match(r[0].reply,/400,00/);assert.match(r[0].reply,/BOLETO/);
 assert.equal(r[0].provider_id,paymentReminders([bill],[sender],now+60000)[0].provider_id);assert.notEqual(r[0].provider_id,paymentReminders([bill],[sender],Date.parse('2026-10-14T12:00:00Z'))[0].provider_id);
});
test('aviso pendente cancela se pago, arquivado, adiado, fora do dia ou para outro número; releitura usa valor atualizado',()=>{
 const r=paymentReminders([bill],[sender],now)[0];assert.ok(currentPaymentReminder(r.provider_id,sender,[bill],now));
 for(const row of [{...bill,active:false},{...bill,status:'REALIZADO' as const},{...bill,entry_date:'2026-10-15'}])assert.equal(currentPaymentReminder(r.provider_id,sender,[row],now),null);
 assert.equal(currentPaymentReminder(r.provider_id,'5511888888888',[bill],now),null);assert.equal(currentPaymentReminder(r.provider_id,sender,[],now),null);assert.equal(currentPaymentReminder(r.provider_id,sender,[bill],now+86400000),null);
 assert.match(currentPaymentReminder(r.provider_id,sender,[{...bill,amount_cents:50000,description:'Aluguel atualizado'}],now)!,/500,00/);
});
