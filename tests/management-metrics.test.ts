import test from 'node:test';
import assert from 'node:assert/strict';
import {campaignResults,commerceMetrics,commercePaymentMetrics,commerceReports,type Campaign,type Customer,type Subscription} from '../lib/commerce.ts';
import type {PixPayment} from '../lib/subscription-access.ts';

const now=new Date('2026-10-27T15:00:00Z');
function customer(id:string,subscription:Partial<Subscription>|null={},method:'CARTAO'|'PIX'|'BOLETO'='CARTAO'):Customer{
 return {id,name:'Conta sintética '+id,email:id+'@example.invalid',created_at:'2026-10-01T12:00:00Z',subscription:subscription===null?null:{user_id:id,status:'ATIVA',plan:'Básico',monthly_cents:4990,renewal_date:'2026-11-10',updated_at:'2026-10-01T12:00:00Z',...subscription},profile:{user_id:id,payment_method:method,notes:'',follow_up_date:null,cancellation_reason:'',updated_at:'2026-10-01T12:00:00Z'}};
}
function payment(id:string,status:PixPayment['status'],amount=4990):PixPayment{
 return {id,user_id:'conta-pix',amount_cents:amount,reference:'Dado sintético',status,access_days:30,created_at:'2026-09-01T12:00:00Z',access_until:status==='APROVADO'?'2026-09-30':null};
}

test('separa contas, assinaturas registradas, status Ativa e mensalidades com prazo vigente',()=>{
 const rows=[customer('sem',null),customer('atual'),customer('vence-hoje',{renewal_date:'2026-10-27',plan:'Ilimitado',monthly_cents:9990}),customer('venceu',{renewal_date:'2026-10-26'}),customer('sem-data',{renewal_date:null}),customer('teste',{status:'TESTE'}),customer('atrasada',{status:'ATRASADA'}),customer('cancelada',{status:'CANCELADA'}),customer('status-sem',{status:'SEM_ASSINATURA'})];
 const m=commerceMetrics(rows,[],now);
 assert.equal(m.registered,9);assert.equal(m.subscriptions_registered,7);
 assert.equal(m.active,4);assert.equal(m.mrr_cents,24960); // compatibility: recorded status only
 assert.equal(m.paid_current,2);assert.equal(m.current_mrr_cents,14980);
 assert.equal(m.paid_expired,1);assert.equal(m.paid_missing_expiry,1);
 assert.equal(m.trials,1);assert.equal(m.trials_current,1);assert.equal(m.past_due,1);assert.equal(m.canceled,1);
 assert.equal(m.effective_access,null);assert.equal(m.as_of,'2026-10-27');
});

test('regressão PA-10: ATIVA vencida não compõe a previsão apresentada na gestão',()=>{
 const m=commerceMetrics([customer('baseline',{renewal_date:'2026-10-26'})],[],now);
 assert.equal(m.active,1);assert.equal(m.mrr_cents,4990);
 assert.equal(m.paid_current,0);assert.equal(m.current_mrr_cents,0);assert.equal(m.paid_expired,1);
 assert.equal(commerceReports([customer('baseline',{renewal_date:'2026-10-26'})],now).annual_forecast_cents,0);
});

test('validade inclui o dia inteiro de São Paulo e muda na meia-noite brasileira',()=>{
 const rows=[customer('hoje',{renewal_date:'2026-10-27'})];
 const before=commerceMetrics(rows,[],new Date('2026-10-28T02:59:59Z'));
 const after=commerceMetrics(rows,[],new Date('2026-10-28T03:00:00Z'));
 assert.equal(before.paid_current,1);assert.equal(before.as_of,'2026-10-27');
 assert.equal(after.paid_current,0);assert.equal(after.paid_expired,1);assert.equal(after.as_of,'2026-10-28');
});

test('datas inválidas ou ausentes não viram prazo válido nem previsão',()=>{
 const rows=[customer('null',{renewal_date:null}),customer('impossivel',{renewal_date:'2026-02-30'}),customer('texto',{renewal_date:'amanhã'}),customer('formato',{renewal_date:'2026-11-1'})];
 const m=commerceMetrics(rows,[],now);
 assert.equal(m.paid_current,0);assert.equal(m.paid_missing_expiry,4);assert.equal(m.paid_expired,0);assert.equal(m.current_mrr_cents,0);
});

test('testes e mensalidades zero não geram previsão; acesso efetivo continua desconhecido',()=>{
 const rows=[customer('teste-atual',{status:'TESTE',monthly_cents:4990}),customer('teste-vencido',{status:'TESTE',monthly_cents:0,renewal_date:'2026-10-26'}),customer('zero',{monthly_cents:0}),customer('sem-assinatura',null)];
 const m=commerceMetrics(rows,[],now);
 assert.equal(m.trials,2);assert.equal(m.trials_current,1);assert.equal(m.paid_current,0);assert.equal(m.current_mrr_cents,0);assert.equal(m.effective_access,null);
 // Isenção, bloqueio administrativo e resultado da RPC não existem em Customer.
 // Uma conta sem assinatura pode ser isenta; nenhuma contagem é licença.
 assert.equal(commerceMetrics([],[],now).effective_access,null);
});

test('Pix aguardando aprovação pode ter mensalidade cadastrada sem ser pagamento aprovado ou acesso comprovado',()=>{
 const m=commerceMetrics([customer('conta-pix',{},'PIX')],[],now),p=commercePaymentMetrics([payment('pedido','PENDENTE')])!;
 assert.equal(m.paid_current,1);assert.equal(m.current_mrr_cents,4990);assert.equal(m.effective_access,null);
 assert.equal(p.approved_cents,0);assert.equal(p.approved_count,0);assert.equal(p.pending_cents,4990);assert.equal(p.pending_count,1);
});

test('relatórios usam a mesma base da previsão, por plano e forma cadastrada, sem inventar cobrança',()=>{
 const rows=[customer('cartao'),customer('boleto',{plan:'Ilimitado',monthly_cents:9990},'BOLETO'),customer('cartao-vencido',{renewal_date:'2026-10-01'}),customer('teste',{status:'TESTE'}),customer('cancelada',{status:'CANCELADA'})];
 const m=commerceMetrics(rows,[],now),r=commerceReports(rows,now);
 assert.equal(r.plans.reduce((sum,p)=>sum+p.mrr_cents,0),m.current_mrr_cents);
 assert.equal(r.plans.reduce((sum,p)=>sum+p.active,0),m.paid_current);
 assert.equal(r.average_ticket_cents,7490);assert.equal(r.annual_forecast_cents,14980*12);
 assert.equal(r.card_subscribers,1);assert.equal(r.boleto_subscribers,1);
 assert.equal(commerceReports([],now).average_ticket_cents,0);
});

test('campanhas mantêm cadastros de origem e removem vencidas da previsão e do contador vigente',()=>{
 const campaign:Campaign={id:'campanha-sintetica',name:'Teste',influencer:'Sintético',channel:'Teste',code:'teste',commission_bps:0,active:true,created_at:now.toISOString(),updated_at:now.toISOString()};
 const attributed=[customer('atual'),customer('vencida',{renewal_date:'2026-10-01'}),customer('teste',{status:'TESTE'})].map(c=>({...c,acquisition:{user_id:c.id,campaign_id:campaign.id,captured_at:now.toISOString()}}));
 const result=campaignResults([campaign],[...attributed,customer('outra-origem')],'https://anotei.example.invalid',undefined,now)[0];
 assert.equal(result.registered,3);assert.equal(result.active_subscribers,1);assert.equal(result.mrr_cents,4990);
});

test('Pix aprovado soma histórico administrativo; pendentes e rejeitados ficam separados, sem recorte por criação',()=>{
 const rows=[payment('aprovado-antigo','APROVADO'),{...payment('aprovado-recente','APROVADO',9990),created_at:'2026-10-27T12:00:00Z'},payment('pendente','PENDENTE',9990),payment('recusado','REJEITADO',9990)];
 assert.deepEqual(commercePaymentMetrics(rows),{approved_count:2,approved_cents:14980,pending_count:1,pending_cents:9990,rejected_count:1});
 assert.equal(commercePaymentMetrics(undefined),null);
 assert.deepEqual(commercePaymentMetrics([]),{approved_count:0,approved_cents:0,pending_count:0,pending_cents:0,rejected_count:0});
});

test('apuração não altera assinatura, validade, valores ou pagamentos de origem',()=>{
 const c=customer('imutavel'),p=payment('imutavel','PENDENTE');
 const before=JSON.stringify({c,p});Object.freeze(c.subscription);Object.freeze(c.profile);Object.freeze(c);Object.freeze(p);
 commerceMetrics([c],[],now);commerceReports([c],now);commercePaymentMetrics(Object.freeze([p]));
 assert.equal(JSON.stringify({c,p}),before);
});
