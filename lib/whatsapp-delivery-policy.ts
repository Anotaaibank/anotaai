/** Pure proposal policy: no transport, database, timers, random source or runtime imports.
 * CLAIM_SEND is a request for an atomic persisted claim, NEVER permission to send
 * before that CAS succeeds. One attempt means one physical provider HTTP call.
 */
export type DeliveryStatus='NAO_ENVIADO'|'ENVIANDO'|'AGUARDANDO_RETRY'|'INCERTO'|'ACEITO'|'ENTREGUE'|'FALHOU'|'CANCELADO'|'EXPIRADO';
export type DeliveryFence=Readonly<{id:string;user_id:string;instance_id:string;sender:string;reply_version:number;delivery_version:number;lease:string|null;attempt_nonce:string|null;payload_hash:string}>;
export type DeliverySnapshot=DeliveryFence&Readonly<{reply_status:DeliveryStatus;attempt_count:number;used_nonces:readonly string[];expires_at:number;send_started_at:number|null;send_lease_until:number|null;next_attempt_at:number|null;provider_message_id:string|null;provider_record_id:string|null;temporary_rejection:boolean}>;
export type DeliveryContext=Readonly<{expected:DeliveryFence;enabled:boolean;authorized:boolean;now:number;jitter?:number;instance_not_before?:number}>;
export type DeliveryEvent=
 | Readonly<{type:'claim';nonce:string}>
 | Readonly<{type:'sweep'}>
 | Readonly<{type:'network_error'}>
 | Readonly<{type:'http';status:number;proof:'ACCEPTED'|'REJECTED_BEFORE_ACCEPTANCE'|'UNKNOWN';message_id?:string|null;record_id?:string|null;retry_after?:string|null}>
 | Readonly<{type:'receipt';verified:boolean;instance_id:string;sender:string;message_id:string;state:'ACCEPTED'|'DELIVERED'|'READ'|'UNKNOWN'|'NOT_FOUND'}>;
export type DeliveryDecision=Readonly<{next:DeliverySnapshot;action:'NONE'|'CLAIM_SEND'|'RECONCILE';reason:string}>;
export const deliveryLimits=Object.freeze({maxAttempts:3,baseDelayMs:1000,maxBackoffMs:30000,sendLeaseMs:60000,requestBudgetMs:25000});
const states:readonly DeliveryStatus[]=['NAO_ENVIADO','ENVIANDO','AGUARDANDO_RETRY','INCERTO','ACEITO','ENTREGUE','FALHOU','CANCELADO','EXPIRADO'];
const fenceKeys:readonly (keyof DeliveryFence)[]=['id','user_id','instance_id','sender','reply_version','delivery_version','lease','attempt_nonce','payload_hash'];
const epoch=(n:unknown):n is number=>Number.isSafeInteger(n)&&Number(n)>=0&&Number(n)<=8640000000000000;
const counter=(n:unknown):n is number=>Number.isSafeInteger(n)&&Number(n)>=0;
const identifier=(s:unknown):s is string=>typeof s==='string'&&s.length>0&&s.length<=256&&s.trim()===s&&!/[\u0000-\u001f\u007f]/u.test(s);
const nonce=(s:unknown):s is string=>typeof s==='string'&&/^[A-Za-z0-9_-]{12,128}$/.test(s);

/** Both forms of Retry-After are interpreted against the injected clock.
 * Invalid/overflowing values fail closed; they are never reduced to zero delay.
 */
export function deliveryRetryAfter(raw:string|null|undefined,now:number):number|null{
 if(!epoch(now))throw new Error('Invalid delivery clock');
 if(raw===null||raw===undefined)return null;
 const value=raw.trim();let at:number;
 if(/^\d+$/.test(value)){const seconds=Number(value);if(!Number.isSafeInteger(seconds))throw new Error('Invalid Retry-After');at=now+seconds*1000;}
 else {
  if(!/^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun), \d{2} (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4} \d{2}:\d{2}:\d{2} GMT$/.test(value))throw new Error('Invalid Retry-After');
  at=Date.parse(value);if(!epoch(at)||new Date(at).toUTCString()!==value)throw new Error('Invalid Retry-After');
 }
 if(!epoch(at))throw new Error('Invalid Retry-After');
 return Math.max(now,at);
}
function validate(row:DeliverySnapshot,ctx:DeliveryContext){
 if(!epoch(ctx.now)||!epoch(row.expires_at)||!states.includes(row.reply_status)||!counter(row.reply_version)||!counter(row.delivery_version)||row.delivery_version===Number.MAX_SAFE_INTEGER||!counter(row.attempt_count)||row.attempt_count>deliveryLimits.maxAttempts)throw new Error('Invalid delivery snapshot');
 if(!['id','user_id','instance_id','sender'].every(k=>identifier(row[k as keyof DeliverySnapshot]))||!/^[a-f0-9]{64}$/i.test(row.payload_hash)||row.lease!==null&&!identifier(row.lease))throw new Error('Invalid delivery identity');
 if(!Array.isArray(row.used_nonces)||row.used_nonces.length!==row.attempt_count||new Set(row.used_nonces).size!==row.used_nonces.length||row.used_nonces.some(n=>!nonce(n))||row.attempt_nonce!==(row.used_nonces.at(-1)??null))throw new Error('Invalid delivery nonce history');
 if([row.send_started_at,row.send_lease_until,row.next_attempt_at].some(n=>n!==null&&!epoch(n))||row.provider_message_id!==null&&!identifier(row.provider_message_id)||row.provider_record_id!==null&&!identifier(row.provider_record_id)||ctx.instance_not_before!==undefined&&!epoch(ctx.instance_not_before)||typeof row.temporary_rejection!=='boolean'||typeof ctx.enabled!=='boolean'||typeof ctx.authorized!=='boolean'||!Number.isFinite(ctx.jitter??0)||(ctx.jitter??0)<0||(ctx.jitter??0)>1)throw new Error('Invalid delivery metadata');
}
export function deliveryPolicy(row:DeliverySnapshot,event:DeliveryEvent,ctx:DeliveryContext):DeliveryDecision{
 validate(row,ctx);
 const unchanged=(reason:string,action:DeliveryDecision['action']='NONE'):DeliveryDecision=>({next:row,action,reason});
 const update=(patch:Partial<DeliverySnapshot>,reason:string,action:DeliveryDecision['action']='NONE'):DeliveryDecision=>({next:{...row,...patch,delivery_version:row.delivery_version+1},action,reason});
 // Null leases are compared literally (reminders); never treated as a wildcard.
 if(fenceKeys.some(k=>row[k]!==ctx.expected[k]))return unchanged('STALE_FENCE');
 if(!ctx.enabled||!ctx.authorized){
  if(['ACEITO','ENTREGUE','CANCELADO'].includes(row.reply_status))return unchanged('DISABLED_NO_NEW_SEND');
  return update({reply_status:'CANCELADO',next_attempt_at:null,temporary_rejection:false},row.reply_status==='ENVIANDO'||row.reply_status==='INCERTO'?'CANCELLED_POSSIBLY_SENT':'CANCELLED');
 }
 if(event.type==='receipt'){
  // The adapter must authenticate the source AND bind the provider ID to this
  // tenant, instance, recipient and attempt. A track_id alone is not proof.
  if(!event.verified||!identifier(event.message_id)||event.instance_id!==row.instance_id||event.sender!==row.sender||!row.provider_message_id||event.message_id!==row.provider_message_id)return unchanged('RECEIPT_NOT_CORRELATED');
  if(!['ACEITO','INCERTO','ENTREGUE'].includes(row.reply_status))return unchanged('RECEIPT_REQUIRES_RECONCILIATION');
  if(row.reply_status==='ENTREGUE')return unchanged('DELIVERY_ALREADY_CONFIRMED');
  if(event.state==='DELIVERED'||event.state==='READ')return update({reply_status:'ENTREGUE',next_attempt_at:null,temporary_rejection:false},'VERIFIED_DELIVERY');
  if(event.state==='ACCEPTED'&&row.reply_status==='INCERTO')return update({reply_status:'ACEITO',next_attempt_at:null,temporary_rejection:false},'VERIFIED_ACCEPTANCE');
  return unchanged('NO_NEW_DELIVERY_PROOF',row.reply_status==='INCERTO'?'RECONCILE':'NONE');
 }
 if(['ACEITO','ENTREGUE','CANCELADO','FALHOU','EXPIRADO'].includes(row.reply_status))return unchanged('TERMINAL_NO_SEND');
 const uncertain=(reason:string,messageId:string|null=row.provider_message_id,recordId:string|null=row.provider_record_id)=>update({reply_status:'INCERTO',provider_message_id:messageId,provider_record_id:recordId,next_attempt_at:null,temporary_rejection:false},reason,'RECONCILE');
 if(event.type==='http'||event.type==='network_error'){
  if(row.reply_status!=='ENVIANDO')return unchanged('RESULT_REQUIRES_ACTIVE_SEND',row.reply_status==='INCERTO'?'RECONCILE':'NONE');
  const id=event.type==='http'&&identifier(event.message_id)?event.message_id:row.provider_message_id;
  const recordId=event.type==='http'&&identifier(event.record_id)?event.record_id:row.provider_record_id;
  if(row.send_lease_until===null||row.send_lease_until<=ctx.now)return uncertain('SEND_LEASE_EXPIRED',id,recordId);
  if(event.type==='network_error')return uncertain('NETWORK_OUTCOME_UNKNOWN');
  if(!Number.isInteger(event.status)||event.status<100||event.status>599)throw new Error('Invalid HTTP observation');
  if(event.status>=200&&event.status<300&&event.proof==='ACCEPTED'&&(id||recordId))return update({reply_status:'ACEITO',provider_message_id:id,provider_record_id:recordId,next_attempt_at:null,temporary_rejection:false},'PROVIDER_ACCEPTED');
  if(event.status===429&&event.proof==='REJECTED_BEFORE_ACCEPTANCE'&&!id&&!recordId){
   if(row.attempt_count>=deliveryLimits.maxAttempts)return update({reply_status:'FALHOU',next_attempt_at:null,temporary_rejection:false},'ATTEMPTS_EXHAUSTED');
   let retryAfter:number|null;try{retryAfter=deliveryRetryAfter(event.retry_after,ctx.now);}catch{return update({reply_status:'FALHOU',next_attempt_at:null,temporary_rejection:false},'INVALID_RETRY_AFTER_REVIEW');}
   const backoff=Math.min(deliveryLimits.maxBackoffMs,deliveryLimits.baseDelayMs*2**Math.max(0,row.attempt_count-1));
   const nextAt=Math.max(ctx.now+Math.ceil(backoff*(1+(ctx.jitter??0)*0.25)),retryAfter??ctx.now);
   if(nextAt+deliveryLimits.requestBudgetMs>=row.expires_at)return update({reply_status:'EXPIRADO',next_attempt_at:null,temporary_rejection:false},'RETRY_EXCEEDS_DEADLINE');
   return update({reply_status:'AGUARDANDO_RETRY',next_attempt_at:nextAt,temporary_rejection:true},'VERIFIED_TEMPORARY_REJECTION');
  }
  if([400,401,403,404,422].includes(event.status)&&event.proof==='REJECTED_BEFORE_ACCEPTANCE'&&!id&&!recordId)return update({reply_status:'FALHOU',next_attempt_at:null,temporary_rejection:false},'DEFINITE_PERMANENT_REJECTION');
  // 5xx (including 503 + Retry-After), conflict, incomplete 2xx or a
  // contradictory ID/rejection are unsafe to repeat without reconciliation.
  return uncertain('HTTP_OUTCOME_UNKNOWN',id,recordId);
 }
 if(row.reply_status==='ENVIANDO'){
  if(row.send_lease_until===null||row.send_lease_until<=ctx.now)return uncertain('ABANDONED_SEND');
  return unchanged('SEND_IN_PROGRESS');
 }
 if(row.reply_status==='INCERTO')return unchanged('RECONCILIATION_REQUIRED','RECONCILE');
 // A status reset cannot erase an earlier physical attempt or a known ACK.
 if(row.provider_message_id||row.provider_record_id||row.reply_status==='NAO_ENVIADO'&&(row.attempt_count>0||row.send_started_at!==null))return uncertain('PREVIOUS_SEND_REQUIRES_RECONCILIATION');
 if(ctx.now+deliveryLimits.requestBudgetMs>=row.expires_at)return update({reply_status:'EXPIRADO',next_attempt_at:null,temporary_rejection:false},'DEADLINE_EXCEEDED');
 if(row.attempt_count>=deliveryLimits.maxAttempts)return update({reply_status:'FALHOU',next_attempt_at:null,temporary_rejection:false},'ATTEMPTS_EXHAUSTED');
 if(ctx.instance_not_before!==undefined&&ctx.now<ctx.instance_not_before){
  if(ctx.instance_not_before+deliveryLimits.requestBudgetMs>=row.expires_at)return update({reply_status:'EXPIRADO',next_attempt_at:null,temporary_rejection:false},'INSTANCE_COOLDOWN_EXCEEDS_DEADLINE');
  return unchanged('INSTANCE_COOLDOWN');
 }
 if(row.reply_status==='AGUARDANDO_RETRY'){
  if(!row.temporary_rejection||row.next_attempt_at===null)return unchanged('RETRY_PROOF_REQUIRED');
  if(ctx.now<row.next_attempt_at)return unchanged('RETRY_NOT_DUE');
 }
 if(event.type!=='claim')return unchanged('AWAITING_ATOMIC_CLAIM');
 if(!nonce(event.nonce)||row.used_nonces.includes(event.nonce))return unchanged('FRESH_NONCE_REQUIRED');
 return update({reply_status:'ENVIANDO',attempt_count:row.attempt_count+1,attempt_nonce:event.nonce,used_nonces:[...row.used_nonces,event.nonce],send_started_at:ctx.now,send_lease_until:ctx.now+deliveryLimits.sendLeaseMs,next_attempt_at:null,temporary_rejection:false},'PERSIST_CLAIM_BEFORE_HTTP','CLAIM_SEND');
}
