import {financeSnapshot,type FinanceState} from './finance.ts';
import {expenseReport} from './assistant.ts';
import {AppError,brazilDay,currency,object,realDate} from './model.ts';
import {paymentMethods} from './expenses.ts';

export const financeTopics=['contexto','resumo','saldo','patrimonio','gastos','investir','salario','rendas','entradas','reservas','pagamentos','atrasos','receber','custos','viagens','agenda','projecao'] as const;
export const financePeriods=['total','hoje','amanha','semana_atual','proxima_semana','mes_atual','mes_anterior','personalizado'] as const;
type Topic=typeof financeTopics[number];
type Period=typeof financePeriods[number];
function dayOffset(day:string,offset:number){const date=new Date(day+'T12:00:00Z');date.setUTCDate(date.getUTCDate()+offset);return date.toISOString().slice(0,10);}
const dateLabel=(day:string)=>day.split('-').reverse().join('/');
export function financeQuery(raw:unknown,today=brazilDay()){
 const b=object(raw);if(Object.keys(b).some(k=>!['topic','period','from','to','explain','payment_state','activity','trip','kind','payment_method','category','search'].includes(k))||b.explain!==undefined&&typeof b.explain!=='boolean')throw new AppError('Confira os filtros da consulta financeira.');
 const topic=(b.topic??'contexto') as Topic,period=(b.period??(topic==='agenda'?'semana_atual':['gastos','atrasos','receber','viagens'].includes(topic)?'total':'mes_atual')) as Period;
 if(!financeTopics.includes(topic)||!financePeriods.includes(period))throw new AppError('Consulta financeira inválida.');
 if(b.payment_state!==undefined&&(!['pagamentos','atrasos'].includes(topic)||!['TODOS','ATRASO','HOJE','FUTURO'].includes(String(b.payment_state))))throw new AppError('Confira a situação dos pagamentos.');
 if(b.kind!==undefined&&(!['pagamentos','atrasos'].includes(topic)||!['PESSOAL','MENSAL'].includes(String(b.kind))))throw new AppError('Confira o tipo das contas.');
 if(b.payment_method!==undefined&&(!['pagamentos','atrasos','custos'].includes(topic)||!paymentMethods.includes(b.payment_method as typeof paymentMethods[number])))throw new AppError('Confira a forma de pagamento.');
 if(b.category!==undefined&&(!['pagamentos','atrasos','custos'].includes(topic)||typeof b.category!=='string'||b.category.trim().length<2||b.category.length>80))throw new AppError('Confira a categoria das contas.');
 if(b.search!==undefined&&(!['pagamentos','atrasos','receber','custos','agenda','viagens'].includes(topic)||typeof b.search!=='string'||b.search.trim().length<2||b.search.length>120))throw new AppError('Confira o texto da busca.');
 if(b.activity!==undefined&&(!['rendas','custos','entradas','receber'].includes(topic)||typeof b.activity!=='string'||b.activity.trim().length<2||b.activity.length>80))throw new AppError('Confira a atividade da renda extra.');
 if(b.trip!==undefined&&(topic!=='viagens'||typeof b.trip!=='string'||b.trip.trim().length<2||b.trip.length>80))throw new AppError('Confira o nome da viagem.');
 let from='2000-01-01',to='2100-12-31';
 if(period==='hoje'||period==='amanha')from=to=dayOffset(today,period==='amanha'?1:0);
 if(period==='semana_atual'||period==='proxima_semana'){const weekday=new Date(today+'T12:00:00Z').getUTCDay();from=dayOffset(today,-((weekday+6)%7)+(period==='proxima_semana'?7:0));to=dayOffset(from,6);}
 if(period==='mes_atual'){from=today.slice(0,7)+'-01';to=dayOffset(dayOffset(from,32).slice(0,7)+'-01',-1);}
 if(period==='mes_anterior'){to=dayOffset(today.slice(0,7)+'-01',-1);from=to.slice(0,7)+'-01';}
 if(period==='personalizado'){if(typeof b.from!=='string'||typeof b.to!=='string'||!realDate(b.from)||!realDate(b.to)||b.from>b.to)throw new AppError('Confira as datas da consulta.');from=b.from;to=b.to;}
 else if(b.from!==undefined||b.to!==undefined)throw new AppError('Use um período personalizado para informar datas.');
 return {topic,period,from,to,...(b.explain===true?{explain:true}:{}),...(b.payment_state?{payment_state:String(b.payment_state)}:{}),...(b.activity?{activity:String(b.activity).trim()}:{}),...(b.trip?{trip:String(b.trip).trim()}:{}),...(b.kind?{kind:String(b.kind)}:{}),...(b.payment_method?{payment_method:String(b.payment_method)}:{}),...(b.category?{category:String(b.category).trim()}:{}),...(b.search?{search:String(b.search).trim()}:{})};
}

// All aggregates use the complete owner-scoped state, before limiting displayed rows.
export function financeReport(state:FinanceState,raw:unknown,today=brazilDay()){
 const q=financeQuery(raw,today),s=financeSnapshot(state,today),within=(day:string)=>day>=q.from&&day<=q.to;
 const sum=(rows:{amount_cents:number}[])=>rows.reduce((n,row)=>n+row.amount_cents,0);
 const activity=(name:unknown)=>!q.activity||String(name||'').normalize('NFD').replace(/\p{M}/gu,'').toLowerCase().includes(q.activity.normalize('NFD').replace(/\p{M}/gu,'').toLowerCase());
 const folded=(value:unknown)=>String(value||'').normalize('NFD').replace(/\p{M}/gu,'').toLowerCase(),search=(value:unknown)=>!q.search||folded(value).includes(folded(q.search));
 const expenseFilter=(row:FinanceState['expenses'][number])=>(!q.payment_method||row.details.payment_method===q.payment_method)&&(!q.category||folded(row.category).includes(folded(q.category)))&&search(row.description+' '+row.category+' '+(row.details.income_activity||'')+' '+(row.details.trip_name||''));
 const paid=state.expenses.filter(e=>e.active&&e.status==='REALIZADO'&&e.entry_date<=today&&within(e.entry_date));
 const personal=paid.filter(e=>!e.details.income_activity),work=paid.filter(e=>!!e.details.income_activity&&activity(e.details.income_activity));
 const incomes=state.documents.filter(d=>d.active&&d.kind==='INCOME'&&d.status==='REALIZADO'&&d.date<=today&&within(d.date)&&activity(d.details.activity));
 const extra=incomes.filter(d=>d.details.salary!==true&&activity(d.details.activity)),salary=incomes.filter(d=>d.details.salary===true);
 const cashPaid=state.expenses.filter(e=>e.active&&e.status==='REALIZADO'&&e.entry_date>=s.profile.opening_date&&e.entry_date<=today);
 const cashReceived=state.documents.filter(d=>d.active&&d.kind==='INCOME'&&d.status==='REALIZADO'&&d.date>=s.profile.opening_date&&d.date<=today);
 const transfers=state.documents.filter(d=>d.active&&d.kind==='TRANSFER'&&d.date>=s.profile.opening_date&&d.date<=today);
 const available=Math.max(0,Math.min(s.available_month_cents,s.projected_minimum_cents)-s.profile.safety_buffer_cents);
 const totals={opening_balance_cents:s.profile.opening_balance_cents,balance_adjustments_cents:s.adjustment_cents,cash_received_cents:sum(cashReceived),cash_paid_cents:sum(cashPaid),cash_deposits_cents:sum(transfers.filter(d=>d.details.direction==='APORTE')),cash_withdrawals_cents:sum(transfers.filter(d=>d.details.direction==='RESGATE')),balance_cents:s.balance_cents,reserve_principal_cents:s.reserve_principal_cents,recorded_assets_cents:s.balance_cents+s.reserve_principal_cents,paid_cents:sum(paid),personal_paid_cents:sum(personal),activity_cost_cents:sum(work),received_cents:sum(incomes),salary_received_cents:sum(salary),extra_received_cents:sum(extra),extra_net_cents:sum(extra)-sum(work),pending_month_cents:s.pending_month_cents,available_month_cents:s.available_month_cents,safety_buffer_cents:s.profile.safety_buffer_cents,available_to_invest_cents:s.configured?available:0,projected_minimum_cents:s.projected_minimum_cents};
 const period=q.period==='total'?'em todo o histórico registrado':`de ${dateLabel(q.from)} a ${dateLabel(q.to)}`;
 let answer='',items:unknown[]=[],count=0;
 const needsCash=['contexto','resumo','saldo','patrimonio','investir','projecao'].includes(q.topic);
 if(needsCash&&!s.configured)answer='Cadastre o saldo inicial em Meu dinheiro para eu calcular seu saldo e o dinheiro disponível.';
 else if(q.topic==='saldo')answer=`Seu saldo atual registrado é ${currency(s.balance_cents)}.${q.explain?` O cálculo parte de ${currency(totals.opening_balance_cents)}, soma ${currency(totals.cash_received_cents)} recebidos e ${currency(totals.cash_withdrawals_cents)} resgatados, desconta ${currency(totals.cash_paid_cents)} pagos e ${currency(totals.cash_deposits_cents)} aportados, e aplica ${currency(totals.balance_adjustments_cents)} de ajustes de conciliação, desde ${dateLabel(s.profile.opening_date)}.`:''}`;
 else if(q.topic==='patrimonio')answer=`Você tem ${currency(totals.recorded_assets_cents)} registrados: ${currency(s.balance_cents)} no caixa e ${currency(s.reserve_principal_cents)} em reservas. Rendimentos estimados ficam separados.`;
 else if(q.topic==='gastos'){count=paid.length;answer=`Você gastou ${currency(totals.paid_cents)} ${period}: ${currency(totals.personal_paid_cents)} em despesas pessoais e ${currency(totals.activity_cost_cents)} em custos de renda extra.`;}
 else if(q.topic==='investir')answer=`Pelas contas registradas, há ${currency(available)} livres para investir, preservando os pagamentos deste mês, a margem de ${currency(s.profile.safety_buffer_cents)} e a projeção dos próximos meses.${s.projected_minimum_cents<0?' A projeção indica falta de '+currency(-s.projected_minimum_cents)+'; ajuste as próximas contas.':''}`;
 else if(q.topic==='salario')answer=`Seu salário fixo cadastrado é ${currency(s.profile.salary_cents)} por mês. Você registrou ${currency(totals.salary_received_cents)} de salário recebido ${period}.`;
 else if(q.topic==='rendas')answer=`Você recebeu ${currency(totals.extra_received_cents)} de renda extra ${period}, com ${currency(totals.activity_cost_cents)} de custos: ${currency(totals.extra_net_cents)} líquidos.`;
 else if(q.topic==='entradas')answer=`Você recebeu ${currency(totals.received_cents)} ${period}: ${currency(totals.salary_received_cents)} de salário e ${currency(totals.extra_received_cents)} de outras rendas. Entradas previstas e resgates não estão nesse total.`;
 else if(q.topic==='reservas'){items=s.reserves;count=items.length;answer=`Suas reservas têm ${currency(s.reserve_principal_cents)} de saldo registrado, separado do caixa. O rendimento estimado é ${currency(s.reserves.reduce((n,r)=>n+r.estimated_interest_cents,0))}.`;}
 else if(q.topic==='agenda'){
  const appointments=state.documents.filter(d=>d.active&&d.kind==='APPOINTMENT'&&!d.details.done&&within(d.date)&&search(d.description+' '+(d.details.location||''))).sort((a,b)=>a.date.localeCompare(b.date)||String(a.details.time||'99:99').localeCompare(String(b.details.time||'99:99'))||a.id.localeCompare(b.id));
  count=appointments.length;items=appointments.slice(0,10).map(d=>({date:d.date,time:d.details.time||'',description:d.description,location:d.details.location||''}));
  answer=count?`Você tem ${count} compromisso${count===1?'':'s'} ${period}. `+appointments.slice(0,10).map(d=>`${dateLabel(d.date)}${d.details.time?' às '+d.details.time:''}: ${d.description}${d.details.location?', em '+d.details.location:''}.`).join(' '):`Você não tem compromissos pendentes ${period}.`;
  if(count>10)answer+=` Outros ${count-10} estão na aba Agenda.`;
 }else if(q.topic==='pagamentos'||q.topic==='atrasos'){
  const status=q.topic==='atrasos'?'ATRASO':q.payment_state||'TODOS';
  const payments=state.expenses.filter(e=>e.active&&e.status==='PREVISTO'&&expenseFilter(e)&&(!q.kind||e.kind===q.kind)&&(within(e.entry_date)||q.topic==='pagamentos'&&q.period==='mes_atual'&&e.entry_date<q.from)&&(status==='TODOS'||status==='ATRASO'&&e.entry_date<today||status==='HOJE'&&e.entry_date===today||status==='FUTURO'&&e.entry_date>today)).sort((a,b)=>a.entry_date.localeCompare(b.entry_date)||a.id.localeCompare(b.id));
  count=payments.length;items=payments.slice(0,10).map(e=>({date:e.entry_date,description:e.description,amount_cents:e.amount_cents,overdue:e.entry_date<today}));
  const statusLabel=status==='ATRASO'?' em atraso':status==='HOJE'?' com vencimento hoje':status==='FUTURO'?' a vencer':'';
  answer=count?`Você tem ${currency(sum(payments))} em ${count} pagamento${count===1?'':'s'}${statusLabel} ${period}${status==='TODOS'&&q.period==='mes_atual'?', incluindo atrasados':''}. `+payments.slice(0,10).map(e=>`${dateLabel(e.entry_date)}: ${e.description}, ${currency(e.amount_cents)}${e.entry_date<today?' (atrasado)':''}.`).join(' '):`Você não tem pagamentos${statusLabel||' previstos'} ${period}.`;
  if(count>10)answer+=` Outros ${count-10} estão no painel.`;
 }else if(q.topic==='receber'){
  const receipts=state.documents.filter(d=>d.active&&d.kind==='INCOME'&&d.status==='PREVISTO'&&activity(d.details.activity)&&search(d.description+' '+(d.details.activity||''))&&(within(d.date)||q.period==='mes_atual'&&d.date<q.from)).sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));
  count=receipts.length;items=receipts.slice(0,10).map(d=>({date:d.date,description:d.description,amount_cents:d.amount_cents,overdue:d.date<today}));
  answer=count?`Você tem ${currency(sum(receipts))} em ${count} entrada${count===1?'':'s'} a receber ${period}. `+receipts.slice(0,10).map(d=>`${dateLabel(d.date)}: ${d.description}, ${currency(d.amount_cents)}${d.date<today?' (recebimento ainda não confirmado)':''}.`).join(' '):`Você não tem entradas a receber registradas ${period}.`;
  answer+=' Previsões não aumentam seu saldo até você confirmar o recebimento.';
 }else if(q.topic==='custos'){
  const costs=work.filter(row=>activity(row.details.income_activity)&&expenseFilter(row));count=costs.length;items=costs.slice(0,10).map(row=>({date:row.entry_date,description:row.description,amount_cents:row.amount_cents}));
  answer=`Você gastou ${currency(sum(costs))} em ${count} custo${count===1?'':'s'} de renda extra${q.activity?' da atividade '+q.activity:''} ${period}.`;
 }else if(q.topic==='viagens'){
  const rows=state.expenses.filter(row=>row.active&&row.details.trip_name&&within(row.entry_date)&&search(row.description+' '+row.details.trip_name)&&(!q.trip||row.details.trip_name.normalize('NFD').replace(/\p{M}/gu,'').toLowerCase().includes(q.trip.normalize('NFD').replace(/\p{M}/gu,'').toLowerCase()))),names=[...new Set(rows.map(row=>row.details.trip_name!))].sort();
  count=names.length;items=names.slice(0,10).map(name=>({description:name,paid_cents:sum(rows.filter(row=>row.details.trip_name===name&&row.status==='REALIZADO'&&row.entry_date<=today)),pending_cents:sum(rows.filter(row=>row.details.trip_name===name&&row.status==='PREVISTO'))}));
  answer=count?`Você tem ${count} viagem${count===1?'':'s'} com despesas registradas ${period}: ${currency(sum(rows.filter(row=>row.status==='REALIZADO'&&row.entry_date<=today)))} pagos e ${currency(sum(rows.filter(row=>row.status==='PREVISTO')))} a pagar. `+(items as {description:string;paid_cents:number;pending_cents:number}[]).map(item=>`${item.description}: ${currency(item.paid_cents)} pagos e ${currency(item.pending_cents)} a pagar.`).join(' '):`Não encontrei despesas de viagens ${period}.`;
 }else if(q.topic==='projecao')answer=`Seu menor saldo projetado nos próximos meses é ${currency(s.projected_minimum_cents)}, considerando as entradas previstas e contas cadastradas.${s.projected_minimum_cents<0?' Faltariam '+currency(-s.projected_minimum_cents)+' para evitar saldo negativo.':''} Previsões ainda não são dinheiro recebido.`;
 else answer=`Salário fixo previsto: ${currency(s.profile.salary_cents)}. Saldo atual: ${currency(s.balance_cents)}. Despesas pessoais pagas no mês: ${currency(s.paid_month_cents)}. Contas deste mês, incluindo atrasadas: ${currency(s.pending_month_cents)}. Sobra após essas contas: ${currency(s.available_month_cents)}. Reservas separadas: ${currency(s.reserve_principal_cents)}. Renda extra líquida no mês: ${currency(s.extra_net_month_cents)}.`;
 return {ok:true,saved:false,topic:q.topic,period:q.period,from:q.from,to:q.to,today,configured:s.configured,answer,totals,items,count,truncated:count>items.length&&['agenda','pagamentos','atrasos','receber','custos','viagens'].includes(q.topic),calculation:{balance:'Saldo inicial + entradas recebidas − despesas pagas + resgates − aportes, desde a data do saldo inicial.',assets:'Caixa + principal das reservas; sem somar salário previsto, cheque especial nem juros estimados.',spending:'Despesas pessoais pagas + custos de renda extra pagos, sem duplicar categorias e sem pagamentos futuros.',investable:'Máximo entre zero e o menor de (caixa − contas pendentes até o fim do mês, menor saldo projetado), menos a margem de segurança. Reservas e entradas previstas não aumentam o caixa disponível.'}};
}

export function financeDraftAnswer(state:FinanceState,query:string,today=brazilDay()){
 const raw=query?object(JSON.parse(query)):{topic:'resumo'};
 if('topic' in raw||!Object.keys(raw).length)return financeReport(state,Object.keys(raw).length?raw:{topic:'resumo'},today).answer;
 const data=expenseReport(state.expenses,raw);
 return `Você tem ${currency(data.amount_cents)} em ${data.count} despesas ${data.status==='PREVISTO'?'previstas':'pagas'} no período consultado.`;
}
