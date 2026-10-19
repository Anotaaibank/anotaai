'use client';
import {Localize} from '@/components/Localization';

import {useCallback,useEffect,useRef,useState} from 'react';
import {ArrowLeft,ArrowRight,Check,ShieldCheck} from 'lucide-react';
import {currency} from '@/lib/model';
import type {PixSettings,PixPayment} from '@/lib/subscription-access';
import {subscriptionPlans,planFrom,type PlanCode} from '@/lib/subscription-plans';
import UsagePanel from './UsagePanel';
import SubscriptionPaymentMethods from './SubscriptionPaymentMethods';

type Data={settings:PixSettings|null;subscription:{status:string;renewal_date:string|null;plan_code?:PlanCode}|null;requests:PixPayment[];access:boolean;manager:boolean};
export default function SubscriptionPayment(){
 const [data,setData]=useState<Data|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[plan,setPlan]=useState<PlanCode>('BASICO'),[step,setStep]=useState<'plan'|'payment'>('plan');
 const initialized=useRef(false),heading=useRef<HTMLHeadingElement>(null),submitting=useRef(false),paymentNavigation=useRef(false),request=useRef<{key:string;id:string}|null>(null);
 const load=useCallback(async()=>{
  const r=await fetch('/api/assinatura',{cache:'no-store'});
  if(r.status===401){location.assign('/?next=assinatura');return;}
  const d:Data&{error?:string}=await r.json();
  if(!r.ok)throw new Error(d.error||'Não foi possível carregar seu plano.');
  setData(d);
  if(!initialized.current){const pending=d.requests.find(p=>p.status==='PENDENTE');setPlan(pending?.plan_code||d.subscription?.plan_code||'BASICO');if(pending)setStep('payment');initialized.current=true;}
 },[]);
 useEffect(()=>{void load().catch(e=>setError(e.message));const timer=setInterval(()=>{if(document.visibilityState==='visible'&&!submitting.current)void load().catch(()=>{});},15000);return()=>clearInterval(timer);},[load]);
 useEffect(()=>{const previous=history.scrollRestoration;history.scrollRestoration='manual';const restore=()=>{setStep(location.hash==='#pagamento'?'payment':'plan');paymentNavigation.current=false;window.scrollTo({top:0,behavior:'instant'});heading.current?.focus({preventScroll:true});};restore();window.addEventListener('popstate',restore);return()=>{history.scrollRestoration=previous;window.removeEventListener('popstate',restore);};},[]);
 const settings=data?.settings,ready=!!settings?.pix_key&&!!settings.receiver,pending=data?.requests.find(p=>p.status==='PENDENTE'),selected=planFrom(pending?.plan_code||plan),paymentStep=!!pending||step==='payment';
 function changeStep(next:'plan'|'payment'){
  if(next==='payment'&&location.hash!=='#pagamento'){history.pushState(history.state,'','#pagamento');paymentNavigation.current=true;}
  else if(next==='plan'){if(paymentNavigation.current)history.back();else history.replaceState(history.state,'','#planos');paymentNavigation.current=false;}
  setStep(next);setError('');setNotice('');window.scrollTo({top:0,behavior:'instant'});heading.current?.focus({preventScroll:true});
 }
 async function submit(e:React.FormEvent<HTMLFormElement>){
  e.preventDefault();if(submitting.current||pending)return;
  const f=new FormData(e.currentTarget),reference=String(f.get('reference')||'').trim(),key=JSON.stringify([plan,reference]);
  if(request.current?.key!==key)request.current={key,id:crypto.randomUUID()};
  submitting.current=true;setBusy(true);setError('');setNotice('');
  try{const r=await fetch('/api/assinatura',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:request.current.id,reference,plan_code:plan})}),d=await r.json();if(!r.ok)throw new Error(d.error||'Não foi possível informar o pagamento.');setData(current=>current?{...current,requests:[d.payment,...current.requests.filter(p=>p.id!==d.payment.id)]}:current);setNotice('Pagamento informado. Aguarde a validação do plano.');await load().catch(()=>{});}
  catch(e){setError(e instanceof Error?e.message:'Não foi possível informar o pagamento.');}
  finally{submitting.current=false;setBusy(false);}
 }
 return <Localize><main className="anotei-registration subscription-payment subscription-checkout">
  <header className="checkout-header"><a className="checkout-back" href={data?.access?'/painel':'/conheca#planos'}><ArrowLeft size={19}/>{data?.access?'Voltar ao aplicativo':'Voltar ao Anotei'}</a><span>ANOTEI <b>NA HORA</b></span></header>
  <div className="checkout-layout"><aside className="checkout-intro"><p className="bank-eyebrow">SUA ROTINA MAIS LEVE</p><h1>Um plano para <br/>organizar seu dia.</h1><p>Contas, dinheiro e compromissos juntos. Pelo aplicativo e pelo WhatsApp.</p><ul><li><Check size={18}/>Até dois números na mesma conta</li><li><Check size={18}/>Seus registros sempre com você</li><li><ShieldCheck size={18}/>Você confere antes de confirmar</li></ul></aside>
  <section className="bank-card checkout-card" aria-busy={!data&&!error||busy}>
   <ol className="checkout-steps" aria-label="Etapas da assinatura"><li aria-current={!paymentStep?'step':undefined}><span>1</span>Escolher plano</li><li aria-current={paymentStep?'step':undefined}><span>2</span>Pagamento</li></ol>
   <h2 ref={heading} tabIndex={-1}>{pending?'Pagamento em análise':paymentStep?'Confira e pague':data?.access?'Meu plano e renovação':'Escolha seu plano'}</h2>
   {!data?<><p role="status">{error||'Carregando os planos…'}</p>{error&&<button type="button" onClick={()=>{setError('');void load().catch(e=>setError(e.message));}}>Tentar novamente</button>}</>:<>
    {data.subscription?.renewal_date&&<p className="checkout-current">Plano atual: {planFrom(data.subscription.plan_code).name} · acesso até {data.subscription.renewal_date.split('-').reverse().join('/')}</p>}
    {!paymentStep?<><fieldset className="checkout-plans" disabled={busy}><legend>Selecione um plano mensal</legend>{Object.values(subscriptionPlans).map(p=><label className={'checkout-plan'+(plan===p.code?' is-selected':'')} key={p.code}><input type="radio" name="plan" value={p.code} checked={plan===p.code} onChange={()=>setPlan(p.code)}/><span><strong>{p.name}</strong><span className="checkout-price">{currency(p.monthly_cents)}<small>/mês</small></span><span className="checkout-plan-description">{p.code==='BASICO'?'150 pedidos, 10 min de áudios no WhatsApp e 10 min de voz no aplicativo.':'Pedidos, áudios no WhatsApp e voz no aplicativo sem franquia mensal.'}</span><small>Até dois números compartilham a conta.</small></span></label>)}</fieldset>
     <p className="bank-note">Usar as telas manualmente não gasta pedidos da IA. No Pix, cada aprovação libera o período de acesso informado no pagamento.</p>
     <button type="button" className="bank-primary checkout-continue" onClick={()=>changeStep('payment')}>Continuar com {selected.name}<ArrowRight size={19}/></button>
    </>:<>
     <div className="checkout-order"><div><small>Plano escolhido</small><strong>{selected.name}</strong></div><strong>{currency(selected.monthly_cents)}<small>/mês</small></strong>{!pending&&<button type="button" disabled={busy} onClick={()=>changeStep('plan')}>Trocar plano</button>}</div>
     {pending?<section className="checkout-pending" role="status"><ShieldCheck size={28}/><h3>Recebemos sua informação de pagamento</h3><p>{currency(pending.amount_cents)} · {planFrom(pending.plan_code).name}</p><p>A administração vai conferir o pagamento e liberar o acesso. Esta página atualiza automaticamente.</p><button type="button" onClick={()=>void load().catch(e=>setError(e.message))}>Verificar liberação</button><p className="bank-note">Para corrigir o plano ou o pagamento informado, fale com a administração.</p></section>:<SubscriptionPaymentMethods pending={false}>
      {ready?<><h3>Pix · {currency(selected.monthly_cents)}</h3><p>Após a aprovação, seu acesso fica liberado por {settings!.access_days} dias.</p><label>Chave Pix<input readOnly value={settings!.pix_key} onFocus={e=>e.target.select()}/></label><button type="button" className="checkout-copy" disabled={busy} onClick={()=>void navigator.clipboard.writeText(settings!.pix_key).then(()=>setNotice('Chave Pix copiada.')).catch(()=>setNotice('Toque na chave e selecione Copiar.'))}>Copiar chave Pix</button><p>Recebedor: <strong>{settings!.receiver}</strong></p><p className="bank-note">1. Copie a chave e pague no aplicativo do seu banco.<br/>2. Confira o recebedor e o valor.<br/>3. Volte aqui e informe o pagamento abaixo.</p><form onSubmit={submit}><label>Identificador do Pix ou observação<textarea name="reference" required minLength={3} maxLength={300} placeholder="Cole o identificador ou escreva uma observação do pagamento" disabled={busy}/></label><button className="bank-primary" disabled={busy}>{busy?'Enviando…':'Já paguei · solicitar validação'}</button><small>O acesso é liberado depois da conferência da administração.</small></form></>:<p className="bank-note">O pagamento está sendo configurado pela administração. Nenhuma cobrança foi feita.</p>}
     </SubscriptionPaymentMethods>}
     {!pending&&<button type="button" className="checkout-back-step" disabled={busy} onClick={()=>changeStep('plan')}><ArrowLeft size={18}/>Voltar aos planos</button>}
    </>}
    {error&&<p className="bank-error" role="alert">{error}</p>}{notice&&<p className="bank-note checkout-notice" role="status">{notice}</p>}
    {data.access&&<a className="checkout-app-link" href="/painel">Abrir meu Anotei<ArrowRight size={17}/></a>}
    <div className="checkout-account"><span>Precisa usar outra conta?</span><button type="button" disabled={busy} onClick={()=>{setBusy(true);void fetch('/api/session',{method:'DELETE'}).then(r=>{if(!r.ok)throw new Error('Não foi possível sair. Tente novamente.');location.assign('/');}).catch(e=>{setError(e.message);setBusy(false);});}}>Sair da conta</button></div>
   </>}
  </section></div>
  {data?.access&&<details className="checkout-usage"><summary>Acompanhar meu uso</summary><UsagePanel/></details>}
 </main></Localize>;
}
