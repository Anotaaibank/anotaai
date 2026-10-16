'use client';
import {useState} from 'react';
import type {FinanceCommand,FinanceDocument} from '@/lib/finance';
import BillRemovalActions from './BillRemovalActions';
import type {AdminEntry} from '@/lib/expenses';
import {currency} from '@/lib/model';
import {calendarDays,moveCalendarMonth,calendarEntries,type CalendarEntry} from '@/lib/agenda-calendar';

type Props={appointments:FinanceDocument[];payments:AdminEntry[];incomes:FinanceDocument[];today:string;archived:boolean;busy:boolean;onArchived:()=>void;onNew:(date:string)=>void;onEdit:(event:FinanceDocument)=>void;onDone:(event:FinanceDocument)=>void;onArchive:(event:FinanceDocument)=>void;onPay:(expense:AdminEntry)=>void;onEditExpense:(expense:AdminEntry)=>void;onReceive:(income:FinanceDocument)=>void;onRemove:(command:FinanceCommand)=>void};
const label=(day:string,options:Intl.DateTimeFormatOptions)=>new Date(day+'T12:00:00Z').toLocaleDateString('pt-BR',{timeZone:'UTC',...options});
const names={appointment:'Compromisso',payable:'Conta a pagar',receivable:'Entrada prevista'};
const daySummary=(rows:CalendarEntry[])=>[...new Set(rows.map(e=>e.kind))].map(kind=>rows.filter(e=>e.kind===kind).length+' '+(kind==='payable'?'conta(s) a pagar':kind==='receivable'?'entrada(s) prevista(s)':'compromisso(s)')).join(', ');
export default function AgendaCalendar({appointments,payments,incomes,today,archived,busy,onArchived,onNew,onEdit,onDone,onArchive,onPay,onEditExpense,onReceive,onRemove}:Props){
 const [month,setMonth]=useState(today.slice(0,7)),[selected,setSelected]=useState(today);
 const entries=calendarEntries(appointments,payments,incomes,archived),days=calendarDays(month),events=entries.filter(a=>a.date===selected),monthly=entries.filter(a=>a.date.startsWith(month)),next=entries.find(a=>!a.done&&a.date>=today);
 const select=(day:string)=>{setMonth(day.slice(0,7));setSelected(day);};
 const navigate=(step:number)=>{const target=moveCalendarMonth(month,step);setMonth(target);setSelected(target+'-01');};
 return <section className="bank-panel agenda-calendar" aria-label="Calendário de compromissos e finanças">
  <div className="bank-panel-title"><div><p className="agenda-eyebrow">SUA ROTINA, À VISTA</p><h2>Minha agenda</h2></div><div className="bank-actions"><button aria-pressed={archived} onClick={onArchived}>{archived?'Ver ativos':'Ver arquivados'}</button><button className="bank-primary" disabled={busy} onClick={()=>onNew(selected)}>Novo compromisso</button></div></div>
  <p className="bank-note">Contas, entradas previstas e compromissos no mesmo calendário. Toque em uma data para ver os detalhes.</p>
  {next&&!archived&&<button className="agenda-next-event" onClick={()=>select(next.date)}><span>Próximo registro</span><strong>{label(next.date,{day:'2-digit',month:'2-digit'})}{next.kind==='appointment'&&next.document?.details.time?' · '+String(next.document.details.time):''} — {next.description}</strong><span aria-hidden="true">↗</span></button>}
  <div className="agenda-calendar-layout"><div>
   <div className="agenda-month-nav"><button aria-label="Mês anterior" disabled={month==='2000-01'} onClick={()=>navigate(-1)}>‹</button><h3 aria-live="polite">{label(month+'-01',{month:'long',year:'numeric'})}</h3><button aria-label="Próximo mês" disabled={month==='2100-12'} onClick={()=>navigate(1)}>›</button><button className="agenda-today" onClick={()=>select(today)}>Hoje</button></div>
   <div className="agenda-weekdays" aria-hidden="true">{['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'].map(day=><span key={day}>{day}</span>)}</div>
   <div className="agenda-days" role="group" aria-label={'Dias de '+label(month+'-01',{month:'long',year:'numeric'})}>{days.map((day,index)=>{
    if(!day)return <span key={'empty'+index} className="agenda-empty-day"/>;
    const rows=monthly.filter(a=>a.date===day),kinds=[...new Set(rows.map(e=>e.kind))],pending=rows.filter(e=>!e.done).length;
    return <button key={day} type="button" aria-pressed={day===selected} aria-current={day===today?'date':undefined} aria-controls="agenda-selected-day" aria-label={label(day,{weekday:'long',day:'numeric',month:'long',year:'numeric'})+(rows.length?', '+daySummary(rows):', sem registros')} className={'agenda-day'+(rows.length?' has-events':'')+kinds.map(k=>' has-'+k).join('')+(kinds.length>1?' has-mixed':'')+(day===today?' is-today':'')+(day===selected?' is-selected':'')+(rows.length&&!pending?' all-done':'')} onClick={()=>select(day)}>
     <span className="agenda-day-number">{Number(day.slice(-2))}</span>
     {rows.length>0&&<><span className="agenda-day-dots" aria-hidden="true">{kinds.map(kind=><i key={kind} className={kind}/>)}</span><span className="agenda-day-count">{rows.length} {rows.length===1?'registro':'registros'}</span></>}
    </button>;
   })}</div>
   <div className="agenda-calendar-legend"><span><i className="payable"/> A pagar</span><span><i className="receivable"/> A receber</span><span><i className="appointment"/> Compromisso</span><span><i className="today"/> Hoje</span><small>{monthly.length} registros neste mês</small></div>
  </div>
  <section id="agenda-selected-day" className="agenda-selected-day" aria-live="polite" aria-label="Registros do dia selecionado">
   <p className="agenda-eyebrow">{selected===today?'HOJE · SUA ORGANIZAÇÃO':'DIA SELECIONADO'}</p><h3>{label(selected,{weekday:'long',day:'numeric',month:'long'})}</h3>
   {events.map(event=><article className={'agenda-event '+event.kind+(event.done?' is-done':'')} key={event.id}>
    <div className="agenda-event-time">{event.kind==='appointment'?String(event.document?.details.time||'Dia inteiro'):currency(event.amount_cents||0)}<span>{archived?'Arquivado':event.done?'Concluído':names[event.kind]}</span></div><h4>{event.description}</h4>
    {event.kind!=='appointment'&&<p>{event.date<today?'Data passou · ':''}{event.kind==='payable'?'Pagamento ainda não confirmado.':'Recebimento ainda não confirmado.'}</p>}
    {!!event.document?.details.location&&<p>{String(event.document.details.location)}</p>}
    <div className="bank-actions">
     {event.kind==='appointment'&&event.document&&<><button disabled={busy} onClick={()=>onEdit(event.document!)}>Editar</button>{event.document.active&&<button disabled={busy} onClick={()=>onDone(event.document!)}>{event.done?'Reabrir':'Concluir'}</button>}<button disabled={busy} onClick={()=>onArchive(event.document!)}>{event.document.active?'Arquivar':'Restaurar'}</button></>}
     {event.kind==='payable'&&event.expense&&<><button disabled={busy} onClick={()=>onPay(event.expense!)}>Registrar pagamento</button><button disabled={busy} onClick={()=>onEditExpense(event.expense!)}>Editar conta</button><BillRemovalActions expense={event.expense} documents={incomes} disabled={busy} onPrepare={onRemove}/></>}
     {event.kind==='receivable'&&event.document&&<button disabled={busy} onClick={()=>onReceive(event.document!)}>Registrar recebimento</button>}
    </div>
   </article>)}
   {!events.length&&<div className="agenda-day-free"><span aria-hidden="true">✦</span><strong>Nenhum registro nesta data</strong><p>Você não tem contas, entradas ou compromissos {archived?'arquivados':'registrados'} neste dia.</p><button disabled={busy} onClick={()=>onNew(selected)}>Agendar neste dia</button></div>}
  </section></div>
  <p className="bank-note">Aparecem aqui os registros já salvos. No WhatsApp, confira o resumo e responda 1 para confirmar. Contas e entradas previstas só alteram o caixa quando você confirma o pagamento ou recebimento. Horários de Brasília.</p>
 </section>;
}
