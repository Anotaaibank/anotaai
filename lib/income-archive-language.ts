import {fold,literalMoney,moneyNumber} from './finance-date.ts';
import {appointmentFacts} from './appointment-language.ts';
import {currency} from './model.ts';
import type {FinanceDraft} from './finance-ai.ts';
import type {FinanceState,FinancePlan} from './finance.ts';
// Created only on the server from confirmed, signed WhatsApp creation plans.
export type IncomeOrigin={message_id:string;confirmed_at:string;income_ids:string[]};
const heading=/^(?:(?:oi|ola|por favor)[,! ]+)*(?:(?:eu )?quero (?:que voce )?)?(?:(?:voce )?(?:pode|poderia)\s+)?(?:cancela|cancelar|cancele|exclui|excluir|exclua|apaga|apagar|apague|remove|remover|remova|arquiva|arquivar|arquive|desfaz|desfazer|desfaca|tira|tirar|tire)\s+(?:(?:pra|para) mim\s+)?(?:(?:a|essa|esta|aquela|minha|uma)\s+)?(?:(?:ultima|ultimo)\s+)?(?:entrada|receita|recebimento)\b/;
export function isIncomeArchiveRequest(text:string){return heading.test(fold(text));}
export function latestIncomeArchiveRequest(text:string){return isIncomeArchiveRequest(text)&&/\bultima (?:entrada|receita)\b|\bultimo recebimento\b|\b(?:entrada|receita|recebimento)\b.*\b(?:por ultimo|mais recente)\b/.test(fold(text));}
const empty=(intent:FinanceDraft['intent'],question:string):FinanceDraft=>({intent,question,query:'',command:null,confidence:'ALTA',target_excerpt:'',money_evidence:[],date_evidence:[]});
export function isIncomeArchivePlan(plan:FinancePlan){return plan.expenses.length===0&&plan.documents.length===1&&plan.documents[0].document.kind==='INCOME'&&plan.documents[0].document.active===false&&plan.documents[0].expected!==null;}
const words=(text:string)=>fold(text).replace(/[^\p{L}\p{N}]+/gu,' ').split(/\s+/).filter(w=>w&&!['a','o','as','os','de','da','do','das','dos','na','no','minha','meu','uma','um','para','pra','pelo','pela','valor','reais','real'].includes(w));
export function incomeArchiveDraft(raw:string,state:FinanceState,today:string,context?:{income_origins?:IncomeOrigin[]}):FinanceDraft|null{
 const text=raw.replace(/\nRegistro identificado nesta conversa: [0-9a-f-]{36}$/i,''),s=fold(text);
 if(/^nao\s+/.test(s)&&heading.test(s.replace(/^nao\s+/,'')))return empty('HELP','Não cancelei nenhuma entrada.');
 const match=s.match(heading);if(!match)return null;
 const facts=appointmentFacts(text,today,'past');if(!facts||facts.dateQuestion)return empty('CLARIFY',facts?.dateQuestion||'Confira a data da entrada que deseja cancelar.');
 const latest=latestIncomeArchiveRequest(text);
 // Mask calendar/time spans before reading values: day 20 is not R$20.
 let masked=text;for(const span of [...facts.dates,...(facts.time?[facts.time]:[])].sort((a,b)=>b.start-a.start))masked=masked.slice(0,span.start)+' '.repeat(span.end-span.start)+masked.slice(span.end);
 const amounts=[...masked.matchAll(new RegExp('(?<![\\p{L}\\d])'+moneyNumber+'(?![\\p{L}\\d])','giu'))].filter(m=>!['um','uma'].includes(fold(m[0])));
 if(amounts.length>1)return empty('CLARIFY','Qual entrada você quer cancelar? Informe apenas um valor, a descrição e a data.');
 let amount:number|undefined;if(amounts.length){try{amount=literalMoney(amounts[0][0]);if(amount<=0)throw Error();}catch{return empty('CLARIFY','Informe o valor correto da entrada que deseja cancelar.');}masked=masked.slice(0,amounts[0].index)+' '.repeat(amounts[0][0].length)+masked.slice(amounts[0].index!+amounts[0][0].length);}
 const body=masked.slice(match[0].length).replace(/\b(?:que (?:eu )?(?:enviei|mandei|lancei|registrei|cadastrei)|por ultimo|mais recente|pelo whatsapp|no whatsapp|por favor|pra mim|para mim)\b/gi,' ').trim();
 const search=words(body),selector=!!facts.date||amount!==undefined||search.length>0;
 let candidates=state.documents.filter(d=>d.kind==='INCOME'&&d.active&&d.status==='REALIZADO'&&d.date<=today);
 if(latest){
  const origins=context?.income_origins||[],at=Math.max(...origins.map(o=>Date.parse(o.confirmed_at)).filter(Number.isFinite)),last=origins.filter(o=>Date.parse(o.confirmed_at)===at),ids=new Set(last.flatMap(o=>o.income_ids));
  if(!ids.size)return empty('CLARIFY','Não consigo comprovar qual foi a última entrada enviada por este número. Informe a descrição, a data ou o valor.');
  candidates=candidates.filter(d=>ids.has(d.id));
  if(ids.size>1&&!selector)return empty('CLARIFY','Essa confirmação contém mais de uma entrada. Repita “cancela a entrada” com a descrição, a data e o valor.');
 }else if(!selector)return empty('CLARIFY','Qual entrada você quer cancelar? Informe a descrição, a data ou o valor.');
 if(facts.date)candidates=candidates.filter(d=>d.date===facts.date!.value);
 if(amount!==undefined)candidates=candidates.filter(d=>d.amount_cents===amount);
 if(search.length)candidates=candidates.filter(d=>{const title=words(d.description);return search.every(w=>title.includes(w));});
 if(!candidates.length)return empty('CLARIFY','Não encontrei uma entrada realizada e ativa com esses dados. Confira a descrição, a data e o valor.');
 if(candidates.length>1){const labels=candidates.slice(0,4).map(d=>d.description+' · '+d.date.split('-').reverse().join('/')+' · '+currency(d.amount_cents));return empty('CLARIFY','Qual entrada você quer cancelar? '+labels.join('; ')+'. Repita “cancela a entrada” com a descrição e o valor.');}
 const id=candidates[0].id;return {...empty('COMMAND',''),command:{action:'document_archive',target_id:id},target_excerpt:id};
}
