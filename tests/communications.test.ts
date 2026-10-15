import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {communicationInput,communicationFilter,communicationText} from '../lib/communications.ts';
test('comunicado exige mensagem, destinatários únicos e recusa números ou identidade injetada',()=>{
 const good={id:randomUUID(),message:'  Aviso do aplicativo  ',invitations:[randomUUID(),randomUUID()]};
 assert.equal(communicationInput(good).message,'Aviso do aplicativo');
 for(const bad of [{...good,message:''},{...good,message:'x'.repeat(2001)},{...good,invitations:[]},{...good,invitations:[good.invitations[0],good.invitations[0]]},{...good,invitations:['11999999999']},{...good,owner_id:randomUUID()},{...good,phone:'11999999999'}])assert.throws(()=>communicationInput(bad));
 assert.equal(communicationText(' Aviso '),'*Anotei na Hora · Comunicado*\n\nAviso');
});
test('filtros combinam nome, telefone, situação e plano sem selecionar outros assinantes',()=>{
 const contacts=[{id:randomUUID(),name:'João Santos',phone:'5511999998876',plan_code:'BASICO',subscription_status:'TESTE'},{id:randomUUID(),name:'Ana Silva',phone:'5511988887777',plan_code:'ILIMITADO',subscription_status:'ATIVA'}];
 assert.equal(communicationFilter(contacts,'santos','BASICO','TESTE').length,1);
 assert.equal(communicationFilter(contacts,'8876','','')[0].name,'João Santos');
 assert.equal(communicationFilter(contacts,'santos','ILIMITADO','').length,0);
 assert.equal(communicationFilter(contacts,'','','').length,2);
});
