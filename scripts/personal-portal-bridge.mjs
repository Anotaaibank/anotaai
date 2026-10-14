// Temporary customer portal. Management, demo and worker endpoints are never exposed.
import {createServer} from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {Readable} from 'node:stream';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const publicPath=p=>p==='/'||/^\/cadastro\/[A-Za-z0-9_-]{43}$/.test(p)||p==='/manifest.webmanifest'||p==='/anotei-na-hora.jpeg'||/^\/_next\/static\/[A-Za-z0-9_./\[\]-]+$/.test(p);
const personalApi=new Set(['/api/session','/api/finance','/api/finance/interpret','/api/expenses','/api/expenses/schedule','/api/assistant','/api/assistant/data','/api/assistant/expense','/api/assistant/finance','/api/assistant/help','/api/assistant/preferences','/api/feedback','/api/whatsapp']);
export function createPersonalPortal({upstream,publicOrigin,authorized,invitationValid,loginAllowed,transport=fetch}){
 const base=new URL(upstream);if(base.protocol!=='http:'||!['localhost','127.0.0.1'].includes(base.hostname)||base.pathname!=='/'||base.search||base.username||base.password)throw Error('Use apenas o aplicativo local.');
 const respond=(res,status,message)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({error:message}));};
 return async(req,res)=>{try{
  const raw=(req.url||'/').split('?')[0],staticPath=raw.startsWith('/_next/static/'),normalized=staticPath?raw.replace(/%5b/gi,'[').replace(/%5d/gi,']'):raw;
  if(/%|\\|(?:^|\/)\.\.(?:\/|$)/.test(normalized)){respond(res,404,'Não encontrado.');return;}
  const url=new URL(req.url||'/',base),path=staticPath?normalized:url.pathname,method=req.method||'GET';
  if(!publicPath(path)&&path!=='/painel'&&!personalApi.has(path)){respond(res,404,'Não encontrado.');return;}
  const logged=await authorized(String(req.headers.cookie||''));
  if(!['GET','HEAD','POST','PATCH','DELETE'].includes(method)){respond(res,405,'Método indisponível.');return;}
  if(!['GET','HEAD'].includes(method)&&(!personalApi.has(path)||req.headers.origin!==publicOrigin())){respond(res,403,'Origem inválida.');return;}
  if((path==='/painel'||personalApi.has(path)&&path!=='/api/session')&&!logged){if(path==='/painel'){res.writeHead(302,{Location:'/', 'Cache-Control':'no-store'});res.end();}else respond(res,401,'Entre na sua conta pessoal.');return;}
  if(path==='/api/session'&&['GET','DELETE'].includes(method)&&!logged){respond(res,401,'Entre na sua conta pessoal.');return;}
  let body;
  if(!['GET','HEAD'].includes(method)){if(Number(req.headers['content-length'])>524288){respond(res,413,'Solicitação acima do limite.');return;}const chunks=[];let length=0;for await(const chunk of req){length+=chunk.length;if(length>524288){respond(res,413,'Solicitação acima do limite.');return;}chunks.push(chunk);}body=Buffer.concat(chunks);
   if(path==='/api/session'&&method==='POST'){let input;try{input=JSON.parse(body.toString());}catch{respond(res,400,'Confira os dados.');return;}
    if(input.action==='login'&&!await loginAllowed(input.email)){respond(res,401,'E-mail ou senha inválidos.');return;}if(input.action==='register'&&!await invitationValid(input.invitation)||!['register','login'].includes(input.action)){respond(res,403,'Use seu convite pessoal ou entre na conta cadastrada por ele.');return;}
   }
  }
  const headers={'x-anotei-public-portal':'1'};for(const name of ['content-type','cookie','origin','accept','user-agent'])if(typeof req.headers[name]==='string')headers[name]=req.headers[name];
  const response=await transport(new URL(url.pathname+url.search,base),{method,headers,body,redirect:'manual',signal:AbortSignal.timeout(180000)});
  res.statusCode=response.status;for(const [name,value]of response.headers)if(!['connection','transfer-encoding','content-encoding','content-length','set-cookie'].includes(name))res.setHeader(name,value);
  for(const cookie of response.headers.getSetCookie())res.appendHeader('Set-Cookie',cookie);
  res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY');res.setHeader('Referrer-Policy','no-referrer');
  if(!response.body||method==='HEAD')res.end();else Readable.fromWeb(response.body).pipe(res);
 }catch{if(!res.headersSent)respond(res,503,'A conexão está sendo restabelecida. Tente novamente em instantes.');else res.end();}};
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 process.loadEnvFile('.env.local');if(process.env.ANOTA_STORAGE!=='local')throw Error('O portal provisório exige armazenamento local.');
 const db=new DatabaseSync(process.env.ANOTA_DATABASE_PATH||'.data/anota-ai.sqlite',{readOnly:true});
 const member=user=>!!db.prepare('SELECT id FROM whatsapp_invitations WHERE user_id=?').get(user);
 const handler=createPersonalPortal({upstream:process.env.ANOTA_PERSONAL_UPSTREAM||process.env.APP_URL||'http://localhost:3100',publicOrigin:()=>process.env.ANOTA_PUBLIC_URL||'',authorized:cookie=>{const token=/(?:^|;\s*)anota-ai-session=([A-Za-z0-9_-]+)/.exec(cookie)?.[1];if(!token)return false;const session=db.prepare('SELECT user_id FROM sessions WHERE hash=? AND expires>?').get(createHash('sha256').update(token).digest('hex'),Date.now());return !!session&&member(session.user_id);},loginAllowed:email=>typeof email==='string'&&!!db.prepare('SELECT i.id FROM whatsapp_invitations i JOIN users u ON u.id=i.user_id WHERE u.email=?').get(email.trim().toLowerCase()),invitationValid:token=>{if(typeof token!=='string'||! /^[A-Za-z0-9_-]{43}$/.test(token))return false;const row=db.prepare('SELECT i.phone,b.data FROM whatsapp_invitations i JOIN bots b ON b.user_id=i.owner_id WHERE i.token_hash=? AND i.user_id IS NULL AND i.active=1 AND i.expires_at>?').get(createHash('sha256').update(token).digest('hex'),Date.now());return !!row&&JSON.parse(row.data).allowed_phones.includes(row.phone);}});
 const server=createServer(handler);server.requestTimeout=200000;server.headersTimeout=10000;server.listen(3102,'127.0.0.1',()=>console.log('Portal pessoal pronto em 127.0.0.1:3102. Gestão e demonstração bloqueadas.'));
 const close=()=>server.close(()=>{db.close();process.exit(0);});process.on('SIGINT',close);process.on('SIGTERM',close);
}
