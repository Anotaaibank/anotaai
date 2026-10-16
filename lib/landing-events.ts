export const landingEventNames=['landing_view','cta_click','video_play','demo_interaction','plans_view','plan_selected','registration_start','payment_start'] as const;
export type LandingEventName=typeof landingEventNames[number];
export type LandingEventDetails={source?:'hero'|'video'|'demo'|'routine'|'plans'|'final'|'mobile'|'footer';plan?:'BASICO'|'ILIMITADO';example?:'expense'|'bill'|'report';action?:'select'|'confirm'};
// No identity, message, financial record, cookie or fabricated purchase event.
export function landingEvent(name:LandingEventName,details:LandingEventDetails={}){
 if(!(landingEventNames as readonly string[]).includes(name))throw new Error('Evento comercial inválido.');
 const allowed={source:['hero','video','demo','routine','plans','final','mobile','footer'],plan:['BASICO','ILIMITADO'],example:['expense','bill','report'],action:['select','confirm']};
 for(const [key,value]of Object.entries(details))if(!Object.hasOwn(allowed,key)||!allowed[key as keyof typeof allowed].includes(value))throw new Error('Contexto comercial inválido.');
 return {event:name,page:'/conheca',...details};
}
export function trackLandingEvent(name:LandingEventName,details:LandingEventDetails={}){
 if(typeof window==='undefined')return;
 window.dispatchEvent(new CustomEvent('anotei:landing',{detail:landingEvent(name,details)}));
}
