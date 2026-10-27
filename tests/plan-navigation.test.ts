import test from 'node:test';
import assert from 'node:assert/strict';
import {afterAuthentication,browserPlanStorage,checkoutHref,checkoutLoginHref,checkoutPlan,loginHref,loginIntent,planChoiceKey,planFromSearch,planRegistrationHref,rememberPlan,rememberedPlan,type PlanChoiceStorage} from '../lib/plan-navigation.ts';

function storage():PlanChoiceStorage{
 const data=new Map<string,string>();
 return {getItem:key=>data.get(key)??null,setItem:(key,value)=>{data.set(key,value);},removeItem:key=>{data.delete(key);}};
}

test('oferta de cada plano atravessa cadastro e login e chega ao checkout escolhido',()=>{
 for(const plan of ['BASICO','ILIMITADO'] as const){
  const offer=new URL(planRegistrationHref(plan),'https://example.invalid');
  assert.equal(offer.pathname,'/');assert.equal(offer.searchParams.get('cadastro'),'1');
  const intent=loginIntent(offer.search);
  for(const register of [true,false]){
   const checkout=new URL(afterAuthentication(intent,register),'https://example.invalid');
   assert.equal(checkout.pathname,'/assinatura');assert.equal(planFromSearch(checkout.search),plan);
   assert.equal(checkoutPlan({search:checkout.search,currentPlan:'BASICO'}),plan);
  }
 }
});

test('sessão expirada volta ao login com seleção e retorna ao mesmo checkout',()=>{
 const expired=new URL(checkoutHref('ILIMITADO','#pagamento'),'https://example.invalid');
 const login=new URL(checkoutLoginHref(expired.search),'https://example.invalid');
 assert.equal(login.searchParams.has('cadastro'),false);
 assert.equal(afterAuthentication(loginIntent(login.search)),'/assinatura?plano=ILIMITADO');
 assert.equal(checkoutLoginHref('?next=https://evil.invalid&plano=ILIMITADO'),'/?next=assinatura&plano=ILIMITADO');
 assert.equal(checkoutLoginHref('?plano=VIP','ILIMITADO'),'/?next=assinatura');
});

test('login comum e gestão conservam destinos, sem conceder gestão a cadastro novo',()=>{
 assert.equal(afterAuthentication(loginIntent('')),'/painel');
 assert.equal(afterAuthentication(loginIntent('?next=gestao')),'/gestao');
 assert.equal(afterAuthentication(loginIntent('?next=gestao'),true),'/painel');
 assert.equal(afterAuthentication(loginIntent('?next=assinatura'),true),'/assinatura');
 assert.deepEqual(loginIntent('?next=gestao&plano=ILIMITADO','BASICO'),{next:'gestao',plan:null});
});

test('destino externo, codificado, ambíguo ou não listado nunca produz open redirect',()=>{
 for(const value of ['https://evil.invalid','//evil.invalid','/assinatura','javascript:alert(1)','/\\evil.invalid','gestao/../assinatura','__proto__','constructor','%2f%2fevil.invalid']){
  const params=new URLSearchParams({next:value,plano:'ILIMITADO'});
  assert.equal(afterAuthentication(loginIntent('?'+params.toString(),'ILIMITADO')),'/painel');
 }
 assert.equal(afterAuthentication(loginIntent('?next=assinatura&next=https://evil.invalid&plano=ILIMITADO')),'/painel');
 assert.equal(afterAuthentication({next:'https://evil.invalid',plan:'ILIMITADO'} as never),'/painel');
});

test('plano inválido ou duplicado é descartado e não substitui fatos do servidor',()=>{
 for(const search of ['?plano=VIP','?plano=ilimitado','?plano=','?plano=ILIMITADO&plano=BASICO','?plano=ILIMITADO&plano=ILIMITADO']){
  assert.equal(planFromSearch(search),null);
  assert.equal(checkoutPlan({search,rememberedPlan:'ILIMITADO'}),'BASICO');
  assert.equal(checkoutPlan({search,currentPlan:'ILIMITADO'}),'ILIMITADO');
 }
 assert.equal(checkoutPlan({search:'?plano=ILIMITADO',pendingPlan:'BASICO',currentPlan:'ILIMITADO'}),'BASICO');
 assert.equal(checkoutPlan({search:'?plano=BASICO',pendingPlan:'ILIMITADO'}),'ILIMITADO');
});

test('preferência não sensível retoma o plano após confirmação de e-mail e expira',()=>{
 const store=storage(),now=1700000000000;
 rememberPlan(store,'ILIMITADO',now);
 assert.equal(rememberedPlan(store,now+60000),'ILIMITADO');
 const intent=loginIntent('',rememberedPlan(store,now+60000));
 assert.equal(afterAuthentication(intent),'/assinatura?plano=ILIMITADO');
 assert.equal(rememberedPlan(store,now+24*60*60*1000),null);
 assert.equal(store.getItem(planChoiceKey),null);
});

test('escolha explícita válida vence preferência anterior e inválida não a reaproveita',()=>{
 assert.equal(loginIntent('?next=assinatura&plano=BASICO','ILIMITADO').plan,'BASICO');
 assert.equal(loginIntent('?next=assinatura&plano=VIP','ILIMITADO').plan,null);
 assert.equal(checkoutPlan({search:'',currentPlan:'BASICO',rememberedPlan:'ILIMITADO'}),'BASICO');
 assert.equal(checkoutPlan({search:'',rememberedPlan:'ILIMITADO'}),'ILIMITADO');
});

test('armazenamento indisponível ou adulterado não bloqueia navegação validada',()=>{
 const denied:PlanChoiceStorage={getItem:()=>{throw Error('denied');},setItem:()=>{throw Error('denied');},removeItem:()=>{throw Error('denied');}};
 assert.doesNotThrow(()=>rememberPlan(denied,'BASICO'));
 assert.equal(rememberedPlan(denied),null);
 assert.equal(afterAuthentication(loginIntent('?next=assinatura&plano=ILIMITADO',rememberedPlan(denied))),'/assinatura?plano=ILIMITADO');
 const store=storage();for(const raw of ['not-json','[]','{"plan":"VIP","expires":9999999999999}','{"plan":"ILIMITADO","expires":9999999999999}']){store.setItem(planChoiceKey,raw);assert.equal(rememberedPlan(store,1700000000000),null);}
 assert.equal(browserPlanStorage(),undefined);
});

test('voltar e alternar cadastro/login mantém contexto sem carregar preço, acesso ou pagamento',()=>{
 const original=loginIntent('?next=assinatura&plano=ILIMITADO&amount=1&access=true&paid=true&cadastro=1');
 for(const register of [false,true,false]){
  const link=new URL(loginHref(original,register),'https://example.invalid');
  assert.equal(link.searchParams.has('cadastro'),register);
  assert.deepEqual(loginIntent(link.search),original);
  assert.deepEqual([...link.searchParams.keys()].sort(),register?['cadastro','next','plano']:['next','plano']);
 }
 assert.equal(checkoutHref('ILIMITADO','#pagamento'),'/assinatura?plano=ILIMITADO#pagamento');
 assert.equal(checkoutHref('VIP','#external'),'/assinatura');
});
