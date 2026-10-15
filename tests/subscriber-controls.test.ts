import test from 'node:test';
import assert from 'node:assert/strict';
import {subscriberActiveInput,accessLinkStatus} from '../lib/subscriber-controls.ts';
test('desativação exige decisão explícita, revisão válida e não aceita identidade do gestor no corpo',()=>{
 const good={phone:'11999999999',active:false,expected:new Date().toISOString()};
 assert.equal(subscriberActiveInput(good).phone,'5511999999999');
 assert.equal(subscriberActiveInput(good).active,false);
 for(const bad of [{...good,active:'false'},{...good,active:null},{...good,expected:''},{...good,actor:'injected'},{...good,user_id:'injected'}])assert.throws(()=>subscriberActiveInput(bad));
});
test('retorno do provedor não é apresentado como entrega confirmada',()=>{
 assert.match(accessLinkStatus('ACEITO'),/entrega não confirmada/);
 assert.match(accessLinkStatus('INCERTO'),/Sem confirmação/);
});
