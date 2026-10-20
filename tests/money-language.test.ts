import test from 'node:test';
import assert from 'node:assert/strict';
import {literalMoney,monetaryLiterals} from '../lib/finance-date.ts';
import {prefixedCommand} from '../lib/command-prefix.ts';
import {normalizeAssistantText} from '../lib/conversation-language.ts';
import type {FinanceCommand} from '../lib/finance.ts';

test('valores decimais são convertidos em centavos exatos sem erro de ponto flutuante',()=>{
 for(const [input,expected] of [['35,80',3580],['38,80',3880],['0,29',29],['4,10',410],['R$ 35,80',3580],['35.80',3580],['1.250,90',125090],['1.250.000,80',125000080],['-35,80',-3580],['1,25 mil',125000]] as const)assert.equal(literalMoney(input),expected,input);
 for(let cents=0;cents<100;cents++){const value='35,'+String(cents).padStart(2,'0');assert.equal(literalMoney(value),3500+cents,value);}
});
test('reais e centavos por dígitos, por extenso ou misturados formam um único valor',()=>{
 for(const [input,expected] of [['38 reais e 80 centavos',3880],['trinta e oito reais e oitenta centavos',3880],['35 reais e oitenta centavos',3580],['trinta e cinco reais e 80 centavos',3580],['35 e 80 centavos',3580],['trinta e cinco e oitenta centavos',3580],['trinta e cinco e vinte e cinco centavos',3525],['oitenta centavos',80],['trinta e cinco centavos',35]] as const){assert.equal(literalMoney(input),expected,input);assert.deepEqual(monetaryLiterals('Paguei '+input+' na costureira.'),[input]);}
 for(const bad of ['35,800','35,80,20','35 reais e 180 centavos','35,80 reais e 20 centavos','1.23,45'])assert.throws(()=>literalMoney(bad),bad);
 assert.deepEqual(monetaryLiterals('Gastei 35 reais e depois 80 reais.'),['35 reais','80 reais']);
 assert.deepEqual(monetaryLiterals('Valor -35,80 reais'),['-35,80 reais']);
 assert.equal(literalMoney('um real e oitenta centavos'),180);
 assert.equal(literalMoney('1 real e vinte e cinco centavos'),125);
 assert.deepEqual(monetaryLiterals('Saída um real e oitenta centavos'),['um real e oitenta centavos']);
});
test('saídas com centavos mantêm finalidade, data e valor sem somar a parte decimal aos reais',()=>{
 for(const input of ['Saída 35,80 reais costureira ontem','Saída trinta e cinco e oitenta centavos, costureira, ontem','Saída 35 reais e 80 centavos costureira ontem','Saída 35, 80 reais, costureira, ontem']){const text=normalizeAssistantText(input),draft=prefixedCommand(text,'2026-10-20');assert.equal(draft?.intent,'COMMAND',input);const c=draft!.command as FinanceCommand;assert.equal(c.amount_cents,3580,input);assert.equal(c.date,'2026-10-19');assert.match(c.description!,/costureira/);assert.doesNotMatch(c.description!,/centavos|reais/);assert.equal(draft!.money_evidence.length,1);}
});
