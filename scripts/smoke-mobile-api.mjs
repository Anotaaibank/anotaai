import {spawn,spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {mkdirSync,readFileSync,writeFileSync,existsSync,openSync,closeSync} from 'node:fs';
import {parseEnv} from 'node:util';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const origin='http://127.0.0.1:3124',env={};
for(const name of ['PATH','Path','SystemRoot','SYSTEMROOT','WINDIR','COMSPEC','TEMP','TMP','LOCALAPPDATA','APPDATA','USERPROFILE','PATHEXT','NUMBER_OF_PROCESSORS'])if(process.env[name])env[name]=process.env[name];
for(const file of ['.env.local','.env.server.local','.env.cloud.local','.env.deploy.local','.env.production','.env'])if(existsSync(file))for(const name of Object.keys(parseEnv(readFileSync(file,'utf8'))))env[name]='';
Object.assign(env,{ANOTA_STORAGE:'local',ANOTA_DATABASE_PATH:':memory:',ANOTA_ASSISTANT_ENABLED:'false',ANOTA_RUN_WORKER:'0',ANOTA_REQUIRE_SUBSCRIPTION:'0',ANOTA_MOBILE_API_ENABLED:'1',APP_URL:origin,NEXT_TELEMETRY_DISABLED:'1',ANOTA_BUILD_CHECK:'mobile-http-smoke',NODE_OPTIONS:'--import='+pathToFileURL(resolve('scripts/offline-validation.mjs')).href});
mkdirSync('.data',{recursive:true});const log=openSync('.data/mobile-http-smoke.log','w'),files=new Map(['tsconfig.json','next-env.d.ts'].map(f=>[f,readFileSync(f)]));
const child=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--webpack','--port','3124','--hostname','127.0.0.1'],{env,stdio:['ignore',log,log],windowsHide:true}),checks=[],started=Date.now();
async function post(path,input,token){const r=await fetch(origin+path,{method:'POST',headers:{'Content-Type':'application/json',Origin:origin,...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(input),signal:AbortSignal.timeout(30000)});return {status:r.status,data:await r.json(),cache:r.headers.get('cache-control')};}
const api=(input,token)=>post('/api/mobile/v1',input,token);
function passed(name){checks.push({name,passed:true});console.log(name+': passed');}
try{
 console.log('Starting isolated Next API on loopback; no production credentials.');
 let ready=false;for(let i=0;i<90;i++){try{const r=await fetch(origin+'/api/mobile/v1',{signal:AbortSignal.timeout(3000)});if(r.status===405){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,500));}assert.ok(ready,'Next server did not become ready');
 const password='synthetic-smoke-'+randomUUID(),email='native-'+randomUUID()+'@example.test';
 assert.equal((await post('/api/session',{action:'register',email,password,password_confirmation:password,name:'Conta sintética nativa'})).status,200);
 const a=await api({action:'login',email,password});assert.equal(a.status,200);assert.match(a.data.token,/^anm1\./);passed('existing-account login through native HTTP gateway');
 const token=a.data.token,today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const prepare=async command=>{const p=await api({action:'prepare',request_id:randomUUID(),command},token);assert.equal(p.status,200,JSON.stringify(p.data));return p.data.pending.confirmation;};
 const income=await prepare({action:'income_upsert',description:'Recebimento sintético',amount_cents:50000,date:today,status:'REALIZADO'});
 assert.equal((await api({action:'snapshot'},token)).data.snapshot.balance_cents,0);passed('prepare does not mutate balance');
 assert.equal((await api({action:'confirm',confirmation:income},token)).data.saved,true);assert.equal((await api({action:'confirm',confirmation:income},token)).data.saved,true);
 const expense=await prepare({action:'expense_create',description:'Almoço sintético',category:'Restaurante',amount_cents:2500,date:today,status:'REALIZADO'});await api({action:'confirm',confirmation:expense},token);
 const future=new Date(Date.parse(today+'T12:00:00Z')+86400000).toISOString().slice(0,10);
 const payable=await prepare({action:'expense_create',description:'Parcela final sintética',category:'Outras despesas pessoais',amount_cents:80000,date:future,status:'PREVISTO'});await api({action:'confirm',confirmation:payable},token);
 const appointment=await prepare({action:'appointment_upsert',description:'Dentista sintético',date:future,time:'15:00'});await api({action:'confirm',confirmation:appointment},token);
 const snapshot=await api({action:'snapshot'},token);assert.equal(snapshot.status,200);assert.equal(snapshot.data.snapshot.balance_cents,47500);assert.equal(snapshot.data.snapshot.documents.filter(d=>d.kind==='INCOME').length,1);assert.equal(snapshot.data.snapshot.expenses.length,2);assert.equal(snapshot.data.snapshot.documents.filter(d=>d.kind==='APPOINTMENT').length,1);assert.ok(!snapshot.data.snapshot.documents.some(d=>d.kind==='BILL_RULE'));assert.match(snapshot.cache,/no-store/);passed('income, expense, future payable, appointment and replay persist exactly once');
 assert.equal((await api({action:'snapshot',user_id:randomUUID()},token)).status,400);passed('owner spoofing is rejected over HTTP');
 assert.equal((await api({action:'logout'},token)).status,200);assert.equal((await api({action:'snapshot'},token)).status,401);passed('logout revokes native HTTP session');
}catch(error){checks.push({name:'smoke failure',passed:false,error:error.message});process.exitCode=1;console.error(error.message);}
finally{
 if(child.exitCode===null){if(process.platform==='win32')spawnSync('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});else child.kill('SIGTERM');await new Promise(r=>{if(child.exitCode!==null)r();else{child.once('exit',r);setTimeout(r,5000).unref();}});}
 closeSync(log);for(const [file,bytes]of files)writeFileSync(file,bytes);
 writeFileSync('.data/mobile-http-smoke.json',JSON.stringify({at:new Date().toISOString(),duration_ms:Date.now()-started,checks,synthetic:true,paid_calls:0,production_writes:0},null,2));
}
