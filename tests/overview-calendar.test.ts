import test from 'node:test';
import assert from 'node:assert/strict';
import {nextCalendarDays,calendarEntries} from '../lib/agenda-calendar.ts';
import {randomUUID} from 'node:crypto';
import {buildFinancePlan,type FinanceState} from '../lib/finance.ts';

test('os dez dias da visão geral incluem hoje e atravessam mês, ano e fevereiro bissexto sem deslocar datas',()=>{
 for(const [start,last]of [['2026-10-16','2026-10-25'],['2026-12-27','2027-01-05'],['2028-02-25','2028-03-05']]){const days=nextCalendarDays(start);assert.equal(days.length,10);assert.equal(days[0],start);assert.equal(days[9],last);assert.equal(new Set(days).size,10);}
 assert.ok(nextCalendarDays('2028-02-25').includes('2028-02-29'));assert.throws(()=>nextCalendarDays('2026-02-29'));assert.throws(()=>nextCalendarDays('2026-10-16',0));
});

test('calendário distingue recebimento realizado de previsão e oculta renda arquivada',()=>{
 const state:FinanceState={documents:[],expenses:[]},today='2026-10-16',user=randomUUID();
 for(const [description,status,date]of [['Venda pessoal','REALIZADO',today],['Comissão futura','PREVISTO','2026-10-20']]as const){const plan=buildFinancePlan({action:'income_upsert',description,status,date,amount_cents:125000},state,user,randomUUID(),today);state.documents.push(...plan.documents.map(d=>({...d.document,updated_at:today})));}
 let entries=calendarEntries(state.documents,[],state.documents);assert.equal(entries.length,2);assert.equal(entries[0].kind,'income');assert.equal(entries[0].done,true);assert.equal(entries[1].kind,'receivable');assert.equal(entries[1].done,false);state.documents[0].active=false;entries=calendarEntries(state.documents,[],state.documents);assert.equal(entries.length,1);assert.equal(entries[0].description,'Comissão futura');assert.equal(calendarEntries(state.documents,[],state.documents,true).length,0);
});
