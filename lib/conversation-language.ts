import {fold,literalMoney,financeDate,spokenNumber,moneyNumber} from './finance-date.ts';
import {personalCategory} from './personal-expenses.ts';
import {appointmentFacts} from './appointment-language.ts';
import {recurringDay} from './monthly-bills.ts';
import {currentBalanceDraft} from './balance-language.ts';
import {financialMessageDraft} from './financial-message.ts';
import {prefixedCommand,commandPrefix} from './command-prefix.ts';
import type {FinanceCommand,FinanceState,FinancePlan} from './finance.ts';
import type {FinanceDraft} from './finance-ai.ts';

// This layer extracts literal entities and resolves existing records. Unusual
// language still goes to the structured interpreter; no model decides ownership.
export {spokenNumber} from './finance-date.ts';
const amountPattern=new RegExp('^'+moneyNumber+'\\b','i');
function amountAtStart(text:string){const m=text.match(amountPattern);if(!m)return null;try{const amount=literalMoney(m[0]);if(amount<=0||amount>1000000000)return null;return {value:amount,excerpt:m[0],rest:text.slice(m[0].length).trim()};}catch{return null;}}
export function financialAmountFragments(text:string){const pattern=new RegExp('(?:^|[,;\\n]|\\be\\b)\\s*(?:(?:anota|anote|lanca|lança|lance|gastei|registra|registre)\\s+)?(?:r\\$\\s*)?'+spokenNumber+'(?:\\s+reais?)?\\s+(?:de|do|da|com|no|na)\\s+(?!(?:janeiro|fevereiro|marco|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\\b)[a-zá-ú]+','gi');return [...text.matchAll(pattern)].map(m=>m[0]);}
export function normalizeAssistantText(text:string){
 let value=text.normalize('NFC').trim().replace(/\b(hj|qto|qts|vc|agnda|sldo|boelto)\b/gi,w=>({hj:'hoje',qto:'quanto',qts:'quantos',vc:'você',agnda:'agenda',sldo:'saldo',boelto:'boleto'}[w.toLowerCase()]||w));
 // ASR can put a space after the decimal comma. Join only two decimal digits
 // immediately followed by the explicit currency unit, not arbitrary lists.
 value=value.replace(/(\d),[ \t]+(\d{2})(?=\s+reais?\b)/gi,'$1,$2');
 value=value.replace(/\bacabei de (ganhar|receber|gastar)\b/gi,(_all,verb:string)=>({ganhar:'ganhei',receber:'recebi',gastar:'gastei'}[verb.toLowerCase()]||verb));
 // Resolve only an explicit, adjacent self-correction. Conflicting facts without
 // a correction marker remain ambiguous and cannot create a write.
 const correction=new RegExp('('+spokenNumber+')(?:\\s+reais?)?\\s*,\\s*(?:não|nao|quer dizer|corrigindo|melhor)\\s*,?\\s*('+spokenNumber+')','gi');
 value=value.replace(correction,(_all,_old,current)=>current);
 value=value.replace(/(?:às|as)\s+([^,;]+?)\s*,\s*(?:quer dizer|melhor|corrigindo)\s*,?\s*(?:às|as)\s+([^.;]+)/gi,(_all,_old,current)=>'às '+current);
 return value;
}
const empty=(intent:FinanceDraft['intent'],question='',query=''):FinanceDraft=>({intent,question,query,command:null,confidence:'ALTA',target_excerpt:'',money_evidence:[],date_evidence:[]});
export const languageQuery=(query:Record<string,unknown>)=>empty('QUERY','',JSON.stringify(query));
export function informationOnlyMessage(text:string){const s=fold(text);if(/^(?:qual|quais|quanto|quantos|quantas|como|onde|o que)\b/.test(s))return true;return s.endsWith('?')&&/^(?:eu tenho|tenho|tem|existe|ja paguei|ja recebi|sera que)\b/.test(s)&&!/\b(?:agenda|agende|anota|anote|lanca|lance|registra|registre|marca|marque|cadastre)\b/.test(s);}
export function languageCommand(command:FinanceCommand,money:{field:string;excerpt:string}[]=[],dates:{field:string;excerpt:string}[]=[],target=''):FinanceDraft{return {...empty('COMMAND'),command,money_evidence:money,date_evidence:dates,target_excerpt:target};}
export function languageGuard(text:string):FinanceDraft|null{
 const s=fold(text),prefix=commandPrefix(text),immediate=prefix?.kind==='entrada'||prefix?.kind==='saida';
 if(/\b(?:se eu|se a gente|suponha|supondo|por exemplo|e so um exemplo|estou simulando|acho que vou|talvez eu)\b/.test(s)||/^(?:eu )?nao (?:paguei|gastei|recebi|agenda|agende|anota|anote|lanca|lance|registre)\b/.test(s)){
  const simulation=s.match(/^(?:se eu|suponha que eu) gastar\s+(.+?)(?:[, ]+)(?:quanto|o que) sobra/);const amount=simulation&&amountAtStart(simulation[1]);
  if(amount&&!amount.rest)return languageQuery({report:'simulation',amount_cents:amount.value});
  return empty('HELP',/^nao paguei/.test(s)?'O pagamento não foi registrado. A conta continua pendente se já estiver cadastrada.':'Não fiz alterações. Para registrar, envie um pedido direto com os dados reais.');
 }
 if(/\b(?:transferi|transfere|transferir)\b/.test(s)&&/\b(?:outra conta|entre (?:as |minhas )?contas|de uma conta|da minha conta.*outra)/.test(s))return empty('HELP','O Anotei ainda não separa várias contas bancárias nem registra transferências entre elas. Não registrei como receita ou despesa. Aportes e resgates de reservas têm uma função própria.');
 if(!immediate&&/\b(?:fatura|limite do cartao|limite de cartao|devo no cartao)\b/.test(s))return empty('HELP','O Anotei registra a forma de pagamento Cartão, mas ainda não controla faturas e limites bancários. Não vou calcular uma fatura sem esses dados.');
 if(!immediate&&/\b(?:quinzenal|quinze em quinze|primeiro dia util|ultimo dia util|toda segunda|toda terca|toda quarta|toda quinta|toda sexta|todo sabado|todo domingo|me avisa uma hora antes|viagem e de \d+ a \d+)\b/.test(s))return empty('HELP','Essa repetição ou configuração de lembrete ainda não está disponível. Posso registrar datas individuais. Contas mensais repetem no dia informado; compromissos com horário usam os lembretes de 24 horas e 5 horas.');
 if(/^cancela (?:todas|todos)(?: as| os)? proxim/.test(s))return empty('CLARIFY','De qual conta recorrente você quer cancelar os próximos vencimentos? Informe o nome. Vou mostrar o alcance antes de confirmar.');
 return null;
}
function targetWords(value:string){return fold(value).replace(/\b(?:o|a|os|as|meu|minha|da|do|de|na|no|essa|esse|esta|este|eu|ja|parcela|conta|pagamento|compromisso|reais|hoje|ontem|paguei|recebi|pago|pagar|receber|foi|esta|um|uma)\b/g,' ').replace(/[^a-z0-9 ]/g,' ').split(/\s+/).filter(Boolean);}
function matches(name:string,request:string){const words=targetWords(request),candidate=fold(name);return words.length>0&&words.every(word=>candidate.includes(word));}
function choose<T extends {description:string}>(rows:T[],text:string){return rows.filter(row=>matches(row.description,text));}
const options=(rows:{description:string;date?:string;entry_date?:string}[])=>rows.slice(0,4).map(r=>r.description+' · '+(r.date||r.entry_date||'').split('-').reverse().join('/')).join('; ');
export type NaturalContext={query?:string;focus?:FinancePlan};
export function naturalReadQuery(text:string,today:string):string|null{
 const s=fold(text),query=(raw:Record<string,unknown>)=>JSON.stringify(raw);
 const paidSearch=s.match(/^quanto (?:eu )?paguei (?:de|do|da|com|no|na) (.+?)[?!. ]*$/);
 if(paidSearch&&!/\b(?:e|ontem|hoje|amanha|semana|ano|entre|desde|ate)\b|\d|,/.test(paidSearch[1])){
  const search=paidSearch[1].replace(/\s+(?:neste mes|este mes|esse mes|n[eo] mes atual|mes atual|no mes passado|mes passado|no mes anterior|mes anterior)$/,'').trim();
  if(search)return query({period:/mes passado|mes anterior/.test(s)?'mes_anterior':/mes atual|neste mes|este mes|esse mes/.test(s)?'mes_atual':'total',search,status:'REALIZADO'});
 }
 if(/^(?:quanto (?:eu )?tenho|quanto tem nas minhas contas|quanto tenho disponivel)[?!. ]*$/.test(s))return query({topic:'saldo'});
 if(/^quanto (?:eu )?tenho guardado[?!. ]*$/.test(s))return query({topic:'reservas'});
 if(/^quanto (?:sobra|fica).*contas.*mes/.test(s)||/^quanto (?:eu )?posso gastar/.test(s))return query({report:'available'});
 if(/^quanto (?:ainda )?(?:falta|tenho (?:que|para|pra)) pagar(?: (?:este mes|esse mes|neste mes|hoje|amanha))?[?!. ]*$/.test(s))return query({topic:'pagamentos',period:/amanha/.test(s)?'amanha':/\bhoje\b/.test(s)?'hoje':'mes_atual'});
 if(/^quanto (?:ainda )?(?:eu )?tenho (?:para|pra|a) receber/.test(s))return query({topic:'receber',period:'total'});
 if(/^(?:o que (?:vence|preciso pagar)|tem boletos? (?:pra|para)|tenho boletos? (?:pra|para)) (?:hoje|amanha)[?!. ]*$/.test(s))return query({topic:'pagamentos',period:/amanha/.test(s)?'amanha':'hoje'});
 if(/^qual(?: e)? (?:a |o )?(?:proxima conta(?: que vence)?|proximo vencimento)[?!. ]*$/.test(s))return query({report:'next_bill'});
 const installment=s.match(/^(?:quantas? parcelas? (?:do|da|de) (.+?) (?:faltam|restam)|quanto falta pagar (?:do|da) (.+?))[?!. ]*$/);if(installment)return query({report:'installments',search:(installment[1]||installment[2]).replace(/[?!.]+$/,'')});
 if(/gastei mais|compar[ae].*gastos/.test(s)&&/mes passado|mes anterior/.test(s)&&/este mes|mes atual|esse mes/.test(s)){const category=personalCategory('',text);return query({report:'comparison',...(category==='Outras despesas pessoais'?{}:{category})});}
 const calendar=/^(?:o que (?:eu )?tenho|como esta (?:o )?meu dia|tenho algo|estou livre|to livre|tenho compromisso)/.test(s);
 if(calendar&&!/\b(?:pagar|receber|saldo|contas|renda)\b/.test(s)){
  const fact=appointmentFacts(text,today)?.date;if(!fact)return null;
  return /\b(?:livre|manha|tarde|noite)\b/.test(s)?query({report:'agenda_window',date:fact.value,part:/\bmanha\b/.test(s)?'MANHA':/\btarde\b/.test(s)?'TARDE':/\bnoite\b/.test(s)?'NOITE':'DIA'}):query({topic:'agenda',period:'personalizado',from:fact.value,to:fact.value});
 }
 return null;
}
export function naturalFinanceTurn(text:string,state:FinanceState,today:string,context:NaturalContext={}):FinanceDraft|null{
 const s=fold(text),guard=languageGuard(text);if(guard)return guard;
 const prefixed=prefixedCommand(text,today);if(prefixed)return prefixed;
 const balance=currentBalanceDraft(text);if(balance)return balance;
 if(/[;\n]/.test(text)||financialAmountFragments(text).length>1||/\be\s+(?:tambem\s+)?(?:marca|marque|agende|anota|lanca|lança|registra|pago|pagar|paguei)\b/.test(s))return null;
 const read=naturalReadQuery(text,today);if(read)return {...empty('QUERY'),query:read};
 if(context.query&&/^(?:e\s+)?(?:no |na |do |da |o |a )?(?:mes passado|passado|mes anterior|mes atual|este mes|hoje|amanha|esta semana)[?!. ]*$/.test(s)){
  const raw=JSON.parse(context.query),period=/passado|anterior/.test(s)?'mes_anterior':/semana/.test(s)?'semana_atual':/amanha/.test(s)?'amanha':/hoje/.test(s)?'hoje':'mes_atual';delete raw.from;delete raw.to;raw.period=period;return languageQuery(raw);
 }
 const finite=s.match(new RegExp('(?:em|por)\\s+('+spokenNumber+')\\s+(?:vezes|parcelas)\\b'));
 if(finite&&/^(?:comprei|compra|anota|lanca|registra|agenda)\b/.test(s)){
  const count=literalMoney(finite[1])/100,per=s.match(new RegExp('(?:vezes|parcelas)\\s+de\\s+('+spokenNumber+')')),total=s.match(new RegExp('(?:por|valor de|total de)\\s+('+spokenNumber+')\\s+(?:reais?\\s+)?em\\s+'));
  if(!Number.isInteger(count)||count<2||count>60)return empty('CLARIFY','Informe uma quantidade de 2 a 60 parcelas.');
  if(!per&&!total)return empty('CLARIFY','Qual é o valor total da compra ou o valor de cada parcela?');
  const facts=appointmentFacts(text,today);if(!facts?.date)return empty('CLARIFY','Qual é o primeiro vencimento das parcelas?');
  const amount=per||total,description=text.replace(/^(?:comprei|compra|anota|lanca|registra|agenda)\s+/i,'').split(/\s+(?:por|em|valor de|total de)\s+/i)[0];
  return languageCommand({action:'expense_schedule',description:description===text||/^(?:em|por)\b/.test(description)?'Compra parcelada':description,date:facts.date.value,amount_cents:literalMoney(amount![1]),schedule_type:'PARCELAS',count,amount_mode:per?'PARCELA':'TOTAL'},[{field:'amount_cents',excerpt:amount![1]},{field:'count',excerpt:finite[1]}],[{field:'date',excerpt:facts.date.excerpt}]);
 }
 if(/\b(?:todo dia|todo mes|mensal)\b/.test(s)&&/\b(?:carro|aluguel|conta|pago|pagar|parcela)\b/.test(s)){
  const day=recurringDay(text);if(!day&&/\d|mil|reais/.test(s))return empty('CLARIFY','Em qual dia do mês essa conta vence?');
  const rest=day?s.replace(fold(day.excerpt),''):s;
  if(day&&!new RegExp('\\d|mil|reais|cento|duzentos|quinhentos').test(rest))return empty('CLARIFY','Qual é o valor mensal dessa conta?');
 }
 if(/^ja paguei\b/.test(s)&&s.endsWith('?'))return languageQuery({report:'payment_status',search:s.replace(/^ja paguei\s+/,'').replace(/[?!.]+$/,'')});
 if(/^(?:paguei|quitei|dei baixa|essa eu ja paguei|esse eu ja paguei)\b/.test(s)&&!s.endsWith('?')){
  let rest=s.replace(/^(?:paguei|quitei|dei baixa)\s+/,'').replace(/[.!]+$/,''),amount=amountAtStart(rest);if(amount)rest=amount.rest;
  let rows=state.expenses.filter(e=>e.active&&e.status==='PREVISTO'&&(!amount||e.amount_cents===amount.value));const generic=/^(?:essa|esse) eu ja paguei/.test(s);
  if(generic&&context.focus){const ids=new Set(context.focus.expenses.map(e=>e.payload.id));rows=rows.filter(e=>ids.has(e.id));}else rows=choose(rows,rest);
  if(rows.length>1){const current=rows.filter(e=>e.entry_date.startsWith(today.slice(0,7)));if(current.length===1)rows=current;}
  if(rows.length===1)return languageCommand({action:'expense_pay',target_id:rows[0].id,date:today},[],[],rows[0].id);
  if(rows.length>1)return empty('CLARIFY','Qual conta você pagou? '+options(rows)+'.');
  if(!amount){const financial=financialMessageDraft(text,state,today);if(financial)return financial;return empty('CLARIFY','Não encontrei uma conta pendente correspondente. Qual é o nome e o valor do pagamento?');}
 }
 if(context.focus&&/^(?:na verdade|corrige|corrija|muda|mude|era|foi)\b/.test(s)){
  const focus=context.focus,documents=focus.documents.filter(d=>d.document.kind==='APPOINTMENT'),expenses=focus.expenses;
  if(documents.length===1&&!expenses.length){const old=state.documents.find(d=>d.active&&d.id===documents[0].document.id),facts=appointmentFacts(text,today);if(old&&facts?.time)return languageCommand({action:'appointment_upsert',target_id:old.id,time:facts.time.value},[],[],old.id);}
  if(expenses.length===1&&!documents.length){const old=state.expenses.find(e=>e.active&&e.id===expenses[0].payload.id),amount=amountAtStart(s.replace(/^(?:na verdade[, ]*|corrige[, ]*|corrija[, ]*|era |foi )+/,''));if(old&&amount&&!amount.rest.replace(/[.!]/g,''))return languageCommand({action:'expense_update',target_id:old.id,amount_cents:amount.value},[{field:'amount_cents',excerpt:amount.excerpt}],[],old.id);}
 }
 const create=s.match(/^(?:(?:anota|anote|lanca|lance|registra|registre)(?: ai| pra mim| para mim)?[, ]+)?(?:eu )?(?:acabei de )?(gastei|gastar|anota|anote|lanca|lance|registra|registre|entrou|caiu|recebi|ganhei)\s+(.+)$/),simple=create&&amountAtStart(create[2]);
 if(simple&&!/\b(?:amanha|dia|todo|toda|mensal|vezes|parcelas|semana|cartao|pix|boleto|transferencia|uber|garcom|pedreiro|ontem|hoje|e gastei|e ganhei)\b/.test(simple.rest)&&!/[;\n?]/.test(s)){
  let description=simple.rest.replace(/^(?:de|do|da|com|em|no|na)\s+/,'').replace(/[, ]*por favor[.! ]*$/,'').replace(/[.!]+$/,'').trim(),income=/entrou|caiu|recebi|ganhei/.test(create![1]);if(!description)description=income?'Entrada recebida':'Despesa pessoal';
  if(description.length>=2&&description.length<=100&&!/\be\b|\d/.test(description)){
   if(income){const existing=choose(state.documents.filter(d=>d.active&&d.kind==='INCOME'&&d.status==='PREVISTO'&&d.amount_cents===simple.value),description);if(existing.length===1)return languageCommand({action:'income_receive',target_id:existing[0].id,date:today},[],[],existing[0].id);if(existing.length>1)return empty('CLARIFY','Qual recebimento você quer confirmar? '+options(existing)+'.');return languageCommand({action:'income_upsert',description,amount_cents:simple.value,status:'REALIZADO'},[{field:'amount_cents',excerpt:simple.excerpt}]);}
   return languageCommand({action:'expense_create',description,amount_cents:simple.value,category:personalCategory('',description),status:'REALIZADO'},[{field:'amount_cents',excerpt:simple.excerpt}]);
  }
 }
 if(/\b(?:muda|mude|cancela|cancele)\b/.test(s)&&/\b(?:reuniao|dentista|consulta|compromisso)\b/.test(s)){
  const facts=appointmentFacts(text,today),name=s.replace(/^(?:muda|mude|cancela|cancele)\s+/,'').replace(/\b(?:so|somente|a|o|desta semana|de sexta|para|pra|das?|as)\b/g,' ').replace(/\d.*$/,'').trim(),rows=choose(state.documents.filter(d=>d.kind==='APPOINTMENT'&&d.active&&!d.details.done&&(!facts?.date||d.date===facts.date.value)),name);
  if(rows.length===1){if(/^cancel/.test(s))return languageCommand({action:'document_archive',target_id:rows[0].id},[],[],rows[0].id);if(facts?.time)return languageCommand({action:'appointment_upsert',target_id:rows[0].id,time:facts.time.value},[],[],rows[0].id);}
  if(rows.length===1&&!/^cancel/.test(s))return empty('CLARIFY','Para qual data ou horário você quer mudar '+rows[0].description+'?');
  if(rows.length>1)return empty('CLARIFY','Qual compromisso? '+options(rows)+'.');
 }
 return financialMessageDraft(text,state,today);
}
export function sourceWithVerifiedTarget(source:string,draft:FinanceDraft){const command=draft.command as FinanceCommand|null;return command?.target_id&&draft.target_excerpt===command.target_id?source+'\nRegistro identificado nesta conversa: '+command.target_id:source;}
