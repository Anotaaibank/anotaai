import test from 'node:test';
import assert from 'node:assert/strict';
import {dashboardSectionFromHash,mobileShortcuts} from '../lib/dashboard-navigation.ts';

test('links diretos e voltar do navegador reconhecem as seções do painel',()=>{
 for(const section of ['agenda','pagamentos','whatsapp','uso','dinheiro'])assert.equal(dashboardSectionFromHash('#'+section),section);
 assert.equal(dashboardSectionFromHash(''),'resumo');
 assert.equal(dashboardSectionFromHash('#destino-externo'),'resumo');
 assert.equal(dashboardSectionFromHash('#agenda/../../gestao'),'resumo');
});
test('atalhos inferiores apontam para seções válidas sem duplicação',()=>{
 assert.equal(new Set(mobileShortcuts.map(item=>item.id)).size,mobileShortcuts.length);
 for(const item of mobileShortcuts)assert.equal(dashboardSectionFromHash('#'+item.id),item.id);
});
