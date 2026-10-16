import test from 'node:test';
import assert from 'node:assert/strict';
import {landingEvent,trackLandingEvent,type LandingEventDetails,type LandingEventName} from '../lib/landing-events.ts';

test('rastreamento comercial aceita contexto ilustrativo e recusa compra fictícia e dados pessoais',()=>{
 assert.deepEqual(landingEvent('plan_selected',{source:'plans',plan:'BASICO'}),{event:'plan_selected',page:'/conheca',source:'plans',plan:'BASICO'});
 assert.deepEqual(landingEvent('demo_interaction',{source:'demo',example:'bill',action:'confirm'}),{event:'demo_interaction',page:'/conheca',source:'demo',example:'bill',action:'confirm'});
 for(const name of ['purchase','payment_confirmed','subscription_activated'])assert.throws(()=>landingEvent(name as LandingEventName));
 for(const details of [{email:'private@example.test'},{phone:'5511999999999'},{message:'gastei 30'},{source:'texto livre'},{plan:'promocional'},{example:'dados reais'}])assert.throws(()=>landingEvent('cta_click',details as LandingEventDetails));
});
test('preparação de eventos é inerte no servidor, sem rede, cookies ou gravação',()=>{
 assert.equal(typeof window,'undefined');assert.doesNotThrow(()=>trackLandingEvent('landing_view'));
});
