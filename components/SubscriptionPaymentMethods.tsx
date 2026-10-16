'use client';
import {useState,type ReactNode} from 'react';
import {CreditCard,ArrowRight,Wallet} from 'lucide-react';
import './subscription-payment-methods.css';

export default function SubscriptionPaymentMethods({pending,children}:{pending:boolean;children:ReactNode}){
 const [method,setMethod]=useState<'CARTAO'|'PIX'>('PIX'),selected=pending?'PIX':method;
 return <section className="subscription-methods" aria-label="Forma de pagamento da assinatura"><h3>Como deseja pagar?</h3><div className="subscription-method-options" role="group" aria-label="Escolher forma de pagamento"><button type="button" aria-pressed={selected==='CARTAO'} disabled={pending} onClick={()=>setMethod('CARTAO')}><CreditCard size={23}/><span><strong>Cartão de crédito</strong><small>Renovação mensal · em breve</small></span><b>Em preparação</b></button><button type="button" aria-pressed={selected==='PIX'} onClick={()=>setMethod('PIX')}><Wallet size={21}/><span><strong>Pix</strong><small>Disponível agora · validação administrativa</small></span><ArrowRight size={17}/></button></div>
 {selected==='CARTAO'?<div className="subscription-card-preparation"><CreditCard size={29}/><h3>Uma assinatura que renova todo mês</h3><p>O cartão recorrente está em preparação. Quando estiver disponível, você poderá assinar sem precisar fazer um novo pagamento manual a cada mês.</p><p>Nenhuma cobrança no cartão será feita nesta etapa.</p><button type="button" className="bank-primary" disabled>Cartão recorrente · em breve</button><button type="button" className="subscription-pix-alternative" onClick={()=>setMethod('PIX')}>Prefiro pagar com Pix por enquanto →</button></div>:<div className="subscription-pix-content"><p>O Pix continua disponível. Cada pagamento é conferido pela administração antes da liberação do acesso.</p>{children}</div>}
 </section>;
}
