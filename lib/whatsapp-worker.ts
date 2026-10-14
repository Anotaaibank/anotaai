import {assistantNameForBot} from './assistant-preferences.ts';
import {getBot,claimMessage,patchMessage,history,pendingReplies,replyClaim,reminderBots,enqueueReminder,type Inbox,type Bot} from './whatsapp-store.ts';
import {credentials,statusBot} from './whatsapp-server.ts';
import {extractFinance,prepareFinanceDraft} from './finance-ai.ts';
import {financeStateForBot,financeSecret,applyFinanceForBot,appointmentsForBot} from './finance-server.ts';
import {fastWhatsappQuery,whatsappQueryAnswer} from './whatsapp-reports.ts';
import {appointmentReminders,currentReminder,reminderPrefix} from './whatsapp-reminder.ts';
import {paymentReminders,currentPaymentReminder,paymentReminderPrefix} from './payment-reminder.ts';
import {whatsappPending,confirmedWhatsappPlan,cancelledWhatsappPlan,editedWhatsappPlan,whatsappConfirmationHint,whatsappPlanReply} from './whatsapp-finance.ts';
import {editingPrefix,signWhatsappEdit,readWhatsappEdit,quickEditedPlan} from './whatsapp-edit.ts';
import {quickMonthlyBillDraft} from './monthly-bills.ts';
import {expandMonthlyBillsForBot} from './monthly-bills-server.ts';
import {quickExpenseDraft,quickAppointmentDraft,quickPlannedExpenseDraft} from './assistant-fast.ts';
import {transcribeExpense} from './whatsapp-ai.ts';
import {expenseStatusQuestion} from './expense-context.ts';
import {brazilDay,object} from './model.ts';
import {stableId} from './finance.ts';
import {feedbackInput} from './commerce.ts';
import {feedbacksForBot,sendFeedbackForBot} from './commerce-server.ts';
import {whatsappHelp,feedbackRequest} from './whatsapp-help.ts';
import {signFeedback,feedbackReply,feedbackAnswer} from './whatsapp-feedback.ts';
import {whatsappFeedbackChoice} from './whatsapp-finance.ts';


import {sendText} from './whatsapp.ts';
import {processInvitations} from './whatsapp-invitations.ts';
import type {AdminEntry} from './expenses.ts';
async function download(b:Bot,id:string){const c=credentials(b),r=await fetch(c.url+'/message/download',{method:'POST',headers:{token:c.token,'Content-Type':'application/json'},body:JSON.stringify({id,return_base64:true,generate_mp3:false,transcribe:false,download_quoted:false}),redirect:'error',signal:AbortSignal.timeout(25000)});if(!r.ok)throw new Error('Não consegui ler o áudio. Envie a despesa por texto.');if(Number(r.headers.get('content-length'))>7500000)throw new Error('Envie um áudio curto, até 5 MB.');const reader=r.body?.getReader();if(!reader)throw new Error('Áudio indisponível.');let size=0;const chunks:Uint8Array[]=[];try{for(;;){const n=await reader.read();if(n.done)break;size+=n.value.length;if(size>7500000)throw new Error('Envie um áudio curto, até 5 MB.');chunks.push(n.value);}}finally{await reader.cancel();reader.releaseLock();}const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}const raw=JSON.parse(new TextDecoder().decode(bytes)),mime=String(raw.mimetype||'').split(';')[0],encoded=raw.base64Data;if(!['audio/ogg','audio/mpeg','audio/wav','audio/x-wav','audio/mp4','audio/webm'].includes(mime)||typeof encoded!=='string'||encoded.length>7000000||!/^[A-Za-z0-9+/=\r\n]+$/.test(encoded))throw new Error('Áudio inválido. Envie uma mensagem curta.');const audio=Buffer.from(encoded,'base64');if(audio.length<32||audio.length>5000000)throw new Error('Áudio fora do limite. Envie por texto.');return {bytes:audio,mime};}
async function reply(row:Inbox,_b:Bot,now=Date.now()){let b=await getBot(row.user_id);if(!b?.enabled||b.status!=='PRONTO'||!b.allowed_phones.includes(row.sender)){await patchMessage(row,{reply_status:'CANCELADO'});return;}
 if(row.provider_id.startsWith(reminderPrefix)){
  const current=async()=>row.provider_id.startsWith(paymentReminderPrefix)?currentPaymentReminder(row.provider_id,row.sender,(await financeStateForBot(row.user_id)).expenses,now):currentReminder(row.provider_id,row.sender,await appointmentsForBot(row.user_id),now);
  if(!await current()){await patchMessage(row,{reply_status:'CANCELADO'});return;}
  if(!(await statusBot(b)).connected)return;
  const message=await current();b=await getBot(row.user_id);
  if(!message||!b?.enabled||b.status!=='PRONTO'||!b.allowed_phones.includes(row.sender)){await patchMessage(row,{reply_status:'CANCELADO'});return;}
  if(!await patchMessage(row,{reply:message}))return;
 }
 if(!await replyClaim(row))return;const c=credentials(b),status=await sendText(c.url,c.token,row.sender,row.reply,row.status==='ESCLARECER'&&row.finance_confirmation&&!row.confirmation_used&&!row.finance_confirmation.startsWith(editingPrefix)?row.confirmation_code:undefined,row.finance_confirmation?.startsWith('feedback.v1.')?'cancel':'edit');await patchMessage(row,{reply_status:status});}
async function propose(row:Inbox,b:Bot,draft:Parameters<typeof prepareFinanceDraft>[0],source:string,state:Parameters<typeof prepareFinanceDraft>[2]){
 const plan=prepareFinanceDraft(draft,source,state,row.user_id,row.id);if(plan.title==='Agendar / alterar compromisso'&&plan.documents.some(d=>!d.document.details.time&&!d.document.details.done))throw new Error('Qual é o horário do compromisso? Preciso dele para enviar os lembretes.');
 const pending=whatsappPending(plan,row.user_id,row.sender,financeSecret());await patchMessage(row,{status:'ESCLARECER',...pending,reply:whatsappPlanReply(plan,pending.confirmation_code)});await reply(row,b);
}
async function answerForBot(user:string,query:string,source:string){const raw=object(JSON.parse(query));if(raw.report==='feedback'){if(Object.keys(raw).some(key=>key!=='report'))throw new Error('Confira o pedido sobre seus feedbacks.');return feedbackAnswer(await feedbacksForBot(user));}return whatsappQueryAnswer(await financeStateForBot(user),query,undefined,source);}
export async function processMessage(row:Inbox){
 // The signed webhook already checked the instance owner/phone. Do not add a remote status lookup to every read.
 const b=await getBot(row.user_id);if(!b||!b.enabled||b.status!=='PRONTO'||!b.allowed_phones.includes(row.sender)){await patchMessage(row,{status:'ERRO',reply:'A conexão não está autorizada. Confira o painel.'});return;}
 let transcript=row.transcript||row.text;
 try{
  const key=process.env.OPENAI_API_KEY;
  if(row.type==='audio'&&!transcript){if(!key)throw new Error('A leitura de áudio ainda precisa ser ativada.');const audio=await download(b,row.provider_id);transcript=await transcribeExpense(audio.bytes,audio.mime,key);}
  const spokenChoice=transcript.normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase().match(/^(?:(?:a |o )?(?:opcao|numero)\s+)?(um|uma|dois|duas|1|2)[.! ]*$/);if(spokenChoice)transcript=/^(?:um|uma|1)$/.test(spokenChoice[1])?'1':'2';
  if(!await patchMessage(row,{transcript}))return;
  const feedback=feedbackRequest(transcript);if(feedback){const id=stableId(row.user_id+':feedback:'+row.id),plan={id,feedback:feedbackInput({...feedback,id})},code=id.replaceAll('-','').slice(0,10).toUpperCase();await patchMessage(row,{status:'ESCLARECER',finance_confirmation:signFeedback(plan,row.user_id,row.sender,financeSecret()),confirmation_code:code,confirmation_used:false,reply:feedbackReply(plan,code)});await reply(row,b);return;}
  const help=whatsappHelp(transcript);if(help){await patchMessage(row,{status:'RESOLVIDO',reply:help});await reply(row,b);return;}
  const quick=fastWhatsappQuery(transcript);if(quick){await patchMessage(row,{status:'RESOLVIDO',reply:await answerForBot(row.user_id,quick,transcript)});await reply(row,b);return;}
  const recent=(await history(row.user_id)).filter(r=>r.id!==row.id&&r.sender===row.sender&&Date.parse(r.created_at)>Date.parse(row.created_at)-900000&&Date.parse(r.created_at)<=Date.parse(row.created_at)).sort((a,b)=>b.created_at.localeCompare(a.created_at));
  if(expenseStatusQuestion(transcript)){const last=recent.find(r=>r.status==='LANCADO');await patchMessage(row,{status:'RESOLVIDO',reply:last?'Seu último lançamento foi registrado. '+last.reply:'Não encontrei um lançamento confirmado nos últimos 15 minutos. Confira seu histórico no painel.'});await reply(row,b);return;}
  const feedbackChoice=whatsappFeedbackChoice(transcript,recent,row.user_id,row.sender,financeSecret());
  if(feedbackChoice){if(!feedbackChoice.cancel)await sendFeedbackForBot(row.user_id,feedbackChoice.plan.feedback,row);const original=recent.find(item=>item.confirmation_code===feedbackChoice.pending.confirmation_code);if(original)await patchMessage(original,{confirmation_used:true,finance_confirmation:''});await patchMessage(row,{status:'RESOLVIDO',reply:feedbackChoice.cancel?'*Feedback cancelado*\n\nNenhum feedback foi enviado.':feedbackReply(feedbackChoice.plan)});await reply(row,b);return;}
  const confirmation=confirmedWhatsappPlan(transcript,recent,row.user_id,row.sender,financeSecret());
  if(confirmation){await applyFinanceForBot(row.user_id,confirmation.plan,row);const original=recent.find(r=>r.confirmation_code===confirmation.pending.confirmation_code);if(original)await patchMessage(original,{confirmation_used:true,finance_confirmation:''});await patchMessage(row,{status:'LANCADO',entry_id:confirmation.plan.expenses[0]?.payload.id||null,reply:whatsappPlanReply(confirmation.plan)});await reply(row,b);return;}
  const cancelled=cancelledWhatsappPlan(transcript,recent,row.user_id,row.sender,financeSecret());if(cancelled){await patchMessage(cancelled as Inbox,{finance_confirmation:'',confirmation_used:true});await patchMessage(row,{status:'RESOLVIDO',reply:'*Proposta cancelada*\n\nNenhuma alteração foi salva.'});await reply(row,b);return;}
  const edited=editedWhatsappPlan(transcript,recent,row.user_id,row.sender,financeSecret());if(edited){const original=recent.find(r=>r.confirmation_code===edited.pending.confirmation_code)!;const source=original.transcript||original.text;await patchMessage(original,{confirmation_used:true,finance_confirmation:''});await patchMessage(row,{status:'ESCLARECER',finance_confirmation:signWhatsappEdit({plan:edited.plan,source},row.user_id,row.sender,financeSecret()),confirmation_code:edited.pending.confirmation_code,confirmation_used:false,reply:'*✏️ Editar proposta*\n\nEscreva o que deseja corrigir. Ex.: “O valor certo é 1600 reais”, “dia 25” ou “às 15h”.\n\nVou mostrar o novo resumo e aguardar 1 para confirmar. Nenhuma alteração foi salva.'});await reply(row,b);return;}
  const editingRows=recent.filter(r=>r.finance_confirmation?.startsWith(editingPrefix)&&!r.confirmation_used);if(editingRows.length){const valid=editingRows.filter(r=>{try{readWhatsappEdit(r.finance_confirmation!,row.user_id,row.sender,financeSecret());return true;}catch{return false;}});if(valid.length>1)throw new Error('Há mais de uma edição pendente. Cancele a edição anterior e repita o pedido.');if(!valid.length){for(const expired of editingRows)await patchMessage(expired,{confirmation_used:true,finance_confirmation:''});const fresh=quickMonthlyBillDraft(transcript,brazilDay())||quickPlannedExpenseDraft(transcript,brazilDay())||quickExpenseDraft(transcript,brazilDay())||quickAppointmentDraft(transcript,brazilDay());if(fresh){await propose(row,b,fresh,transcript,await financeStateForBot(row.user_id));return;}throw new Error('A edição expirou. Repita o pedido completo.');}const pending=valid[0],edit=readWhatsappEdit(pending.finance_confirmation!,row.user_id,row.sender,financeSecret());if(/^(?:cancelar|desistir|cancela)(?:\s+[a-f0-9]{10})?[.! ]*$/i.test(transcript)){await patchMessage(pending,{confirmation_used:true,finance_confirmation:''});await patchMessage(row,{status:'RESOLVIDO',reply:'*Edição cancelada*\n\nNenhuma alteração foi salva.'});await reply(row,b);return;}const state=await financeStateForBot(row.user_id),plan=quickEditedPlan(edit,transcript,state,row.user_id,row.id,brazilDay()),source=edit.source+'\nCorreção do usuário: '+transcript;if(plan){const replacement=whatsappPending(plan,row.user_id,row.sender,financeSecret());await patchMessage(row,{status:'ESCLARECER',...replacement,transcript:source,reply:whatsappPlanReply(plan,replacement.confirmation_code)});await patchMessage(pending,{confirmation_used:true,finance_confirmation:''});await reply(row,b);return;}if(!key)throw new Error('Escreva a correção do valor, dia ou horário.');const draft=await extractFinance(source,state,key,undefined,undefined,await assistantNameForBot(row.user_id),'resumo',{channel:'whatsapp',pending_edit:true});await propose(row,b,draft,source,state);await patchMessage(row,{transcript:source});await patchMessage(pending,{confirmation_used:true,finance_confirmation:''});return;}
  const hint=whatsappConfirmationHint(transcript,recent,row.user_id,row.sender,financeSecret());
  if(hint){await patchMessage(row,{status:'RESOLVIDO',reply:hint});await reply(row,b);return;}
  if(/^confirmar\b/i.test(transcript))throw new Error('Envie CONFIRMAR seguido do código exato da proposta.');
  const local=quickMonthlyBillDraft(transcript,brazilDay())||quickPlannedExpenseDraft(transcript,brazilDay())||quickExpenseDraft(transcript,brazilDay())||quickAppointmentDraft(transcript,brazilDay());if(local){await propose(row,b,local,transcript,await financeStateForBot(row.user_id));return;}
  if(!key)throw new Error('A interpretação de comandos ainda precisa ser ativada.');
  const previous=recent.find(r=>r.status==='ESCLARECER'&&!r.finance_confirmation&&!r.confirmation_used)?.transcript||'',source=previous&&/^(?:[\dR$]|(?:é|foi|o valor|amanhã|hoje|dia|às|as)\b)/i.test(transcript)?previous+'\nComplemento: '+transcript:transcript;const state=await financeStateForBot(row.user_id),name=await assistantNameForBot(row.user_id),draft=await extractFinance(source,state,key,undefined,undefined,name,'resumo',{channel:'whatsapp'});
  if(draft.intent==='HELP'){await patchMessage(row,{status:'RESOLVIDO',reply:draft.question});await reply(row,b);return;}
  if(draft.intent==='QUERY'){await patchMessage(row,{status:'RESOLVIDO',reply:await answerForBot(row.user_id,draft.query,transcript)});await reply(row,b);return;}
  await propose(row,b,draft,source,state);
 }catch(e){const message=e instanceof Error?e.message:'Não foi possível ler a mensagem.';await patchMessage(row,{transcript,status:/valor|despesa|data|paga|viagem|segurança|pessoal|horário|compromisso/.test(message)?'ESCLARECER':'ERRO',reply:message+'\n\nNenhuma nova alteração foi confirmada. Se pediu para salvar, confira o histórico antes de reenviar.'});await reply(row,b);}
}
export async function processQueue(count=3){for(const row of await pendingReplies()){const b=await getBot(row.user_id);if(b)await reply(row,b);}let processed=0;for(let i=0;i<count;i++){const row=await claimMessage();if(!row)break;await processMessage(row);processed++;}return processed;}
const reminders=globalThis as unknown as {anoteiReminderSweep?:{next:number;running:boolean}};
export async function processReminders(now=Date.now()){
 const sweep=reminders.anoteiReminderSweep??={next:0,running:false};if(sweep.running||sweep.next>now)return 0;sweep.running=true;let queued=0;
 try{for(const row of await pendingReplies(true)){const b=await getBot(row.user_id);if(b)await reply(row,b,now);else await patchMessage(row,{reply_status:'CANCELADO'});}for(const b of await reminderBots()){try{let state=await financeStateForBot(b.user_id);if(state.documents.some(d=>d.kind==='BILL_RULE'&&d.active)&&await expandMonthlyBillsForBot(b.user_id,now))state=await financeStateForBot(b.user_id);for(const r of [...appointmentReminders(state.documents,b.allowed_phones,now),...paymentReminders(state.expenses,b.allowed_phones,now)]){const row=await enqueueReminder(b,r,now);if(row){queued++;await reply(row,b,now);}}}catch{/* Leave existing outbox entries intact; another account must not block this sweep. */}}sweep.next=now+60000;return queued;}finally{sweep.running=false;}
}
const ticks=globalThis as unknown as {anoteiWhatsappTicks?:Map<string,Promise<{processed?:number;reminders?:number;invitations?:number}>>};
export function runWhatsappTick(task:'messages'|'reminders'|'invitations'='messages'){
 const active=ticks.anoteiWhatsappTicks??=new Map();let work=active.get(task);if(!work){work=(async()=>{try{return task==='messages'?{processed:await processQueue(3)}:task==='invitations'?{invitations:await processInvitations()}:{reminders:await processReminders()};}finally{active.delete(task);}})();active.set(task,work);}return work;
}
