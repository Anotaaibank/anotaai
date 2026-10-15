import {createHash,randomUUID} from 'node:crypto';
import {AppError,uuid} from './model.ts';
import {isManager} from './commerce.ts';
import {subscriptionPlans,type UsageKind,type UsageSummary} from './subscription-plans.ts';
export type UsageReservation={id:string;granted:number;expires_at:string|null;duplicate?:boolean;result?:unknown};
const free=(id:string,amount:number):UsageReservation=>({id,granted:amount,expires_at:null});
const localMode=()=>process.env.ANOTA_STORAGE==='local'||(process.env.NODE_ENV!=='production'&&!process.env.SUPABASE_URL);
async function service<T>(path:string,method='GET',body?:unknown){return (await import('./server.ts')).service<T>(path,method,body);}
export async function usageSummary(user:string):Promise<UsageSummary>{if(localMode())return {plan_code:'BASICO',exempt:true,period_start:new Date().toISOString().slice(0,10),period_end:new Date(Date.now()+30*86400000).toISOString().slice(0,10),requests:0,whatsapp_seconds:0,voice_seconds:0,limits:{requests:null,whatsapp_seconds:null,voice_seconds:null}};return service<UsageSummary>('rpc/anota_usage_summary','POST',{p_user:user});}
export async function reserveUsage(user:string,kind:UsageKind,event:string,amount:number,source=''):Promise<UsageReservation>{
 if(!uuid(event)||!Number.isSafeInteger(amount)||amount<1)throw new AppError('Pedido de uso inválido.');
 if(localMode()||isManager(user))return free(event,amount);
 const r=await service<UsageReservation&{error?:string}>('rpc/anota_usage_take','POST',{p_user:user,p_kind:kind,p_event:event,p_amount:amount,p_fingerprint:createHash('sha256').update(source).digest('hex')});
 if(r.error==='LIMIT')throw new AppError('A franquia desta função foi utilizada. Consulte Meu uso no aplicativo para renovar ou mudar de plano.',429);
 if(r.error==='BUSY')throw new AppError('Já existe uma conversa em andamento nesta conta.',409);
 if(r.error)throw new AppError('Não foi possível conferir a franquia. Atualize o aplicativo.',409);
 return r;
}
export async function settleUsage(user:string,id:string,kind:UsageKind,used:number,result?:unknown){if(localMode()||isManager(user))return;await service('rpc/anota_usage_settle','POST',{p_user:user,p_event:id,p_kind:kind,p_used:Math.max(0,Math.ceil(used)),p_result:result??null});}
export const usageRequestId=(raw:unknown)=>uuid(raw)?raw:randomUUID();
export {subscriptionPlans};
