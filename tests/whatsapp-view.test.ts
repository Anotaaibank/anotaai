import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {runInNewContext} from 'node:vm';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import ts from 'typescript';
import {createWhatsappView,whatsappAccessMessage,whatsappSender} from '../components/whatsapp-view.ts';
import {addAuthorizedPhone,displayPhone} from '../lib/whatsapp-contacts.ts';
import {hasTranslation} from '../lib/locale.ts';

const require=createRequire(import.meta.url);
function deferred<T>(){let resolve!:(value:T)=>void,reject!:(reason:unknown)=>void;const promise=new Promise<T>((done,fail)=>{resolve=done;reject=fail;});return {promise,resolve,reject};}
function transport(){const calls:{init:RequestInit;reply:ReturnType<typeof deferred<Response>>}[]=[];return {calls,fetch:((_url:unknown,init:RequestInit={})=>{const reply=deferred<Response>();calls.push({init,reply});return reply.promise;}) as typeof fetch};}
const response=(status:number,data:unknown)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
const data=(text='mensagem sintética privada',viewer_id='11111111-1111-4111-8111-111111111111')=>({viewer_id,can_invite:true,shared_connection:true,integration_ready:true,invitation_ready:true,ai_configured:true,connection:null,settings:{phone:'5511988880000',allowed_phones:['5511999991234'],enabled:true,status:'PRONTO',updated_at:'2026-10-27T10:00:00Z'},access_links:[{phone:'5511999991234',status:'NAO_ENVIADO'}],participants:[{phone:'5511999991234',subscriber_name:'Pessoa Sintética',registered:true,active:true,send_status:'ACEITO',expired:false}],history:[{id:'message-1',sender:'5511999991234',transcript:text,reply:'resposta sintética privada',status:'RESOLVIDO',reply_status:'ACEITO',created_at:'2026-10-27T10:00:00Z'}]});

/** Actual component and handlers; fake hook scheduling, DOM lifecycle and transport. Not browser/device QA. */
function screen(){
 const network=transport(),slots:{value?:any;deps?:readonly unknown[];cleanup?:()=>void}[]=[],effects:(()=>void)[]=[];
 let cursor=0,tree:React.ReactNode=null,unmounted=false,updatesAfterUnmount=0,intervalId=0;
 const intervals=new Map<number,()=>void>(),windowTarget=new EventTarget(),documentTarget=Object.assign(new EventTarget(),{visibilityState:'visible'});
 const same=(a:readonly unknown[]|undefined,b:readonly unknown[])=>!!a&&a.length===b.length&&a.every((x,i)=>Object.is(x,b[i]));
 const memo=(fn:()=>unknown,deps:readonly unknown[])=>{const i=cursor++,slot=slots[i]??={};if(!same(slot.deps,deps)){slot.value=fn();slot.deps=deps;}return slot.value;};
 const hooks={
  useState:(initial:unknown)=>{const i=cursor++;if(!slots[i])slots[i]={value:typeof initial==='function'?(initial as ()=>unknown)():initial};return [slots[i].value,(value:any)=>{if(unmounted)updatesAfterUnmount++;slots[i].value=typeof value==='function'?value(slots[i].value):value;}];},
  useRef:(initial:unknown)=>{const i=cursor++;return (slots[i]??={value:{current:initial}}).value;},useMemo:memo,
  useCallback:(fn:unknown,deps:readonly unknown[])=>memo(()=>fn,deps),
  useEffect:(fn:()=>void|(()=>void),deps:readonly unknown[])=>{const i=cursor++,slot=slots[i]??={};if(!same(slot.deps,deps)){slot.deps=deps;effects.push(()=>{slot.cleanup?.();slot.cleanup=fn()||undefined;});}},
 };
 const identity=({children}:{children:React.ReactNode})=>children;
 const mocks:Record<string,unknown>={react:hooks,'@/components/Localization':{Localize:identity,OriginalText:identity},'@/lib/whatsapp-contacts':{addAuthorizedPhone,displayPhone},'@/lib/subscription-plans':{subscriptionPlans:{BASICO:{code:'BASICO',name:'Básico',monthly_cents:4990},ILIMITADO:{code:'ILIMITADO',name:'Ilimitado',monthly_cents:9990}}},'./whatsapp-view':{createWhatsappView:(deny:Parameters<typeof createWhatsappView>[0])=>createWhatsappView(deny,network.fetch),whatsappAccessMessage,whatsappSender}};
 const source=readFileSync(new URL('../components/Whatsapp.tsx',import.meta.url),'utf8');const output=ts.transpileModule(source,{fileName:'Whatsapp.tsx',compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
 const module={exports:{} as {default:(props:Record<string,never>)=>React.ReactNode}};
 runInNewContext(output,{module,exports:module.exports,require:(name:string)=>name in mocks?mocks[name]:require(name),window:windowTarget,document:documentTarget,crypto:{randomUUID},setInterval:(fn:()=>void)=>{const id=++intervalId;intervals.set(id,fn);return id;},clearInterval:(id:number)=>intervals.delete(id)});
 const render=()=>{cursor=0;tree=module.exports.default({});while(effects.length)effects.shift()!();};
 const nodes=()=>{const all:React.ReactElement<any>[]=[];const visit=(node:React.ReactNode)=>{if(Array.isArray(node)){node.forEach(visit);return;}if(!React.isValidElement<any>(node))return;const element=node as React.ReactElement<{children?:React.ReactNode}>;all.push(element);visit(element.props.children);};visit(tree);return all;};
 const text=(value:React.ReactNode):string=>Array.isArray(value)?value.map(text).join(''):React.isValidElement<any>(value)?text((value as React.ReactElement<{children?:React.ReactNode}>).props.children):value==null||typeof value==='boolean'?'':String(value);
 const button=(label:string)=>{const node=nodes().find(n=>n.type==='button'&&text(n.props.children)===label);assert.ok(node,'button '+label);return node;};
 render();
 return {network,render,button,nodes,html:()=>renderToStaticMarkup(tree),
  async settle(){for(let i=0;i<8;i++){await Promise.resolve();render();}},
  fill(placeholder:string,value:string){const input=nodes().find(n=>n.type==='input'&&n.props.placeholder===placeholder);assert.ok(input,placeholder);input.props.onChange({target:{value}});render();},
  poll(){for(const fn of [...intervals.values()])fn();},
  hide(){documentTarget.visibilityState='hidden';documentTarget.dispatchEvent(new Event('visibilitychange'));render();},
  show(){documentTarget.visibilityState='visible';documentTarget.dispatchEvent(new Event('visibilitychange'));render();},
  blur(){windowTarget.dispatchEvent(new Event('blur'));render();},
  focus(){windowTarget.dispatchEvent(new Event('focus'));render();},
  unmount(){for(const slot of slots)slot.cleanup?.();unmounted=true;},
  updatesAfterUnmount:()=>updatesAfterUnmount,
 };
}

for(const status of [401,402,403] as const)test('actual WhatsApp view clears sensitive state on '+status+' and ignores an older successful GET',async()=>{
 const page=screen();page.network.calls[0].reply.resolve(response(200,data()));await page.settle();
 assert.match(page.html(),/mensagem sintética privada/);assert.match(page.html(),/compartilham saldo, despesas, agenda e o histórico/);
 page.fill('Ex.: Ana Silva','Rascunho Particular');page.fill('Ex.: (11) 99999-9999','11911112222');
 page.poll();const late=page.network.calls[1],retry=page.button('Atualizar conexão e histórico').props.onClick;retry();const denied=page.network.calls[2];
 denied.reply.resolve(response(status,{error:'not displayed'}));await page.settle();
 assert.doesNotMatch(page.html(),/mensagem sintética privada|resposta sintética privada|Rascunho Particular|11911112222|5511988880000/);
 assert.match(page.html(),status===402?/Ver minha assinatura/:/Entrar novamente/);assert.ok(late.init.signal?.aborted);
 late.reply.resolve(response(200,data('GET antigo não pode reaparecer')));await page.settle();
 assert.doesNotMatch(page.html(),/GET antigo não pode reaparecer|mensagem sintética privada/);
 page.poll();retry();await page.settle();assert.equal(page.network.calls.length,3);page.unmount();
});

test('actual POST denial does not reload, reconnect or retry a write, and ignores an older poll',async()=>{
 const page=screen();page.network.calls[0].reply.resolve(response(200,data()));await page.settle();page.poll();
 const form=page.nodes().find(n=>n.type==='form');assert.ok(form);form.props.onSubmit({preventDefault(){}});assert.equal(page.network.calls[2].init.method,'POST');
 page.network.calls[2].reply.resolve(response(401,{}));await page.settle();page.network.calls[1].reply.resolve(response(200,data('old poll')));await page.settle();
 assert.equal(page.network.calls.length,3);assert.equal(page.network.calls.filter(c=>c.init.method==='POST').length,1);assert.doesNotMatch(page.html(),/old poll|mensagem sintética privada/);page.unmount();
});

test('actual uncertain POST performs only the existing read reconciliation, never an automatic POST retry',async()=>{
 const page=screen();page.network.calls[0].reply.resolve(response(200,data()));await page.settle();
 const form=page.nodes().find(n=>n.type==='form');assert.ok(form);form.props.onSubmit({preventDefault(){}});page.network.calls[1].reply.resolve(response(503,{error:'Envio em conferência'}));await page.settle();
 assert.equal(page.network.calls.length,3);assert.equal(page.network.calls[2].init.method,undefined);page.network.calls[2].reply.resolve(response(200,data()));await page.settle();
 assert.equal(page.network.calls.filter(c=>c.init.method==='POST').length,1);assert.match(page.html(),/Envio em conferência/);page.unmount();
});

test('pagehide/return hides old account state and late POST cannot restore it in the new lifetime',async()=>{
 const page=screen();page.network.calls[0].reply.resolve(response(200,data()));await page.settle();
 const form=page.nodes().find(n=>n.type==='form');assert.ok(form);form.props.onSubmit({preventDefault(){}});const late=page.network.calls[1];
 page.hide();assert.ok(late.init.signal?.aborted);assert.doesNotMatch(page.html(),/mensagem sintética privada/);page.show();assert.equal(page.network.calls.length,3);
 page.network.calls[2].reply.resolve(response(200,data('nova leitura da sessão atual')));await page.settle();late.reply.resolve(response(200,data('resposta da conta anterior')));await page.settle();
 assert.match(page.html(),/nova leitura da sessão atual/);assert.doesNotMatch(page.html(),/resposta da conta anterior|Números e configuração salvos/);assert.equal(page.network.calls.filter(c=>c.init.method==='POST').length,1);page.unmount();
});

test('unmount aborts pending GET and prevents state writes or reads through a retained old handler',async()=>{
 const page=screen(),oldHandler=page.button('Atualizar conexão e histórico').props.onClick;page.unmount();assert.ok(page.network.calls[0].init.signal?.aborted);
 page.network.calls[0].reply.resolve(response(200,data()));for(let i=0;i<8;i++)await Promise.resolve();oldHandler();for(let i=0;i<8;i++)await Promise.resolve();
 assert.equal(page.updatesAfterUnmount(),0);assert.equal(page.network.calls.length,1);
});

test('view guard also discards a delayed JSON body after access revocation',async()=>{
 const network=transport();let denied=0;const view=createWhatsappView(()=>{denied++;},network.fetch);view.activate();const body=deferred<unknown>();
 const old=view.run();network.calls[0].reply.resolve({status:200,ok:true,json:()=>body.promise} as Response);await Promise.resolve();await Promise.resolve();
 const next=view.run();network.calls[1].reply.resolve(response(403,{}));await next;body.resolve(data());assert.equal((await old).kind,'stale');assert.equal(denied,1);assert.equal(view.activate(),false);
});

test('sender rendering uses the known name and only the last four digits in the new event cell',async()=>{
 assert.deepEqual(whatsappSender('+55 (11) 99999-1234',[{phone:'5511999991234',subscriber_name:'Pessoa Sintética'}]),{name:'Pessoa Sintética',masked:'•••• 1234'});
 assert.deepEqual(whatsappSender('abc'),{name:null,masked:'Número indisponível'});
 const page=screen();page.network.calls[0].reply.resolve(response(200,data()));await page.settle();const senderCells=page.nodes().filter(n=>n.type==='td'&&renderToStaticMarkup(n).includes('Pessoa Sintética'));assert.equal(senderCells.length,1);const html=renderToStaticMarkup(senderCells[0]);assert.match(html,/•••• 1234/);assert.doesNotMatch(html,/5511999991234|99999-1234/);page.unmount();
});

test('new access and privacy labels have American English translations',()=>{
 for(const status of [401,402,403] as const)assert.ok(hasTranslation(whatsappAccessMessage(status)));
 for(const label of ['Ver minha assinatura','Entrar novamente','Remetente','Contato da conta','Número indisponível','Os dois números do casal compartilham saldo, despesas, agenda e o histórico de mensagens desta conta. A administração cadastra os números; você não precisa ler QR Code.'])assert.ok(hasTranslation(label),label);
});

test('window focus also refreshes the lifetime when the page stayed visible during another-window account change',async()=>{
 const page=screen();page.network.calls[0].reply.resolve(response(200,data()));await page.settle();page.poll();const old=page.network.calls[1];page.blur();assert.doesNotMatch(page.html(),/mensagem sintética privada/);page.focus();assert.equal(page.network.calls.length,3);page.network.calls[2].reply.resolve(response(200,data('dados da nova leitura')));await page.settle();old.reply.resolve(response(200,data('antigo em outra janela')));await page.settle();assert.match(page.html(),/dados da nova leitura/);assert.doesNotMatch(page.html(),/antigo em outra janela/);page.unmount();
});

test('network failure after a POST is reconciled by GET only and never auto-repeated',async()=>{
 const page=screen();page.network.calls[0].reply.resolve(response(200,data()));await page.settle();const form=page.nodes().find(n=>n.type==='form');assert.ok(form);form.props.onSubmit({preventDefault(){}});page.network.calls[1].reply.reject(new Error('synthetic offline'));await page.settle();assert.equal(page.network.calls.length,3);assert.equal(page.network.calls[2].init.method,undefined);page.network.calls[2].reply.resolve(response(200,data()));await page.settle();assert.equal(page.network.calls.filter(c=>c.init.method==='POST').length,1);assert.match(page.html(),/Confira o histórico antes de repetir uma ação/);page.unmount();
});

test('subscriber view accepts the safe connection DTO without optional pairing fields',async()=>{
 const page=screen();page.network.calls[0].reply.resolve(response(200,{...data(),can_invite:false,connection:{configured:true,connected:true,message:'WhatsApp conectado. Use o contato da IA para enviar seus pedidos.'}}));await page.settle();assert.match(page.html(),/WhatsApp conectado/);assert.doesNotMatch(page.html(),/Código:|QR Code para conectar/);page.unmount();
});

test('same viewer A after blur preserves manual drafts but never reveals history or QR before verification',async()=>{
 const page=screen();page.network.calls[0].reply.resolve(response(200,{...data(),connection:{configured:true,connected:false,message:'conexão sintética',qr:'data:image/png;base64,AAAA'}}));await page.settle();page.fill('Ex.: Ana Silva','Rascunho de Cadastro');page.fill('Ex.: (11) 99999-9999','11911112222');page.fill('DDD + número que será conectado','11922223333');page.blur();assert.doesNotMatch(page.html(),/mensagem sintética privada|Rascunho de Cadastro|11911112222|data:image/);page.focus();assert.doesNotMatch(page.html(),/mensagem sintética privada|Rascunho de Cadastro|11911112222|data:image/);page.network.calls[1].reply.resolve(response(200,data()));await page.settle();assert.match(page.html(),/Rascunho de Cadastro|11911112222/);assert.ok(page.nodes().some(n=>n.type==='input'&&n.props.value==='11922223333'));page.unmount();
});

test('empty transcript placeholder remains a translatable label rather than original user text',async()=>{
 const page=screen();page.network.calls[0].reply.resolve(response(200,data('')));await page.settle();assert.ok(page.nodes().some(n=>n.type==='td'&&n.props.children==='Áudio aguardando leitura'));assert.ok(hasTranslation('Áudio aguardando leitura'));page.unmount();
});

const viewerB='22222222-2222-4222-8222-222222222222';
test('actual A to blur to B200 clears all drafts and never exposes either account content together',async()=>{
 const page=screen();page.network.calls[0].reply.resolve(response(200,data()));await page.settle();page.fill('Ex.: Ana Silva','Rascunho Exclusivo A');page.fill('Ex.: (11) 99999-9999','11911112222');page.blur();page.focus();
 page.network.calls[1].reply.resolve(response(200,{...data('conteúdo privado de B',viewerB),connection:{configured:true,connected:false,message:'B provider',paircode:'B-123456'}}));await page.settle();
 assert.match(page.html(),/A conta mudou ou não pôde ser confirmada/);assert.doesNotMatch(page.html(),/Rascunho Exclusivo A|11911112222|mensagem sintética privada|conteúdo privado de B|B-123456/);page.blur();page.focus();await page.settle();assert.equal(page.network.calls.length,2);page.unmount();
});

test('actual old GET cannot restore history or QR after a newer POST succeeds in the same epoch',async()=>{
 const page=screen();page.network.calls[0].reply.resolve(response(200,data()));await page.settle();page.poll();const older=page.network.calls[1];const form=page.nodes().find(n=>n.type==='form');assert.ok(form);form.props.onSubmit({preventDefault(){}});assert.equal(page.network.calls[2].init.method,'POST');
 page.network.calls[2].reply.resolve(response(200,{...data('estado novo confirmado'),connection:{configured:true,connected:false,message:'new',qr:'data:image/png;base64,TkVX'}}));await page.settle();older.reply.resolve(response(200,{...data('histórico GET antigo'),connection:{configured:true,connected:false,message:'old',qr:'data:image/png;base64,T0xE'}}));await page.settle();
 assert.match(page.html(),/estado novo confirmado|base64,TkVX/);assert.doesNotMatch(page.html(),/histórico GET antigo|base64,T0xE/);assert.equal(page.network.calls.filter(c=>c.init.method==='POST').length,1);page.unmount();
});

test('actual newer GET wins over a slow polling GET in the same epoch',async()=>{
 const page=screen();page.network.calls[0].reply.resolve(response(200,data()));await page.settle();page.poll();const old=page.network.calls[1];page.button('Atualizar conexão e histórico').props.onClick();page.network.calls[2].reply.resolve(response(200,data('leitura mais recente')));await page.settle();old.reply.resolve(response(200,data('leitura superada')));await page.settle();assert.match(page.html(),/leitura mais recente/);assert.doesNotMatch(page.html(),/leitura superada/);page.unmount();
});

test('actual initial success without viewer_id fails closed before any private body is exposed',async()=>{
 const page=screen();const {viewer_id:_,...missing}=data('conteúdo sem identidade');page.network.calls[0].reply.resolve(response(200,missing));await page.settle();assert.match(page.html(),/Entre novamente/);assert.doesNotMatch(page.html(),/conteúdo sem identidade|resposta sintética privada/);assert.ok(hasTranslation(whatsappAccessMessage('IDENTITY')));page.unmount();
});

for(const kind of ['GET','POST'])test('actual missing viewer on '+kind+' clears an already loaded account and draft',async()=>{
 const page=screen();page.network.calls[0].reply.resolve(response(200,data()));await page.settle();page.fill('Ex.: Ana Silva','Nome Privado A');if(kind==='POST'){const form=page.nodes().find(n=>n.type==='form');assert.ok(form);form.props.onSubmit({preventDefault(){}});}else page.button('Atualizar conexão e histórico').props.onClick();const {viewer_id:_,...missing}=data('resposta sem titular');page.network.calls[1].reply.resolve(response(200,missing));await page.settle();assert.match(page.html(),/Entre novamente/);assert.doesNotMatch(page.html(),/Nome Privado A|resposta sem titular|mensagem sintética privada/);assert.equal(page.network.calls.length,2);page.unmount();
});

test('actual delayed JSON body still checks identity before any state callback can expose it',async()=>{
 const page=screen();page.network.calls[0].reply.resolve(response(200,data()));await page.settle();page.poll();const body=deferred<unknown>();page.network.calls[1].reply.resolve({status:200,ok:true,json:()=>body.promise} as Response);await page.settle();page.button('Atualizar conexão e histórico').props.onClick();page.network.calls[2].reply.resolve(response(200,data('resposta atual A')));await page.settle();body.resolve(data('JSON tardio de B',viewerB));await page.settle();assert.match(page.html(),/Entre novamente/);assert.doesNotMatch(page.html(),/JSON tardio de B|resposta atual A/);page.unmount();
});

test('a resolved response token cannot be accepted by a deferred state callback after a newer request starts',async()=>{
 const network=transport(),view=createWhatsappView(()=>assert.fail('same viewer must not revoke'),network.fetch);view.activate();const first=view.run();network.calls[0].reply.resolve(response(200,data()));const resolved=await first;assert.equal(resolved.kind,'ok');assert.equal(view.current(resolved.epoch,resolved.sequence),true);const newer=view.run();assert.equal(view.current(resolved.epoch,resolved.sequence),false);network.calls[1].reply.resolve(response(200,data()));await newer;view.suspend();
});

test('successful HTTP response with an invalid JSON body fails closed rather than retaining old drafts',async()=>{
 const page=screen();page.network.calls[0].reply.resolve(response(200,data()));await page.settle();page.fill('Ex.: Ana Silva','Nome privado em memória');page.button('Atualizar conexão e histórico').props.onClick();page.network.calls[1].reply.resolve(new Response('not json',{status:200}));await page.settle();assert.match(page.html(),/Entre novamente/);assert.doesNotMatch(page.html(),/Nome privado em memória|mensagem sintética privada/);page.unmount();
});
