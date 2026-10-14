import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {appointmentInstant,reminderStage,appointmentReminders,currentReminder} from '../lib/whatsapp-reminder.ts';
import type {FinanceDocument} from '../lib/finance.ts';
const d:FinanceDocument={id:randomUUID(),kind:'APPOINTMENT',description:'Reunião',date:'2026-11-11',amount_cents:0,status:'REALIZADO',active:true,details:{time:'14:00',location:'Escritório'},updated_at:'2026-10-10T12:00:00Z'},sender='5511999999999',at=Date.parse('2026-11-11T17:00:00Z');
test('lembretes respeitam São Paulo, 24 horas e 5 horas, sem avisar antes nem após o evento',()=>{
 assert.equal(appointmentInstant(d),at);assert.equal(reminderStage(d,at-86400000-1),null);assert.equal(reminderStage(d,at-86400000),24);assert.equal(reminderStage(d,at-18000000-1),24);assert.equal(reminderStage(d,at-18000000),5);assert.equal(reminderStage(d,at),null);
 const first=appointmentReminders([d],[sender,sender],at-86400000);assert.equal(first.length,1);assert.match(first[0].reply,/amanhã, às 14:00.*Reunião/);const second=appointmentReminders([d],[sender],at-18000000);assert.equal(second.length,1);assert.match(second[0].reply,/hoje, às 14:00/);assert.notEqual(first[0].provider_id,second[0].provider_id);assert.equal(first[0].provider_id,appointmentReminders([d],[sender],at-86400000+60000)[0].provider_id);
});
test('antes de enviar, cancela aviso de evento arquivado, concluído, adiado, expirado ou outro destinatário',()=>{
 const now=at-86400000,r=appointmentReminders([d],[sender],now)[0];assert.ok(currentReminder(r.provider_id,sender,[d],now));
 for(const changed of [{...d,active:false},{...d,details:{...d.details,done:true}},{...d,date:'2026-11-12'},{...d,details:{...d.details,time:'15:00'}},{...d,details:{time:''}}])assert.equal(currentReminder(r.provider_id,sender,[changed],now),null);
 assert.equal(currentReminder(r.provider_id,'5511888888888',[d],now),null);assert.equal(currentReminder(r.provider_id,sender,[],now),null);assert.equal(currentReminder(r.provider_id,sender,[d],at-18000000),null);assert.equal(currentReminder(r.provider_id,sender,[d],at),null);
});
test('compromisso sem horário válido não inventa hora; nome atualizado é lido na hora do envio',()=>{
 assert.equal(appointmentInstant({...d,details:{time:'25:00'}}),null);assert.equal(appointmentReminders([{...d,details:{}}],[sender],at-86400000).length,0);const r=appointmentReminders([d],[sender],at-86400000)[0];assert.match(currentReminder(r.provider_id,sender,[{...d,description:'Reunião alterada'}],at-86400000)!,/Reunião alterada/);
});
