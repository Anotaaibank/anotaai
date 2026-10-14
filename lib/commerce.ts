import {AppError,brazilDay,object,realDate,uuid} from './model.ts';

export const feedbackTopics=['Visão geral','Meu dinheiro','Rendas complementares','Agenda','Minhas despesas','Despesas fixas','Viagens','WhatsApp','IA por voz e texto','Outros'] as const;
export const feedbackKinds=['Sugestão','Problema','Elogio','Dúvida'] as const;
export const feedbackStatuses=['NOVO','EM_ANALISE','PLANEJADO','RESOLVIDO'] as const;
export const subscriptionStatuses=['SEM_ASSINATURA','TESTE','ATIVA','ATRASADA','CANCELADA'] as const;
export const feedbackStatusLabel:Record<FeedbackStatus,string>={NOVO:'Novo',EM_ANALISE:'Em análise',PLANEJADO:'Planejado',RESOLVIDO:'Resolvido'};
export const subscriptionStatusLabel:Record<SubscriptionStatus,string>={SEM_ASSINATURA:'Sem assinatura',TESTE:'Em teste',ATIVA:'Ativa',ATRASADA:'Em atraso',CANCELADA:'Cancelada'};
export type FeedbackStatus=typeof feedbackStatuses[number];
export type SubscriptionStatus=typeof subscriptionStatuses[number];
export type FeedbackInput={id:string;topic:typeof feedbackTopics[number];kind:typeof feedbackKinds[number];message:string};
export type Feedback=FeedbackInput&{user_id:string;status:FeedbackStatus;response:string;created_at:string;updated_at:string};
export type Subscription={user_id:string;status:SubscriptionStatus;plan:string;monthly_cents:number;renewal_date:string|null;updated_at:string};
export const paymentMethods=['CARTAO','BOLETO','NAO_DEFINIDO'] as const;
export const paymentMethodLabel={CARTAO:'Cartão recorrente',BOLETO:'Boleto',NAO_DEFINIDO:'Não informado'};
export type CommercialInput={payment_method:typeof paymentMethods[number];notes:string;follow_up_date:string|null;cancellation_reason:string;expected:string|null};
export type CustomerProfile=Omit<CommercialInput,'expected'>&{user_id:string;updated_at:string};
export type Campaign={id:string;name:string;influencer:string;channel:string;code:string;commission_bps:number;active:boolean;created_at:string;updated_at:string};
export type Acquisition={user_id:string;campaign_id:string;captured_at:string};
export type SubscriptionEvent={id:string;user_id:string;actor_id:string;before_subscription:Subscription|null;after_subscription:Subscription;before_profile:CustomerProfile|null;after_profile:CustomerProfile|null;created_at:string};
export type Customer={id:string;name:string;email:string;created_at:string;subscription:Subscription|null;profile?:CustomerProfile|null;acquisition?:Acquisition|null};
export type ManagementData={customers:Customer[];feedbacks:(Feedback&{user_name:string;user_email:string})[];metrics:ReturnType<typeof commerceMetrics>;billing_mode:'MANUAL';campaigns:(Campaign&{link:string;test_link:boolean;registered:number;active_subscribers:number;mrr_cents:number})[];history:SubscriptionEvent[];attention:ReturnType<typeof commerceAttention>;reports:ReturnType<typeof commerceReports>;billing:{provider:string|null;connected:false;primary_method:'CARTAO';boleto_optional:true;public_url_ready:boolean}};

// Server configuration only: names, email and user-editable metadata never grant management access.
export function isManager(userId:string,configured=process.env.ANOTA_MANAGER_USER_IDS||''){
 return uuid(userId)&&configured.split(',').map(s=>s.trim()).filter(uuid).includes(userId);
}
export function requireManager(userId:string){if(!isManager(userId))throw new AppError('Esta área é exclusiva da gestão do Anotei.',403);}
function keys(b:Record<string,unknown>,allowed:string[]){if(Object.keys(b).some(k=>!allowed.includes(k)))throw new AppError('Confira os campos enviados.');}
function text(value:unknown,min:number,max:number,label:string){if(typeof value!=='string')throw new AppError('Confira '+label+'.');const t=value.trim();if(t.length<min||t.length>max||/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(t))throw new AppError('Confira '+label+'.');return t;}
export function feedbackInput(raw:unknown):FeedbackInput{
 const b=object(raw);keys(b,['id','topic','kind','message']);
 if(!uuid(b.id)||!feedbackTopics.includes(b.topic as FeedbackInput['topic'])||!feedbackKinds.includes(b.kind as FeedbackInput['kind']))throw new AppError('Escolha a área e o tipo de feedback.');
 return {id:b.id,topic:b.topic as FeedbackInput['topic'],kind:b.kind as FeedbackInput['kind'],message:text(b.message,10,3000,'a mensagem (10 a 3.000 caracteres)')};
}
export function feedbackUpdate(raw:unknown){const b=object(raw);keys(b,['id','status','response','expected']);if(!uuid(b.id)||!feedbackStatuses.includes(b.status as FeedbackStatus)||typeof b.expected!=='string'||!Number.isFinite(Date.parse(b.expected)))throw new AppError('Confira a situação do feedback.');return {id:b.id,status:b.status as FeedbackStatus,response:text(b.response,0,2000,'a resposta'),expected:b.expected};}
export function subscriptionInput(raw:unknown):Omit<Subscription,'updated_at'>&{expected:string|null;commercial?:CommercialInput}{
 const b=object(raw);keys(b,['user_id','status','plan','monthly_cents','renewal_date','expected','commercial']);
 if(!uuid(b.user_id)||!subscriptionStatuses.includes(b.status as SubscriptionStatus)||!Number.isSafeInteger(b.monthly_cents)||Number(b.monthly_cents)<0||Number(b.monthly_cents)>10000000||b.status==='ATIVA'&&Number(b.monthly_cents)===0)throw new AppError('Confira a assinatura. Uma assinatura paga ativa precisa ter um valor mensal.');
 if(b.renewal_date!==null&&(typeof b.renewal_date!=='string'||!realDate(b.renewal_date)))throw new AppError('Confira a data da próxima renovação.');
 if(b.expected!==null&&(typeof b.expected!=='string'||!Number.isFinite(Date.parse(b.expected))))throw new AppError('Atualize a assinatura antes de salvar.');
 const commercial=b.commercial===undefined?undefined:commercialInput(b.commercial);
 if(commercial&&b.status==='CANCELADA'&&!commercial.cancellation_reason)throw new AppError('Informe o motivo do cancelamento para acompanhar a retenção.');
 return {user_id:b.user_id,status:b.status as SubscriptionStatus,plan:text(b.plan,0,80,'o nome do plano'),monthly_cents:Number(b.monthly_cents),renewal_date:b.renewal_date as string|null,expected:b.expected as string|null,...(commercial?{commercial}:{})};
}
export function commerceMetrics(customers:Customer[],feedbacks:Feedback[],now=new Date()){
 const active=customers.filter(c=>c.subscription?.status==='ATIVA'&&c.subscription.monthly_cents>0),month=brazilDay(now).slice(0,7);
 return {registered:customers.length,active:active.length,trials:customers.filter(c=>c.subscription?.status==='TESTE').length,past_due:customers.filter(c=>c.subscription?.status==='ATRASADA').length,canceled:customers.filter(c=>c.subscription?.status==='CANCELADA').length,new_this_month:customers.filter(c=>brazilDay(new Date(c.created_at)).startsWith(month)).length,mrr_cents:active.reduce((n,c)=>n+c.subscription!.monthly_cents,0),feedback_total:feedbacks.length,feedback_open:feedbacks.filter(f=>f.status!=='RESOLVIDO').length};
}

function expectedVersion(value:unknown){if(value!==null&&(typeof value!=='string'||!Number.isFinite(Date.parse(value))))throw new AppError('Atualize a página antes de salvar.');return value as string|null;}
function optionalDate(value:unknown){if(value!==null&&(typeof value!=='string'||!realDate(value)))throw new AppError('Confira a data informada.');return value as string|null;}
export function commercialInput(raw:unknown):CommercialInput{
 const b=object(raw);keys(b,['payment_method','notes','follow_up_date','cancellation_reason','expected']);
 if(!paymentMethods.includes(b.payment_method as CommercialInput['payment_method']))throw new AppError('Escolha a forma de cobrança.');
 return {payment_method:b.payment_method as CommercialInput['payment_method'],notes:text(b.notes,0,2000,'as anotações'),follow_up_date:optionalDate(b.follow_up_date),cancellation_reason:text(b.cancellation_reason,0,500,'o motivo do cancelamento'),expected:expectedVersion(b.expected)};
}
export function campaignInput(raw:unknown):Omit<Campaign,'created_at'|'updated_at'>&{expected:string|null}{
 const b=object(raw);keys(b,['id','name','influencer','channel','code','commission_bps','active','expected']);
 if(!uuid(b.id)||typeof b.code!=='string'||!/^[a-z0-9][a-z0-9-]{2,47}$/.test(b.code)||!Number.isSafeInteger(b.commission_bps)||Number(b.commission_bps)<0||Number(b.commission_bps)>10000||typeof b.active!=='boolean')throw new AppError('Confira o código da campanha e a comissão (0 a 100%).');
 return {id:b.id,name:text(b.name,2,100,'o nome da campanha'),influencer:text(b.influencer,2,100,'o influenciador'),channel:text(b.channel,2,80,'o canal'),code:b.code,commission_bps:Number(b.commission_bps),active:b.active,expected:expectedVersion(b.expected)};
}
export function campaignLink(code:string,configured:string|undefined,fallback='http://localhost:3100'){
 let base:URL;try{base=new URL(configured||fallback);}catch{base=new URL('http://localhost:3100');}
 const test=base.protocol!=='https:'||!base.hostname.includes('.')||/^(localhost|127\.|0\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[::1\]$)/i.test(base.hostname)||!!base.username||!!base.password;
 if(!['http:','https:'].includes(base.protocol)||base.username||base.password)base=new URL('http://localhost:3100');
 return {link:new URL('/convite/'+encodeURIComponent(code),base.origin).toString(),test_link:test};
}
export function commerceAttention(customers:Customer[],feedbacks:Feedback[],now=new Date()){
 const today=brazilDay(now),soon=brazilDay(new Date(now.getTime()+7*86400000));
 return {
  overdue:customers.filter(c=>c.subscription?.status==='ATRASADA'||c.subscription?.status==='ATIVA'&&!!c.subscription.renewal_date&&c.subscription.renewal_date<today).map(c=>c.id),
  renewing:customers.filter(c=>c.subscription?.status==='ATIVA'&&!!c.subscription.renewal_date&&c.subscription.renewal_date>=today&&c.subscription.renewal_date<=soon).map(c=>c.id),
  trials_ending:customers.filter(c=>c.subscription?.status==='TESTE'&&!!c.subscription.renewal_date&&c.subscription.renewal_date<=soon).map(c=>c.id),
  missing_dates:customers.filter(c=>['ATIVA','TESTE'].includes(c.subscription?.status||'')&&!c.subscription?.renewal_date).map(c=>c.id),
  followups:customers.filter(c=>c.profile?.follow_up_date&&c.profile.follow_up_date<=today).map(c=>c.id),
  pending_feedback:feedbacks.filter(f=>f.status!=='RESOLVIDO'&&!f.response&&Date.parse(f.created_at)<=now.getTime()-3*86400000).map(f=>f.id)
 };
}
export function commerceReports(customers:Customer[]){
 const m=commerceMetrics(customers,[]),plans=new Map<string,{plan:string;active:number;mrr_cents:number}>();
 for(const c of customers){const s=c.subscription;if(!s||s.status!=='ATIVA'||s.monthly_cents<=0)continue;const key=s.plan||'Sem nome de plano',p=plans.get(key)||{plan:key,active:0,mrr_cents:0};p.active++;p.mrr_cents+=s.monthly_cents;plans.set(key,p);}
 return {average_ticket_cents:m.active?Math.round(m.mrr_cents/m.active):0,annual_forecast_cents:m.mrr_cents*12,plans:[...plans.values()].sort((a,b)=>b.mrr_cents-a.mrr_cents||a.plan.localeCompare(b.plan)),card_subscribers:customers.filter(c=>c.subscription?.status==='ATIVA'&&c.profile?.payment_method==='CARTAO').length,boleto_subscribers:customers.filter(c=>c.subscription?.status==='ATIVA'&&c.profile?.payment_method==='BOLETO').length};
}
export function campaignResults(campaigns:Campaign[],customers:Customer[],configured:string|undefined,fallback?:string){return campaigns.map(c=>{const attributed=customers.filter(u=>u.acquisition?.campaign_id===c.id),m=commerceMetrics(attributed,[]);return {...c,...campaignLink(c.code,configured,fallback),registered:attributed.length,active_subscribers:m.active,mrr_cents:m.mrr_cents};});}
// Text cells are quoted and neutralize spreadsheet formulas, including leading whitespace.
export function commerceCsv(rows:(string|number|null)[][]){return '\uFEFF'+rows.map(row=>row.map(value=>{let cell=String(value??'');if(/^[\s\uFEFF]*[=+@-]/.test(cell)||/^[\t\r\n]/.test(cell))cell="'"+cell;return '"'+cell.replaceAll('"','""')+'"';}).join(';')).join('\r\n')+'\r\n';}
