import {markLocalFinanceTarget} from './verified-finance-target.ts';
import {fold,literalMoney,moneyNumber} from './finance-date.ts';
import {appointmentFacts} from './appointment-language.ts';
import {currency} from './model.ts';
import type {FinanceDraft} from './finance-ai.ts';
import type {FinanceState,FinancePlan} from './finance.ts';
// Created only on the server from confirmed, signed WhatsApp creation plans.
export type IncomeOrigin={message_id:string;confirmed_at:string;income_ids:string[]};
const heading=/^(?:(?:oi|ola|por favor)[,! ]+)*(?:(?:eu )?quero (?:que voce )?)?(?:(?:voce )?(?:pode|poderia)\s+)?(?:cancela|cancelar|cancele|exclui|excluir|exclua|apaga|apagar|apague|remove|remover|remova|arquiva|arquivar|arquive|desfaz|desfazer|desfaca|tira|tirar|tire)\s+(?:(?:pra|para) mim\s+)?(?:(?:a|o|essa|esse|esta|este|aquela|aquele|minha|meu|uma|um)\s+)?(?:(?:ultima|ultimo)\s+)?(?:entrada|receita|recebimento|renda|grana|credito|comissao)\b/;
export function isIncomeArchiveRequest(text:string){return heading.test(fold(text));}
export function latestIncomeArchiveRequest(text:string){return isIncomeArchiveRequest(text)&&/\bultima (?:entrada|receita|renda|grana|comissao)\b|\bultimo (?:recebimento|credito)\b|\b(?:entrada|receita|recebimento|renda|grana|credito|comissao)\b.*\b(?:por ultimo|mais recente)\b/.test(fold(text));}
const empty=(intent:FinanceDraft['intent'],question:string):FinanceDraft=>({intent,question,query:'',command:null,confidence:'ALTA',target_excerpt:'',money_evidence:[],date_evidence:[]});
export function isIncomeArchivePlan(plan:FinancePlan){return plan.expenses.length===0&&plan.documents.length===1&&plan.documents[0].document.kind==='INCOME'&&plan.documents[0].document.active===false&&plan.documents[0].expected!==null;}
function ambiguousIncome(rows:FinanceState['documents'],hasDate:boolean,hasAmount:boolean){
 const labels=rows.slice(0,4).map(d=>'• '+d.description+' · '+d.date.split('-').reverse().join('/')+' · '+currency(d.amount_cents)),dates=new Set(rows.map(d=>d.date)),amounts=new Set(rows.map(d=>d.amount_cents)),names=new Set(rows.map(d=>fold(d.description))),tuples=new Set(rows.map(d=>JSON.stringify([fold(d.description),d.date,d.amount_cents])));
 const ask=tuples.size===1&&rows.length>1?'Essas entradas têm os mesmos dados. Abra o aplicativo e selecione a entrada que quer cancelar.':dates.size>1&&!hasDate?'Qual é a data da entrada? Repita o pedido completo, mantendo os dados já informados e acrescentando essa data.':amounts.size>1&&!hasAmount?'Qual é o valor da entrada? Repita o pedido completo, mantendo os dados já informados e acrescentando esse valor.':names.size>1?'De onde veio o dinheiro? Repita o pedido completo, mantendo a data e o valor já informados e acrescentando a descrição.':'Repita o pedido completo, mantendo a data, o valor e a descrição já informados.';
 return empty('CLARIFY',ask+'\n\n'+labels.join('\n')+(rows.length>4?'\nHá outras '+(rows.length-4)+' entradas com esses dados.':''));
}
const words=(text:string)=>fold(text).replace(/[^\p{L}\p{N}]+/gu,' ').split(/\s+/).filter(w=>w&&!['a','o','as','os','de','da','do','das','dos','na','no','minha','meu','uma','um','para','pra','pelo','pela','valor','reais','real'].includes(w));
export function incomeArchiveDraft(raw:string,state:FinanceState,today:string,context?:{income_origins?:IncomeOrigin[]}):FinanceDraft|null{
 const text=raw.replace(/\nRegistro identificado nesta conversa: [0-9a-f-]{36}$/i,''),s=fold(text);
 if(/^nao\s+/.test(s)&&heading.test(s.replace(/^nao\s+/,'')))return empty('HELP','Não cancelei nenhuma entrada.');
 const match=s.match(heading);if(!match)return null;
 const facts=appointmentFacts(text,today,false);if(!facts||facts.dateQuestion)return empty('CLARIFY',facts?.dateQuestion||'Confira a data da entrada que deseja cancelar.');

 // Interpret an omitted 'dia' only in this bounded clause with explicit money
 // and a matching saved entry. Do not guess month/year from the current date.
 const linked=s.match(new RegExp('\\bde\\s+(\\d{1,2})\\s*,\\s*a que foi\\s+(?:de\\s+)?('+moneyNumber+')[.!?]*$','iu'));
 if(linked&&!facts.date&&!latestIncomeArchiveRequest(text)&&/r\$|rea(?:l|is)\b|centavos?\b/i.test(linked[2])){
  const day=Number(linked[1]);let amount:number;try{amount=literalMoney(linked[2]);}catch{return empty('CLARIFY','Confira o valor e repita o pedido completo, mantendo a descrição e a data.');}
  const description=s.slice(match[0].length,linked.index).trim(),search=words(description);if(/\bcomissao$/.test(match[0]))search.push('comissao');
  const rows=state.documents.filter(d=>d.kind==='INCOME'&&d.active&&(d.status==='PREVISTO'||d.status==='REALIZADO'&&d.date<=today)&&Number(d.date.slice(8))===day&&d.amount_cents===amount&&search.every(w=>words(d.description).includes(w)));
  if(day<1||day>31||amount<=0||!rows.length)return empty('CLARIFY','Entendi a referência ao dia '+linked[1]+' e o valor '+currency(amount)+'. Não identifiquei uma única entrada conhecida com esses dados. Repita o pedido completo mantendo esses dados e acrescente o mês/ano e a descrição.');
  if(rows.length>1)return ambiguousIncome(rows,false,true);
  const id=rows[0].id;return markLocalFinanceTarget({...empty('COMMAND',''),command:{action:'document_archive',target_id:id},target_excerpt:id},text,state);
 }
 const latest=latestIncomeArchiveRequest(text);
 // Mask calendar/time spans before reading values: day 20 is not R$20.
 let masked=text;for(const span of [...facts.dates,...(facts.time?[facts.time]:[])].sort((a,b)=>b.start-a.start))masked=masked.slice(0,span.start)+' '.repeat(span.end-span.start)+masked.slice(span.end);
 const amounts=[...masked.matchAll(new RegExp('(?<![\\p{L}\\d])'+moneyNumber+'(?![\\p{L}\\d])','giu'))].filter(m=>!['um','uma'].includes(fold(m[0])));
 if(amounts.length>1)return empty('CLARIFY','Encontrei estes valores: '+amounts.map(m=>{try{return currency(literalMoney(m[0]));}catch{return m[0];}}).join(' e ')+(facts.date?'. A data informada é '+facts.date.value.split('-').reverse().join('/'):'')+'. Repita o pedido completo mantendo a descrição e esclareça qual é o dia e qual é o valor da entrada.');
 let amount:number|undefined;if(amounts.length){try{amount=literalMoney(amounts[0][0]);if(amount<=0)throw Error();}catch{return empty('CLARIFY','Informe o valor correto da entrada que deseja cancelar.');}masked=masked.slice(0,amounts[0].index)+' '.repeat(amounts[0][0].length)+masked.slice(amounts[0].index!+amounts[0][0].length);}
 let body=masked.slice(match[0].length).trimStart();
 const linkage=body.match(/^que (?:eu )?(teve|recebi|entrou|caiu|ganhei|vou receber|receberei)\b\s*(?:na (?:minha )?conta\b\s*)?/i);
 const qualifier=body.match(/^(prevista|previsto|agendada|agendado|recebida|recebido|realizada|realizado)\b\s*/i);
 const requiredStatus=linkage&&/recebi|entrou|caiu|ganhei/i.test(linkage[1])?'REALIZADO':linkage&&/vou receber|receberei/i.test(linkage[1])?'PREVISTO':qualifier&&/previst|agendad/i.test(qualifier[1])?'PREVISTO':qualifier?'REALIZADO':undefined;
 if(linkage)body=body.slice(linkage[0].length);if(qualifier)body=body.slice(qualifier[0].length);
 body=body.replace(/\b(?:que (?:eu )?(?:enviei|mandei|lancei|registrei|cadastrei)|por ultimo|mais recente|pelo whatsapp|no whatsapp|por favor|pra mim|para mim)\b/gi,' ').trim();
 // Relative linkage immediately before a calendar span is grammatical, while
 // the same words inside a real description remain a selector.
 if(facts.date)body=body.replace(/[.!?]+$/,'').trim().replace(/\bque (?:eu )?(?:teve|recebi|entrou|caiu|ganhei)(?:\s+(?:na minha conta|no banco))?\s*$/i,'').trim();
 body=body.replace(/\s*,\s*a que foi(?:\s+de)?\s*[.!?]*$/i,'').trim();
 const search=words(body);if(/\bcomissao$/.test(match[0]))search.push('comissao');const selector=!!facts.date||amount!==undefined||search.length>0;
 let candidates=state.documents.filter(d=>d.kind==='INCOME'&&d.active&&(d.status==='PREVISTO'||d.status==='REALIZADO'&&d.date<=today)&&(!requiredStatus||d.status===requiredStatus));
 if(latest){
  const origins=context?.income_origins||[],at=Math.max(...origins.map(o=>Date.parse(o.confirmed_at)).filter(Number.isFinite)),last=origins.filter(o=>Date.parse(o.confirmed_at)===at),ids=new Set(last.flatMap(o=>o.income_ids));
  if(!ids.size)return empty('CLARIFY','Qual entrada você quer cancelar? Diga o valor, a data ou de onde veio o dinheiro.');
  candidates=candidates.filter(d=>ids.has(d.id));
  if(ids.size>1&&!selector)return ambiguousIncome(candidates,!!facts.date,amount!==undefined);
 }else if(!selector)return empty('CLARIFY','Qual entrada você quer cancelar? Informe a descrição, a data ou o valor.');
 if(facts.date)candidates=candidates.filter(d=>d.date===facts.date!.value);
 if(amount!==undefined)candidates=candidates.filter(d=>d.amount_cents===amount);
 if(search.length){const beforeDescription=candidates;candidates=candidates.filter(d=>{const title=words(d.description);return search.every(w=>title.includes(w));});
  if(!candidates.length&&/^que\b/i.test(body)&&beforeDescription.length&&facts.date)return empty('CLARIFY','Entendi a data '+facts.date.value.split('-').reverse().join('/')+'. Diga '+(amount===undefined?'o valor ou o nome da entrada':'de onde veio o dinheiro')+' para eu localizar a certa.');
 }
 if(!candidates.length)return empty('CLARIFY','Não achei essa entrada. Confira a data ou me diga o valor e a descrição.');
 if(candidates.length>1)return ambiguousIncome(candidates,!!facts.date,amount!==undefined);
 const id=candidates[0].id;return markLocalFinanceTarget({...empty('COMMAND',''),command:{action:'document_archive',target_id:id},target_excerpt:id},text,state);
}
