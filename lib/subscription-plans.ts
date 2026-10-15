export const subscriptionPlans={
 BASICO:{code:'BASICO',name:'Básico',monthly_cents:4990,requests:150,whatsapp_seconds:600,voice_seconds:600},
 ILIMITADO:{code:'ILIMITADO',name:'Ilimitado',monthly_cents:9990,requests:null,whatsapp_seconds:null,voice_seconds:null}
} as const;
export type PlanCode=keyof typeof subscriptionPlans;
export const validPlan=(value:unknown):value is PlanCode=>value==='BASICO'||value==='ILIMITADO';
export function planFrom(value:unknown):typeof subscriptionPlans[PlanCode]{return subscriptionPlans[value==='ILIMITADO'?'ILIMITADO':'BASICO'];}
export type UsageKind='REQUEST'|'WHATSAPP'|'VOICE';
export type UsageSummary={plan_code:PlanCode;exempt:boolean;period_start:string;period_end:string;requests:number;whatsapp_seconds:number;voice_seconds:number;limits:{requests:number|null;whatsapp_seconds:number|null;voice_seconds:number|null}};
export function timeUsed(seconds:number){const s=Math.max(0,Math.ceil(seconds));return `${Math.floor(s/60)}min ${String(s%60).padStart(2,'0')}s`;}
