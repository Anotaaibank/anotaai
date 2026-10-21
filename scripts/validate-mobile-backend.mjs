import {spawn} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {parseEnv} from 'node:util';
const env={};for(const k of ['PATH','Path','SystemRoot','SYSTEMROOT','WINDIR','COMSPEC','TEMP','TMP','LOCALAPPDATA','APPDATA','USERPROFILE','PATHEXT','NUMBER_OF_PROCESSORS'])if(process.env[k])env[k]=process.env[k];
for(const file of ['.env.local','.env.server.local','.env.cloud.local','.env.deploy.local','.env.production','.env'])if(fs.existsSync(file))for(const k of Object.keys(parseEnv(fs.readFileSync(file,'utf8'))))env[k]='';
Object.assign(env,{ANOTA_STORAGE:'local',ANOTA_DATABASE_PATH:':memory:',ANOTA_ASSISTANT_ENABLED:'false',ANOTA_RUN_WORKER:'0',ANOTA_REQUIRE_SUBSCRIPTION:'0',ANOTA_MOBILE_API_ENABLED:'0',APP_URL:'http://localhost:3100',NEXT_TELEMETRY_DISABLED:'1',ANOTA_BUILD_CHECK:'mobile-foundation-20261021',NODE_OPTIONS:'--import='+pathToFileURL(path.resolve('scripts/offline-validation.mjs')).href});
fs.mkdirSync('.data',{recursive:true});const results=[];
const steps=[['typecheck',['node_modules/typescript/bin/tsc','--noEmit']],['tests',['--experimental-strip-types','--test','--test-isolation=none','tests/*.test.ts']],['build',['node_modules/next/dist/bin/next','build','--webpack']]];
// Next modifies these generated paths during isolated builds. Preserve the caller's files.
const originals=new Map(['tsconfig.json','next-env.d.ts'].filter(f=>fs.existsSync(f)).map(f=>[f,fs.readFileSync(f)]));
try{for(const [name,args] of steps.filter(([n])=>!process.argv.includes('--checks-only')||n!=='build')){
 const start=Date.now(),fd=fs.openSync('.data/mobile-backend-'+name+'.log','w');
 const code=await new Promise(resolve=>{const p=spawn(process.execPath,args,{env,stdio:['ignore',fd,fd],windowsHide:true});p.once('error',()=>resolve(-1));p.once('exit',resolve);});fs.closeSync(fd);
 results.push({name,exit:code,duration_ms:Date.now()-start});console.log(JSON.stringify(results.at(-1)));if(code!==0){process.exitCode=1;break;}
}}finally{for(const [file,bytes] of originals)fs.writeFileSync(file,bytes);fs.writeFileSync('.data/mobile-backend-results.json',JSON.stringify({at:new Date().toISOString(),isolated:true,paid_calls:0,production_writes:0,results},null,2));}
