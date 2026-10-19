import {fold,literalMoney,spokenNumber,monetaryLiterals} from './finance-date.ts';
import {appointmentFacts} from './appointment-language.ts';
import {personalCategory} from './personal-expenses.ts';
import {expenseContext} from './expense-context.ts';
import type {FinanceDraft} from './finance-ai.ts';
import type {FinanceCommand} from './finance.ts';

export const prefixInstructions='PROTOCOLO ENTRADA SAÍDA AGENDA — PRIORIDADE: mensagem começando com entrada registra uma nova receita REALIZADO hoje em São Paulo, seja salário recebido, venda pessoal, bico ou Uber; nunca altera salário previsto ou saldo inicial. Saída registra uma despesa REALIZADO hoje, inclusive Pix para familiar, com categoria automática e sem perguntar data. Esses dois prefixos escolhem registro imediato, sem criar recorrência. Agenda ou agendamento com valor e compra/conta prepara despesa PREVISTO no vencimento dito, mesmo se mencionar comprei. Agenda compromisso sem valor prepara compromisso, com data e horário quando informado. Resolva amanhã, dia da semana e data numérica no calendário fornecido. Pergunte só dado essencial ausente ou uma contradição real. Mostre resumo e espere confirmação; novo prefixo completo inicia novo pedido, sem herdar dados. Preserve todos os itens de uma lista com prefixos. Escopo pessoal, autenticação e confirmação continuam obrigatórios.';

export function commandPrefix(text:string){
 const match=text.normalize('NFC').trim().match(/^(entrada|sa[ií]da|agenda|agendamento)\b[\s,:;.!]*/i);
 if(!match)return null;
 const kind=fold(match[1])==='saida'?'saida':fold(match[1])==='entrada'?'entrada':'agenda',body=text.normalize('NFC').trim().slice(match[0].length);
 if(kind==='agenda'&&/^(?:(?:da|de|desta|dessa|deste|desse|para|pra)\s+)?(?:hoje|amanha|semana|esta semana|proxima semana|semana que vem|mes|este mes)[?!. ]*$/.test(fold(body)))return null;
 return {kind,body};
}
const clarify=(question:string):FinanceDraft=>({intent:'CLARIFY',command:null,question,query:'',confidence:'ALTA',target_excerpt:'',money_evidence:[],date_evidence:[]});
const clean=(s:string)=>s.replace(/\s+/g,' ').replace(/^[\s,.:;!-]*(?:(?:de|do|da|no|na|em|por|o|a)\b[\s,.:;!-]*)*/i,'').replace(/[\s,.:;!?-]+$/,'').trim();
const moneyPattern=()=>new RegExp('(?<![\\p{L}\\d])(?:R\\$\\s*)?'+spokenNumber+'(?:\\s+reais?(?:\\s+(?:e\\s+)?'+spokenNumber+'\\s+centavos?)?)?(?![\\p{L}\\d])','giu');

// Explicit communication protocol. Labels select the operation before tense or
// merchant-name heuristics. All writes still require a signed confirmation.
export function prefixedCommand(text:string,today:string):FinanceDraft|null{
 const prefix=commandPrefix(text);if(!prefix)return null;
 const body=prefix.body,source=fold(body);
 if(/^(?:(?:pix|boleto|dinheiro)\s+(?:de\s+)?)?(?:r\$\s*)?-\s*\d/.test(source))return clarify('Informe um valor em reais maior que zero.');
 if(/[;\n]/.test(body)||/\be\s+(?:entrada|sa[ií]da|agenda|agendamento|marca|marque|agende|anota|lanca|registra)\b/i.test(body))return null; // Full list interpreter preserves every item.
 if(/^(?:nao (?:registre|registra|lance|lanca|salve|salva|agende|agenda)|cancelar|cancela)\b/.test(source))return {...clarify('Nenhuma alteração foi preparada.'),intent:'HELP'};
 const facts=prefix.kind==='agenda'?appointmentFacts(body,today):null;
 let masked=body;
 const dateFacts=facts||(prefix.kind!=='agenda'?appointmentFacts(body,today):null);
 if(dateFacts)for(const span of [...dateFacts.dates,...(dateFacts.time?[dateFacts.time]:[])].sort((a,b)=>b.start-a.start))masked=masked.slice(0,span.start)+' '.repeat(span.end-span.start)+masked.slice(span.end);
 const explicitEvent=prefix.kind==='agenda'&&/^(?:um |uma |o |a )?(?:compromisso|evento|reuniao|consulta|dentista|aniversario|culto)\b/.test(source);
 const atStart=masked.match(new RegExp('^\\s*(?:(?:pix|no pix|boleto|dinheiro|cart[aã]o|transfer[eê]ncia)\\s+(?:de\\s+)?)?((?:R\\$\\s*)?'+spokenNumber+'(?:\\s+reais?(?:\\s+(?:e\\s+)?'+spokenNumber+'\\s+centavos?)?)?)','iu'));
 const isFinancial=prefix.kind!=='agenda'||!explicitEvent&&(!!atStart||monetaryLiterals(masked).length>0||/\b(?:pagar|pagamento|parcela|prestacao|boleto)\b/.test(source));
 if(prefix.kind==='agenda'&&!facts)return clarify('Qual é a data correta? Confira as datas e os horários informados.');
 if(!isFinancial){
  if(!facts?.date)return clarify('Em qual data será o compromisso?');
  const description=clean(facts.description.replace(/^(?:um |uma |o |a )?(?:compromisso|evento)\s+/i,''));
  if(!description)return clarify('Qual é o compromisso?');
  if(description.length>160)return null;
  return {...clarify(''),intent:'COMMAND',command:{action:'appointment_upsert',description,date:facts.date.value,...(facts.time?{time:facts.time.value}:{})},date_evidence:[{field:'date',excerpt:facts.date.excerpt}]};
 }
 const amounts=[...masked.matchAll(moneyPattern())].filter(m=>!['um','uma'].includes(fold(m[0]))||/reais?/.test(fold(m[0])));
 if(!amounts.length)return clarify('Qual é o valor em reais?');
 if(amounts.length!==1)return null;
 const amount=amounts[0];let cents:number;try{cents=literalMoney(amount[0]);}catch{return null;}
 if(cents<=0||cents>1000000000)return clarify('Informe um valor em reais maior que zero e de até dez milhões.');
 if(prefix.kind==='agenda'&&!facts?.date)return clarify('Qual é a data de vencimento?');
 // Series and mixed gain/cost remain with the full interpreter, not a single write.
 if(/\b(?:e gastei|e ganhei|e recebi)\b/.test(source)||prefix.kind==='agenda'&&/\b(?:todo|toda|mensal|recorrente|vezes|parcelas)\b/.test(source))return null;
 let description=clean(masked.slice(0,amount.index)+masked.slice(amount.index!+amount[0].length));
 description=clean(description.replace(/^(?:(?:pix|no pix|boleto|dinheiro|cart[aã]o|transfer[eê]ncia)(?:\s+de)?\s*)/i,''));
 if(!description)description=prefix.kind==='entrada'?'Entrada recebida':prefix.kind==='agenda'?'Conta a pagar':'Despesa pessoal';
 if(description.length>160)return null;
 const category=personalCategory('',description),method=/\bpix\b/.test(source)?'PIX':/\bboleto\b/.test(source)?'BOLETO':/\bdinheiro\b/.test(source)?'DINHEIRO':/\b(?:cartao|credito|debito)\b/.test(source)?'CARTAO':/\btransferencia\b/.test(source)?'TRANSFERENCIA':'OUTRO';
 const command:FinanceCommand=prefix.kind==='entrada'?{action:'income_upsert',description,amount_cents:cents,date:today,status:'REALIZADO',salary:/\bsalario\b/.test(source)}:{action:'expense_create',description,amount_cents:cents,date:prefix.kind==='agenda'?facts!.date!.value:today,status:prefix.kind==='agenda'?'PREVISTO':'REALIZADO',category,details:{...expenseContext(text,category),payment_method:method}};
 return {...clarify(''),intent:'COMMAND',command,money_evidence:[{field:'amount_cents',excerpt:amount[0]}],date_evidence:prefix.kind==='agenda'?[{field:'date',excerpt:facts!.date!.excerpt}]:[]};
}

export function continuedPrefixedCommand(previous:string,current:string,today:string){
 if(!commandPrefix(previous)||commandPrefix(current)||prefixedCommand(previous,today)?.intent!=='CLARIFY')return null;
 const source=previous+' '+current,draft=prefixedCommand(source,today);
 return draft?.intent==='COMMAND'?{source,draft}:null;
}
