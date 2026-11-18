const statuses=['Disponível','Alugado','Em preparação','Em manutenção','Inativo'];
const expenseCategories=EXPENSE_GROUPS.flatMap(group=>group.categories);
const ownerColors=['teal','blue','amber','violet','rose','cyan'];
const json=(v,status=200)=>new Response(JSON.stringify(v),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
function bad(message){throw Object.assign(new Error(message),{status:400});}
function str(v,label,max=200){if(typeof v!=='string'||!v.trim()||v.trim().length>max)bad('Confira '+label+'.');return v.trim();}
function money(v,zero=false){if(!Number.isSafeInteger(v)||v<(zero?0:1)||v>100000000000)bad('Informe um valor válido em dólares.');return v;}
function day(v){if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v)||!Number.isFinite(Date.parse(v))||new Date(v).toISOString().slice(0,10)!==v)bad('Informe uma data válida.');return v;}
const notes=v=>typeof v==='string'?v.trim().slice(0,2000):'';
export default {async fetch(request,env){
 const url=new URL(request.url),p=url.pathname;
 try{
  if(!p.startsWith('/api/')){const asset=ASSETS[p];if(!asset)return new Response('Página não encontrada',{status:404});return new Response(asset.body,{headers:{'Content-Type':asset.type,'X-Content-Type-Options':'nosniff','Cache-Control':'no-cache','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'self'"}});}
  if(!request.headers.get('oai-authenticated-user-id')&&!env.LOCAL_PREVIEW)return json({error:'Entre com sua conta do ChatGPT para acessar o controle.'},401);
  if(request.method!=='GET'){
   const origin=request.headers.get('origin');if(origin&&origin!==url.origin)return json({error:'Origem não autorizada.'},403);
   if(!request.headers.get('content-type')?.startsWith('application/json'))return json({error:'Formato inválido.'},415);
   if(Number(request.headers.get('content-length')||0)>30000)return json({error:'Dados muito grandes.'},413);
  }
  if(!env.DB)return json({error:'O banco de dados não está disponível. Tente novamente.'},503);
  const db=env.DB;
  if(p==='/api/data'&&request.method==='GET'){
   const [vehicles,entries,settings,owners]=await db.batch([db.prepare('SELECT * FROM vehicles ORDER BY purchased_at DESC, name'),db.prepare('SELECT * FROM entries ORDER BY date DESC, id DESC'),db.prepare('SELECT company FROM settings WHERE id=1'),db.prepare('SELECT id,name,color FROM owners ORDER BY name COLLATE NOCASE')]);
   return json({vehicles:vehicles.results,entries:entries.results,owners:owners.results,expenseGroups:EXPENSE_GROUPS,company:settings.results[0]?.company||'Minha Frota',storage:env.LOCAL_PREVIEW?'local':'online'});
  }
  const body=request.method==='GET'?{}:await request.json();
  if(p==='/api/owner'&&request.method==='POST'){
   const name=str(body.name,'o nome do proprietário',80).normalize('NFC').replace(/\s+/gu,' '),nameKey=name.toLocaleLowerCase('pt-BR');
   if(!ownerColors.includes(body.color))bad('Selecione uma cor para o proprietário.');
   if(body.id&&!await db.prepare('SELECT id FROM owners WHERE id=?').bind(body.id).first())return json({error:'Proprietário não encontrado.'},404);
   const duplicate=await db.prepare('SELECT id FROM owners WHERE name_key=?').bind(nameKey).first();
   if(duplicate&&duplicate.id!==body.id)return json({error:'Esse proprietário já está cadastrado. Selecione o nome existente.'},409);
   const id=body.id||crypto.randomUUID();
   await db.prepare('INSERT INTO owners(id,name,name_key,color) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,name_key=excluded.name_key,color=excluded.color').bind(id,name,nameKey,body.color).run();
   return json({ok:true,id});
  }
  if(p==='/api/company'&&request.method==='POST'){
   const company=str(body.company,'o nome da empresa',80);await db.prepare('INSERT INTO settings(id,company) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET company=excluded.company').bind(company).run();return json({ok:true});
  }
  if(p==='/api/vehicle'&&request.method==='POST'){
   const v={id:body.id||crypto.randomUUID(),name:str(body.name,'o nome do veículo',100),plate:str(body.plate,'a placa',20).toUpperCase(),year:notes(body.year).slice(0,4),purchase:money(body.purchase,true),purchased_at:day(body.purchased_at),status:body.status,notes:notes(body.notes),owner_id:str(body.owner_id,'o proprietário')};
   if(!await db.prepare('SELECT id FROM owners WHERE id=?').bind(v.owner_id).first())bad('Selecione um proprietário cadastrado.');
   if(!statuses.includes(v.status))bad('Selecione a situação do carro.');
   if(v.year&&!/^(19|20)\d{2}$/.test(v.year))bad('Informe um ano entre 1900 e 2099.');
   if(body.id&&!await db.prepare('SELECT id FROM vehicles WHERE id=?').bind(body.id).first())return json({error:'Veículo não encontrado.'},404);
   await db.prepare('INSERT INTO vehicles(id,name,plate,year,purchase,purchased_at,status,notes,owner_id) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,plate=excluded.plate,year=excluded.year,purchase=excluded.purchase,purchased_at=excluded.purchased_at,status=excluded.status,notes=excluded.notes,owner_id=excluded.owner_id').bind(...Object.values(v)).run();return json({ok:true,id:v.id});
  }
  if(p==='/api/entry'&&request.method==='POST'){
   const v={id:body.id||crypto.randomUUID(),vehicle_id:str(body.vehicle_id,'o veículo'),kind:body.kind,category:body.category,amount:money(body.amount),date:day(body.date),description:notes(body.description)};
   if(!['income','expense'].includes(v.kind))bad('Tipo de lançamento inválido.');
   if(v.kind==='income')v.category='Locação';else if(!expenseCategories.includes(v.category))bad('Categoria inválida.');
   if(!await db.prepare('SELECT id FROM vehicles WHERE id=?').bind(v.vehicle_id).first())bad('Selecione um veículo cadastrado.');
   if(body.id&&!await db.prepare('SELECT id FROM entries WHERE id=?').bind(body.id).first())return json({error:'Lançamento não encontrado.'},404);
   await db.prepare('INSERT INTO entries(id,vehicle_id,kind,category,amount,date,description) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET vehicle_id=excluded.vehicle_id,kind=excluded.kind,category=excluded.category,amount=excluded.amount,date=excluded.date,description=excluded.description').bind(...Object.values(v)).run();return json({ok:true,id:v.id});
  }
  if(p==='/api/delete-entry'&&request.method==='POST'){await db.prepare('DELETE FROM entries WHERE id=?').bind(str(body.id,'o lançamento')).run();return json({ok:true});}
  if(p==='/api/delete-vehicle'&&request.method==='POST'){
   if(await db.prepare('SELECT id FROM entries WHERE vehicle_id=? LIMIT 1').bind(str(body.id,'o veículo')).first())bad('Este veículo tem lançamentos. Use a situação Inativo para preservar o histórico.');
   await db.prepare('DELETE FROM vehicles WHERE id=?').bind(body.id).run();return json({ok:true});
  }
  return json({error:'Operação não encontrada.'},404);
 }catch(e){if(e.message?.includes('UNIQUE'))return json({error:'Já existe um veículo com essa placa.'},409);return json({error:e.status?e.message:'Não foi possível salvar ou carregar. Tente novamente.'},e.status||500);}
}};
