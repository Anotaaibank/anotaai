// Only this receiver is exposed for local tests. Never point a tunnel at Next.js.
import {createServer} from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {timingSafeEqual} from 'node:crypto';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {unseal} from '../lib/secret-box.ts';

export function createWebhookBridge({upstream,authorize,transport=fetch}){
 const base=new URL(upstream);
 if(!['localhost','127.0.0.1','[::1]'].includes(base.hostname)||base.protocol!=='http:'||base.username||base.password||base.pathname!=='/'||base.search||base.hash)throw new Error('O receptor deve encaminhar somente para o aplicativo local.');
 let inFlight=0,windowStart=Date.now(),received=0;
 const respond=(res,status,value)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','Connection':'close'});res.end(JSON.stringify(value));};
 return async(req,res)=>{
  try{
   const url=new URL(req.url||'/', 'http://receiver.local');
   if(req.method!=='POST'||url.pathname!=='/api/whatsapp/webhook'){respond(res,404,{error:'Não encontrado'});return;}
   const account=url.searchParams.get('account'),key=url.searchParams.get('key');
   if(url.searchParams.getAll('account').length!==1||url.searchParams.getAll('key').length!==1||!/^[a-f0-9-]{36}$/i.test(account||'')||!/^[A-Za-z0-9_-]{32,100}$/.test(key||'')){respond(res,403,{error:'Recebimento não autorizado'});return;}
   if(Date.now()-windowStart>=60000){windowStart=Date.now();received=0;}
   if(++received>120||inFlight>=8){respond(res,429,{error:'Aguarde'});return;}
   if(!await authorize(account,key)){respond(res,403,{error:'Recebimento não autorizado'});return;}
   if(!String(req.headers['content-type']||'').startsWith('application/json')){respond(res,415,{error:'Formato inválido'});return;}
   if(Number(req.headers['content-length'])>50000){respond(res,413,{error:'Acima do limite'});return;}
   inFlight++;let chunks=[],size=0;
   try{
    const bytes=await new Promise((ok,fail)=>{
     const timer=setTimeout(()=>fail(new Error('timeout')),5000);
     req.on('data',chunk=>{size+=chunk.length;if(size>50000){clearTimeout(timer);fail(new Error('large'));req.resume();return;}chunks.push(chunk);});
     req.on('end',()=>{clearTimeout(timer);ok(Buffer.concat(chunks));});
     req.on('error',()=>{clearTimeout(timer);fail(new Error('input'));});
    });chunks=[];
    const result=await transport(new URL('/api/whatsapp/webhook',base),{method:'POST',headers:{'Content-Type':'application/json','x-anota-account':account,'x-anota-hook-key':key},body:bytes,redirect:'error',signal:AbortSignal.timeout(12000)});
    const payload=await result.json().catch(()=>null);
    if(result.ok&&payload&&(typeof payload.queued==='boolean'||payload.ignored===true))respond(res,200,payload.ignored===true?{ignored:true}:{queued:payload.queued});
    else respond(res,[400,403,413,415,429].includes(result.status)?result.status:503,{error:'Não foi possível receber'});
   }catch(e){if(!res.headersSent)respond(res,e.message==='large'?413:e.message==='timeout'?408:503,{error:'Não foi possível receber'});}
   finally{inFlight--;}
  }catch{if(!res.headersSent)respond(res,400,{error:'Recebimento inválido'});}
 };
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{process.loadEnvFile('.env.local');}catch{}
 if(process.env.ANOTA_STORAGE!=='local')throw new Error('O receptor de teste exige banco local.');
 const db=new DatabaseSync(process.env.ANOTA_DATABASE_PATH||'.data/anota-ai.sqlite',{readOnly:true});
 db.exec('PRAGMA busy_timeout=3000');
 const handler=createWebhookBridge({upstream:process.env.APP_URL||'http://localhost:3100',authorize:(account,key)=>{
  try{const row=db.prepare('SELECT data FROM bots WHERE user_id=?').get(account),secret=db.prepare("SELECT value FROM settings WHERE name='encryption'").get()?.value;if(!row||!secret)return false;const bot=JSON.parse(row.data);if(!bot.enabled||bot.status!=='PRONTO'||bot.user_id!==account)return false;const expected=unseal(bot.hook_cipher,secret,'anota-ai-hook:'+account),a=Buffer.from(key),b=Buffer.from(expected);return a.length===b.length&&timingSafeEqual(a,b);}catch{return false;}
 }});
 const server=createServer(handler);server.headersTimeout=8000;server.requestTimeout=15000;
 server.listen(3101,'127.0.0.1',()=>console.log('Receptor de mensagens pronto em 127.0.0.1:3101. Painel, demonstração e banco permanecem locais.'));
 const close=()=>server.close(()=>{db.close();process.exit(0);});process.on('SIGINT',close);process.on('SIGTERM',close);
}
