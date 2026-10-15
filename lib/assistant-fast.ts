import {fold,literalMoney,monetaryLiterals,financeDate} from './finance-date.ts';
import {personalCategory} from './personal-expenses.ts';
import type {FinanceDraft} from './finance-ai.ts';
import {naturalAppointmentDraft,appointmentFacts} from './appointment-language.ts';

// Complete single appointments use literal date/time evidence in natural order.
// Edits, ambiguous times and combined requests retain the full interpreter.
export function quickAppointmentDraft(text:string,today:string):FinanceDraft|null{if(!appointmentFacts(text,today))return null;return legacyAppointmentDraft(text,today)||naturalAppointmentDraft(text,today);}
function legacyAppointmentDraft(text:string,today:string):FinanceDraft|null{
 const original=text.normalize('NFC').trim(),source=fold(original).replace(/[, ]*por favor[.! ]*$/,'');
 if(source.length>400||/[?\n]|\b(?:empresas?|lojas?|clientes?|contratos?|estoque|juridico|cnpj|pagar|pagamento|reais|recorr\w*|mensal|todo|toda|semanal|alter\w*|edit\w*|corrig\w*|cancel\w*|arquiv\w*|nao)\b/.test(source))return null;
 const m=source.match(/^(?:por favor[, ]+)?(?:agenda|agende|agendar|marca|marque|me lembra|me lembre)(?:\s+(?:pra mim|para mim|ai))?[, ]+(?:eu tenho\s+)?(?:(?:um|uma|o|a|do|da)\s+)?(.+?)\s+(?:no |na |para |em )?((?:dia .+?)|(?:\d{1,4}[/-].+?)|(?:amanha|hoje|depois de amanha)|(?:(?:proxima |proximo |nesta |neste |essa |esse )?(?:segunda|terca|quarta|quinta|sexta|sabado|domingo)(?:-feira)?))\s+as\s+(\d{1,2})(?:(?::|h)(\d{2}))?(?:\s*(?:h|horas?))?[.! ]*$/d);
 if(!m||!m.indices||m[1].length<2||m[1].length>160||/\be\b|\d|\b(?:depois|antes|tambem|outro|outra)\b/.test(m[1]))return null;
 const hour=Number(m[3]),minute=Number(m[4]||0);if(hour>23||minute>59)return null;
 let date:string;try{date=financeDate(m[2],today,true);}catch{return null;}
 const description=original.slice(m.indices[1][0],m.indices[1][1]),time=String(hour).padStart(2,'0')+':'+String(minute).padStart(2,'0');
 return {intent:'COMMAND',command:{action:'appointment_upsert',description,date,time},confidence:'ALTA',question:'',target_excerpt:'',query:'',money_evidence:[],date_evidence:[{field:'date',excerpt:m[2]}]};
}

// Only complete, single, explicitly paid expenses use this local path.
// Scheduling, edits, business scope, income activities and multiple amounts
// continue through the full interpreter and its existing validation.
export function quickExpenseDraft(text:string,today:string):FinanceDraft|null{
 const source=fold(text).replace(/\?[.! ]*$/,'');if(source.length>250||/\b(?:empresa|loja|cliente|contrato|estoque|juridico|cnpj|uber|motorista|bico|trabalh\w*|renda|ganhei|recebi|futuro|amanha|pagar|parcel\w*|mensal|mes|recorren\w*|fix[oa]|agenda\w*|edit\w*|corrig\w*|alter\w*|arquiv\w*|cancel\w*|viagem|ferias|desfaz|nao|se|sera|quanto|como|qual|voce|esposa|marido|filh\w*|familia|essencial|opcional)\b|[?\n]|\d{1,4}[/-]\d{1,2}/.test(source))return null;
 const money=monetaryLiterals(text);if(money.length!==1)return null;
 const amount=literalMoney(money[0]);if(amount<=0||amount>1000000000)return null;
 const match=source.match(/^(?:(?:ola|oi|por favor)[,! ]+)?(?:(?:anota|anote|lanca|lance|registra|registre)(?: ai| pra mim| para mim)?[, ]+)?(?:(hoje|ontem|anteontem)[, ]+)?(?:eu )?(?:(?:acabei de )?(?:gastar|gastei|pagar|paguei|comprar|comprei)|(?:anota|anote|lanca|lance|registra|registre)(?: ai| pra mim| para mim)?)\s+(.+)$/);
 if(!match)return null;
 let rest=match[2];if(!rest.startsWith(money[0]))return null;
 rest=rest.slice(money[0].length).trim();let day=match[1]||'';
 const tailDate=rest.match(/\b(hoje|ontem|anteontem)[.! ]*$/);if(tailDate){if(day&&day!==tailDate[1])return null;day=tailDate[1];rest=rest.slice(0,tailDate.index).trim();}
 rest=rest.replace(/(?:[, ]*(?:por favor|anota(?: pra mim)?|lanca(?: pra mim)?))[.! ]*$/,'').replace(/^(?:de|com|em|no|na|num|numa)\s+/,'').replace(/[.! ]+$/,'').trim();
 if(/\b(?:e|mas|tambem|depois|antes|dois|duas|tres|quatro|cinco|pix|dinheiro|cartao|credito|debito|boleto|transferencia|observacao|nota|categoria|segunda|terca|quarta|quinta|sexta|sabado|domingo|seman\w*|dia\w*|meses|anual|anualmente|recorr\w*|repet\w*|passad[oa]|ultim[oa]|janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro|mei|pj)\b/.test(rest)||/\d/.test(rest)||rest.length>100||rest&&!/^[a-z][a-z /-]*$/.test(rest))return null;
 const description=rest?rest[0].toUpperCase()+rest.slice(1):'Despesa pessoal',category=personalCategory('',description);
 return {intent:'COMMAND',command:{action:'expense_create',description,category,amount_cents:amount,status:'REALIZADO',...(day?{date:financeDate(day,today)}:{})},confidence:'ALTA',question:'',target_excerpt:'',query:'',money_evidence:[{field:'amount_cents',excerpt:money[0]}],date_evidence:day?[{field:'date',excerpt:day}]:[]};
}

export function quickPlannedExpenseDraft(text:string,today:string):FinanceDraft|null{
 const original=text.normalize('NFC').trim(),source=fold(original);if(source.length>500||/[\n]|\b(?:todo|toda|cada|mensal|recorr\w*|fix[oa]|parcel\w*|vezes|empresa|loja propria|estoque|clientes|contratos|cnpj|edit\w*|alter\w*|corrig\w*|cancel\w*|quanto|qual|nao)\b/.test(source))return null;
 const m=source.match(/^(?:por favor[, ]+)?(?:vou pagar|tenho que pagar|agenda|agende|lanca|lance|registra|registre)(?:\s+(?:pra mim|para mim|ai))?[, ]+(.+?)\s+((?:dia .+?)|(?:\d{1,4}[/-]\d{1,2}(?:[/-]\d{2,4})?)|(?:amanha|hoje|depois de amanha))(?:(?:[, ]+)(?:lanca|anota|agenda)[^\n]*)?[.!? ]*$/d);if(!m||!m.indices)return null;
 const amounts=monetaryLiterals(m[1]);if(amounts.length!==1)return null;let rest=m[1].replace(/^(?:um pagamento de|uma conta de|uma despesa de)\s+/,'');if(!rest.startsWith(amounts[0]))return null;rest=rest.slice(amounts[0].length).replace(/^\s*(?:de|do|da|com|em|no|na)\s+/,'').trim();if(rest.length<2||rest.length>120||/\d|\be\b/.test(rest))return null;
 let date:string;try{date=financeDate(m[2],today,true);}catch{return null;}const description=rest[0].toUpperCase()+rest.slice(1);
 return {intent:'COMMAND',command:{action:'expense_create',description,date,amount_cents:literalMoney(amounts[0]),category:personalCategory('',description),status:'PREVISTO'},confidence:'ALTA',question:'',query:'',target_excerpt:'',money_evidence:[{field:'amount_cents',excerpt:amounts[0]}],date_evidence:[{field:'date',excerpt:m[2]}]};
}

// Realtime receives just the answer for a read, rather than reprocessing every
// total and calculation. The server still reads fresh, complete owner data.
export function compactVoiceResult(data:unknown){
 if(!data||typeof data!=='object')return data;
 const b=data as Record<string,unknown>;
 if(b.ok===true&&typeof b.answer==='string')return {ok:true,saved:false,answer:b.answer,...(b.topic?{topic:b.topic}:{}),...(b.period?{period:b.period}:{})};
 return data;
}
