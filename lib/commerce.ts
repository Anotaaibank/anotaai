import type {CustomerDetails} from './customer-details.ts';
import type {PlanCode} from './subscription-plans.ts';
import type {PixSettings,PixPayment} from './subscription-access.ts';
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
export type Subscription={user_id:string;status:SubscriptionStatus;plan:string;monthly_cents:number;renewal_date:string|null;updated_at:string;plan_code?:PlanCode};
export const paymentMethods=['CARTAO','PIX','BOLETO','NAO_DEFINIDO'] as const;
export const paymentMethodLabel={CARTAO:'Cartão recorrente',PIX:'Pix · validação administrativa',BOLETO:'Boleto',NAO_DEFINIDO:'Não informado'};
export type CommercialInput={payment_method:typeof paymentMethods[number];notes:string;follow_up_date:string|null;cancellation_reason:string;expected:string|null};
export type CustomerProfile=Omit<CommercialInput,'expected'>&{user_id:string;updated_at:string};
export type Campaign={id:string;name:string;influencer:string;channel:string;code:string;commission_bps:number;active:boolean;created_at:string;updated_at:string};
export type Acquisition={user_id:string;campaign_id:string;captured_at:string};
export type SubscriptionEvent={id:string;user_id:string;actor_id:string;before_subscription:Subscription|null;after_subscription:Subscription;before_profile:CustomerProfile|null;after_profile:CustomerProfile|null;created_at:string};
export type Customer={id:string;name:string;email:string;created_at:string;subscription:Subscription|null;details?:CustomerDetails|null;profile?:CustomerProfile|null;acquisition?:Acquisition|null};
type BaseManagementData={customers:Customer[];feedbacks:(Feedback&{user_name:string;user_email:string})[];metrics:ReturnType<typeof commerceMetrics>;billing_mode:'MANUAL';campaigns:(Campaign&{link:string;test_link:boolean;registered:number;active_subscribers:number;mrr_cents:number})[];history:SubscriptionEvent[];attention:ReturnType<typeof commerceAttention>;reports:ReturnType<typeof commerceReports>;billing:{provider:string|null;connected:false;primary_method:'CARTAO';boleto_optional:true;public_url_ready:boolean}};

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
 if((b.status==='ATIVA'||b.status==='TESTE')&&b.renewal_date===null)throw new AppError('Informe a validade do acesso para liberar uma assinatura ativa ou de teste.');
 if(b.expected!==null&&(typeof b.expected!=='string'||!Number.isFinite(Date.parse(b.expected))))throw new AppError('Atualize a assinatura antes de salvar.');
 const commercial=b.commercial===undefined?undefined:commercialInput(b.commercial);
 if(commercial&&b.status==='CANCELADA'&&!commercial.cancellation_reason)throw new AppError('Informe o motivo do cancelamento para acompanhar a retenção.');
 return {user_id:b.user_id,status:b.status as SubscriptionStatus,plan:text(b.plan,0,80,'o nome do plano'),monthly_cents:Number(b.monthly_cents),renewal_date:b.renewal_date as string|null,expected:b.expected as string|null,...(commercial?{commercial}:{})};
}
// Reporting only. A date/status is not proof of access: the server also checks
// exemptions, disabled accounts, enforcement and approved Pix for that validity.
function subscriptionWithinTerm(subscription:Subscription|null,today:string){
 return !!subscription&&['ATIVA','TESTE'].includes(subscription.status)&&!!subscription.renewal_date&&realDate(subscription.renewal_date)&&subscription.renewal_date>=today;
}
function paidSubscriptionsWithinTerm(customers:Customer[],today:string){
 return customers.filter(c=>c.subscription?.status==='ATIVA'&&c.subscription.monthly_cents>0&&subscriptionWithinTerm(c.subscription,today));
}
export function commerceMetrics(customers:Customer[],feedbacks:Feedback[],now=new Date()){
 const today=brazilDay(now),month=today.slice(0,7),active=customers.filter(c=>c.subscription?.status==='ATIVA'&&c.subscription.monthly_cents>0),current=paidSubscriptionsWithinTerm(customers,today);
 return {
  registered:customers.length,
  // Compatibility: these two legacy counters describe the recorded ATIVA status,
  // including expired/missing dates. Use paid_current/current_mrr_cents for forecasts.
  active:active.length,mrr_cents:active.reduce((n,c)=>n+c.subscription!.monthly_cents,0),
  subscriptions_registered:customers.filter(c=>c.subscription&&c.subscription.status!=='SEM_ASSINATURA').length,
  paid_current:current.length,current_mrr_cents:current.reduce((n,c)=>n+c.subscription!.monthly_cents,0),
  paid_expired:active.filter(c=>!!c.subscription!.renewal_date&&realDate(c.subscription!.renewal_date)&&c.subscription!.renewal_date<today).length,
  paid_missing_expiry:active.filter(c=>!c.subscription!.renewal_date||!realDate(c.subscription!.renewal_date)).length,
  trials:customers.filter(c=>c.subscription?.status==='TESTE').length,
  trials_current:customers.filter(c=>c.subscription?.status==='TESTE'&&subscriptionWithinTerm(c.subscription,today)).length,
  // No authoritative access result is included in ManagementData. Unknown != zero.
  effective_access:null,
  past_due:customers.filter(c=>c.subscription?.status==='ATRASADA').length,canceled:customers.filter(c=>c.subscription?.status==='CANCELADA').length,
  new_this_month:customers.filter(c=>brazilDay(new Date(c.created_at)).startsWith(month)).length,
  feedback_total:feedbacks.length,feedback_open:feedbacks.filter(f=>f.status!=='RESOLVIDO').length,as_of:today
 };
}
// Historical administrative approvals, not bank reconciliation or card revenue.
// Omitted data stays unknown; created_at is a request date, not a receipt date.
export function commercePaymentMetrics(payments?:ReadonlyArray<PixPayment>){
 if(payments===undefined)return null;
 const approved=payments.filter(p=>p.status==='APROVADO'),pending=payments.filter(p=>p.status==='PENDENTE');
 return {approved_count:approved.length,approved_cents:approved.reduce((sum,p)=>sum+p.amount_cents,0),pending_count:pending.length,pending_cents:pending.reduce((sum,p)=>sum+p.amount_cents,0),rejected_count:payments.filter(p=>p.status==='REJEITADO').length};
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
export function commerceReports(customers:Customer[],now=new Date()){
 const today=brazilDay(now),current=paidSubscriptionsWithinTerm(customers,today),m=commerceMetrics(customers,[],now),plans=new Map<string,{plan:string;active:number;mrr_cents:number}>();
 for(const c of current){const s=c.subscription!,key=s.plan||'Sem nome de plano',p=plans.get(key)||{plan:key,active:0,mrr_cents:0};p.active++;p.mrr_cents+=s.monthly_cents;plans.set(key,p);}
 return {average_ticket_cents:m.paid_current?Math.round(m.current_mrr_cents/m.paid_current):0,annual_forecast_cents:m.current_mrr_cents*12,plans:[...plans.values()].sort((a,b)=>b.mrr_cents-a.mrr_cents||a.plan.localeCompare(b.plan)),card_subscribers:current.filter(c=>c.profile?.payment_method==='CARTAO').length,boleto_subscribers:current.filter(c=>c.profile?.payment_method==='BOLETO').length};
}
export function campaignResults(campaigns:Campaign[],customers:Customer[],configured:string|undefined,fallback?:string,now=new Date()){return campaigns.map(c=>{const attributed=customers.filter(u=>u.acquisition?.campaign_id===c.id),m=commerceMetrics(attributed,[],now);return {...c,...campaignLink(c.code,configured,fallback),registered:attributed.length,active_subscribers:m.paid_current,mrr_cents:m.current_mrr_cents};});}
// Text cells are quoted and neutralize spreadsheet formulas, including leading whitespace.
export function commerceCsv(rows:(string|number|null)[][]){return '\uFEFF'+rows.map(row=>row.map(value=>{let cell=String(value??'');if(/^[\s\uFEFF]*[=+@-]/.test(cell)||/^[\t\r\n]/.test(cell))cell="'"+cell;return '"'+cell.replaceAll('"','""')+'"';}).join(';')).join('\r\n')+'\r\n';}

export type ManagementData=BaseManagementData&{pix?:PixSettings|null;pix_payments?:PixPayment[];participantAccounts?:{owner_account?:boolean;whatsapp_ready?:boolean;authorized?:boolean;subscriber_name?:string;plan_code?:PlanCode;phone:string;user_id:string|null;registered:boolean;active:boolean;send_status:string;updated_at?:string;expires_at?:number;last_link?:{status:string;updated_at:string}}[];households?:{user_id:string;phone:string;contact_name?:string}[]};
