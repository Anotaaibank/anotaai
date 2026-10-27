import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {campaignInput,campaignLink,campaignResults,commerceAttention,commerceCsv,commerceReports,commercialInput,subscriptionInput,type Customer,type SubscriptionStatus} from '../lib/commerce.ts';
import {attributeLocalRegistration,localCampaignByCode,localCommerce,saveLocalCampaign,updateLocalSubscription} from '../lib/commerce-local.ts';
import {localDb,registerLocal} from '../lib/local-db.ts';
import {readReferral,signReferral} from '../lib/commerce-referral.ts';
process.env.ANOTA_DATABASE_PATH=':memory:';
const account=()=>registerLocal(randomUUID()+'@growth.test','growth-test-password','Conta de teste').user.id;
const profile=(overrides={})=>({payment_method:'CARTAO',notes:'',follow_up_date:null,cancellation_reason:'',expected:null,...overrides});
const campaign=(overrides:Record<string,unknown>={})=>{const {created_at,updated_at,...values}=overrides;void created_at;void updated_at;return campaignInput({id:randomUUID(),name:'Campanha teste',influencer:'Divulgador teste',channel:'Instagram',code:'teste-'+randomUUID(),commission_bps:1250,active:true,expected:null,...values});};
function manager<T>(fn:(id:string)=>T){const old=process.env.ANOTA_MANAGER_USER_IDS,id=account();process.env.ANOTA_MANAGER_USER_IDS=id;try{return fn(id);}finally{if(old===undefined)delete process.env.ANOTA_MANAGER_USER_IDS;else process.env.ANOTA_MANAGER_USER_IDS=old;}}

test('gestão não aceita dados de cartão, comissão inválida ou versões e datas inválidas',()=>{
 const commercial=profile();assert.equal(commercialInput(commercial).payment_method,'CARTAO');
 assert.equal(commercialInput({...commercial,payment_method:'PIX'}).payment_method,'PIX');
 for(const bad of [{card_number:'1234'},{payment_method:'CRIPTO'},{follow_up_date:'2026-02-30'},{notes:'x'.repeat(2001)},{expected:'inválida'}])assert.throws(()=>commercialInput({...commercial,...bad}));
 for(const bad of [{code:'CÓDIGO'},{commission_bps:10001},{commission_bps:-1},{commission_bps:0.5},{active:'true'},{owner:randomUUID()}])assert.throws(()=>campaign(bad));
 const input={user_id:randomUUID(),status:'CANCELADA',plan:'Mensal',monthly_cents:4900,renewal_date:null,expected:null,commercial};assert.throws(()=>subscriptionInput(input));assert.equal(subscriptionInput({...input,commercial:profile({cancellation_reason:'Não utiliza mais'})}).status,'CANCELADA');
});

test('alteração salva assinatura, anotações e histórico juntos; conflito não grava nada',()=>manager(id=>{
 const consumer=account(),input=subscriptionInput({user_id:consumer,status:'ATIVA',plan:'Mensal',monthly_cents:4900,renewal_date:'2026-11-10',expected:null,commercial:profile({notes:'Acompanhar adaptação',follow_up_date:'2026-10-12'})});
 const saved=updateLocalSubscription(id,input),first=localCommerce(id),current=first.customers.find(c=>c.id===consumer)!;
 assert.equal(current.profile?.payment_method,'CARTAO');assert.equal(current.profile?.notes,'Acompanhar adaptação');assert.equal(first.history.filter(h=>h.user_id===consumer).length,1);
 assert.throws(()=>updateLocalSubscription(id,subscriptionInput({...input,expected:saved.updated_at,commercial:profile({notes:'Não deve gravar'})})));
 assert.equal(localCommerce(id).customers.find(c=>c.id===consumer)?.subscription?.updated_at,saved.updated_at);assert.equal(localCommerce(id).history.filter(h=>h.user_id===consumer).length,1);
 const canceled=updateLocalSubscription(id,subscriptionInput({...input,status:'CANCELADA',expected:saved.updated_at,commercial:profile({expected:current.profile!.updated_at,cancellation_reason:'Preço',payment_method:'BOLETO'})}));
 const history=localCommerce(id).history.find(h=>h.user_id===consumer&&h.after_subscription.updated_at===canceled.updated_at)!;
 assert.equal(history.before_subscription?.status,'ATIVA');assert.equal(history.after_subscription.status,'CANCELADA');assert.equal(history.after_profile?.cancellation_reason,'Preço');assert.equal(history.before_profile?.payment_method,'CARTAO');
}));

test('campanhas são privadas, código único e imutável e pausas desativam o link',()=>manager(id=>{
 const other=account(),input=campaign(),saved=saveLocalCampaign(id,input);
 assert.throws(()=>saveLocalCampaign(other,campaign()));assert.throws(()=>localCommerce(other));
 assert.equal(localCampaignByCode(saved.code)?.id,saved.id);assert.throws(()=>saveLocalCampaign(id,campaign({code:saved.code})));
 assert.throws(()=>saveLocalCampaign(id,campaign({...saved,code:'outro-codigo',expected:saved.updated_at})));
 const paused=saveLocalCampaign(id,campaign({...saved,active:false,expected:saved.updated_at}));assert.equal(paused.active,false);assert.equal(localCampaignByCode(saved.code),null);
 assert.throws(()=>saveLocalCampaign(id,campaign({...saved,expected:saved.updated_at})));
}));

test('origem assinada expira, rejeita adulteração e tem separação de propósito',()=>{
 const id=randomUUID(),now=Date.parse('2026-10-10T15:00:00Z'),secret='secret-test-only',token=signReferral(id,secret,now);
 assert.equal(readReferral(token,secret,now+1)?.campaign_id,id);assert.equal(readReferral(token,secret,now+30*86400000),null);assert.equal(readReferral(token,secret,now-1),null);
 assert.equal(readReferral(token,'outro-segredo',now),null);assert.equal(readReferral(token+'.extra',secret,now),null);assert.equal(readReferral('x'+token,secret,now),null);assert.equal(readReferral(undefined,secret,now),null);
});

test('origem só pertence ao cadastro novo, não é reassociada e criação é atômica',()=>manager(id=>{
 const first=saveLocalCampaign(id,campaign()),second=saveLocalCampaign(id,campaign()),existing=account(),now=new Date().toISOString();
 localDb().prepare('UPDATE users SET created_at=? WHERE id=?').run('2026-01-01T00:00:00Z',existing);
 const referral={campaign_id:first.id,captured_at:now,expires:Date.now()+30*86400000};assert.equal(attributeLocalRegistration(existing,referral),false);
 const consumer=registerLocal(randomUUID()+'@growth.test','growth-test-password','Nova conta',undefined,userId=>{attributeLocalRegistration(userId,referral);}).user.id;
 assert.equal(localCommerce(id).customers.find(c=>c.id===consumer)?.acquisition?.campaign_id,first.id);
 assert.equal(attributeLocalRegistration(consumer,{...referral,campaign_id:second.id}),false);
 const email=randomUUID()+'@growth.test';assert.throws(()=>registerLocal(email,'growth-test-password','Não deve persistir',undefined,()=>{throw new Error('Falha simulada');}));assert.equal(localDb().prepare('SELECT id FROM users WHERE email=?').get(email),undefined);
 saveLocalCampaign(id,campaign({...second,active:false,expected:second.updated_at}));assert.equal(attributeLocalRegistration(account(),{...referral,campaign_id:second.id}),false);
}));

test('alertas usam o dia brasileiro, não contam canceladas como atraso e não duplicam inadimplência',()=>{
 const customer=(status:SubscriptionStatus,d:string|null):Customer=>({id:randomUUID(),name:'Conta',email:'conta@test.invalid',created_at:'2026-10-01T12:00:00Z',subscription:{user_id:randomUUID(),status,plan:'Mensal',monthly_cents:1000,renewal_date:d,updated_at:'2026-10-01T12:00:00Z'}});
 const rows=[customer('ATIVA','2026-10-09'),customer('ATIVA','2026-10-10'),customer('ATIVA','2026-10-17'),customer('ATIVA','2026-10-18'),customer('ATRASADA','2026-10-01'),customer('CANCELADA','2026-10-01'),customer('TESTE','2026-10-12'),customer('TESTE',null)];
 const a=commerceAttention(rows,[],new Date('2026-10-11T02:59:00Z'));assert.deepEqual(a.overdue,[rows[0].id,rows[4].id]);assert.deepEqual(a.renewing,[rows[1].id,rows[2].id]);assert.deepEqual(a.trials_ending,[rows[6].id]);assert.deepEqual(a.missing_dates,[rows[7].id]);
});

test('relatórios por plano e campanha não tratam cadastro ou cancelamento como receita recebida',()=>manager(id=>{
 const c=saveLocalCampaign(id,campaign()),ref={campaign_id:c.id,captured_at:new Date().toISOString(),expires:Date.now()+30*86400000};
 const a=account();attributeLocalRegistration(a,ref);updateLocalSubscription(id,subscriptionInput({user_id:a,status:'ATIVA',plan:'Mensal',monthly_cents:4990,renewal_date:'2026-11-10',expected:null}));
 const evaluation=new Date('2026-10-27T15:00:00Z'),customers=localCommerce(id).customers.filter(u=>u.id===a),r=commerceReports(customers,evaluation),result=campaignResults([c],customers,'https://anotei.example',undefined,evaluation)[0];
 assert.equal(r.average_ticket_cents,4990);assert.equal(r.annual_forecast_cents,59880);assert.equal(r.plans[0].active,1);assert.equal(result.registered,1);assert.equal(result.active_subscribers,1);assert.equal(result.mrr_cents,4990);assert.equal(result.test_link,false);
 assert.equal(campaignLink(c.code,undefined).test_link,true);assert.equal(campaignLink(c.code,'http://localhost:3100').test_link,true);assert.equal(campaignLink(c.code,'https://127.0.0.1').test_link,true);assert.equal(campaignLink(c.code,'https://user:pass@example.com').link.includes('pass'),false);
}));

test('exportação CSV preserva acentos e aspas e bloqueia fórmulas injetadas em planilhas',()=>{
 const csv=commerceCsv([['Nome','Notas'],['João','texto; "aspas"'],['=HYPERLINK("x")','  +SUM(1)'],['@fórmula','-1'],['Seguro','\t=1']]);
 assert.ok(csv.startsWith('\uFEFF'));assert.ok(csv.includes('"texto; ""aspas"""'));assert.ok(csv.includes('"\'=HYPERLINK'));assert.ok(csv.includes('"\'  +SUM'));assert.ok(csv.includes('"\'@fórmula"'));assert.ok(csv.includes('"\'\t=1"'));
});
