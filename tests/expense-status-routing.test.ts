import test from 'node:test';
import assert from 'node:assert/strict';
import {expenseStatusQuestion} from '../lib/expense-context.ts';

test('IW-02: consultar recibo continua sendo leitura',()=>{
 for(const text of ['Você já lançou?','Foi salvo?','O almoço está registrado?','Já registrou os 25 reais?','Me diz se ficou lançado o almoço'])assert.equal(expenseStatusQuestion(text),true,text);
});
test('IW-02: referência ao registro salvo não encerra uma ordem explícita',()=>{
 for(const text of ['Corrige o almoço que você lançou ontem para 30 reais','Por favor, altere para 42 reais o gasto que registrou','Quero corrigir a data do almoço que ficou salvo','Muda o valor que você registrou para 27 reais','Atualize o gasto que está lançado para 32 reais','Exclui o almoço que foi registrado','Lança 20 de lanche igual ao que você lançou ontem','Entrada 200 reais pelo serviço que você registrou','Saída 25 reais gasolina igual ao que foi lançado'])assert.equal(expenseStatusQuestion(text),false,text);
});
