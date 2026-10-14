import {spawn} from 'node:child_process';
import {deploymentReadiness} from './deployment-preflight.mjs';

const readiness=deploymentReadiness(process.env);
if(!readiness.configuration_ready){console.error(JSON.stringify(readiness));process.exit(2);}
const children=[];
let stopping=false;
function stop(code){
 if(stopping)return;stopping=true;
 for(const child of children)child.kill('SIGTERM');
 const deadline=setTimeout(()=>{for(const child of children)child.kill('SIGKILL');process.exit(code);},10000);
 deadline.unref();
 Promise.all(children.map(child=>child.exitCode!==null?Promise.resolve():new Promise(resolve=>child.once('exit',resolve)))).then(()=>process.exit(code));
}
function start(file){
 const child=spawn(process.execPath,[file],{stdio:'inherit',env:process.env});children.push(child);
 child.once('error',()=>{console.error('Não foi possível iniciar um processo do Anotei.');stop(1);});
 child.once('exit',code=>{if(!stopping)stop(code||1);});return child;
}
process.on('SIGTERM',()=>stop(0));process.on('SIGINT',()=>stop(0));
start('server.js');
if(process.env.ANOTA_RUN_WORKER==='1')start('scripts/whatsapp-worker.mjs');
