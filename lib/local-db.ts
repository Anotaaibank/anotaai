import {DatabaseSync} from 'node:sqlite';
import {mkdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {randomBytes,randomUUID,scryptSync,timingSafeEqual,createHash} from 'node:crypto';
import {AppError,type User} from './model.ts';
import {assistantName,savedAssistantName} from './assistant-name.ts';
import type {AdminEntry,ExpensePayload} from './expenses.ts';
const runtime=globalThis as unknown as {anotaDb?:DatabaseSync;anotaInvitationsReady?:boolean};
export function localDb(){
 if(runtime.anotaDb){if(!runtime.anotaInvitationsReady){runtime.anotaDb.exec('CREATE TABLE IF NOT EXISTS whatsapp_invitations(id TEXT PRIMARY KEY,owner_id TEXT NOT NULL REFERENCES users(id),phone TEXT NOT NULL UNIQUE,user_id TEXT UNIQUE REFERENCES users(id),token_hash TEXT NOT NULL UNIQUE,token_cipher TEXT NOT NULL,expires_at INTEGER NOT NULL,send_status TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,UNIQUE(owner_id,phone))');runtime.anotaInvitationsReady=true;}return runtime.anotaDb;}
 const path=process.env.ANOTA_DATABASE_PATH||'.data/anota-ai.sqlite';if(path!==':memory:')mkdirSync(dirname(resolve(path)),{recursive:true});
 const db=new DatabaseSync(path);db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
 CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,name TEXT NOT NULL,password TEXT NOT NULL,created_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS sessions(hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),expires INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS expenses(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),data TEXT NOT NULL,updated_at TEXT NOT NULL);
 CREATE INDEX IF NOT EXISTS expenses_owner ON expenses(user_id);
 CREATE TABLE IF NOT EXISTS audit(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,entity_id TEXT,action TEXT NOT NULL,details TEXT NOT NULL,created_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS bots(user_id TEXT PRIMARY KEY REFERENCES users(id),data TEXT NOT NULL,updated_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS whatsapp_invitations(id TEXT PRIMARY KEY,owner_id TEXT NOT NULL REFERENCES users(id),phone TEXT NOT NULL UNIQUE,user_id TEXT UNIQUE REFERENCES users(id),token_hash TEXT NOT NULL UNIQUE,token_cipher TEXT NOT NULL,expires_at INTEGER NOT NULL,send_status TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,UNIQUE(owner_id,phone));
 CREATE TABLE IF NOT EXISTS inbox(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,provider_id TEXT NOT NULL,data TEXT NOT NULL,UNIQUE(user_id,provider_id));
 CREATE INDEX IF NOT EXISTS inbox_queue_status ON inbox(json_extract(data,'$.status'),json_extract(data,'$.claimed_at'));
 CREATE INDEX IF NOT EXISTS inbox_reply_status ON inbox(json_extract(data,'$.reply_status'));
 CREATE TABLE IF NOT EXISTS settings(name TEXT PRIMARY KEY,value TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS limits(key TEXT PRIMARY KEY,count INTEGER NOT NULL,start INTEGER NOT NULL);`);
 runtime.anotaDb=db;runtime.anotaInvitationsReady=true;return db;
}
export function transaction<T>(fn:()=>T){const db=localDb();if(db.isTransaction)return fn();db.exec('BEGIN IMMEDIATE');try{const result=fn();db.exec('COMMIT');return result;}catch(e){db.exec('ROLLBACK');throw e;}}
function hashPassword(password:string,salt=randomBytes(16).toString('hex')){return salt+':'+scryptSync(password,salt,64).toString('hex');}
function session(user:User){const token=randomBytes(32).toString('base64url');localDb().prepare('INSERT INTO sessions VALUES(?,?,?)').run(createHash('sha256').update(token).digest('hex'),user.id,Date.now()+86400000);return {user,token};}
function preferenceDb(){const db=localDb();db.exec('CREATE TABLE IF NOT EXISTS assistant_preferences(user_id TEXT PRIMARY KEY REFERENCES users(id),name TEXT NOT NULL)');return db;}
export function localAssistantName(user:string){const row=preferenceDb().prepare('SELECT name FROM assistant_preferences WHERE user_id=?').get(user) as {name:string}|undefined;return savedAssistantName(row?.name);}
export function setLocalAssistantName(user:string,value:unknown){const name=assistantName(value);preferenceDb().prepare('INSERT INTO assistant_preferences(user_id,name) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET name=excluded.name').run(user,name);return name;}
export function registerLocal(email:string,password:string,name:string,chosenName:unknown=undefined,onCreated?:(userId:string)=>void){const user={id:randomUUID(),name,email,assistant_name:assistantName(chosenName)};try{return transaction(()=>{localDb().prepare('INSERT INTO users VALUES(?,?,?,?,?)').run(user.id,email,name,hashPassword(password),new Date().toISOString());setLocalAssistantName(user.id,user.assistant_name);onCreated?.(user.id);return session(user);});}catch{throw new AppError('Não foi possível criar a conta. Confira o e-mail ou tente entrar.',409);}}
export function loginLocal(email:string,password:string){const row=localDb().prepare('SELECT * FROM users WHERE email=?').get(email) as {id:string;name:string;email:string;password:string}|undefined;const saved=row?.password||hashPassword('dummy-password');const [salt,expected]=saved.split(':');if(!timingSafeEqual(scryptSync(password,salt,64),Buffer.from(expected,'hex'))||!row)throw new AppError('E-mail ou senha inválidos.',401);return session({id:row.id,name:row.name,email:row.email,assistant_name:localAssistantName(row.id)});}
export function userLocal(token:string){const hash=createHash('sha256').update(token).digest('hex');const row=localDb().prepare('SELECT u.id,u.email,u.name FROM sessions s JOIN users u ON u.id=s.user_id WHERE hash=? AND expires>?').get(hash,Date.now()) as User|undefined;if(!row)throw new AppError('Entre na sua conta para continuar.',401);return {...row,assistant_name:localAssistantName(row.id)};}
export function logoutLocal(token:string){localDb().prepare('DELETE FROM sessions WHERE hash=?').run(createHash('sha256').update(token).digest('hex'));}
export function localRows(user:string){return (localDb().prepare('SELECT data FROM expenses WHERE user_id=? ORDER BY updated_at DESC').all(user) as {data:string}[]).map(r=>JSON.parse(r.data) as AdminEntry);}
export function auditLocal(user:string,entity:string,action:string,details:unknown){localDb().prepare('INSERT INTO audit VALUES(?,?,?,?,?,?)').run(randomUUID(),user,entity,action,JSON.stringify(details),new Date().toISOString());}
function timestamp(after?:string){return new Date(Math.max(Date.now(),after?Date.parse(after)+1:0)).toISOString();}
export function saveLocal(user:string,payload:ExpensePayload,expected:string|null,origin:AdminEntry['origin']){
 return transaction(()=>{
  const db=localDb(),stored=db.prepare('SELECT user_id,data FROM expenses WHERE id=?').get(payload.id) as {user_id:string;data:string}|undefined;
  if(stored&&stored.user_id!==user)throw new AppError('Não foi possível acessar este lançamento.',403);
  const old=stored?JSON.parse(stored.data) as AdminEntry:null;
  if(old&&!expected){const {user_id:_,active:__,created_at:___,updated_at:____,origin:_____,...original}=old;void _;void __;void ___;void ____;void _____;if(JSON.stringify(original)!==JSON.stringify(payload))throw new AppError('Este código já pertence a outro lançamento.',409);return old;}
  if(expected&&(!old||old.updated_at!==expected))throw new AppError('A despesa mudou em outra aba. Atualize antes de salvar.',409);
  const now=timestamp(old?.updated_at),row:AdminEntry={...payload,user_id:user,active:old?.active??true,created_at:old?.created_at??now,updated_at:now,origin:old?.origin??origin};
  db.prepare('INSERT INTO expenses VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at').run(row.id,user,JSON.stringify(row),now);auditLocal(user,row.id,old?'DESPESA_EDITADA':'DESPESA_CRIADA',{origin:row.origin});return row;
 });
}
export function archiveLocal(user:string,id:string,expected:string,active:boolean){return transaction(()=>{const row=localRows(user).find(r=>r.id===id);if(!row)throw new AppError('Despesa não encontrada.',404);if(row.updated_at!==expected)throw new AppError('A despesa mudou. Atualize a página.',409);row.active=active;row.updated_at=timestamp(row.updated_at);localDb().prepare('UPDATE expenses SET data=?,updated_at=? WHERE id=? AND user_id=?').run(JSON.stringify(row),row.updated_at,id,user);auditLocal(user,id,active?'DESPESA_RESTAURADA':'DESPESA_ARQUIVADA',{});return row;});}
export function localSecret(){const db=localDb();let value=(db.prepare("SELECT value FROM settings WHERE name='encryption'").get() as {value:string}|undefined)?.value;if(!value){value=randomBytes(32).toString('base64url');db.prepare('INSERT OR IGNORE INTO settings VALUES(?,?)').run('encryption',value);value=(db.prepare("SELECT value FROM settings WHERE name='encryption'").get() as {value:string}).value;}return value;}
export function throttleLocal(key:string,max:number,windowMs:number){transaction(()=>{const db=localDb(),now=Date.now(),row=db.prepare('SELECT count,start FROM limits WHERE key=?').get(key) as {count:number;start:number}|undefined;db.prepare('DELETE FROM limits WHERE start<?').run(now-86400000);if(row&&row.start>now-windowMs&&row.count>=max)throw new AppError('Aguarde um pouco antes de tentar novamente.',429);db.prepare('INSERT INTO limits VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET count=excluded.count,start=excluded.start').run(key,row&&row.start>now-windowMs?row.count+1:1,row&&row.start>now-windowMs?row.start:now);});}
