import {test} from 'node:test';
import assert from 'node:assert/strict';
import {authorizedPhones,addAuthorizedPhone,maxAuthorizedPhones,displayPhone} from '../lib/whatsapp-contacts.ts';
const assistant='5511988888888',sender='5511999999999';
test('lista autoriza até cem números normalizados e rejeita excesso sem alterar a lista original',()=>{
 const numbers=Array.from({length:100},(_,i)=>'55119'+String(10000000+i)),before=JSON.stringify(numbers);
 assert.equal(maxAuthorizedPhones,100);assert.deepEqual(authorizedPhones(numbers,assistant),numbers);
 assert.throws(()=>addAuthorizedPhone(numbers,'(11) 99999-9999',assistant),/100/);assert.equal(JSON.stringify(numbers),before);
 assert.throws(()=>authorizedPhones([],assistant));assert.throws(()=>authorizedPhones([null],assistant));assert.throws(()=>authorizedPhones(['123'],assistant));
});
test('cadastro detecta duplicatas mesmo com formatos diferentes e não autoriza o próprio número da IA',()=>{
 assert.deepEqual(addAuthorizedPhone([sender],'(12) 99123-4567',assistant),[sender,'5512991234567']);
 assert.throws(()=>addAuthorizedPhone([sender],'(11) 99999-9999',assistant),/já está cadastrado/);
 assert.throws(()=>addAuthorizedPhone([sender],'11 98888-8888',assistant),/número da IA/);
 assert.deepEqual(authorizedPhones([sender,'(11) 99999-9999'],assistant),[sender]);
 assert.equal(displayPhone(sender),'(11) 99999-9999');
});
