import test from 'node:test';
import assert from 'node:assert/strict';
import {confirmedRegistrationPassword,minimumPasswordLength} from '../lib/registration-password.ts';
test('cadastro permite senha numérica de seis caracteres sem exigir letras ou símbolos',()=>{
 assert.equal(minimumPasswordLength,6);
 for(const value of ['246810','123456','abcdef','000000','sem-simbolos'])assert.equal(confirmedRegistrationPassword(value,value),value);
 for(const value of ['', '1234','12345','x'.repeat(129)])assert.throws(()=>confirmedRegistrationPassword(value,value),/senha/);
});
test('senha simplificada continua exigindo confirmação idêntica',()=>{
 assert.throws(()=>confirmedRegistrationPassword('123456','123457'),/senhas não são iguais/);
 assert.throws(()=>confirmedRegistrationPassword('123456',undefined),/senhas não são iguais/);
 assert.equal(confirmedRegistrationPassword(' 123456',' 123456'),' 123456');
});
