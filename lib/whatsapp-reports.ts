import {fold,monetaryLiterals} from './finance-date.ts';
import {financeReport,financeQuery} from './finance-report.ts';
import {assistantQuery} from './assistant-query.ts';
import {expenseReport} from './assistant.ts';
import {personalCategory} from './personal-expenses.ts';
import {brazilDay,currency,object} from './model.ts';
import {financeSnapshot,type FinanceState} from './finance.ts';
import {expandedWhatsappQuery,multipleWhatsappReads} from './whatsapp-intents.ts';
import {conversationReport} from './conversation-reports.ts';
import {naturalReadQuery,normalizeAssistantText} from './conversation-language.ts';

// Recognize only unambiguous reads. Writes and unusual filters keep the full interpreter.
export function fastWhatsappQuery(text:string,today=brazilDay()):string|null{
 text=normalizeAssistantText(text);const semantic=naturalReadQuery(text,today);if(semantic)return semantic;
 if(monetaryLiterals(text).length)return null;
 const legacy=legacyWhatsappQuery(text),expanded=expandedWhatsappQuery(text);if(legacy){const old=JSON.parse(legacy);if(old.report==='balance_overdue'||!old.topic&&!old.report||old.category||old.trip||old.audience||old.nature)return legacy;}return expanded||legacy;
}
function legacyWhatsappQuery(text:string):string|null{
 const s=fold(text);if(s.length>500||/\d|\b(?:empresas?|lojas?|clientes?|contratos?|estoque|juridico|cnpj|lanc\w*|anot\w*|registr\w*|agendar|agende|agendamento|agenda (?:pra|para|um|uma|meu|minha)|cadast\w*|alter\w*|corrig\w*|exclu\w*|cancel\w*|paguei|ganhei|recebi|comprei|vou pagar|como|onde|aba|tela|viagem|ferias|familia|esposa|marido|filh\w*|opcional|essencial|ontem|janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\b/.test(s))return null;
 if(/\b(?:paga|pague|quitar|quite|baixa|dar baixa|marcar como pago|marca como pago|marque como pago|receber agora)\b/.test(s))return null;
 if(/\b(?:antes|depois|entre|exceto|semana passada|ano passado|ano atual|ultimo ano)\b/.test(s))return null;
 if(!/\?|\b(?:qual|quanto|quantos|quais|meu|minha|meus|minhas|relatorio|resumo|confere|verifica|mostra|manda|puxa|consulta|tenho|tem|existe|algum|alguma)\b/.test(s))return null;
 if(/cheque especial/.test(s))return JSON.stringify({report:'overdraft'});
 if(/feedback|retorno (?:da equipe|do suporte)|minha sugestao/.test(s))return JSON.stringify({report:'feedback'});
 const kind=/despesas? fixas?|contas? fixas?/.test(s)?{kind:'MENSAL'}:/despesas? variaveis|contas? variaveis/.test(s)?{kind:'PESSOAL'}:{};
 if(/\b(?:saldo|caixa)\b/.test(s)&&/\b(?:contas?|pagamentos?|parcelas?|dividas?|despesas?)\b/.test(s)&&/atraso|atrasad|vencid|devendo/.test(s)){
  if(/salario|rendas?|reservas?|poupanca|agenda|compromissos|investir|patrimonio|gastei|gastos/.test(s))return null;
  return JSON.stringify({report:'balance_overdue',period:period(s,'total'),...kind});
 }
 if(/\b(?:contas?|pagamentos?|parcelas?|dividas?|despesas?)\b/.test(s)&&/atraso|atrasad|vencid|devendo/.test(s))return JSON.stringify({topic:'atrasos',period:period(s,'total'),...kind});
 if(/contas? a receber|tenho (?:dinheiro|valor|algo) (?:pra|para|a) receber|entradas? (?:prevista|pendente)|rendas? (?:prevista|pendente)|recebimentos? (?:previsto|pendente)/.test(s))return JSON.stringify({topic:'receber',period:period(s,'total')});
 if(/custos? (?:de |da |das |do |com )?(?:renda|atividade|uber|trabalho)|gastei (?:para|pra) (?:trabalhar|fazer renda)/.test(s))return JSON.stringify({topic:'custos',period:period(s,'mes_atual'),...(/uber/.test(s)?{activity:'Uber'}:{})});
 if(/\b(?:contas?|pagamentos?|parcelas?|dividas?|despesas?)\b/.test(s)&&/a vencer|vence(?:m|r)? hoje|vencimento hoje|em aberto|pendentes?|devo pagar/.test(s))return JSON.stringify({topic:'pagamentos',period:period(s,'total'),...kind,...(/vence(?:m|r)? hoje|vencimento hoje/.test(s)?{payment_state:'HOJE'}:/a vencer/.test(s)?{payment_state:'FUTURO'}:{})});
 if(/despesas? variaveis|gastos? variaveis/.test(s))return JSON.stringify({report:'variable',period:period(s,'total')});
 const topics:[string,RegExp][]=[['salario',/salario/],['saldo',/saldo|caixa/],['rendas',/renda(?:s)? (?:extra|complementar)|rendas complementares|bicos/],['entradas',/entradas|recebimentos/],['reservas',/reservas|poupanca/],['pagamentos',/contas? a pagar|pagamentos? (?:futuro|previsto|pendente)|parcelas? a pagar/],['agenda',/agenda|compromissos|eventos|reunioes/],['projecao',/projecao|saldo projetado/],['investir',/investir|livre para investimento/],['patrimonio',/patrimonio|tenho (?:no |ao )?total|tenho ao todo/],['gastos',/gastei|gastos|despesas/]];
 const hits=topics.filter(([,r])=>r.test(s));
 if(hits.some(([t])=>t==='projecao')){const i=hits.findIndex(([t])=>t==='saldo');if(i>=0)hits.splice(i,1);}
 if(/despesas? fixas?|contas? fixas?/.test(s)){
  if(hits.some(([t])=>!['gastos','pagamentos'].includes(t)))return null;
  return JSON.stringify({report:'fixed',period:period(s,'mes_atual'),...(hits.some(([t])=>t==='pagamentos')?{status:'PREVISTO'}:{})});
 }
 if(hits.length>1)return null;
 const topic=hits[0]?.[0]||(/viagens/.test(s)?'viagens':/resumo|relatorio geral|situacao financeira|meu dinheiro/.test(s)?'resumo':'');if(!topic)return null;
 const p=period(s,topic==='agenda'?'semana_atual':['gastos','viagens'].includes(topic)?'total':'mes_atual');
 const category=topic==='gastos'?personalCategory('',text):'Outras despesas pessoais';
 if(topic==='gastos'&&/despesas? pessoais|gastos? pessoais/.test(s))return JSON.stringify({period:p,...(category!=='Outras despesas pessoais'?{category}:{})});
 return JSON.stringify(topic==='gastos'&&category!=='Outras despesas pessoais'?{period:p,category}:{topic,period:p,...(topic==='rendas'&&/\buber\b/.test(s)?{activity:'Uber'}:{}),...(topic==='pagamentos'&&/vence(?:m)? hoje|vencimento hoje/.test(s)?{payment_state:'HOJE'}:topic==='pagamentos'&&/a vencer/.test(s)?{payment_state:'FUTURO'}:{})});
}
function period(s:string,fallback:string){return /mes passado|mes anterior/.test(s)?'mes_anterior':/proxima semana|semana que vem/.test(s)?'proxima_semana':/semana/.test(s)?'semana_atual':/amanha/.test(s)?'amanha':/hoje/.test(s)?'hoje':/este mes|esse mes|nesse mes|neste mes|desse mes|mes (?:atual|inteiro)|do mes/.test(s)?'mes_atual':/todo o historico|desde o inicio|ate o momento|ao todo|total/.test(s)?'total':fallback;}
const dateLabel=(s:string)=>s.split('-').reverse().join('/');
const block=(title:string,parts:string[])=>`*${title}*\n\n`+parts.filter(Boolean).join('\n\n');
const paragraphs=(answer:string)=>answer.replace(/\.\s+(?=[A-ZÁÉÍÓÚÇ])/g,'.\n\n');
const periodLabel=(p:{period:string;from:string;to:string})=>p.period==='total'?'Todo o histórico registrado':`${dateLabel(p.from)} a ${dateLabel(p.to)}`;
function expenseAnswer(state:FinanceState,raw:Record<string,unknown>,today:string){
 const input=JSON.parse(assistantQuery(JSON.stringify(raw),today)),p=financeQuery({topic:'gastos',period:input.period||'total',...(input.from?{from:input.from,to:input.to}:{})},today);
 const data=expenseReport(input.status==='PREVISTO'?state.expenses:state.expenses.filter(e=>e.entry_date<=today),{...input,period:'personalizado',from:p.from,to:p.to});
 return block('🧾 Despesas pessoais '+(data.status==='PREVISTO'?'a pagar':'pagas'),[periodLabel(p),`*Total: ${currency(data.amount_cents)} em ${data.count} registros.*`,data.categories.length?'*Por categoria*\n'+data.categories.slice(0,15).map(c=>`• ${c.name}: ${currency(c.amount_cents)} (${c.count}).`).join('\n'):'',data.categories.length>15?`Mais ${data.categories.length-15} categorias estão no painel; o total inclui todas.`:'',data.rows.length?'*Lançamentos*\n'+data.rows.slice(0,10).map(r=>`• ${dateLabel(r.entry_date)} · ${r.description}: ${currency(r.amount_cents)}.`).join('\n'):'',data.count>10?`Mais ${data.count-10} registros estão em Minhas despesas. O total inclui todos.`:'']);
}
export function whatsappQueryAnswer(state:FinanceState,query:string,today=brazilDay(),source=''):string{
 let raw=object(JSON.parse(query||'{"topic":"resumo"}'));
 const semantic=conversationReport(state,raw,today);if(semantic!==null)return semantic;
 if(raw.report==='multiple')return multipleWhatsappReads(raw).map(q=>whatsappQueryAnswer(state,JSON.stringify(q),today)).join('\n\n──────────\n\n');
 if(raw.report==='available'){if(Object.keys(raw).some(k=>k!=='report'))throw new Error('Confira a consulta de saldo.');const s=financeSnapshot(state,today);return block('💚 Sobra neste mês',[s.configured?`Saldo atual: ${currency(s.balance_cents)}\nContas a pagar até o fim do mês, incluindo atrasadas: ${currency(s.pending_month_cents)}\n${s.available_month_cents<0?'Falta':'Sobra'}: ${currency(Math.abs(s.available_month_cents))}`:'Cadastre o saldo inicial em Meu dinheiro para calcular quanto sobra.','O cálculo considera o dinheiro já recebido. Salário e rendas futuras ficam na previsão.']);}
 if(raw.report==='balance_overdue'){
  if(Object.keys(raw).some(key=>!['report','period','kind'].includes(key)))throw new Error('Confira os filtros da consulta financeira.');
  const overdue={topic:'atrasos',period:raw.period||'total',...(raw.kind?{kind:raw.kind}:{})};
  financeQuery(overdue,today);
  return [whatsappQueryAnswer(state,JSON.stringify({topic:'saldo'}),today),whatsappQueryAnswer(state,JSON.stringify(overdue),today,source)].join('\n\n──────────\n\n');
 }
 if(['pagamentos','atrasos'].includes(String(raw.topic))){const s=fold(source);if(!raw.payment_method){if(/\bboleto(?:s)?\b/.test(s))raw.payment_method='BOLETO';else if(/\bpix\b/.test(s))raw.payment_method='PIX';else if(/\bcart(?:ao|oes)\b/.test(s))raw.payment_method='CARTAO';}if(!raw.category){const category=personalCategory('',source);if(category!=='Outras despesas pessoais')raw.category=category;}}
 if(raw.report==='variable'){const {report,...filters}=raw;void report;return expenseAnswer({...state,expenses:state.expenses.filter(row=>row.kind==='PESSOAL')},filters,today).replace('Despesas pessoais','Despesas variáveis');}
 if(['pagamentos','atrasos'].includes(String(raw.topic))&&!raw.kind){if(/despesas? fixas?|contas? fixas?/.test(fold(source)))raw.kind='MENSAL';else if(/despesas? variaveis|contas? variaveis/.test(fold(source)))raw.kind='PESSOAL';}
 if(raw.report==='overdraft'){const s=financeSnapshot(state,today);return block('🏦 Cheque especial',[`Limite cadastrado: ${currency(s.profile.overdraft_limit_cents)}\nTaxa informada: ${s.profile.overdraft_monthly_rate}% ao mês.`,s.configured?'Saldo atual registrado: '+currency(s.balance_cents)+'.':'Cadastre seu saldo inicial em Meu dinheiro para acompanhar o caixa.','O limite não é dinheiro recebido.']);}
 if(raw.report==='fixed'||(!raw.topic||raw.topic==='gastos')&&/despesas? fixas?|contas? fixas?/.test(fold(source))){
  if(raw.report!=='fixed')raw=object(JSON.parse(assistantQuery(JSON.stringify(raw),today)));
  const q=financeQuery({topic:'pagamentos',period:raw.period||'mes_atual',...(raw.from?{from:raw.from,to:raw.to}:{})},today),rows=state.expenses.filter(e=>e.kind==='MENSAL'),filter={period:'personalizado',from:q.from,to:q.to};
  const filters=Object.fromEntries(['category','trip','audience','nature','search'].filter(k=>raw[k]!==undefined&&raw[k]!==null).map(k=>[k,raw[k]]));
  const paid=expenseReport(rows.filter(e=>e.entry_date<=today),{...filter,...filters}),pending=expenseReport(rows,{...filter,...filters,status:'PREVISTO'}),onlyPending=raw.status==='PREVISTO',onlyPaid=raw.status==='REALIZADO';
  const items=[...(onlyPending?[]:paid.rows),...(onlyPaid?[]:pending.rows)].sort((a,b)=>a.entry_date.localeCompare(b.entry_date));
  const rules=q.period==='mes_atual'&&!onlyPaid&&!onlyPending&&!Object.keys(filters).length?state.documents.filter(d=>d.kind==='BILL_RULE'&&d.active):[];
  return block('📅 Despesas fixas',[periodLabel(q),rules.length?'*Contas recorrentes ativas · valor por mês*\n'+rules.slice(0,15).map(d=>`• ${d.description}: ${currency(d.amount_cents)} · dia ${String(d.details.day)} · início ${dateLabel(d.date)}.`).join('\n'):'',[...(onlyPending?[]:[`Pagas no período: ${currency(paid.amount_cents)} (${paid.count}).`]),...(onlyPaid?[]:[`A pagar no período: ${currency(pending.amount_cents)} (${pending.count}).`])].join('\n'),items.slice(0,15).map(e=>`• ${dateLabel(e.entry_date)} · ${e.description}: ${currency(e.amount_cents)} · ${pending.rows.some(p=>p.id===e.id)?'a pagar':'paga'}.`).join('\n'),(onlyPending?0:paid.count)+(onlyPaid?0:pending.count)>15||rules.length>15?'Confira os demais registros em Despesas fixas. Os totais incluem todos.':'']);
 }
 raw=object(JSON.parse(assistantQuery(JSON.stringify(raw),today,source)));
 if(!raw.topic)return expenseAnswer(state,raw,today);
 const report=financeReport(state,raw,today);
 if(raw.topic==='gastos')return block('📊 Gastos gerais',[report.answer,expenseAnswer(state,{period:report.period,...(report.period==='personalizado'?{from:report.from,to:report.to}:{})},today)]);
 if(raw.topic==='reservas')return block('🌱 Reservas e poupanças',[paragraphs(report.answer),(report.items as {description:string;principal_cents:number;details:Record<string,unknown>}[]).map(r=>`• ${r.description}: ${currency(r.principal_cents)}\n  Taxa informada: ${r.details.rate_percent}% ${r.details.rate_period==='ANUAL'?'ao ano':'ao mês'}.`).join('\n\n')]);
 if(['agenda','pagamentos','atrasos','receber','custos'].includes(String(raw.topic))){
  const agenda=raw.topic==='agenda',items=report.items as {date:string;time?:string;description:string;location?:string;amount_cents?:number;overdue?:boolean}[];
  const title=agenda?'🗓️ Sua agenda':raw.topic==='atrasos'?'⚠️ Contas em atraso':raw.topic==='receber'?'📥 Contas a receber':raw.topic==='custos'?'🛠️ Custos da renda extra':'📅 Contas a pagar';
  return block(title,[report.answer.split(/\.\s/)[0].replace(/\.$/,'')+'.',items.map(i=>`• ${dateLabel(i.date)}${i.time?' às '+i.time:''}: ${i.description}${agenda?(i.location?'\n  Local: '+i.location:''):', '+currency(i.amount_cents!)+(i.overdue?(raw.topic==='receber'?' (recebimento não confirmado)':' (em atraso)'):'')}.`).join('\n\n'),raw.topic==='receber'?'Esses valores só entram no saldo quando você confirmar o recebimento.':'',report.truncated?`Outros ${report.count-items.length} registros estão no painel. O total inclui todos.`:'']);
 }
 if(raw.topic==='viagens')return block('✈️ Suas viagens',[report.answer.split(/\.\s/)[0].replace(/\.$/,'')+'.',(report.items as {description:string;paid_cents:number;pending_cents:number}[]).map(item=>`• *${item.description}*\n  Pago: ${currency(item.paid_cents)}\n  A pagar: ${currency(item.pending_cents)}`).join('\n\n'),report.truncated?`Mais ${report.count-report.items.length} viagens estão registradas. Os totais incluem todas.`:'']);
 const titles:Record<string,string>={saldo:'💰 Saldo da conta',salario:'💼 Salário fixo',rendas:'✨ Rendas complementares',entradas:'📥 Entradas recebidas',patrimonio:'🏦 Patrimônio registrado',investir:'🌱 Valor livre para investir',projecao:'🔭 Projeção financeira',resumo:'📊 Resumo financeiro',contexto:'📊 Resumo financeiro'};
 return block(titles[String(raw.topic)]||'📊 Suas finanças',[paragraphs(report.answer)]);
}
