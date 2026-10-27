'use client';
import {useState} from 'react';
import {adminMoneyInput,adminMoneyText} from '@/lib/expenses';
import {currency} from '@/lib/model';
import type {FinanceCommand} from '@/lib/finance';
import FinancialDialog from './financial-dialog/FinancialDialog';

export default function BalanceAdjustment({balance,onPrepare,onClose,busy,error:serverError}:{
 balance:number;onPrepare:(command:FinanceCommand)=>void;onClose:()=>void;busy:boolean;error?:string;
}){
 const [value,setValue]=useState(adminMoneyText(balance)),[error,setError]=useState('');
 function prepare(){
  if(busy)return;
  setError('');
  try{
   const raw=value.trim(),negative=raw.startsWith('-'),amount=negative?raw.slice(1).trim():raw;
   const cents=/^0(?:,0{1,2})?$/.test(amount)?0:adminMoneyInput(amount);
   onPrepare({action:'balance_adjust',balance_cents:negative?-cents:cents});
  }catch(cause){setError(cause instanceof Error?cause.message:'Confira o saldo correto.');}
 }
 return <FinancialDialog labelledBy="balance-adjustment-title" onClose={onClose} busy={busy}>
  <div className="bank-panel-title"><h2 id="balance-adjustment-title">Ajustar saldo atual</h2><button type="button" disabled={busy} aria-label="Fechar ajuste de saldo" onClick={onClose}>×</button></div>
  <p>Saldo registrado agora: <strong>{currency(balance)}</strong>.</p>
  <p className="bank-note">Confira o saldo no seu banco e informe o valor correto. O ajuste preserva o saldo inicial e os lançamentos anteriores. Não é ganho nem despesa.</p>
  <form onSubmit={event=>{event.preventDefault();prepare();}}><fieldset disabled={busy}>
   <label>Saldo atual correto (R$)<input autoFocus required inputMode="decimal" value={value} onChange={event=>setValue(event.target.value)} aria-describedby="balance-adjustment-help"/></label>
   <p id="balance-adjustment-help" className="bank-note">Pode informar zero ou um valor negativo, como -200,00. Na próxima etapa você confere o resumo antes de confirmar.</p>
   {(error||serverError)&&<p className="bank-error" role="alert">{error||serverError}</p>}
   <div className="bank-actions"><button type="button" onClick={onClose}>Cancelar</button><button className="bank-primary">Conferir ajuste</button></div>
  </fieldset></form>
 </FinancialDialog>;
}
