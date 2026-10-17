import {fold,literalMoney,spokenNumber} from './finance-date.ts';
import {appointmentFacts} from './appointment-language.ts';
import {personalCategory} from './personal-expenses.ts';
import type {FinanceDraft} from './finance-ai.ts';
import type {FinanceCommand,FinanceState} from './finance.ts';

const reply=(question:string):FinanceDraft=>({intent:'CLARIFY',question,query:'',command:null,confidence:'ALTA',target_excerpt:'',money_evidence:[],date_evidence:[]});
const command=(c:FinanceCommand,amount?:string,date?:string):FinanceDraft=>({...reply(''),intent:'COMMAND',command:c,money_evidence:amount?[{field:'amount_cents',excerpt:amount}]:[],date_evidence:date?[{field:'date',excerpt:date}]:[]});
const futureOut=/\b(?:(?:vou|irei|preciso|devo|tenho que|tenho de)\s+(?:pagar|gastar|quitar)|pagarei|a pagar|vai vencer|vence|vencimento)\b/;
const futureIn=/\b(?:(?:vou|irei|tenho que|tenho a)\s+receber|receberei|a receber|(?:vai|ira)\s+me\s+pagar|me\s+(?:pagara|vai pagar))\b/;
const paid=/\b(?:paguei|gastei|comprei|quitei)\b/;
const received=/\b(?:recebi|ganhei|entrou|caiu|vendi|tive)\b|\bme\s+(?:pagou|pagaram)\b/;
const outgoing=/\b(?:paguei|gastei|comprei|quitei|quitar|pagar|pagarei|parcela|prestacao|boleto|aluguel|mensalidade|conserto)\b/;
const incoming=/\b(?:recebi|ganhei|recebo|receber|receberei|vendi|entrou|caiu|lucro)\b|\bme\s+(?:pagou|pagaram|paga|pagara|vai pagar)\b|\b(?:vai|ira)\s+me\s+pagar\b/;
export function statedFinancialStatus(text:string){const s=fold(text);return futureOut.test(s)||futureIn.test(s)?'PREVISTO' as const:paid.test(s)||received.test(s)?'REALIZADO' as const:undefined;}

// A conservative literal path, alongside (not in place of) the semantic model.
// Dates, money, grammatical roles and tense must agree. Unknown constructions
// return null to the existing single structured interpretation, never a guess.
export function financialMessageDraft(text:string,state:FinanceState,today:string):FinanceDraft|null {
 const s=fold(text);
 const sale=text.match(/^(comprei\b.+?)\s+e\s+(vendi\b.+)$/i);
 if(sale){const parts=[financialMessageDraft(sale[1],state,today),financialMessageDraft(sale[2],state,today)];if(parts.every(p=>p?.intent==='COMMAND'&&!(p.command as FinanceCommand)?.target_id))return {...reply(''),intent:'COMMAND',items:parts.map((p,i)=>({source:sale[i+1],command:p!.command as FinanceCommand,target_excerpt:'',money_evidence:p!.money_evidence,date_evidence:p!.date_evidence}))};return null;}
 if(text.length>700||/[;\n?]/.test(s)||/\b(?:nao|se|talvez|hipotese|exemplo|como|quanto|qual|corrig[ea]|corrija|alter[ae]|edit[ae]|cancel[ae]|arquiv[ae]|reserva|poupanca|aporte|resgate|todo|toda|mensal|recorrente|vezes|parcelas|viagem|ferias|familia|esposa|marido|filhos?|uber|motorista|garcom|pedreiro|bico|atividade|pix|dinheiro|cartao|credito|debito|transferencia|algum|alguma|alguns|algumas)\b/.test(s)||/\b(?:quero saber|me diga|me informa|saber se|sera que)\b/.test(s))return null;
 const isIn=incoming.test(s),isOut=outgoing.test(s.replace(/\b(?:(?:vai|ira)\s+me\s+pagar|me\s+(?:pagou|pagaram|paga|pagara|vai pagar))\b/g,''));
 if(!isIn&&!isOut||isIn&&isOut)return null;
 if(/\b(?:reembolso|estorno|emprestimo|limite|transferencia)\b/.test(s))return null;
 const future=(isIn?futureIn:futureOut).test(s),past=(isIn?received:paid).test(s);
 const facts=appointmentFacts(text,today,past&&!future?'past':true);
 if(!facts)return reply('Qual é a data correta? Encontrei datas ou horários diferentes ou inválidos.');
 if(facts.time)return null; // Mixed financial/event messages retain both via the model.
 let masked=text.normalize('NFC');
 for(const date of facts.dates.slice().sort((a,b)=>b.start-a.start))masked=masked.slice(0,date.start)+' '.repeat(date.end-date.start)+masked.slice(date.end);
 const pattern=new RegExp('(?<![\\p{L}\\d])(?:R\\$\\s*)?'+spokenNumber+'(?:\\s+reais?(?:\\s+(?:e\\s+)?'+spokenNumber+'\\s+centavos?)?)?(?![\\p{L}\\d])','giu');
 const amounts=[...masked.matchAll(pattern)].filter(m=>!['um','uma'].includes(fold(m[0]))).map(m=>({start:m.index!,end:m.index!+m[0].length,excerpt:m[0],amount:literalMoney(m[0])}));
 if(!amounts.length)return reply('Qual foi o valor?');
 if(new Set(amounts.map(m=>m.amount)).size>1)return reply('Qual é o valor correto para este lançamento?');
 const amount=amounts[0];if(amount.amount<=0||amount.amount>1000000000)return reply('Qual é o valor em reais, maior que zero?');
 let description=masked;
 for(const span of amounts.slice().reverse())description=description.slice(0,span.start)+' '.repeat(span.end-span.start)+description.slice(span.end);
 description=description.replace(/\b(?:(?:eu\s+)?(?:vou|irei|preciso|devo|tenho que|tenho de)\s+(?:pagar|gastar|quitar|receber)|(?:vai|irá|ira)\s+me\s+pagar|me\s+(?:pagou|pagaram|paga|pagará|pagara|vai pagar)|paguei|gastei|comprei|quitei|recebi|ganhei|recebo|receberei|pagarei|vendi|entrou|caiu|tive)\b/gi,' ')
  .replace(/^(?:(?:por favor|anota|anote|lança|lanca|lance|registra|registre|agenda|agende|pra mim|para mim|agora|eu)\b[, ]*)+/i,'')
  .replace(/\b(?:por favor|aqui|agora|já|ja)\b/gi,' ').replace(/\s+/g,' ').replace(/^[\s,.:;-]*(?:(?:de|do|da|no|na|em|por|o|a|um|uma)\b[\s,.:;-]*)*/i,'').replace(/[\s,.:;!-]+$/,'').trim();
 description=description.replace(/(?:^|\s)é\s+de\b|\bo\s+valor\s+(?:é\s+)?de\b/gi,' ').replace(/\s+/g,' ').trim();
 if(!description)description=isIn?'Entrada recebida':'Despesa pessoal';
 if(description.length>160||/\b(?:e|mas|tambem|depois|antes|outro|outra|registrad[oa]|anotad[oa])\b/.test(fold(description)))return null;
 if(/\blucro\b/.test(s))description='Lucro informado · '+description;
 if(/\bultima parcela\b/.test(s)&&!/\bultima parcela\b/.test(fold(description)))description='Última parcela · '+description;
 const planned=future||!past&&!!facts.date&&facts.date.value>today||!past&&/\b(?:parcela|prestacao|boleto)\b/.test(s);
 if(planned&&!facts.date)return reply('Qual é a data prevista?');
 const date=facts.date?.value||today;
 if(past&&!future&&date>today)return reply('Esse valor já foi pago ou recebido, ou é uma previsão para essa data?');
 if(!facts.date&&/\b(?:dia|mes que vem|proximo mes|semana passada|mes passado)\b/.test(s))return reply('Qual é a data do lançamento?');
 const c:FinanceCommand={action:isIn?'income_upsert':'expense_create',description:description[0].toLocaleUpperCase('pt-BR')+description.slice(1),amount_cents:amount.amount,date,status:planned?'PREVISTO':'REALIZADO',...(isIn?{}:{category:personalCategory('',description)})};
 // Match a literal, uniquely identified existing obligation before creating
 // a receipt. Similar amounts alone never collapse two legitimate purchases.
 if(past&&!planned){
  const words=fold(description).replace(/\b(?:ultima|parcela|minha|meu|do|da|de|o|a)\b/g,' ').split(/\s+/).filter(w=>w.length>2);
  const rows=isIn?state.documents.filter(r=>r.kind==='INCOME'&&r.active&&r.status==='PREVISTO'):state.expenses.filter(r=>r.active&&r.status==='PREVISTO');
  const matches=rows.filter(r=>r.amount_cents===amount.amount&&words.length&&words.every(w=>fold(r.description).includes(w)));
  if(matches.length>1)return reply('Qual registro você quer dar como pago ou recebido? Informe a descrição e o vencimento.');
  if(matches.length===1)return {...command({action:isIn?'income_receive':'expense_pay',target_id:matches[0].id,...(facts.date?{date}:{})},undefined,facts.date?.excerpt),target_excerpt:matches[0].id};
 }
 return command(c,amount.excerpt,facts.date?.excerpt);
}

export function continuedFinancialMessage(previous:string,current:string,state:FinanceState,today:string){
 if(financialMessageDraft(previous,state,today)?.question!=='Qual foi o valor?')return null;
 const value=current.trim().replace(/^(?:(?:o valor (?:certo )?(?:e|é)|foi|é|e)\s+)*/i,'').replace(/[.!]+$/,'');
 try{if(literalMoney(value)<=0)return null;}catch{return null;}
 const source=previous+' '+value,draft=financialMessageDraft(source,state,today);
 return draft?.intent==='COMMAND'?{source,draft}:null;
}
