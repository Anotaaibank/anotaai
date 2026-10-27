import test from 'node:test';
import assert from 'node:assert/strict';
import {deliveryPolicy,deliveryRetryAfter,deliveryLimits,type DeliverySnapshot,type DeliveryContext,type DeliveryEvent,type DeliveryFence} from '../lib/whatsapp-delivery-policy.ts';
const now=Date.parse('2026-10-27T12:00:00Z');
const attempt=(n:number)=>'synthetic-attempt-'+n;
function fresh(patch:Partial<DeliverySnapshot>={}):DeliverySnapshot{return {id:'inbox-A',user_id:'owner-A',instance_id:'instance-A',sender:'recipient-A',reply_version:7,delivery_version:0,lease:'processing-A',attempt_nonce:null,payload_hash:'a'.repeat(64),reply_status:'NAO_ENVIADO',attempt_count:0,used_nonces:[],expires_at:now+600000,send_started_at:null,send_lease_until:null,next_attempt_at:null,provider_message_id:null,provider_record_id:null,temporary_rejection:false,...patch};}
function context(row:DeliverySnapshot,patch:Partial<DeliveryContext>={}):DeliveryContext{return {expected:{...row},enabled:true,authorized:true,now,...patch};}
function step(row:DeliverySnapshot,event:DeliveryEvent,patch:Partial<DeliveryContext>={}){return deliveryPolicy(row,event,context(row,patch));}
function sending(patch:Partial<DeliverySnapshot>={}){return {...step(fresh(),{type:'claim',nonce:attempt(1)}).next,...patch};}
function rejected(row=sending(),retry_after:string|null='3',at=now){return step(row,{type:'http',status:429,proof:'REJECTED_BEFORE_ACCEPTANCE',retry_after},{now:at});}
function receipt(row:DeliverySnapshot,patch:Partial<Extract<DeliveryEvent,{type:'receipt'}>>={}){return step(row,{type:'receipt',verified:true,instance_id:row.instance_id,sender:row.sender,message_id:row.provider_message_id||'unmatched-message',state:'DELIVERED',...patch});}

test('claim exige CAS externo, incrementa contador e usa nonce novo sem mutar snapshot',()=>{
 const row=fresh();Object.freeze(row.used_nonces);Object.freeze(row);const result=step(row,{type:'claim',nonce:attempt(1)});assert.equal(result.action,'CLAIM_SEND');assert.equal(result.reason,'PERSIST_CLAIM_BEFORE_HTTP');assert.equal(result.next.reply_status,'ENVIANDO');assert.equal(result.next.attempt_count,1);assert.deepEqual(result.next.used_nonces,[attempt(1)]);assert.equal(row.attempt_count,0);assert.equal(result.next.delivery_version,1);assert.equal(result.next.send_started_at,now);assert.equal(result.next.send_lease_until,now+deliveryLimits.sendLeaseMs);assert.equal(step(row,{type:'sweep'}).action,'NONE');
});
test('todo componente de posse e revisão perdida falha fechado, incluindo lease nulo literal',()=>{
 const row=fresh();const changes:Partial<DeliveryFence>[]=[{id:'inbox-B'},{user_id:'owner-B'},{instance_id:'instance-B'},{sender:'recipient-B'},{reply_version:8},{delivery_version:1},{lease:null},{attempt_nonce:attempt(9)},{payload_hash:'b'.repeat(64)}];
 for(const change of changes){const result=deliveryPolicy(row,{type:'claim',nonce:attempt(1)},context(row,{expected:{...row,...change}}));assert.equal(result.action,'NONE',JSON.stringify(change));assert.equal(result.reason,'STALE_FENCE');assert.strictEqual(result.next,row);}
 const reminder=fresh({lease:null});assert.equal(step(reminder,{type:'claim',nonce:attempt(1)}).action,'CLAIM_SEND');assert.equal(deliveryPolicy(reminder,{type:'claim',nonce:attempt(1)},context(reminder,{expected:{...reminder,lease:'stale'}})).action,'NONE');
});
test('ENVIANDO abandonado vira INCERTO mesmo com prazo vencido; nunca volta à fila',()=>{
 for(const row of [sending({send_lease_until:now}),sending({send_lease_until:now-1,expires_at:now-10}),sending({send_lease_until:null})]){const recovered=step(row,{type:'sweep'});assert.equal(recovered.next.reply_status,'INCERTO');assert.equal(recovered.action,'RECONCILE');assert.equal(recovered.next.next_attempt_at,null);const next=step(recovered.next,{type:'claim',nonce:attempt(2)});assert.equal(next.action,'RECONCILE');assert.equal(next.next.attempt_count,1);}
 assert.equal(step(sending(),{type:'sweep'}).reason,'SEND_IN_PROGRESS');assert.equal(step(sending(),{type:'claim',nonce:attempt(2)}).action,'NONE');
});
test('queda após claim e antes do HTTP não é presumida como prova de não envio',()=>{
 const claimed=step(fresh(),{type:'claim',nonce:attempt(1)}).next;const restart=step(claimed,{type:'sweep'},{now:now+deliveryLimits.sendLeaseMs});assert.equal(restart.next.reply_status,'INCERTO');assert.equal(step(restart.next,{type:'claim',nonce:attempt(2)}).action,'RECONCILE');
});
test('timeout, 5xx, conflito e 2xx incompleto exigem reconciliação mesmo com Retry-After',()=>{
 const events:DeliveryEvent[]=[{type:'network_error'},...[409,500,502,503,504].map(status=>({type:'http' as const,status,proof:'UNKNOWN' as const,retry_after:'1'})),{type:'http',status:503,proof:'REJECTED_BEFORE_ACCEPTANCE',retry_after:'1'},{type:'http',status:200,proof:'ACCEPTED'},{type:'http',status:200,proof:'UNKNOWN',message_id:'provider-msg-A'},{type:'http',status:400,proof:'REJECTED_BEFORE_ACCEPTANCE',record_id:'contradictory-internal-id'},{type:'http',status:429,proof:'UNKNOWN',retry_after:'1'},{type:'http',status:429,proof:'REJECTED_BEFORE_ACCEPTANCE',message_id:'contradictory-id',retry_after:'1'}];
 for(const event of events){const result=step(sending(),event);assert.equal(result.next.reply_status,'INCERTO',JSON.stringify(event));assert.equal(result.action,'RECONCILE');assert.notEqual(step(result.next,{type:'claim',nonce:attempt(2)}).action,'CLAIM_SEND');}
});
test('429 comprovadamente rejeitado respeita Retry-After, backoff, jitter e novo nonce',()=>{
 const first=rejected();assert.equal(first.next.reply_status,'AGUARDANDO_RETRY');assert.equal(first.next.next_attempt_at,now+3000);assert.equal(first.action,'NONE');assert.equal(step(first.next,{type:'claim',nonce:attempt(2)},{now:now+2999}).reason,'RETRY_NOT_DUE');assert.equal(step(first.next,{type:'claim',nonce:attempt(1)},{now:now+3000}).reason,'FRESH_NONCE_REQUIRED');const second=step(first.next,{type:'claim',nonce:attempt(2)},{now:now+3000});assert.equal(second.action,'CLAIM_SEND');assert.equal(second.next.attempt_count,2);assert.deepEqual(second.next.used_nonces,[attempt(1),attempt(2)]);
 const backoff=step(second.next,{type:'http',status:429,proof:'REJECTED_BEFORE_ACCEPTANCE'},{now:now+3000,jitter:1});assert.equal(backoff.next.next_attempt_at,now+5500);assert.equal(rejected(sending(),'0').next.next_attempt_at,now+1000);
});
test('máximo de três HTTPs não é resetado por nova execução ou outro nonce',()=>{
 let row=fresh(),at=now;for(let n=1;n<=3;n++){const claimed=step(row,{type:'claim',nonce:attempt(n)},{now:at});assert.equal(claimed.action,'CLAIM_SEND');const rejectedAgain=rejected(claimed.next,'0',at);row=rejectedAgain.next;if(n<3){assert.equal(row.reply_status,'AGUARDANDO_RETRY');at=row.next_attempt_at!;}else{assert.equal(row.reply_status,'FALHOU');assert.equal(rejectedAgain.reason,'ATTEMPTS_EXHAUSTED');}}
 assert.equal(row.attempt_count,3);assert.equal(step(row,{type:'claim',nonce:attempt(4)},{now:at+10000}).action,'NONE');
});
test('não antecipa Retry-After grande para caber no prazo da confirmação ou lembrete',()=>{
 const row=sending({expires_at:now+120000});const long=rejected(row,'120');assert.equal(long.next.reply_status,'EXPIRADO');assert.equal(long.next.next_attempt_at,null);assert.equal(step(fresh({expires_at:now+deliveryLimits.requestBudgetMs}),{type:'claim',nonce:attempt(1)}).next.reply_status,'EXPIRADO');const pending=rejected().next;assert.equal(step(pending,{type:'claim',nonce:attempt(2)},{now:pending.expires_at}).next.reply_status,'EXPIRADO');
});
test('Retry-After aceita segundos e HTTP-date estrito pelo relógio injetado',()=>{
 assert.equal(deliveryRetryAfter(' 12 ',now),now+12000);assert.equal(deliveryRetryAfter('Tue, 27 Oct 2026 12:02:00 GMT',now),now+120000);assert.equal(deliveryRetryAfter('Mon, 26 Oct 2026 12:00:00 GMT',now),now);assert.equal(deliveryRetryAfter(null,now),null);assert.equal(deliveryRetryAfter(undefined,now),null);
 for(const value of ['', '-1','1.5','Infinity','1e3','99999999999999999999999','2026-10-27','Tue, 31 Feb 2026 12:00:00 GMT'])assert.throws(()=>deliveryRetryAfter(value,now),/Invalid/);
 for(const retry_after of ['not-a-date','-1','99999999999999999999999']){const result=rejected(sending(),retry_after);assert.equal(result.next.reply_status,'FALHOU');assert.equal(result.reason,'INVALID_RETRY_AFTER_REVIEW');assert.equal(result.next.next_attempt_at,null);}
});
test('aceite com ID é ACEITO, e somente recibo correlacionado comprova entrega',()=>{
 const accepted=step(sending(),{type:'http',status:200,proof:'ACCEPTED',message_id:'provider-msg-A'}).next;assert.equal(accepted.reply_status,'ACEITO');assert.equal(accepted.provider_message_id,'provider-msg-A');assert.equal(step(accepted,{type:'claim',nonce:attempt(2)}).action,'NONE');assert.equal(receipt(accepted,{state:'ACCEPTED'}).next.reply_status,'ACEITO');const delivered=receipt(accepted);assert.equal(delivered.next.reply_status,'ENTREGUE');assert.equal(receipt(delivered.next,{state:'ACCEPTED'}).next.reply_status,'ENTREGUE');assert.equal(receipt(delivered.next).next.delivery_version,delivered.next.delivery_version);
});
test('recibo não autenticado, outra instância/destino/ID e busca não encontrada não autorizam retry',()=>{
 const uncertain=step(sending(),{type:'http',status:503,proof:'UNKNOWN',message_id:'provider-msg-A'}).next;
 for(const patch of [{verified:false},{instance_id:'instance-B'},{sender:'recipient-B'},{message_id:'provider-msg-B'}]){const result=receipt(uncertain,patch);assert.equal(result.next.reply_status,'INCERTO');assert.equal(result.reason,'RECEIPT_NOT_CORRELATED');}
 for(const state of ['NOT_FOUND','UNKNOWN'] as const){const result=receipt(uncertain,{state});assert.equal(result.next.reply_status,'INCERTO');assert.equal(result.action,'RECONCILE');assert.notEqual(step(result.next,{type:'claim',nonce:attempt(2)}).action,'CLAIM_SEND');}
 const noId=step(sending(),{type:'network_error'}).next;assert.equal(receipt(noId).reason,'RECEIPT_NOT_CORRELATED');assert.equal(receipt(uncertain,{state:'READ'}).next.reply_status,'ENTREGUE');
});
test('desativação/revogação cancela trabalho pendente sem apagar fato histórico de aceite/entrega',()=>{
 for(const enabled of [true,false]){const authorized=!enabled;for(const row of [fresh(),sending(),rejected().next,step(sending(),{type:'network_error'}).next]){const result=step(row,{type:'claim',nonce:attempt(2)},{enabled,authorized});assert.equal(result.next.reply_status,'CANCELADO');assert.equal(result.action,'NONE');assert.equal(result.next.next_attempt_at,null);}}
 for(const reply_status of ['ACEITO','ENTREGUE'] as const){const row=sending({reply_status,provider_message_id:'provider-msg-A'});assert.equal(step(row,{type:'sweep'},{enabled:false}).next.reply_status,reply_status);}
});
test('rejeições permanentes comprovadas falham; apenas status HTTP não prova rejeição',()=>{
 for(const status of [400,401,403,404,422]){assert.equal(step(sending(),{type:'http',status,proof:'REJECTED_BEFORE_ACCEPTANCE'}).next.reply_status,'FALHOU');assert.equal(step(sending(),{type:'http',status,proof:'UNKNOWN'}).next.reply_status,'INCERTO');}
});
test('ACK tardio, revisão/nonce antigos e retry sem prova não autorizam novo envio',()=>{
 const row=sending({send_lease_until:now});const late=step(row,{type:'http',status:200,proof:'ACCEPTED',message_id:'late-provider-id'});assert.equal(late.next.reply_status,'INCERTO');assert.equal(late.next.provider_message_id,'late-provider-id');assert.equal(receipt(late.next,{state:'ACCEPTED'}).next.reply_status,'ACEITO');
 const retry=rejected().next;for(const field of ['attempt_nonce','lease','reply_version','delivery_version','payload_hash'] as const){const expected={...retry,[field]:field==='reply_version'||field==='delivery_version'?999:'stale'};assert.equal(deliveryPolicy(retry,{type:'claim',nonce:attempt(2)},context(retry,{expected})).reason,'STALE_FENCE');}
 assert.equal(step({...retry,temporary_rejection:false},{type:'claim',nonce:attempt(2)},{now:now+3000}).reason,'RETRY_PROOF_REQUIRED');
});
test('um reset manual de status não apaga possível envio anterior nem ID já conhecido',()=>{
 for(const row of [sending({reply_status:'NAO_ENVIADO'}),fresh({provider_message_id:'known-id'}),{...rejected().next,provider_message_id:'known-id'}]){const result=step(row,{type:'claim',nonce:attempt(2)},{now:now+4000});assert.notEqual(result.action,'CLAIM_SEND');assert.equal(result.next.reply_status,'INCERTO');}
});
test('a política é determinística e não depende de Date.now, sorteio, rede ou timers',()=>{
 const clock=Date.now,random=Math.random;try{Date.now=()=>{throw Error('ambient clock forbidden');};Math.random=()=>{throw Error('ambient randomness forbidden');};const row=sending();assert.deepEqual(rejected(row),rejected(row));}finally{Date.now=clock;Math.random=random;}
});
test('metadados corrompidos falham fechado sem reiniciar contadores ou nonces',()=>{
 for(const row of [fresh({attempt_count:-1}),fresh({attempt_count:4}),fresh({used_nonces:[attempt(1)]}),fresh({payload_hash:'_'.repeat(64)}),fresh({delivery_version:Number.MAX_SAFE_INTEGER}),fresh({expires_at:NaN})])assert.throws(()=>step(row,{type:'claim',nonce:attempt(1)}),/Invalid/);
 assert.throws(()=>step(fresh(),{type:'claim',nonce:attempt(1)},{now:Infinity}),/Invalid/);assert.throws(()=>step(fresh(),{type:'claim',nonce:attempt(1)},{jitter:2}),/Invalid/);
});

test('cooldown compartilhado da instância impede outro envio e não bloqueia ACK já em voo',()=>{
 const row=fresh();assert.equal(step(row,{type:'claim',nonce:attempt(1)},{instance_not_before:now+3000}).reason,'INSTANCE_COOLDOWN');assert.equal(step(row,{type:'claim',nonce:attempt(1)},{instance_not_before:now+3000,now:now+3000}).action,'CLAIM_SEND');assert.equal(step(row,{type:'claim',nonce:attempt(1)},{instance_not_before:row.expires_at}).next.reply_status,'EXPIRADO');assert.equal(step(sending(),{type:'http',status:200,proof:'ACCEPTED',message_id:'provider-msg-A'},{instance_not_before:now+3000}).next.reply_status,'ACEITO');
});
test('janela de retry nunca antecipa prazo do provedor em variações determinísticas',()=>{
 for(const seconds of [0,1,3,30,300,86400])for(const jitter of [0,0.5,1]){const result=step(sending(),{type:'http',status:429,proof:'REJECTED_BEFORE_ACCEPTANCE',retry_after:String(seconds)},{jitter});if(result.next.reply_status==='AGUARDANDO_RETRY'){assert.ok(result.next.next_attempt_at!>=now+seconds*1000);assert.ok(result.next.next_attempt_at!+deliveryLimits.requestBudgetMs<result.next.expires_at);assert.notEqual(step(result.next,{type:'claim',nonce:attempt(2)},{now:result.next.next_attempt_at!-1}).action,'CLAIM_SEND');}else assert.equal(result.next.reply_status,'EXPIRADO');}
});

test('ID interno da API comprova aceite válido, mas nunca é confundido com ID original no recibo',()=>{
 const result=step(sending(),{type:'http',status:200,proof:'ACCEPTED',record_id:'r-internal-1'});assert.equal(result.next.reply_status,'ACEITO');assert.equal(result.next.provider_record_id,'r-internal-1');assert.equal(result.next.provider_message_id,null);assert.equal(receipt(result.next,{message_id:'r-internal-1'}).reason,'RECEIPT_NOT_CORRELATED');assert.notEqual(step({...result.next,reply_status:'NAO_ENVIADO'},{type:'claim',nonce:attempt(2)}).action,'CLAIM_SEND');
 const unknown=step(sending(),{type:'http',status:503,proof:'UNKNOWN',record_id:'r-internal-1',retry_after:'1'});assert.equal(unknown.next.reply_status,'INCERTO');assert.equal(unknown.next.provider_record_id,'r-internal-1');
});
