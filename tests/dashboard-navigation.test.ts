import test from 'node:test';
import assert from 'node:assert/strict';
import {dashboardSectionFromHash,mobileShortcuts,primaryNavigation,dashboardSections,dashboardGroup,groupedSections} from '../lib/dashboard-navigation.ts';

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

test('as telas antigas e novas pertencem a um dos mesmos cinco destinos em desktop e mobile',()=>{
 assert.equal(primaryNavigation.length,5);assert.deepEqual(mobileShortcuts,primaryNavigation);
 for(const section of dashboardSections)assert.ok(primaryNavigation.some(item=>item.id===dashboardGroup(section)));
 for(const section of ['despesas','mensais','viagens','pagamentos'] as const)assert.equal(dashboardGroup(section),'pagamentos');
 assert.equal(dashboardGroup('rendas'),'dinheiro');
 for(const section of ['whatsapp','feedback','uso'] as const)assert.equal(dashboardGroup(section),'mais');
 for(const section of dashboardSections)assert.equal(dashboardSectionFromHash('#'+section),section);
 assert.deepEqual(groupedSections.pagamentos.map(item=>item.id),['pagamentos','despesas','mensais','viagens']);
});
