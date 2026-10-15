import {createHash,randomUUID} from 'node:crypto';
import {callIdFromLocation,createVoiceLimiter,VoiceError,voiceDurationMs,voiceSession} from './assistant-session.ts';
import {assistantConversations} from './assistant-conversation.ts';
import {reserveUsage,settleUsage,type UsageReservation} from './subscription-usage.ts';


type VoiceCall={user:string;callId:string;expiresAt:number;reads:number;timer:ReturnType<typeof setTimeout>;usage:UsageReservation};
const runtime=globalThis as unknown as {[key:symbol]:{limiter:ReturnType<typeof createVoiceLimiter>;calls:Map<string,VoiceCall>}|undefined};
const state=runtime[Symbol.for('anota-ai.voice-state.v2')]??={limiter:createVoiceLimiter(),calls:new Map<string,VoiceCall>()};
const {limiter,calls}=state;
export function claimVoiceRead(user:string,id:string){
 const call=calls.get(id);
 if(!call||call.user!==user||call.expiresAt<=Date.now())throw new VoiceError('Inicie uma nova conversa para consultar os dados.',403);
 if(call.reads>=40)throw new VoiceError('Limite de consultas desta conversa atingido. Inicie outra conversa.',429);
 call.reads++;
}
export function voiceConfigured(){return !!process.env.OPENAI_API_KEY?.trim()&&process.env.ANOTA_ASSISTANT_ENABLED!=='false';}
async function hangup(callId:string){
 try{const r=await fetch(`https://api.openai.com/v1/realtime/calls/${encodeURIComponent(callId)}/hangup`,{method:'POST',headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`},signal:AbortSignal.timeout(10000)});return r.ok||r.status===404;}catch{return false;}
}
// Recover expired leases after a server restart, when the original in-memory timer is gone.
export async function expireVoiceCalls(){const {localMode,service}=await import('./server.ts');if(localMode()||!voiceConfigured())return 0;const rows=await service<{user_id:string;event_id:string;call_id:string|null;amount:number}[]>('anota_usage_events?kind=eq.VOICE&needs_hangup=eq.true&expires_at=lt.'+encodeURIComponent(new Date().toISOString())+'&select=user_id,event_id,call_id,amount&limit=50');for(const row of rows){if(row.call_id&&!await hangup(row.call_id))continue;await service('anota_usage_events?user_id=eq.'+row.user_id+'&kind=eq.VOICE&event_id=eq.'+row.event_id,'PATCH',{needs_hangup:false});await settleUsage(row.user_id,row.event_id,'VOICE',row.amount);}return rows.length;}
export async function closeVoice(user:string,id:string){
 const call=calls.get(id);if(!call||call.user!==user)return;
 calls.delete(id);assistantConversations.close(user,id);clearTimeout(call.timer);limiter.end(user);const [ended]=await Promise.all([hangup(call.callId),settleUsage(user,call.usage.id,'VOICE',call.usage.granted)]);if(call.usage.expires_at){const {service}=await import('./server.ts');await service('anota_usage_events?user_id=eq.'+user+'&kind=eq.VOICE&event_id=eq.'+call.usage.id,'PATCH',{needs_hangup:!ended,expires_at:new Date().toISOString()});}
}
export async function startVoice(user:string,input:{sdp:string;section:string},signal:AbortSignal,name:unknown=undefined){
 if(!voiceConfigured())throw new VoiceError('A voz ainda aguarda ativação pelo administrador. As orientações rápidas estão disponíveis abaixo.',503);
 limiter.begin(user);
 let callId:string|null=null;
 let usage:UsageReservation|undefined;
 try{
  usage=await reserveUsage(user,'VOICE',randomUUID(),voiceDurationMs/1000);
  const form=new FormData();form.set('sdp',input.sdp);form.set('session',JSON.stringify(voiceSession(input.section,name)));
  const response=await fetch('https://api.openai.com/v1/realtime/calls',{method:'POST',body:form,headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY!.trim()}`,'OpenAI-Safety-Identifier':createHash('sha256').update(`anota-ai:${user}`).digest('hex')},signal:AbortSignal.any([signal,AbortSignal.timeout(30000)]),cache:'no-store'});
  if(!response.ok){await response.body?.cancel();throw new VoiceError(response.status===429?'O serviço de voz está ocupado ou sem cota. Peça ao administrador para conferir a API.':'Não foi possível conectar a voz. Peça ao administrador para conferir a configuração da API.',502);}
  callId=callIdFromLocation(response.headers.get('Location'));const sdp=await response.text();
  if(!callId||!sdp.startsWith('v=0')||sdp.length>60000)throw new VoiceError('O serviço não confirmou a conexão. Tente novamente.',502);
  if(usage.expires_at){const {service}=await import('./server.ts');const bound=await service<{expires_at:string}>('rpc/anota_usage_bind_voice','POST',{p_user:user,p_event:usage.id,p_call:callId});usage.expires_at=bound.expires_at;}
  if(signal.aborted)throw new VoiceError('A conversa foi cancelada.');
  const id=randomUUID(),expiresAt=usage.expires_at?Date.parse(usage.expires_at):Date.now()+voiceDurationMs,remaining=expiresAt-Date.now();
  if(remaining<1000)throw new VoiceError('O tempo disponível acabou. Consulte Meu uso no aplicativo.',429);
  const timer=setTimeout(()=>void closeVoice(user,id).catch(()=>{}),remaining);timer.unref();
  calls.set(id,{user,callId,expiresAt,reads:0,timer,usage});return {id,sdp,expiresAt};
 }catch(error){limiter.end(user);if(callId)await hangup(callId);if(usage)await settleUsage(user,usage.id,'VOICE',0).catch(()=>{});if(error instanceof VoiceError)throw error;if(error instanceof Error&&'status' in error)throw error;throw new VoiceError('Não foi possível conectar a voz. Tente novamente em alguns instantes.',502);}
}

