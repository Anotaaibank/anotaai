import {validPlan,type PlanCode} from './subscription-plans.ts';

// These are navigation preferences, never an entitlement, a price or a receipt.
const destinations={painel:'/painel',gestao:'/gestao',assinatura:'/assinatura'} as const;
export type LoginDestination=keyof typeof destinations;
export type LoginIntent={next:LoginDestination;plan:PlanCode|null};
export type PlanChoiceStorage=Pick<Storage,'getItem'|'setItem'|'removeItem'>;
export const planChoiceKey='anotei-plan-choice.v1';
const preferenceLifetime=24*60*60*1000;

function single(params:URLSearchParams,key:string){
 const values=params.getAll(key);
 return values.length===1?values[0]:null;
}
function destination(raw:unknown):LoginDestination|null{
 return typeof raw==='string'&&Object.hasOwn(destinations,raw)?raw as LoginDestination:null;
}
export function planFromSearch(search:string):PlanCode|null{
 const value=single(new URLSearchParams(search),'plano');
 return validPlan(value)?value:null;
}
export function loginIntent(search:string,remembered:unknown=null):LoginIntent{
 const params=new URLSearchParams(search);
 const requested=destination(single(params,'next'));
 // An explicit invalid/ambiguous target must not fall back to another intention.
 if(params.has('next')&&!requested)return {next:'painel',plan:null};
 const plan=params.has('plano')?planFromSearch(search):validPlan(remembered)?remembered:null;
 const next=requested||(plan?'assinatura':'painel');
 return {next,plan:next==='assinatura'?plan:null};
}
export function loginHref(intent:LoginIntent,register=false){
 const next=destination(intent.next)||'painel',params=new URLSearchParams({next});
 if(next==='assinatura'&&validPlan(intent.plan))params.set('plano',intent.plan);
 if(register)params.set('cadastro','1');
 return '/?'+params.toString();
}
export function planRegistrationHref(plan:unknown){
 return loginHref({next:'assinatura',plan:validPlan(plan)?plan:null},true);
}
export function checkoutLoginHref(search:string,remembered:unknown=null){
 const params=new URLSearchParams(search);
 const plan=params.has('plano')?planFromSearch(search):validPlan(remembered)?remembered:null;
 return loginHref({next:'assinatura',plan});
}
export function checkoutHref(plan:unknown,hash=''){
 const query=validPlan(plan)?'?'+new URLSearchParams({plano:plan}).toString():'';
 const step=hash==='#pagamento'||hash==='#planos'?hash:'';
 return '/assinatura'+query+step;
}
export function afterAuthentication(intent:LoginIntent,register=false){
 const next=destination(intent.next)||'painel';
 // Preserve the existing rule: a new registration does not land in management.
 if(next==='gestao'&&register)return destinations.painel;
 return next==='assinatura'?checkoutHref(intent.plan):destinations[next];
}
export function checkoutPlan(input:{search:string;pendingPlan?:unknown;currentPlan?:unknown;rememberedPlan?:unknown}):PlanCode{
 // A pending payment is a server fact and cannot be replaced by a URL choice.
 if(validPlan(input.pendingPlan))return input.pendingPlan;
 const requested=planFromSearch(input.search);
 if(requested)return requested;
 if(validPlan(input.currentPlan))return input.currentPlan;
 if(!new URLSearchParams(input.search).has('plano')&&validPlan(input.rememberedPlan))return input.rememberedPlan;
 return 'BASICO';
}
export function browserPlanStorage():PlanChoiceStorage|undefined{
 try{return typeof window==='undefined'?undefined:window.localStorage;}catch{return undefined;}
}
export function rememberPlan(storage:PlanChoiceStorage|undefined,plan:unknown,now=Date.now()){
 try{
  if(!validPlan(plan)){storage?.removeItem(planChoiceKey);return;}
  storage?.setItem(planChoiceKey,JSON.stringify({plan,expires:now+preferenceLifetime}));
 }catch{/* A blocked browser store must not prevent the URL-based journey. */}
}
export function rememberedPlan(storage:PlanChoiceStorage|undefined,now=Date.now()):PlanCode|null{
 try{
  const value=storage?.getItem(planChoiceKey);if(!value)return null;
  if(value.length>160){rememberPlan(storage,null);return null;}
  const raw:unknown=JSON.parse(value);
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return null;
  const preference=raw as Record<string,unknown>;
  if(!validPlan(preference.plan)||typeof preference.expires!=='number'||!Number.isFinite(preference.expires)||preference.expires<=now||preference.expires>now+preferenceLifetime){rememberPlan(storage,null);return null;}
  return preference.plan;
 }catch{return null;}
}
