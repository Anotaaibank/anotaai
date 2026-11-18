import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import worker from '../server/application.mjs';
import {createDb} from '../scripts/local-db.mjs';
const taxonomy=JSON.parse(readFileSync(new URL('../shared/expense-categories.json',import.meta.url),'utf8'));
test('all predefined costs save independently and old categories remain editable',async()=>{
 const DB=createDb();DB.sqlite.prepare('INSERT INTO owners(id,name,name_key,color) VALUES(?,?,?,?)').run('bruno','Bruno','bruno','teal');
 DB.sqlite.prepare('INSERT INTO vehicles(id,name,plate,purchase,purchased_at,owner_id) VALUES(?,?,?,?,?,?)').run('car','Toyota','FL001',1000000,'2026-11-01','bruno');
 async function call(path,body){const r=await worker.fetch(new Request('https://fleet.test'+path,{method:body?'POST':'GET',headers:{'oai-authenticated-user-id':'test-user',...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})}),{DB});return{status:r.status,data:await r.json()};}
 const categories=taxonomy.flatMap(group=>group.categories);assert.equal(new Set(categories).size,categories.length);
 for(const category of ['Peças','Mecânico / mão de obra','Lavagem','Check-in','Check-out','Vaga / estacionamento','Manutenção','Documentação','Preparação','Seguro','Impostos e taxas','Limpeza','Outros'])assert.ok(categories.includes(category),category);
 const base={vehicle_id:'car',kind:'expense',amount:12345,date:'2026-11-18',description:'Teste isolado'};
 for(const category of categories)assert.equal((await call('/api/entry',{...base,category})).status,200,category);
 assert.equal((await call('/api/entry',{...base,category:'Custo digitado livremente'})).status,400);
 const loaded=(await call('/api/data')).data;assert.equal(loaded.entries.length,categories.length);assert.deepEqual(loaded.expenseGroups,taxonomy);
 for(const category of categories)assert.equal(loaded.entries.filter(entry=>entry.category===category).length,1);
 const legacy=loaded.entries.find(entry=>entry.category==='Manutenção');assert.equal((await call('/api/entry',{...base,id:legacy.id,category:'Peças'})).status,200);
 const updated=(await call('/api/data')).data;assert.equal(updated.entries.length,categories.length);assert.equal(updated.entries.find(entry=>entry.id===legacy.id).category,'Peças');
});
function client(){let source=readFileSync(new URL('../web/app.js',import.meta.url),'utf8');source=source.slice(0,source.indexOf("document.addEventListener('click'"))+`globalThis.costTest={costBreakdown,costReportEntries,costReportCsv,costs,categoryOptions,costPeriodInvalid,setData:v=>data=v,setGroups:v=>expenseGroups=v,setFilters:v=>{reportOwner=v.owner||'';reportVehicle=v.vehicle||'';reportCategory=v.category||'';reportFrom=v.from||'';reportTo=v.to||'';}};})();`;const context={document:{querySelector:()=>null},Intl,Map,Set,Date,console};vm.createContext(context);vm.runInContext(source,context);context.costTest.setGroups(taxonomy);return context.costTest;}
const sample={company:'Empresa Teste',owners:[{id:'bruno',name:'Bruno',color:'teal'},{id:'ana',name:'Ana',color:'violet'}],vehicles:[{id:'a',name:'Corolla',plate:'AAA',owner_id:'bruno',purchase:1000000,status:'Disponível'},{id:'b',name:'Civic',plate:'BBB',owner_id:'ana',purchase:2000000,status:'Disponível'},{id:'old',name:'Antigo',plate:'OLD',owner_id:null,purchase:0,status:'Disponível'}],entries:[{id:'1',vehicle_id:'a',kind:'expense',category:'Lavagem',amount:3000,date:'2026-11-01',description:'Lavagem 1'},{id:'2',vehicle_id:'a',kind:'expense',category:'Lavagem',amount:4000,date:'2026-11-18',description:'Lavagem 2'},{id:'3',vehicle_id:'a',kind:'expense',category:'Vaga / estacionamento',amount:20000,date:'2026-11-10',description:'Mensalidade da vaga'},{id:'4',vehicle_id:'b',kind:'expense',category:'Lavagem',amount:5000,date:'2026-11-18',description:'Lavagem Civic'},{id:'5',vehicle_id:'b',kind:'expense',category:'Check-in',amount:2500,date:'2026-10-31',description:'Check-in'},{id:'6',vehicle_id:'a',kind:'income',category:'Locação',amount:100000,date:'2026-11-18',description:'Aluguel recebido'},{id:'7',vehicle_id:'old',kind:'expense',category:'Limpeza',amount:800,date:'2026-11-10',description:'Categoria antiga'}]};
test('cost report sums expenses by category, including legacy costs, and excludes purchases and income',()=>{
 const t=client();t.setData(sample);const entries=t.costReportEntries(),rows=t.costBreakdown(entries);assert.equal(entries.length,6);assert.equal(rows.find(row=>row.category==='Lavagem').total,12000);assert.equal(rows.find(row=>row.category==='Lavagem').count,3);assert.equal(rows.find(row=>row.category==='Vaga / estacionamento').total,20000);assert.equal(rows.find(row=>row.category==='Limpeza').total,800);assert.equal(rows.reduce((sum,row)=>sum+row.total,0),35300);assert.ok(!rows.some(row=>row.category==='Locação'));
});
test('owner, vehicle, category and inclusive date filters intersect correctly',()=>{
 const t=client();t.setData(sample);t.setFilters({owner:'bruno',category:'Lavagem',from:'2026-11-01',to:'2026-11-18'});assert.equal(t.costReportEntries().length,2);assert.equal(t.costBreakdown(t.costReportEntries())[0].total,7000);
 t.setFilters({owner:'bruno',category:'Lavagem',from:'2026-11-18',to:'2026-11-18'});assert.equal(t.costReportEntries().length,1);assert.equal(t.costReportEntries()[0].amount,4000);
 t.setFilters({owner:'bruno',vehicle:'b'});assert.equal(t.costReportEntries().length,0);
 t.setFilters({owner:'__unassigned__'});assert.equal(t.costReportEntries().length,1);assert.equal(t.costReportEntries()[0].category,'Limpeza');
 t.setFilters({from:'2026-11-19',to:'2026-11-01'});assert.equal(t.costPeriodInvalid(),true);assert.throws(()=>t.costReportCsv(),/Ajuste o período/);
});
test('report CSV follows selected filters and exports a total plus the matching itemized costs',()=>{
 const t=client();t.setData(sample);t.setFilters({owner:'bruno',category:'Lavagem',from:'2026-11-01',to:'2026-11-18'});const csv=t.costReportCsv();assert.ok(csv.includes('"Lavagem";"2";"70,00"'));assert.ok(csv.includes('"Total";"2";"70,00"'));assert.ok(csv.includes('Lavagem 1'));assert.ok(csv.includes('Lavagem 2'));assert.ok(!csv.includes('Lavagem Civic'));assert.ok(!csv.includes('Mensalidade da vaga'));assert.ok(!csv.includes('Aluguel recebido'));
 const choices=t.categoryOptions('Check-out');assert.ok(choices.includes('<optgroup label="Operação e locação">'));assert.ok(choices.includes('value="Check-out" selected'));
 const html=t.costs();assert.ok(html.includes('US$'));assert.ok(html.includes('Lançamentos do relatório'));assert.ok(html.includes('Tipo de custo do relatório'));
});
