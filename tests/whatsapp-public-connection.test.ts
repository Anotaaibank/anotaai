import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {randomUUID} from 'node:crypto';
import {AppError} from '../lib/model.ts';
import type {Bot} from '../lib/whatsapp-store.ts';
import {publicWhatsappConnection} from '../lib/whatsapp-public-connection.ts';

// Actual GET/POST, HTTP helpers and public projection; only identity/store/provider
// transports are synthetic. No connection, media or message is sent to a provider.
const headersHook=registerHooks({resolve(s,c,next){return next(s==='next/headers'?'next/headers.js':s,c);}});
const server=await import('../lib/server.ts');headersHook.deregister();
const viewer=randomUUID(),master=randomUUID();
const qr='data:image/png;base64,AQIDBA==',paircode='ABCD-1234';
const providerConnection={configured:true,connected:false,connecting:true,wrongNumber:false,phone:'5511999999999',qr,paircode,message:'Conexão em andamento.',token:'synthetic-provider-token',owner:master,instance_id:'synthetic-instance',actions:{pair:true},unexpected:'synthetic-extra'};
const makeBot=(id=viewer,shared?:string):Bot=>({user_id:id,phone:'5511999999999',allowed_phones:['5511988888888'],enabled:true,status:'PRONTO',instance_id:'synthetic-instance',token_cipher:'synthetic-token-cipher',hook_cipher:'synthetic-hook-cipher',updated_at:'2026-10-27T12:00:00.000Z',...(shared?{shared_owner_id:shared,connection_user_id:shared}:{})});
const fixture={server,AppError,viewer,manager:false,unauthenticated:false,settings:makeBot() as Bot|null,bot:makeBot() as Bot|null,providerConnection:providerConnection as Record<string,unknown>,reads:0,statusCalls:0,saveCalls:0,connectCalls:0};
(globalThis as Record<symbol,unknown>)[Symbol.for('anotei.public-whatsapp-tests')]=fixture;
const prefix="const f=globalThis[Symbol.for('anotei.public-whatsapp-tests')];";
const sources:Record<string,string>={
 '@/lib/server':prefix+`export const authorize=async()=>{if(f.unauthenticated)throw new f.AppError('Entre na conta',401);return {user:{id:f.viewer},token:'synthetic-auth'};};export const body=f.server.body,json=f.server.json,sameOrigin=f.server.sameOrigin,failure=f.server.failure;`,
 '@/lib/whatsapp-store':prefix+`export const rawBot=async user=>{if(user!==f.viewer)throw Error('Wrong owner');f.reads++;return f.settings;};export const getBot=async user=>{if(user!==f.viewer)throw Error('Wrong owner');f.reads++;return f.bot;};export const history=async user=>{if(user!==f.viewer)throw Error('Wrong owner');return [{id:'synthetic-message',sender:'5511988888888',transcript:'Texto sintético',reply:'Resposta sintética',status:'RESOLVIDO',reply_status:'ACEITO',created_at:'2026-10-27T12:00:00.000Z',finance_confirmation:'synthetic-private-confirmation'}];};`,
 '@/lib/whatsapp-server':prefix+`export const statusBot=async()=>{f.statusCalls++;return f.providerConnection;};export const saveBot=async(auth)=>{f.saveCalls++;if(!f.manager)throw new f.AppError('Management required',403);};export const connectBot=async(auth)=>{f.connectCalls++;if(!f.manager||f.settings?.shared_owner_id)throw new f.AppError('Management required',403);return f.providerConnection;};`,
 '@/lib/commerce':prefix+`export const isManager=user=>user===f.viewer&&f.manager;export const requireManager=user=>{if(user!==f.viewer||!f.manager)throw new f.AppError('Management required',403);};`,
 '@/lib/whatsapp-config':`export const whatsappIntegrationReady=()=>true;`,
 '@/lib/whatsapp-members':`export const invitationViews=async()=>[],publicAppOrigin=()=> 'https://synthetic.example',createPersonalInvitation=async()=>{};`,
 '@/lib/whatsapp-access-links':`export const accessLinkViews=async()=>[],queueAccessLink=async()=>{};`,
 '@/lib/model':`export {AppError} from ${JSON.stringify(new URL('../lib/model.ts',import.meta.url).href)};`,
};
const hooks=registerHooks({resolve(s,c,next){
 if(sources[s])return {url:'data:text/javascript,'+encodeURIComponent(sources[s]),shortCircuit:true};
 if(s==='@/lib/whatsapp-public-connection')return next(new URL('../lib/whatsapp-public-connection.ts',import.meta.url).href,c);
 return next(s,c);
}});
const route=await import('../app/api/whatsapp/route.ts');hooks.deregister();
function reset(manager=false,shared=false){fixture.viewer=viewer;fixture.manager=manager;fixture.unauthenticated=false;fixture.settings=makeBot(viewer,shared?master:undefined);fixture.bot=makeBot(viewer,shared?master:undefined);fixture.providerConnection={...providerConnection};fixture.reads=fixture.statusCalls=fixture.saveCalls=fixture.connectCalls=0;}
const request=(action='save',extra={},query='')=>{const origin=new URL(process.env.APP_URL||'http://whatsapp-public.test').origin;return new Request(origin+'/api/whatsapp'+query,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({action,...extra})});};
function assertPrivate(data:{connection:Record<string,unknown>}){assert.deepEqual(Object.keys(data.connection).sort(),['configured','connected','message']);assert.equal(data.connection.qr,undefined);assert.equal(data.connection.paircode,undefined);assert.equal(data.connection.owner,undefined);assert.equal(data.connection.token,undefined);assert.equal(data.connection.configured,true);assert.equal(data.connection.connected,false);}

test('PRIV-B baseline GET: assinante não recebe material de pareamento nem extras',async()=>{
 reset(false,true);const response=await route.GET();assert.equal(response.status,200);assertPrivate(await response.json());assert.equal(fixture.statusCalls,1);
});
test('PRIV-B baseline POST: gestor em conexão compartilhada não recebe pareamento',async()=>{
 reset(true,true);const response=await route.POST(request());assert.equal(response.status,200);assertPrivate(await response.json());assert.equal(fixture.statusCalls,1);
});
for(const method of ['GET','POST'] as const){
 test(`${method}: gestor dono exato independente preserva QR/código e remove extras`,async()=>{
  reset(true);const response=method==='GET'?await route.GET():await route.POST(request());const data=await response.json();
  assert.equal(response.status,200);assert.equal(data.connection.qr,qr);assert.equal(data.connection.paircode,paircode);
  assert.equal(data.connection.connecting,true);assert.equal(data.connection.wrongNumber,false);assert.equal(data.connection.phone,providerConnection.phone);assert.equal(data.connection.message,providerConnection.message);
  assert.deepEqual(Object.keys(data.connection).sort(),['configured','connected','connecting','message','paircode','phone','qr','wrongNumber']);
  assert.equal(data.settings.token_cipher,undefined);assert.equal(data.settings.hook_cipher,undefined);assert.equal(data.history[0].finance_confirmation,undefined);
  assert.equal(fixture.statusCalls,1);assert.equal(fixture.connectCalls,0);assert.equal(data.history[0].transcript,'Texto sintético');
 });
 test(`${method}: sem sessão não consulta armazenamento nem provedor`,async()=>{
  reset();fixture.unauthenticated=true;const response=method==='GET'?await route.GET():await route.POST(request());
  assert.equal(response.status,401);assert.equal(fixture.reads,0);assert.equal(fixture.statusCalls,0);assert.equal(fixture.connectCalls,0);assert.equal(fixture.saveCalls,0);
  assert.equal((await response.json()).viewer_id,undefined);
 });
}
for(const [label,manager,shared]of [['assinante independente',false,false],['gestor compartilhado',true,true]] as const)test(`GET: ${label} recebe só status e mensagem segura`,async()=>{
 reset(manager,shared);fixture.providerConnection.message='synthetic internal owner secret';const data=await(await route.GET()).json();
 assertPrivate(data);assert.ok(!data.connection.message.includes('internal'));assert.equal(fixture.statusCalls,1);
});
test('POST: flags do cliente não promovem assinante a gestor nem revelam pareamento',async()=>{
 reset(false,true);const response=await route.POST(request('save',{manager:true,viewerId:master,connection_owner_id:viewer,shared_connection:false}));
 assert.equal(response.status,403);assert.equal(fixture.statusCalls,0);assert.equal((await response.json()).connection,undefined);
});
test('POST connect: gestor independente usa resultado live com a mesma projeção sem status extra',async()=>{
 reset(true);const response=await route.POST(request('connect'));const data=await response.json();
 assert.equal(response.status,200);assert.equal(data.connection.qr,qr);assert.equal(data.connection.paircode,paircode);assert.equal(data.connection.token,undefined);
 assert.equal(fixture.statusCalls,0);assert.equal(fixture.connectCalls,1);
});
test('POST connect: bloqueio existente de gestor compartilhado continua sem consulta extra',async()=>{
 reset(true,true);const response=await route.POST(request('connect'));assert.equal(response.status,403);assert.equal(fixture.statusCalls,0);
});
test('POST: origem diferente continua bloqueada antes de consultar conexão',async()=>{
 reset(true);const req=request();req.headers.set('Origin','https://other-origin.example');const response=await route.POST(req);
 assert.equal(response.status,403);assert.equal(fixture.reads,0);assert.equal(fixture.statusCalls,0);
});
for(const mismatch of ['settings_owner','effective_owner','transport_owner','raw_shared'] as const)test(`GET: gestor com ${mismatch} divergente não recebe pareamento`,async()=>{
 reset(true);if(mismatch==='settings_owner')fixture.settings!.user_id=master;
 if(mismatch==='effective_owner')fixture.bot!.user_id=master;
 if(mismatch==='transport_owner')fixture.bot!.connection_user_id=master;
 if(mismatch==='raw_shared')fixture.settings!.shared_owner_id=master;
 const response=await route.GET();assert.equal(response.status,200);assertPrivate(await response.json());assert.equal(fixture.statusCalls,1);
});
test('GET: conexão ausente mantém null e não consulta provedor',async()=>{
 reset();fixture.settings=null;fixture.bot=null;const data=await(await route.GET()).json();assert.equal(data.connection,null);assert.equal(fixture.statusCalls,0);
});
test('DTO: código malformado/QR externo nunca entram na allowlist',()=>{
 const viewerContext={viewerId:viewer,manager:true,settings:makeBot(),effective:makeBot()};
 const dto=publicWhatsappConnection({...providerConnection,qr:'https://external.example/qr',paircode:'unsafe<script>'},viewerContext)!;
 assert.equal(dto.qr,undefined);assert.equal(dto.paircode,undefined);assert.equal((dto as Record<string,unknown>).token,undefined);
});
test('DTO: sessão conectada não republica material antigo de pareamento',()=>{
 const dto=publicWhatsappConnection({...providerConnection,connected:true},{viewerId:viewer,manager:true,settings:makeBot(),effective:makeBot()})!;
 assert.equal(dto.connected,true);assert.equal(dto.qr,undefined);assert.equal(dto.paircode,undefined);
});
for(const method of ['GET','POST'] as const)test(`PRIV-B2 ${method}: viewer_id vem da sessão, nunca de query/body/provedor`,async()=>{
 reset(true);fixture.providerConnection.viewer_id=master;fixture.providerConnection.user_id=master;
 const post=request('save',{viewer_id:master,user_id:master,viewerId:master,manager:true},'?viewer_id='+master+'&user_id='+master);
 const req=method==='GET'?new Request(post.url,{headers:post.headers}):post;
 req.headers.set('x-viewer-id',master);
 const response:Response=method==='GET'?await Reflect.apply(route.GET,undefined,[req]):await route.POST(req);
 const data=await response.json();assert.equal(response.status,200);assert.equal(data.viewer_id,viewer);
 assert.notEqual(data.viewer_id,master);assert.equal(fixture.statusCalls,1);
});
test('PRIV-B2 POST connect: resultado live mantém viewer_id da sessão',async()=>{
 reset(true);fixture.providerConnection.viewer_id=master;
 const response=await route.POST(request('connect',{viewer_id:master}));const data=await response.json();
 assert.equal(response.status,200);assert.equal(data.viewer_id,viewer);assert.equal(fixture.statusCalls,0);assert.equal(fixture.connectCalls,1);
});
test('PRIV-B2 GET: troca de sessão muda viewer_id mesmo com o mesmo provedor compartilhado',async()=>{
 reset(false,true);const first=await(await route.GET()).json();
 const nextViewer=randomUUID();fixture.viewer=nextViewer;fixture.settings=makeBot(nextViewer,master);fixture.bot=makeBot(nextViewer,master);
 const second=await(await route.GET()).json();assert.equal(first.viewer_id,viewer);assert.equal(second.viewer_id,nextViewer);
 assertPrivate(second);assert.equal(fixture.statusCalls,2);
});
