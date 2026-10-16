'use client';
import {useId,useState} from 'react';
import type {FinanceDocument} from '@/lib/finance';
import type {AdminEntry} from '@/lib/expenses';
import {currency} from '@/lib/model';
import {calendarDays,calendarEntries,moveCalendarMonth,nextCalendarDays} from '@/lib/agenda-calendar';
import './overview-calendar.css';

const label=(day:string,options:Intl.DateTimeFormatOptions)=>new Date(day+'T12:00:00Z').toLocaleDateString('pt-BR',{timeZone:'UTC',...options});
const kindNames={appointment:'Compromisso',payable:'Conta a pagar',receivable:'Entrada prevista'};
export default function OverviewCalendar({documents,expenses,today,onOpenAgenda}:{documents:FinanceDocument[];expenses:AdminEntry[];today:string;onOpenAgenda:()=>void}){
 const [expanded,setExpanded]=useState(false),[month,setMonth]=useState(today.slice(0,7)),[selected,setSelected]=useState(today),id=useId();
 const windowDays=nextCalendarDays(today),days=expanded?calendarDays(month):windowDays,entries=calendarEntries(documents,expenses,documents).filter(e=>!e.done),events=entries.filter(e=>e.date===selected),upcoming=entries.filter(e=>e.date>=today&&e.date!==selected).slice(0,3);
 const select=(day:string)=>{setSelected(day);setMonth(day.slice(0,7));if(!windowDays.includes(day))setExpanded(true);};
 const navigate=(step:number)=>{const target=moveCalendarMonth(month,step);setMonth(target);setSelected(target+'-01');};
 const toggle=()=>{if(expanded){setSelected(today);setMonth(today.slice(0,7));}setExpanded(!expanded);};
 return <section className="bank-panel agenda-calendar overview-calendar" aria-label="Agenda de Compromissos">
  <div className="bank-panel-title"><div><p className="agenda-eyebrow">SUA ROTINA, LOGO AQUI</p><h2>Agenda de Compromissos</h2></div><button className="overview-expand" aria-expanded={expanded} aria-controls={id+'-days'} onClick={toggle}>{expanded?'Ver próximos 10 dias':'Ver mês completo'}</button></div>
  <p className="bank-note">Compromissos, contas a pagar e entradas previstas. Toque no dia para conferir.</p>
  <div className="overview-calendar-layout"><div>
   <div className="agenda-month-nav">{expanded?<><button aria-label="Mês anterior da visão geral" disabled={month==='2000-01'} onClick={()=>navigate(-1)}>‹</button><h3 aria-live="polite">{label(month+'-01',{month:'long',year:'numeric'})}</h3><button aria-label="Próximo mês da visão geral" disabled={month==='2100-12'} onClick={()=>navigate(1)}>›</button></>:<h3>Hoje e próximos 9 dias <small>{label(today,{day:'2-digit',month:'short'})} — {label(windowDays[9],{day:'2-digit',month:'short'})}</small></h3>}<button className="agenda-today" onClick={()=>select(today)}>Hoje</button></div>
   {expanded&&<div className="agenda-weekdays" aria-hidden="true">{['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'].map(d=><span key={d}>{d}</span>)}</div>}
   <div id={id+'-days'} className={'agenda-days'+(expanded?'':' overview-ten-days')} role="group" aria-label={expanded?'Calendário mensal da visão geral':'Próximos 10 dias'}>{days.map((day,index)=>{
    if(!day)return <span key={'empty'+index} className="agenda-empty-day"/>;
    const rows=entries.filter(e=>e.date===day),kinds=[...new Set(rows.map(e=>e.kind))];
    return <button type="button" key={day} aria-pressed={day===selected} aria-current={day===today?'date':undefined} aria-controls={id+'-details'} aria-label={label(day,{weekday:'long',day:'numeric',month:'long',year:'numeric'})+(rows.length?', '+rows.map(e=>kindNames[e.kind]+': '+e.description).join('; '):', sem registros')} className={'agenda-day'+(rows.length?' has-events':'')+kinds.map(k=>' has-'+k).join('')+(kinds.length>1?' has-mixed':'')+(day===today?' is-today':'')+(day===selected?' is-selected':'')} onClick={()=>select(day)}>
     {!expanded&&<small className="overview-weekday">{label(day,{weekday:'short'})}</small>}<span className="agenda-day-number">{Number(day.slice(-2))}</span>
     {rows.length>0&&<><span className="agenda-day-dots" aria-hidden="true">{kinds.map(kind=><i className={kind} key={kind}/>)}</span><span className="agenda-day-count">{rows.length} {rows.length===1?'registro':'registros'}</span></>}
    </button>;
   })}</div>
   <div className="agenda-calendar-legend"><span><i className="payable"/> A pagar</span><span><i className="receivable"/> A receber</span><span><i className="appointment"/> Compromisso</span><span><i className="today"/> Hoje</span></div>
   {upcoming.length>0&&<div className="overview-upcoming"><h3>Próximos registros</h3>{upcoming.map(e=><button key={e.id} className={'overview-upcoming-item '+e.kind} onClick={()=>select(e.date)}><span>{label(e.date,{day:'2-digit',month:'2-digit'})}<small>{e.kind==='appointment'?String(e.document?.details.time||'Dia inteiro'):kindNames[e.kind]}</small></span><strong>{e.description}</strong>{e.kind!=='appointment'&&<b>{currency(e.amount_cents||0)}</b>}<span aria-hidden="true">↗</span></button>)}</div>}
  </div>
  <section id={id+'-details'} className="agenda-selected-day" aria-live="polite" aria-label="Detalhes da agenda na visão geral"><p className="agenda-eyebrow">{selected===today?'HOJE':'DIA SELECIONADO'}</p><h3>{label(selected,{weekday:'long',day:'numeric',month:'long'})}</h3>
   {events.length?events.map(e=><article className={'agenda-event '+e.kind} key={e.id}><div className="agenda-event-time">{e.kind==='appointment'?String(e.document?.details.time||'Dia inteiro'):currency(e.amount_cents||0)}<span>{kindNames[e.kind]}</span></div><h4>{e.description}</h4>{!!e.document?.details.location&&<p>{String(e.document.details.location)}</p>}{e.kind!=='appointment'&&<p>{e.kind==='payable'?'Pagamento ainda não confirmado.':'Recebimento ainda não confirmado.'}</p>}</article>):<div className="overview-empty"><span aria-hidden="true">✦</span><strong>Nenhum registro nesta data</strong><p>Seus compromissos e vencimentos aparecem aqui assim que forem salvos.</p></div>}
   <button className="overview-open-agenda" onClick={onOpenAgenda}>Abrir Agenda para gerenciar ↗</button>
  </section></div>
 </section>;
}
