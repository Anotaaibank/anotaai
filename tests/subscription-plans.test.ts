import test from 'node:test';
import assert from 'node:assert/strict';
import {customerDetails,subscriberName,validCpf} from '../lib/customer-details.ts';
import {subscriptionPlans,timeUsed} from '../lib/subscription-plans.ts';
test('cadastro valida CPF e endereço, recusa dado ausente e não aceita identidade injetada',()=>{
 const good={full_name:'Ana Silva',cpf:'529.982.247-25',postal_code:'01001-000',street:'Rua de Teste',address_number:'S/N',complement:'',neighborhood:'Centro',city:'São Paulo',state:'SP'};
 assert.equal(customerDetails(good).cpf,'52998224725');assert.equal(customerDetails(good).postal_code,'01001000');
 assert.equal(validCpf('11111111111'),false);assert.equal(validCpf('52998224724'),false);assert.equal(validCpf('abc52998224725'),false);
 assert.throws(()=>customerDetails({...good,cpf:undefined}),/CPF/);assert.throws(()=>customerDetails({...good,state:'XX'}),/estado/);assert.throws(()=>customerDetails({...good,user_id:'another'}));assert.throws(()=>subscriberName('Ana'));assert.equal(subscriberName('  Ana   D’Ávila '),'Ana D’Ávila');
});
test('plano básico separa as franquias; ilimitado não possui teto mensal e relógio não exibe saldo negativo',()=>{assert.equal(subscriptionPlans.BASICO.monthly_cents,4990);assert.equal(subscriptionPlans.BASICO.voice_seconds,600);assert.equal(subscriptionPlans.BASICO.whatsapp_seconds,600);assert.equal(subscriptionPlans.BASICO.requests,150);assert.equal(subscriptionPlans.ILIMITADO.monthly_cents,9990);assert.equal(subscriptionPlans.ILIMITADO.voice_seconds,null);assert.equal(timeUsed(-5),'0min 00s');assert.equal(timeUsed(65),'1min 05s');});
