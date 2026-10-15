import {randomUUID} from 'node:crypto';
import {AppError,uuid} from './model.ts';
import {fold,literalMoney} from './finance-date.ts';
import type {FinancePlan,FinanceState} from './finance.ts';
import type {FinanceDraft} from './finance-ai.ts';
import {continuedAppointment} from './appointment-language.ts';

type Turn={text:string;intent:FinanceDraft['intent'];answer:string};
export type AssistantConversation={id:string;user:string;scope:'text'|'voice';expires:number;busy:boolean;turns:Turn[];incomplete?:string;query?:string;pending?:{plan:FinancePlan;source:string;confirmation:string;created:number};focus?:{ids:string[];kind:string;description:string;at:number;plan?:string};requests:Map<string,{text:string;result:unknown;created:number}>;manual?:{section:string;view:string;step:number}};
const duration=20*60*1000;
export function createConversationStore(){
 const sessions=new Map<string,AssistantConversation>();
 function sweep(now:number){for(const [id,c] of sessions)if(c.expires<=now&&!c.busy)sessions.delete(id);}
 return {open(user:string,id:unknown=undefined,scope:'text'|'voice'='text',now=Date.now()){
  if(!uuid(user)||id!==undefined&&!uuid(id))throw new AppError('Conversa inválida.');sweep(now);
  if(id!==undefined){const found=sessions.get(id as string);if(found){if(found.user!==user||found.scope!==scope)throw new AppError('Conversa não pertence à sua conta.',403);found.expires=now+duration;return found;}if(scope==='text')throw new AppError('A conversa expirou. Envie novamente para iniciar outra.',410);}
  if(sessions.size>=1000)throw new AppError('Assistente ocupado. Tente novamente em instantes.',503);
  const c:AssistantConversation={id:typeof id==='string'?id:randomUUID(),user,scope,expires:now+duration,busy:false,turns:[],requests:new Map()};sessions.set(c.id,c);return c;
 },close(user:string,id:string){const c=sessions.get(id);if(c?.user===user)sessions.delete(id);},size(){return sessions.size;}};
}
const runtime=globalThis as unknown as {[key:symbol]:ReturnType<typeof createConversationStore>|undefined};
export const assistantConversations=runtime[Symbol.for('anotei.assistant-conversations.v1')]??=createConversationStore();

function normalized(value:unknown):unknown{return Array.isArray(value)?value.map(normalized):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,normalized(v)])):value;}
const stable=(value:unknown)=>JSON.stringify(normalized(value));
export function reconcileConversation(c:AssistantConversation,state:FinanceState,now=Date.now()){
 const p=c.pending?.plan;if(!p)return false;
 const expenses=p.expenses.every(e=>{const row=state.expenses.find(r=>r.id===e.payload.id&&r.user_id===c.user);return row&&row.active===(e.active??true)&&(!e.expected||row.updated_at!==e.expected)&&Object.entries(e.payload).every(([key,value])=>stable(row[key as keyof typeof row])===stable(value));});
 const documents=p.documents.every(d=>{const row=state.documents.find(r=>r.id===d.document.id);return row&&(!d.expected||row.updated_at!==d.expected)&&Object.entries(d.document).every(([key,value])=>stable(row[key as keyof typeof row])===stable(value));});
 if(!expenses||!documents)return false;
 const entries=[...p.expenses.map(e=>({id:e.payload.id,kind:'EXPENSE',description:e.payload.description})),...p.documents.map(d=>({id:d.document.id,kind:d.document.kind,description:d.document.description}))];
 if(!c.focus||c.focus.plan!==p.id)c.focus={ids:entries.map(e=>e.id),kind:entries.length===1?entries[0].kind:'MULTIPLE',description:entries.length===1?entries[0].description:p.title,at:now,plan:p.id};return true;
}
export function contextualCorrection(text:string){return /^(?:na verdade|corrig(?:e|ir|a)|corrija|quis dizer|errei|o correto|era |foram |foi )/.test(fold(text));}
export function resolveAssistantSource(c:AssistantConversation,text:string,state:FinanceState,now=Date.now(),today=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date())):{source:string;answer?:string;target?:string;draft?:FinanceDraft}{
 reconcileConversation(c,state,now);const value=fold(text);
 if(c.incomplete){const continuation=continuedAppointment(c.incomplete,text,today);if(continuation)return continuation;}
 if(contextualCorrection(text)){
  const focus=c.focus;
  let amountOnly=false;try{amountOnly=literalMoney(value.replace(/^(?:na verdade[, ]*)?(?:(?:foram|era|foi|gastei)\s+)?/,'').replace(/[.!?]$/,''))>0;}catch{}
  const generic=amountOnly||/\b(?:esse|essa|este|esta|ultimo|ultima|isso)\b/.test(value);
  if(focus&&now-focus.at<600000&&(generic||value.includes(fold(focus.description)))){
   if(focus.ids.length!==1)return {source:text,answer:'Qual dos registros você quer corrigir? Informe a descrição e a data.'};
   const id=focus.ids[0],entry=focus.kind==='EXPENSE'?state.expenses.find(e=>e.id===id&&e.user_id===c.user&&e.active):state.documents.find(d=>d.id===id&&d.active);
   if(!entry)return {source:text,answer:'Não encontrei esse registro ativo. Informe qual anotação deseja corrigir.'};
   if(focus.kind==='PROFILE')return {source:text,answer:'Você quer corrigir o salário ou o saldo inicial?'};
   const kind=focus.kind==='EXPENSE'?'despesa':focus.kind==='INCOME'?'entrada':focus.kind==='RESERVE'?'reserva':focus.kind==='APPOINTMENT'?'compromisso':'';
   if(!kind)return {source:text,answer:'Informe qual anotação deseja corrigir.'};
   return {source:`Corrija a ${kind} identificada por ${id}. Correção informada: ${text}`,target:id};
  }
  if(generic)return {source:text,answer:'Qual anotação você quer corrigir? Informe a descrição ou a data.'};
 }
 let moneyOnly=false;try{moneyOnly=literalMoney(value)>0;}catch{}
 const complement=moneyOnly||/^(?:r\$\s*)?\d|^(?:hoje|ontem|amanha|dia |do mes|no mes|mes que vem|proximo mes|sim\b|nao\b|combustivel\b|gasolina\b|pix\b|boleto\b)/.test(value);
 if(c.incomplete&&complement){const source=(c.incomplete+' '+text).trim();if(source.length>4000)throw new AppError('Envie o pedido completo em uma mensagem curta.');return {source};}
 return {source:text};
}
export function conversationQuery(c:AssistantConversation,text:string){
 if(!c.query||!/^(?:e\s+)?(?:no |na |do |da |o |a )?(?:mes passado|mes anterior|mes atual|este mes|neste mes|hoje|ontem|esta semana|semana que vem|proxima semana)[?!. ]*$/.test(fold(text)))return null;
 const raw=JSON.parse(c.query) as Record<string,unknown>,value=fold(text);delete raw.from;delete raw.to;
 raw.period=/mes passado|mes anterior/.test(value)?'mes_anterior':/semana que vem|proxima semana/.test(value)?'proxima_semana':/semana/.test(value)?'semana_atual':/hoje/.test(value)?'hoje':/ontem/.test(value)?'personalizado':'mes_atual';
 if(!('topic' in raw)&&!['mes_anterior','mes_atual'].includes(String(raw.period))||raw.period==='personalizado')return null;
 return JSON.stringify(raw);
}
export function rememberTurn(c:AssistantConversation,text:string,draft:FinanceDraft,answer:string,source=text){
 c.turns.push({text:text.slice(0,1500),intent:draft.intent,answer:answer.slice(0,1000)});c.turns=c.turns.slice(-6);
 c.incomplete=draft.intent==='CLARIFY'?source:undefined;c.query=draft.intent==='QUERY'?draft.query:undefined;
}
export function conversationContext(c:AssistantConversation){return {turns:c.turns,focus:c.focus?{...c.focus,at:undefined}:undefined};}
