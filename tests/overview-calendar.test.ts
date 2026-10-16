import test from 'node:test';
import assert from 'node:assert/strict';
import {nextCalendarDays} from '../lib/agenda-calendar.ts';

test('os dez dias da visão geral incluem hoje e atravessam mês, ano e fevereiro bissexto sem deslocar datas',()=>{
 for(const [start,last]of [['2026-10-16','2026-10-25'],['2026-12-27','2027-01-05'],['2028-02-25','2028-03-05']]){const days=nextCalendarDays(start);assert.equal(days.length,10);assert.equal(days[0],start);assert.equal(days[9],last);assert.equal(new Set(days).size,10);}
 assert.ok(nextCalendarDays('2028-02-25').includes('2028-02-29'));assert.throws(()=>nextCalendarDays('2026-02-29'));assert.throws(()=>nextCalendarDays('2026-10-16',0));
});
