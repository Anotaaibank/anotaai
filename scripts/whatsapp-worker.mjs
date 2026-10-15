import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';

// Public customer links keep APP_URL; containers use an internal worker route.
export function workerConnection(env){
 const origin=env.ANOTA_WORKER_URL||env.APP_URL;
 const secret=env.ANOTA_WORKER_SECRET;
 try{
  const url=new URL(origin||'');
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.search||url.hash||url.pathname!=='/')throw Error();
 }catch{throw new Error('Configure APP_URL ou ANOTA_WORKER_URL como origem HTTP/HTTPS.');}
 if(typeof secret!=='string'||secret.length<32)throw new Error('Configure ANOTA_WORKER_SECRET com pelo menos 32 caracteres.');
 return {origin,secret};
}

function startWorker(env){
 const {origin,secret}=workerConnection(env);
 const running=new Set();
 async function tick(task){
  if(running.has(task))return;
  running.add(task);
  try{
   const response=await fetch(new URL('/api/whatsapp/worker',origin),{
    method:'POST',headers:{Authorization:'Bearer '+secret,'x-anotei-task':task},
    signal:AbortSignal.timeout(180000)
   });
   if(!response.ok)console.error('Worker indisponível:',task,response.status);
  }catch{console.error('Worker sem conexão:',task,'A fila permanece no banco.');}
  finally{running.delete(task);}
 }
 for(const [task,interval] of [['messages',1000],['reminders',30000],['invitations',5000],['communications',3000]]){
  void tick(task);
  setInterval(()=>void tick(task),interval);
 }
}

// Importing the helper never reads credentials or starts network activity.
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{process.loadEnvFile('.env.local');}catch{}
 startWorker(process.env);
}
