import type {FinancePlan} from './finance.ts';
import {currency} from './model.ts';

const brazilianDates=(text:string)=>text.replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g,'$3/$2/$1');
const bullets=(lines:string[])=>lines.filter(line=>line.trim()).map(line=>'• '+brazilianDates(line));

// A field displayed with a label need not be echoed in the detail list. All
// other plan lines, including unfamiliar conditions, remain visible.
function remainingLines(plan:FinancePlan,displayed:string[]){
 return bullets(plan.lines.filter(line=>!displayed.includes(line)));
}

function simpleCopy(plan:FinancePlan):{title:string;lines:string[]}|null{
 if(plan.checks.length)return null;
 if(plan.documents.length===1&&!plan.expenses.length){
  const change=plan.documents[0],d=change.document;
  const fields=[`Valor: ${currency(d.amount_cents)}`,`Descrição: ${d.description}`,`Data: ${brazilianDates(d.date)}`];
  if(d.kind==='INCOME'&&!d.active&&change.expected!==null&&plan.title==='Arquivar registro'){
   return {title:'Cancelamento da entrada',lines:[...fields,...remainingLines(plan,[d.description]),'A entrada fica fora dos registros ativos. O histórico é preservado.']};
  }
  if(change.expected!==null||!d.active)return null;
  if(d.kind==='INCOME'&&['Registrar recebimento','Agendar entrada'].includes(plan.title)){
   return {title:d.status==='REALIZADO'?'Entrada':'Entrada prevista',lines:[...fields,...remainingLines(plan,[d.description,currency(d.amount_cents)+' · '+d.date])]};
  }
  if(d.kind==='APPOINTMENT'&&plan.title==='Agendar / alterar compromisso'&&!d.details.done){
   const time=typeof d.details.time==='string'?d.details.time:'',location=typeof d.details.location==='string'?d.details.location:'';
   const date=d.date+(time?' às '+time:'');
   return {title:'Compromisso',lines:[`Descrição: ${d.description}`,`Data: ${brazilianDates(date)}`,...(location?[`Local: ${location}`]:[]),...remainingLines(plan,[d.description,date,location])]};
  }
 }
 if(plan.expenses.length===1&&!plan.documents.length){
  const change=plan.expenses[0],p=change.payload;
  if(change.expected===null&&change.active!==false&&['Registrar despesa paga','Agendar pagamento futuro'].includes(plan.title)){
   const future=p.status==='PREVISTO',effect=future?'Previsto; não reduz o saldo atual':'Pago; reduz o saldo atual';
   return {title:future?'Conta a pagar':'Saída',lines:[`Valor: ${currency(p.amount_cents)}`,`Descrição: ${p.description}`,`${future?'Vencimento':'Data'}: ${brazilianDates(p.entry_date)}`,`Categoria: ${p.category}`,effect,...remainingLines(plan,[p.description,currency(p.amount_cents)+' · '+p.category,brazilianDates(p.entry_date)+' · '+effect])]};
  }
 }
 return null;
}

/** Presentation only: no IO, state changes or authorization. A supplied code
 * renders a proposal, never a saved record. With no code, the caller MUST already
 * have verified the write receipt for this plan; absence is not verification.
 * Complex plans retain every nonempty plan line without a display limit. */
export function whatsappPlanCopy(plan:FinancePlan,code?:string):string{
 if(code!==undefined&&!/^[A-F0-9]{10}$/.test(code))throw new Error('Código de confirmação inválido.');
 const pending=code!==undefined,copy=simpleCopy(plan),title=copy?.title??plan.title,lines=copy?.lines??bullets(plan.lines);
 const footer=pending?`*1 — Confirmar*\n*2 — Editar*\n\nAinda não foi salvo. Responda em até 10 minutos.\nPara desistir: CANCELAR ${code}.\nSe houver várias propostas, use o botão ou envie CONFIRMAR ${code} / EDITAR ${code}.`:'Você já pode conferir no painel.';
 return `*${pending?'⏳ Aguardando confirmação — ainda não salvo':'✅ Registrado'}*\n\n${brazilianDates(title)}\n\n${lines.join('\n')}\n\n${footer}`;
}
