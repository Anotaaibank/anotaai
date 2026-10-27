import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import * as navigation from '../lib/plan-navigation.ts';
import * as plans from '../lib/subscription-plans.ts';

// Executes the actual TSX event handlers with synthetic hooks/transport.
// This is a component simulation, not a browser/DOM/accessibility test.
type Node={type:unknown;props:Record<string,unknown>};
function nodes(tree:unknown):Node[]{
 if(Array.isArray(tree))return tree.flatMap(nodes);
 if(!tree||typeof tree!=='object'||!('props' in tree))return [];
 const node=tree as Node;return [node,...nodes(node.props.children)];
}
function content(tree:unknown):string{
 if(Array.isArray(tree))return tree.map(content).join('');
 if(typeof tree==='string'||typeof tree==='number')return String(tree);
 return tree&&typeof tree==='object'&&'props' in tree?content((tree as Node).props.children):'';
}
function store(){const data=new Map<string,string>();return {getItem:(key:string)=>data.get(key)??null,setItem:(key:string,value:string)=>{data.set(key,value);},removeItem:(key:string)=>{data.delete(key);}};}

function component(file:string,search:string,transport:(url:string,init?:RequestInit)=>Promise<Response>){
 const hooks:unknown[]=[],effects:(()=>void)[]=[],cleanups:(()=>void)[]=[],listeners=new Map<string,()=>void>();let cursor=0,tree:unknown;
 const calls:{url:string;method:string;body?:unknown}[]=[],redirects:string[]=[];
 const location={pathname:file.includes('SubscriptionPayment')?'/assinatura':'/',search,hash:'',assign:(url:string)=>{redirects.push(url);},replace:(url:string)=>{redirects.push(url);}};
 const update=(url:string)=>{const parsed=new URL(url,'https://example.invalid'+location.pathname+location.search+location.hash);Object.assign(location,{pathname:parsed.pathname,search:parsed.search,hash:parsed.hash});};
 const localStorage=store(),sessionStorage=store();
 const history={scrollRestoration:'auto',state:null,replaceState:(_state:unknown,_title:string,url:string)=>update(url),pushState:(_state:unknown,_title:string,url:string)=>update(url),back:()=>{location.hash='';listeners.get('popstate')?.();}};
 const globals={location,history,sessionStorage,document:{visibilityState:'visible'},window:{localStorage,scrollTo:()=>{},addEventListener:(name:string,fn:()=>void)=>{listeners.set(name,fn);},removeEventListener:(name:string)=>{listeners.delete(name);}},fetch:async(url:string,init?:RequestInit)=>{calls.push({url,method:init?.method||'GET',body:init?.body?JSON.parse(String(init.body)):undefined});return transport(url,init);},setInterval:()=>1,clearInterval:()=>{},FormData:class{private values:Record<string,string>;constructor(values:Record<string,string>){this.values=values;}get(key:string){return this.values[key]??null;}[Symbol.iterator](){return Object.entries(this.values)[Symbol.iterator]();}}};
 const previous=new Map(Object.keys(globals).map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
 for(const [key,value] of Object.entries(globals))Object.defineProperty(globalThis,key,{value,writable:true,configurable:true});
 const react={useState:(initial:unknown)=>{const index=cursor++;if(!(index in hooks))hooks[index]=typeof initial==='function'?initial():initial;return [hooks[index],(value:unknown)=>{hooks[index]=typeof value==='function'?value(hooks[index]):value;}];},useRef:(initial:unknown)=>{const index=cursor++;if(!(index in hooks))hooks[index]={current:initial};return hooks[index];},useCallback:(fn:unknown)=>{const index=cursor++;return hooks[index]??=fn;},useEffect:(fn:()=>void|(()=>void),deps:unknown[])=>{const index=cursor++,old=hooks[index] as unknown[]|undefined;if(!old||deps.some((value,i)=>value!==old[i])){hooks[index]=deps;effects.push(()=>{const cleanup=fn();if(cleanup)cleanups.push(cleanup);});}}};
 const jsx=(type:unknown,props:Record<string,unknown>)=>({type,props});
 const stub={__esModule:true,default:()=>null};
 const imports:Record<string,unknown>={'react':react,'react/jsx-runtime':{jsx,jsxs:jsx,Fragment:'fragment'},'@/lib/plan-navigation':navigation,'@/lib/subscription-plans':plans,'@/lib/model':{currency:(cents:number)=>String(cents)},'@/lib/subscription-billing-policy':{subscriptionPaymentCopy:{summary:'prepared',faq:'prepared'}},'@/lib/landing-events':{trackLandingEvent:()=>{}},'@/components/Localization':{Localize:'localize'},'./Brand':{BrandOrb:'brand'}};
 const output=ts.transpileModule(readFileSync(new URL('../'+file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
 const exported:Record<string,unknown>={};
 const load=(name:string)=>{if(name==='lucide-react')return new Proxy({},{get:(_object,key)=>String(key)});if(name in imports)return imports[name];if(name.startsWith('./'))return stub;throw Error('Unexpected import: '+name);};
 new Function('require','exports',output)(load,exported);
 const render=(props:Record<string,unknown>={})=>{cursor=0;tree=(exported.default as (props:Record<string,unknown>)=>unknown)(props);return tree;};
 return {render,async flush(){for(const effect of effects.splice(0))effect();await new Promise(resolve=>setImmediate(resolve));return render();},get tree(){return tree;},calls,redirects,location,history,localStorage,close(){for(const cleanup of cleanups)cleanup();for(const [key,descriptor] of previous){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else Reflect.deleteProperty(globalThis,key);}}};
}
function form(tree:unknown){const value=nodes(tree).find(node=>node.type==='form');assert.ok(value);return value;}
function submit(node:Node,values:Record<string,string>){return (node.props.onSubmit as (event:unknown)=>Promise<void>)({preventDefault:()=>{},currentTarget:values});}

test('botões reais da oferta geram URLs distintas para os dois planos',()=>{
 const view=component('components/SalesPage.tsx','',async()=>{throw Error('No network expected');});
 try{view.render();const offers=nodes(view.tree).filter(node=>node.props.source==='plans');assert.equal(offers.length,2);assert.deepEqual(offers.map(node=>navigation.planFromSearch(new URL(String(node.props.href),'https://example.invalid').search)),['BASICO','ILIMITADO']);assert.equal(view.calls.length,0);}finally{view.close();}
});

test('handler real de login respeita assinatura/gestão e não posta plano/preço/acesso',async()=>{
 for(const [query,expected] of [['?next=assinatura&plano=ILIMITADO','/assinatura?plano=ILIMITADO'],['?next=gestao','/gestao'],['?next=https://evil.invalid','/painel']]){
  const view=component('components/Login.tsx',query,async()=>Response.json({user:{id:'synthetic'}}));
  try{view.render();await view.flush();await submit(form(view.tree),{email:'example@example.invalid',password:'synthetic'});assert.deepEqual(view.redirects,[expected]);assert.equal(view.calls.length,1);assert.deepEqual(view.calls[0].body,{email:'example@example.invalid',password:'synthetic',action:'login'});}finally{view.close();}
 }
});

test('cadastro com confirmação de e-mail não repete POST e passa a oferecer login',async()=>{
 let release!:(value:Response)=>void;const response=new Promise<Response>(resolve=>{release=resolve;});
 const view=component('components/Login.tsx','?cadastro=1&next=assinatura&plano=ILIMITADO',async()=>response);
 try{view.render();await view.flush();const current=form(view.tree),values={name:'Pessoa Sintética',email:'example@example.invalid',password:'synthetic',password_confirmation:'synthetic'};const first=submit(current,values),second=submit(current,values);assert.equal(view.calls.length,1);assert.equal((view.calls[0].body as {action:string}).action,'register');release(Response.json({confirmation_required:true,message:'Confira o e-mail'}));await Promise.all([first,second]);view.render();assert.ok(content(view.tree).includes('ENTRAR'));assert.ok(content(view.tree).includes('Confira o e-mail'));assert.equal(new URLSearchParams(view.location.search).has('cadastro'),false);assert.equal(navigation.planFromSearch(view.location.search),'ILIMITADO');assert.equal(view.redirects.length,0);assert.equal(view.calls.length,1);}finally{view.close();}
});

test('cadastro autenticado vai ao plano escolhido e consome a preferência sem alterar login comum futuro',async()=>{
 const view=component('components/Login.tsx','?cadastro=1&next=assinatura&plano=ILIMITADO',async()=>Response.json({user:{id:'synthetic'}}));
 try{view.render();await view.flush();assert.equal(navigation.rememberedPlan(view.localStorage),'ILIMITADO');await submit(form(view.tree),{name:'Pessoa Sintética',email:'example@example.invalid',password:'synthetic',password_confirmation:'synthetic'});assert.equal((view.calls[0].body as {action:string}).action,'register');assert.deepEqual(view.redirects,['/assinatura?plano=ILIMITADO']);assert.equal(navigation.rememberedPlan(view.localStorage),null);assert.equal(navigation.afterAuthentication(navigation.loginIntent('',navigation.rememberedPlan(view.localStorage))),'/painel');}finally{view.close();}
});

test('checkout autenticado consome preferência, mantendo a escolha na URL sem criar pedido',async()=>{
 const view=component('components/SubscriptionPayment.tsx','',async()=>Response.json({settings:null,subscription:null,requests:[],access:false,manager:false}));
 try{navigation.rememberPlan(view.localStorage,'ILIMITADO');view.render();await view.flush();assert.equal(navigation.planFromSearch(view.location.search),'ILIMITADO');assert.equal(navigation.rememberedPlan(view.localStorage),null);assert.equal(view.calls.length,1);assert.equal(view.calls[0].method,'GET');}finally{view.close();}
});

test('checkout real com sessão expirada volta ao login sem criar pagamento',async()=>{
 const view=component('components/SubscriptionPayment.tsx','?plano=ILIMITADO',async()=>Response.json({error:'expired'},{status:401}));
 try{view.render();await view.flush();assert.deepEqual(view.redirects,['/?next=assinatura&plano=ILIMITADO']);assert.equal(view.calls.length,1);assert.equal(view.calls[0].method,'GET');}finally{view.close();}
});

test('pagamento pendente real prevalece sobre query e não cria outro pedido ao abrir',async()=>{
 const view=component('components/SubscriptionPayment.tsx','?plano=ILIMITADO',async()=>Response.json({settings:null,subscription:{plan_code:'ILIMITADO'},requests:[{id:'synthetic',status:'PENDENTE',plan_code:'BASICO',amount_cents:4990}],access:false,manager:false}));
 try{view.render();await view.flush();assert.ok(content(view.tree).includes('Pagamento em análise'));assert.equal(navigation.planFromSearch(view.location.search),'BASICO');assert.equal(view.calls.length,1);assert.equal(view.calls[0].method,'GET');assert.equal(nodes(view.tree).some(node=>content(node)==='Trocar plano'),false);}finally{view.close();}
});

test('selecionar, avançar e voltar no checkout real conserva o plano sem POST',async()=>{
 const view=component('components/SubscriptionPayment.tsx','?plano=BASICO',async()=>Response.json({settings:null,subscription:null,requests:[],access:false,manager:false}));
 try{view.render();await view.flush();const option=nodes(view.tree).find(node=>node.type==='input'&&node.props.value==='ILIMITADO');assert.ok(option);(option.props.onChange as ()=>void)();view.render();assert.equal(navigation.planFromSearch(view.location.search),'ILIMITADO');const next=nodes(view.tree).find(node=>node.type==='button'&&content(node).includes('Continuar com'));assert.ok(next);(next.props.onClick as ()=>void)();view.render();assert.equal(view.location.hash,'#pagamento');const back=nodes(view.tree).find(node=>node.type==='button'&&content(node)==='Voltar aos planos');assert.ok(back);(back.props.onClick as ()=>void)();view.render();assert.equal(navigation.planFromSearch(view.location.search),'ILIMITADO');assert.equal(nodes(view.tree).find(node=>node.type==='input'&&node.props.value==='ILIMITADO')?.props.checked,true);assert.equal(view.calls.length,1);assert.equal(view.calls[0].method,'GET');}finally{view.close();}
});
