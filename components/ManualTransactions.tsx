'use client';
import {useEffect,useRef,useState} from 'react';
import {ArrowDownLeft,ArrowUpRight,X} from 'lucide-react';
import {Localize} from './Localization';
import ExpenseForm from './ExpenseForm';
import {ManualIncomeForm} from './Finance';

export default function ManualTransactions({onClose,onSaved}:{onClose:()=>void;onSaved:()=>void}){
 const [mode,setMode]=useState<'income'|'expense'|null>(null),first=useRef<HTMLButtonElement>(null),scope=useRef<HTMLDivElement>(null);
 useEffect(()=>{
  const previous=document.activeElement as HTMLElement|null,overflow=document.body.style.overflow;
  document.body.style.overflow='hidden';
  function keyboard(e:KeyboardEvent){
   const root=scope.current;if(!root)return;
   if(e.key==='Escape'&&!root.querySelector('fieldset[disabled],.finance-confirm button:disabled')){e.preventDefault();onClose();}
   if(e.key!=='Tab')return;
   const fields=Array.from(root.querySelectorAll<HTMLElement>('button,input,select,textarea,a[href],[tabindex="0"]')).filter(el=>!el.matches(':disabled')&&el.getClientRects().length>0),first=fields[0],last=fields.at(-1);
   if(!root.contains(document.activeElement)||!(document.activeElement as HTMLElement|null)?.getClientRects().length){e.preventDefault();(e.shiftKey?last:first)?.focus();}
   else if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}
   else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}
  }
  document.addEventListener('keydown',keyboard);
  return()=>{document.removeEventListener('keydown',keyboard);document.body.style.overflow=overflow;previous?.focus({preventScroll:true});};
 },[onClose]);
 useEffect(()=>{if(!mode)first.current?.focus();},[mode]);
 return <div ref={scope} className="manual-entry-scope">{mode==='income'?<ManualIncomeForm onClose={onClose} onSaved={onSaved}/>:mode==='expense'?<ExpenseForm chooseType onClose={onClose} onSaved={onSaved}/>:<Localize><div className="anota-modal-backdrop"><section className="bank-panel anota-modal manual-transactions" role="dialog" aria-modal="true" aria-labelledby="manual-entry-title">
  <div className="bank-panel-title"><div><p className="bank-eyebrow">CADASTRO MANUAL</p><h2 id="manual-entry-title">Entradas e saídas</h2></div><button type="button" aria-label="Fechar formulário" onClick={onClose}><X size={20}/></button></div>
  <p className="bank-note">O que você quer registrar? Preencha os dados e confira antes de confirmar.</p>
  <div className="manual-entry-options">
   <button type="button" ref={first} onClick={()=>setMode('income')}><ArrowDownLeft size={27}/><span><strong>Entradas</strong><small>Ganhos · salário, vendas e renda extra</small></span></button>
   <button type="button" onClick={()=>setMode('expense')}><ArrowUpRight size={27}/><span><strong>Saídas</strong><small>Despesas · gastos avulsos ou contas fixas</small></span></button>
  </div>
  <p className="bank-note">Você pode registrar por aqui, pelo WhatsApp ou pela IA do aplicativo.</p>
 </section></div></Localize>}</div>;
}
