import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {extractFinance,prepareFinanceDraft,quickFinanceList,type FinanceDraft} from '../lib/finance-ai.ts';
import {financeSnapshot,readFinance,signFinance} from '../lib/finance.ts';
import {applyLocalFinance,localFinanceState} from '../lib/finance-store.ts';
import {registerLocal} from '../lib/local-db.ts';
import {whatsappPending,confirmedWhatsappPlan} from '../lib/whatsapp-finance.ts';
process.env.ANOTA_DATABASE_PATH=':memory:';
const today='2026-10-15',empty={documents:[],expenses:[]};
const text='Pago meu carro todo dia 22 valor de 1500 reais; pago internet todo dia 20 valor de 100 reais';
test('lista de contas mensais preserva valores e datas, exige uma confirmação e não reduz caixa',()=>{
 const user=registerLocal(randomUUID()+'@example.test','fixture-list-password','Lista privada').user.id,id=randomUUID();
 const d=quickFinanceList(text,today)!;assert.equal(d.items?.length,2);
 const plan=prepareFinanceDraft(d,text,empty,user,id,today);assert.equal(plan.documents.length,2);assert.equal(plan.expenses.length,24);assert.equal(new Set(plan.expenses.map(e=>e.payload.id)).size,24);
 assert.ok(plan.expenses.filter(e=>e.payload.description.includes('carro')).every(e=>e.payload.amount_cents===150000&&e.payload.entry_date.endsWith('-22')));
 assert.ok(plan.expenses.filter(e=>e.payload.description.includes('internet')).every(e=>e.payload.amount_cents===10000&&e.payload.entry_date.endsWith('-20')));
 assert.equal(localFinanceState(user).expenses.length,0);
 const sender='5511999999979',pending=whatsappPending(plan,user,sender,'fixture-secret',1000),confirmed=confirmedWhatsappPlan('1',[{user_id:user,sender,...pending}],user,sender,'fixture-secret',2000)!;
 assert.throws(()=>readFinance(signFinance(plan,user,'fixture-secret',1000),randomUUID(),'fixture-secret',2000));
 assert.throws(()=>confirmedWhatsappPlan('1',[{user_id:user,sender,...pending}],user,sender,'fixture-secret',601001));
 applyLocalFinance(user,confirmed.plan,'WHATSAPP');assert.equal(applyLocalFinance(user,confirmed.plan,'WHATSAPP').replayed,true);assert.equal(localFinanceState(user).expenses.length,24);assert.equal(financeSnapshot(localFinanceState(user),today).balance_cents,0);
});
test('lista inteira é recusada se um valor não constar no trecho ou se houver item duplicado',()=>{
 const d=quickFinanceList(text,today)!,user=randomUUID();
 const changed=structuredClone(d);changed.items![0].command!.amount_cents=999999;assert.throws(()=>prepareFinanceDraft(changed,text,empty,user,randomUUID(),today));
 const repeated={...d,items:[d.items![0],d.items![0]]};assert.throws(()=>prepareFinanceDraft(repeated,text,empty,user,randomUUID(),today));
 const forged=structuredClone(d);forged.items![1].source='Pago escola de 300 reais todo dia 12';assert.throws(()=>prepareFinanceDraft(forged,text,empty,user,randomUUID(),today));
});
test('uma chamada estruturada interpreta lista natural, sem requisições externas nos testes',async()=>{
 const d=quickFinanceList(text,today)!;let calls=0;
 const natural='Quero anotar estas contas. '+text.replace(';',', e também');
 const transport=async(_url:unknown,options?:RequestInit)=>{calls++;const body=JSON.parse(String(options?.body));assert.ok(body.text.format.schema.required.includes('items'));assert.match(body.instructions,/LISTAS DE CONTAS/);return new Response(JSON.stringify({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(d)}]}]}));};
 const result=await extractFinance(natural,empty,'fixture-key',today,transport as typeof fetch);assert.equal(calls,1);assert.equal(prepareFinanceDraft(result,natural,empty,randomUUID(),randomUUID(),today).documents.length,2);
});
test('agenda pode funcionar sem salário ou saldo cadastrado',()=>{
 const source='Agende consulta dia 20 de outubro às 14 horas',d:FinanceDraft={intent:'COMMAND',command:{action:'appointment_upsert',description:'Consulta',date:'2026-10-20',time:'14:00'},confidence:'ALTA',question:'',query:'',target_excerpt:'',money_evidence:[],date_evidence:[{field:'date',excerpt:'dia 20 de outubro'}]};
 const plan=prepareFinanceDraft(d,source,empty,randomUUID(),randomUUID(),today);assert.equal(plan.documents[0].document.kind,'APPOINTMENT');assert.equal(plan.documents[0].document.details.time,'14:00');assert.equal(plan.expenses.length,0);
});
