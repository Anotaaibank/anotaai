import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import vm from 'node:vm';
import worker from '../server/application.mjs';
import {createDb} from '../scripts/local-db.mjs';

function harness(){const DB=createDb();return {DB,async call(path,body){const r=await worker.fetch(new Request('https://fleet.test'+path,{method:body?'POST':'GET',headers:{'oai-authenticated-user-id':'test-user',...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})}),{DB});return {status:r.status,data:await r.json()};}};}
const car={name:'Corolla',plate:'FL123',year:'2022',purchase:1000000,purchased_at:'2026-11-18',status:'Disponível',notes:''};
test('owners are required, persist, normalize duplicate names and validate colors',async()=>{
 const {call}=harness();assert.equal((await call('/api/vehicle',car)).status,400);
 assert.equal((await call('/api/vehicle',{...car,owner_id:'nonexistent'})).status,400);
 assert.equal((await call('/api/owner',{name:'Bruno',color:'red-invalid'})).status,400);
 assert.equal((await call('/api/owner',{name:'  ',color:'teal'})).status,400);
 const bruno=await call('/api/owner',{name:' Bruno  Lira ',color:'teal'});assert.equal(bruno.status,200);
 assert.equal((await call('/api/owner',{name:'bruno lira',color:'blue'})).status,409);
 const created=await call('/api/vehicle',{...car,owner_id:bruno.data.id});assert.equal(created.status,200);
 const loaded=(await call('/api/data')).data;assert.equal(loaded.owners[0].name,'Bruno Lira');assert.equal(loaded.vehicles[0].owner_id,bruno.data.id);
 assert.equal((await call('/api/owner',{id:bruno.data.id,name:'Bruno',color:'blue'})).status,200);
 const updated=(await call('/api/data')).data;assert.equal(updated.owners.length,1);assert.equal(updated.owners[0].color,'blue');assert.equal(updated.vehicles[0].owner_id,bruno.data.id);
});
test('a vehicle can change owner without losing its cost and rental history',async()=>{
 const {call}=harness(),bruno=(await call('/api/owner',{name:'Bruno',color:'teal'})).data,mariana=(await call('/api/owner',{name:'Mariana',color:'violet'})).data;
 const created=(await call('/api/vehicle',{...car,owner_id:bruno.id})).data;
 await call('/api/entry',{vehicle_id:created.id,kind:'expense',category:'Manutenção',amount:50000,date:'2026-11-18'});
 await call('/api/entry',{vehicle_id:created.id,kind:'income',category:'Locação',amount:200000,date:'2026-11-18'});
 assert.equal((await call('/api/vehicle',{...car,id:created.id,owner_id:mariana.id})).status,200);
 const loaded=(await call('/api/data')).data;assert.equal(loaded.vehicles.length,1);assert.equal(loaded.vehicles[0].owner_id,mariana.id);assert.equal(loaded.entries.length,2);assert.equal(loaded.vehicles[0].purchase,1000000);
});
test('migration upgrades an existing database, keeps cars and ledger and is safe to reopen',()=>{
 const directory=mkdtempSync(join(tmpdir(),'fleet-owner-migration-')),filename=join(directory,'fleet.sqlite');const old=new DatabaseSync(filename);
 old.exec(readFileSync(new URL('../drizzle/0000_fleet.sql',import.meta.url),'utf8'));
 old.prepare('INSERT INTO vehicles(id,name,plate,purchase,purchased_at) VALUES(?,?,?,?,?)').run('old-car','Carro existente','OLD123',900000,'2026-10-01');
 old.prepare('INSERT INTO entries(id,vehicle_id,kind,category,amount,date) VALUES(?,?,?,?,?,?)').run('old-entry','old-car','income','Locação',30000,'2026-11-01');old.close();
 const upgraded=createDb(filename);assert.equal(upgraded.sqlite.prepare('SELECT * FROM vehicles').get().owner_id,null);assert.equal(upgraded.sqlite.prepare('SELECT amount FROM entries').get().amount,30000);assert.equal(upgraded.sqlite.prepare('SELECT count(*) AS n FROM fleet_migrations').get().n,2);upgraded.sqlite.close();
 const reopened=createDb(filename);assert.equal(reopened.sqlite.prepare('SELECT count(*) AS n FROM vehicles').get().n,1);reopened.sqlite.close();assert.equal(readdirSync(directory).filter(f=>f.endsWith('.bak')).length,1);
});
test('demonstration links each sample car to its owner without accessing persistence',()=>{
 let src=readFileSync(new URL('../web/app.js',import.meta.url),'utf8');src=src.slice(0,src.indexOf("document.addEventListener('click'"))+"render=()=>{};startDemo();globalThis.sample=data;})();";
 const context={document:{querySelector:()=>null},Intl,Set,Map,Date,console};vm.createContext(context);vm.runInContext(src,context);
 assert.equal(context.sample.owners.length,2);assert.equal(context.sample.vehicles.filter(v=>v.owner_id==='demo-bruno').length,2);assert.ok(context.sample.vehicles.every(v=>context.sample.owners.some(o=>o.id===v.owner_id)));
});
test('fleet groups and totals stay separated by owner, handle legacy cars and escape names',()=>{
 let src=readFileSync(new URL('../web/app.js',import.meta.url),'utf8');src=src.slice(0,src.indexOf("document.addEventListener('click'"))+"globalThis.testing={ownerGroups,groupedFleet,filteredVehicles,metrics,setData:v=>data=v,setFilter:v=>ownerFilter=v};})();";
 const context={document:{querySelector:()=>null},Intl,Set,Map,Date,console};vm.createContext(context);vm.runInContext(src,context);const t=context.testing;
 t.setData({owners:[{id:'bruno',name:'Bruno <&>',color:'teal'},{id:'mariana',name:'Mariana',color:'violet'}],vehicles:[{...car,id:'b1',owner_id:'bruno'},{...car,id:'m1',owner_id:'mariana',purchase:2000000},{...car,id:'b2',owner_id:'bruno'},{...car,id:'old',owner_id:null}],entries:[{vehicle_id:'b1',kind:'income',amount:200000},{vehicle_id:'b2',kind:'expense',amount:50000},{vehicle_id:'m1',kind:'income',amount:900000}]});
 const groups=t.ownerGroups(t.filteredVehicles());assert.equal(groups.length,3);assert.equal(groups[0].vehicles.length,2);assert.equal(groups[1].owner.name,'Mariana');assert.equal(groups[2].owner,undefined);
 assert.equal(t.metrics(groups[0].vehicles).operating,150000);assert.equal(t.metrics(groups[1].vehicles).operating,900000);
 const html=t.groupedFleet(t.filteredVehicles());assert.ok(html.includes('owner-teal'));assert.ok(html.includes('owner-violet'));assert.ok(html.includes('Bruno &lt;&amp;&gt;'));assert.ok(html.includes('Sem proprietário definido'));
 t.setFilter('bruno');assert.equal(t.filteredVehicles().length,2);t.setFilter('__unassigned__');assert.equal(t.filteredVehicles().length,1);
});
