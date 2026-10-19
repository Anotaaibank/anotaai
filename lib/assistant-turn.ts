import {randomUUID} from 'node:crypto';
import {AppError,brazilDay,uuid} from './model.ts';
import {extractFinance,prepareFinanceDraft,type FinanceDraft} from './finance-ai.ts';
import {signFinance,type FinanceState,type FinancePlan} from './finance.ts';
import {financeDraftAnswer} from './finance-report.ts';
import {assistantConversations,resolveAssistantSource,conversationQuery,rememberTurn,conversationContext,reconcileConversation} from './assistant-conversation.ts';
import {assistantManual,assistantView} from './assistant-manual.ts';
import {assistantScreen} from './assistant-guide.ts';
import {fold,monetaryLiterals} from './finance-date.ts';
import {assistantQuery} from './assistant-query.ts';
import {normalizeAssistantText,naturalFinanceTurn,sourceWithVerifiedTarget} from './conversation-language.ts';
import {conversationReport} from './conversation-reports.ts';
import {prepareFinanceProposal} from './finance-proposal.ts';
import {appointmentFacts} from './appointment-language.ts';

type Options={user:string;text:string;state:FinanceState;key:string;secret:string;conversation?:unknown;scope?:'text'|'voice';requestId?:unknown;name?:unknown;section?:unknown;view?:unknown;today?:string;now?:number;transport?:typeof fetch};
type Result={ok:true;saved:false;conversation_id:string;answer?:string;pending?:{title:string;lines:string[];confirmation:string}};
export async function assistantTurn(o:Options):Promise<Result>{
 if(typeof o.text==='string')o={...o,text:normalizeAssistantText(o.text)};
 const now=o.now??Date.now(),today=o.today??brazilDay(),view=assistantView(o.view),section=assistantScreen(o.section);if(typeof o.text!=='string'||o.text.trim().length<2||o.text.length>4000)throw new AppError('Informe seu pedido em uma mensagem curta.');
 if(o.requestId!==undefined&&!uuid(o.requestId))throw new AppError('Mensagem inválida.');
 const c=assistantConversations.open(o.user,o.conversation,o.scope??'text',now),requestId=typeof o.requestId==='string'?o.requestId:randomUUID(),base={ok:true as const,saved:false as const,conversation_id:c.id};
 if(c.busy)throw new AppError('Aguarde a resposta anterior antes de enviar outra mensagem.',409);
 const replay=c.requests.get(requestId);if(replay){if(replay.text!==o.text)throw new AppError('Essa mensagem já foi usada com outro pedido.',409);if(now-replay.created>=600000)throw new AppError('O resumo expirou. Envie o pedido novamente.');if(c.pending?.plan.id===requestId&&reconcileConversation(c,o.state,now))return {...base,answer:'Esse lançamento já está registrado. Confira o histórico antes de repetir.'};if((replay.result as Result).pending)return replay.result as Result;}
 c.busy=true;
 try{
  const resolved=resolveAssistantSource(c,o.text,o.state,now,today);

  if(resolved.answer)return {...base,answer:resolved.answer};
  if(c.pending&&now-c.pending.created<60000&&c.pending.source===resolved.source){if(!reconcileConversation(c,o.state,now))return {...base,pending:{title:c.pending.plan.title,lines:c.pending.plan.lines,confirmation:c.pending.confirmation}};c.pending=undefined;}
  const next=/^(?:e agora|ja abri|ja fiz|pronto|continue|continuar|proximo(?: passo)?)[.!? ]*$/.test(fold(o.text));
  if(next&&c.turns.at(-1)?.intent==='HELP'&&c.manual){const guide=assistantManual({mode:'PASSOS',step:c.manual.section===section&&c.manual.view===view?c.manual.step:1},section,view);c.manual={section,view,step:guide.next_step??guide.suggested_step};const answer=guide.answer;rememberTurn(c,o.text,{intent:'HELP'} as FinanceDraft,answer);return {...base,answer};}
  const query=conversationQuery(c,o.text),draft:FinanceDraft=resolved.draft||(query?{intent:'QUERY',command:null,question:'',confidence:'ALTA',target_excerpt:'',money_evidence:[],date_evidence:[],query}:await extractFinance(resolved.source,o.state,o.key,today,o.transport??fetch,o.name,section,{...conversationContext(c),current_view:{section,form:view},guide:assistantManual({mode:'PASSOS'},section,view)}));
  if(draft.intent==='COMMAND')resolved.source=sourceWithVerifiedTarget(resolved.source,draft);
  let result:Result;
  if(draft.intent==='QUERY'||draft.intent==='HELP'||draft.intent==='CLARIFY'||draft.intent==='OUTSIDE'){
   if(draft.intent==='QUERY')draft.query=assistantQuery(draft.query,today,o.text);
   const answer=draft.intent==='QUERY'?(conversationReport(o.state,JSON.parse(draft.query),today)??financeDraftAnswer(o.state,draft.query,today)):draft.question||'Posso ajudar com as finanças pessoais e as telas do Anotei na Hora.';result={...base,answer};rememberTurn(c,o.text,draft,answer,resolved.source);if(draft.intent==='HELP')c.manual={section,view,step:2};else c.manual=undefined;
  }else{
   if(resolved.target){const command=typeof draft.command==='string'?JSON.parse(draft.command):draft.command;if(!command||command.target_id!==resolved.target)throw new AppError('A correção não identificou o registro correto. Informe a descrição e o valor.');draft.target_excerpt=resolved.target;}
   // Context identifies a record, never supplies a new date. Keep unchanged fields
   // out of the patch when a model echoes the last record without a user request.
   if(resolved.target&&!appointmentFacts(o.text,today)?.date&&!/\b(?:hoje|ontem|anteontem|amanha|dia\s+\d|mes que vem|proximo mes)\b|\b\d{1,4}[/-]\d{1,2}(?:[/-]\d{2,4})?\b/.test(fold(o.text))){const command=typeof draft.command==='string'?JSON.parse(draft.command):draft.command;if(command&&typeof command==='object')draft.command={...command,date:undefined};}
   let plan:FinancePlan,incomplete:string[]=[];try{({plan,incomplete}=prepareFinanceProposal(draft,resolved.source,o.state,o.user,requestId,today));}catch(e){if(!(e instanceof AppError)||e.status!==400||resolved.target)throw e;const outside=/somente finanças pessoais/.test(e.message),missingMoney=/valor, a quantidade ou a taxa/.test(e.message)&&monetaryLiterals(resolved.source).length===0;const answer=missingMoney?'Qual foi o valor?':e.message;rememberTurn(c,o.text,{...draft,intent:outside?'OUTSIDE':'CLARIFY',command:null,question:answer},answer,resolved.source);result={...base,answer};c.requests.set(requestId,{text:o.text,result,created:now});while(c.requests.size>24)c.requests.delete(c.requests.keys().next().value!);return result;}
   if(resolved.target&&(!plan.expenses.length&&!plan.documents.length||[...plan.expenses.map(e=>e.payload.id),...plan.documents.map(d=>d.document.id)].some(id=>id!==resolved.target)))throw new AppError('A correção não identificou o registro correto. Informe a descrição e o valor.');
   const confirmation=signFinance(plan,o.user,o.secret,now,incomplete);c.pending={plan,source:resolved.source,confirmation,created:now,incomplete};rememberTurn(c,o.text,draft,'Confira o resumo e confirme no botão, por favor.',resolved.source);result={...base,pending:{title:plan.title,lines:plan.lines,confirmation}};
  }
  c.requests.set(requestId,{text:o.text,result,created:now});while(c.requests.size>24)c.requests.delete(c.requests.keys().next().value!);return result;
 }finally{c.busy=false;}
}
export function assistantSavedContext(user:string,id:string,state:FinanceState,plan:FinancePlan){const c=assistantConversations.open(user,id,'voice');if(c.pending?.plan.id===plan.id)reconcileConversation(c,state);return {saved:true,title:plan.title,lines:plan.lines,records:[...plan.expenses.map(e=>({id:e.payload.id,kind:'EXPENSE',description:e.payload.description,amount_cents:e.payload.amount_cents,date:e.payload.entry_date,status:e.payload.status,active:e.active??true})),...plan.documents.map(d=>({id:d.document.id,kind:d.document.kind,description:d.document.description,amount_cents:d.document.amount_cents,date:d.document.date,active:d.document.active}))]};}
