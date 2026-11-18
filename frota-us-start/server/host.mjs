import {createHash} from 'node:crypto';
import {mkdirSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import application from './application.mjs';
import schema from './schema.json' with {type:'json'};
import {createDb} from '../scripts/local-db.mjs';
const databases=new Map(),base='/minha-frota';
const fail=(message,status)=>Response.json({error:message},{status,headers:{'Cache-Control':'private, no-store'}});
export function fleetDatabase(userId,directory){
 if(typeof userId!=='string'||!userId.trim())throw Object.assign(new Error('Entre no Anotaí para continuar.'),{status:401});
 const root=resolve(directory||process.env.ANOTA_FLEET_DIRECTORY||join(dirname(process.env.ANOTA_DATABASE_PATH||join(process.cwd(),'.data','anota-ai.sqlite')),'minha-frota'));
 mkdirSync(root,{recursive:true});const file=join(root,createHash('sha256').update(userId).digest('hex')+'.sqlite');
 if(!databases.has(file))databases.set(file,createDb(file,schema));return databases.get(file);
}
export async function readFleetBody(request,limit=1048576){
 if(!request.headers.get('content-type')?.startsWith('application/json'))throw Object.assign(new Error('Envie os dados no formato correto.'),{status:415});
 const reader=request.body?.getReader();if(!reader)throw Object.assign(new Error('Solicitação vazia.'),{status:400});
 const chunks=[];let size=0;
 try{for(;;){const next=await reader.read();if(next.done)break;size+=next.value.length;if(size>limit)throw Object.assign(new Error('Arquivo acima do limite permitido.'),{status:413});chunks.push(next.value);}}finally{await reader.cancel();reader.releaseLock();}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
 let parsed;try{parsed=JSON.parse(new TextDecoder().decode(bytes));}catch{throw Object.assign(new Error('Confira o arquivo ou os dados enviados.'),{status:400});}
 if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw Object.assign(new Error('Formato inválido.'),{status:400});return parsed;
}
async function importSnapshot(DB,snapshot,userId){
 if(snapshot.currency!=='USD'||snapshot.amountUnit!=='cents'||![1,2].includes(snapshot.version)||!Array.isArray(snapshot.owners)||!Array.isArray(snapshot.vehicles)||!Array.isArray(snapshot.entries))return fail('Use a cópia JSON completa exportada da Minha Frota.',400);
 if(snapshot.vehicles.length>2000||snapshot.owners.length>1000||snapshot.entries.length>10000)return fail('Divida os registros antes de importar.',413);
 const temp=createDb(':memory:',schema),owners=new Map(),vehicles=new Map();
 async function save(path,value){const response=await application.fetch(new Request('https://fleet-import.local/api/'+path,{method:'POST',headers:{'Content-Type':'application/json','oai-authenticated-user-id':userId},body:JSON.stringify(value)}),{DB:temp});const result=await response.json();if(!response.ok)throw Object.assign(new Error(result.error),{status:400});return result.id;}
 try{
  for(const owner of snapshot.owners){if(!owner?.id||owners.has(owner.id))throw Object.assign(new Error('Confira os proprietários da cópia.'),{status:400});owners.set(owner.id,await save('owner',{name:owner.name,color:owner.color}));}
  for(const vehicle of snapshot.vehicles){if(!vehicle?.id||vehicles.has(vehicle.id)||!owners.has(vehicle.owner_id))throw Object.assign(new Error('Defina o proprietário de cada carro antes de exportar a cópia.'),{status:400});vehicles.set(vehicle.id,await save('vehicle',{...vehicle,id:undefined,owner_id:owners.get(vehicle.owner_id)}));}
  for(const entry of snapshot.entries){if(!vehicles.has(entry?.vehicle_id))throw Object.assign(new Error('Um lançamento não corresponde aos veículos da cópia.'),{status:400});await save('entry',{...entry,id:undefined,vehicle_id:vehicles.get(entry.vehicle_id)});}
  await save('company',{company:snapshot.company});
  DB.sqlite.exec('BEGIN IMMEDIATE');
  try{
   const count=DB.sqlite.prepare('SELECT (SELECT COUNT(*) FROM owners)+(SELECT COUNT(*) FROM vehicles)+(SELECT COUNT(*) FROM entries) AS n').get().n;
   if(count)throw Object.assign(new Error('A importação só é permitida com a frota vazia. Nenhum registro foi alterado.'),{status:409});
   for(const row of temp.sqlite.prepare('SELECT * FROM owners').all())DB.sqlite.prepare('INSERT INTO owners(id,name,name_key,color) VALUES(?,?,?,?)').run(row.id,row.name,row.name_key,row.color);
   for(const row of temp.sqlite.prepare('SELECT * FROM vehicles').all())DB.sqlite.prepare('INSERT INTO vehicles(id,name,plate,year,purchase,purchased_at,status,notes,owner_id) VALUES(?,?,?,?,?,?,?,?,?)').run(row.id,row.name,row.plate,row.year,row.purchase,row.purchased_at,row.status,row.notes,row.owner_id);
   for(const row of temp.sqlite.prepare('SELECT * FROM entries').all())DB.sqlite.prepare('INSERT INTO entries(id,vehicle_id,kind,category,amount,date,description) VALUES(?,?,?,?,?,?,?)').run(row.id,row.vehicle_id,row.kind,row.category,row.amount,row.date,row.description);
   const company=temp.sqlite.prepare('SELECT company FROM settings WHERE id=1').get().company;DB.sqlite.prepare('INSERT INTO settings(id,company) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET company=excluded.company').run(company);
   DB.sqlite.exec('COMMIT');
  }catch(error){DB.sqlite.exec('ROLLBACK');throw error;}
  return Response.json({ok:true,owners:owners.size,vehicles:vehicles.size,entries:snapshot.entries.length},{headers:{'Cache-Control':'private, no-store'}});
 }finally{temp.sqlite.close();}
}
export async function handleHostedFleet(request,options={}){
 const url=new URL(request.url);if(url.pathname!==base&&!url.pathname.startsWith(base+'/'))return fail('Página não encontrada.',404);
 const path=url.pathname.slice(base.length)||'/',isApi=path.startsWith('/api/');url.pathname=path;
 try{
  if(!isApi){if(!['GET','HEAD'].includes(request.method))return fail('Método não permitido.',405);return application.fetch(new Request(url,{method:request.method}),{});}
  const userId=await options.authenticate?.();if(!userId)return fail('Entre no Anotaí para acessar a sua frota.',401);
  let payload;
  if(request.method!=='GET'){
   if(request.method!=='POST')return fail('Método não permitido.',405);
   if(options.sameOrigin)options.sameOrigin(request);else if(request.headers.get('origin')!==new URL(request.url).origin)return fail('Origem não autorizada.',403);
   payload=await readFleetBody(request,path==='/api/import'?1048576:30000);
  }
  const DB=fleetDatabase(userId,options.directory);
  if(path==='/api/import'&&request.method==='POST')return await importSnapshot(DB,payload,userId);
  const headers=new Headers({'oai-authenticated-user-id':userId});
  if(payload){headers.set('Content-Type','application/json');headers.set('Origin',url.origin);}
  return await application.fetch(new Request(url,{method:request.method,headers,...(payload?{body:JSON.stringify(payload)}:{})}),{DB});
 }catch(error){const status=Number(error?.status)||500;return fail(status===401?'Entre no Anotaí para acessar a sua frota.':status===403?'A Minha Frota está disponível para a conta de gestão do Anotaí.':status>=500?'Não foi possível acessar a frota. Tente novamente.':error.message,status);}
}
