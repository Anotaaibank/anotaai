import test from 'node:test';
import assert from 'node:assert/strict';
import {subscriberActiveInput,subscriberLinkInput,accessLinkStatus} from '../lib/subscriber-controls.ts';
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
test('vínculo exige conta existente, e-mail e revisão; não aceita alterar plano ou identidade do gestor',()=>{
 const good={phone:'11999999999',user_id:'f1111111-1111-4111-8111-111111111111',email:' Pessoa@Example.test ',expected:new Date().toISOString()};
 assert.equal(subscriberLinkInput(good).email,'pessoa@example.test');
 for(const bad of [{...good,user_id:''},{...good,email:''},{...good,expected:''},{...good,actor:'injected'},{...good,plan_code:'ILIMITADO'}])assert.throws(()=>subscriberLinkInput(bad));
});
