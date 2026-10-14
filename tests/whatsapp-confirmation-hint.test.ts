import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {buildFinancePlan} from '../lib/finance.ts';
import {whatsappPending,confirmedWhatsappPlan,whatsappConfirmationHint} from '../lib/whatsapp-finance.ts';
const user=randomUUID(),sender='5511999999999',key='hint-unit-test-only-private-key';
const proposal=()=>{const plan=buildFinancePlan({action:'expense_create',description:'Teste',category:'Combustível',amount_cents:5000},{documents:[],expenses:[]},user,randomUUID());return {user_id:user,sender,...whatsappPending(plan,user,sender,key,1000)};};
test('consentimento sem código orienta diretamente, sem confirmar ou alterar a proposta',()=>{
 const row=proposal(),before=JSON.stringify(row);const hint=whatsappConfirmationHint('ok, pode salvar',[row],user,sender,key,2000);
 assert.ok(hint?.includes('CONFIRMAR '+row.confirmation_code));assert.equal(confirmedWhatsappPlan('ok, pode salvar',[row],user,sender,key,2000),null);assert.equal(JSON.stringify(row),before);
 assert.equal(whatsappConfirmationHint('Registra 50 reais de gasolina',[row],user,sender,key,2000),null);assert.equal(whatsappConfirmationHint('Não pode salvar',[row],user,sender,key,2000),null);
});
test('orientação não escolhe entre propostas nem expõe códigos de outro usuário ou remetente',()=>{
 const a=proposal(),b=proposal();assert.ok(whatsappConfirmationHint('Pode lançar',[a,b],user,sender,key,2000)?.includes('mais de uma'));assert.ok(!whatsappConfirmationHint('Pode salvar',[a],randomUUID(),sender,key,2000)?.includes(a.confirmation_code));assert.ok(!whatsappConfirmationHint('Pode salvar',[a],user,'5511888888888',key,2000)?.includes(a.confirmation_code));
});
test('proposta expirada, adulterada ou já usada não oferece um código válido',()=>{
 const row=proposal();assert.ok(whatsappConfirmationHint('Confirmar',[row],user,sender,key,601001)?.includes('expirou'));assert.ok(!whatsappConfirmationHint('Pode salvar',[{...row,finance_confirmation:row.finance_confirmation+'tampered'}],user,sender,key,2000)?.includes(row.confirmation_code));assert.ok(!whatsappConfirmationHint('Pode salvar',[{...row,confirmation_used:true}],user,sender,key,2000)?.includes(row.confirmation_code));
});
