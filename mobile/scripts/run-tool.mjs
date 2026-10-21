import {spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import {dirname,resolve,delimiter} from 'node:path';
import {fileURLToPath} from 'node:url';
export const mobile=resolve(dirname(fileURLToPath(import.meta.url)),'..');
export function run(command,args,options={}){
 const helper=resolve(mobile,'../.data/mobile-tools/node_modules/.bin'),env={...process.env,EXPO_NO_TELEMETRY:'1',...options.env};
 const pathKeys=Object.keys(env).filter(k=>k.toLowerCase()==='path'),pathValue=pathKeys.map(k=>env[k]).find(Boolean)||'';
 for(const k of pathKeys)delete env[k];env.PATH=(existsSync(helper)?helper+delimiter:'')+pathValue;
 const r=spawnSync(command,args,{cwd:mobile,stdio:'inherit',windowsHide:true,shell:process.platform==='win32'&&command==='pnpm',...options,env});
 if(r.error)throw r.error;if(r.status!==0)throw Error(command+' falhou ('+r.status+').');
}
