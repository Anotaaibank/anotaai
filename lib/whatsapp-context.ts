import {readFinance,readFinanceContinuation,type FinancePlan} from './finance.ts';
import {whatsappActor} from './whatsapp-finance.ts';
import {fastWhatsappQuery} from './whatsapp-reports.ts';
import {normalizeAssistantText} from './conversation-language.ts';
import type {Inbox} from './whatsapp-store.ts';
// A saved focus must come from a successful, signed operation for this sender.
// Its old signature is context only; every new write gets a fresh confirmation.
export function whatsappConversationContext(rows:Inbox[],user:string,sender:string,key:string,now=Date.now()){
 const recent=rows.filter(r=>r.user_id===user&&r.sender===sender&&Date.parse(r.created_at)>now-900000&&Date.parse(r.created_at)<=now).sort((a,b)=>b.created_at.localeCompare(a.created_at));
 let focus:FinancePlan|undefined,incomplete:string[]=[];
 const saved=recent.find(r=>r.status==='LANCADO');
 if(saved?.finance_confirmation&&saved.confirmation_used&&!recent.some(r=>r.status==='ESCLARECER'&&!r.confirmation_used&&r.created_at>saved.created_at)){try{focus=readFinance(saved.finance_confirmation,whatsappActor(user,sender),key,Date.parse(saved.created_at));incomplete=readFinanceContinuation(saved.finance_confirmation,whatsappActor(user,sender),key,Date.parse(saved.created_at));}catch{/* Invalid signatures never provide record IDs. */}}
 const latest=recent.find(r=>r.status==='RESOLVIDO'||r.status==='LANCADO'||r.status==='ESCLARECER'),query=latest?.status==='RESOLVIDO'?fastWhatsappQuery(normalizeAssistantText(latest.transcript||latest.text))||undefined:undefined;
 return {focus,query,incomplete,turns:recent.slice(0,6).reverse().map(r=>({text:(r.transcript||r.text).slice(0,1500),answer:r.reply.slice(0,1000),status:r.status}))};
}
