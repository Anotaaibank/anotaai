import {readFinance,signFinance,type FinancePlan} from './finance.ts';
import {AppError} from './model.ts';
import {feedbackTokenPrefix,readFeedback} from './whatsapp-feedback.ts';
import {editingPrefix,readWhatsappEdit} from './whatsapp-edit.ts';
export const whatsappActor=(user:string,sender:string)=>user+':whatsapp:'+sender;
export function confirmationChoice(text:string){const value=text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase().replace(/[.! ]+$/,'');if(/^(?:(?:a |o )?(?:opcao|numero)\s+)?(?:um|uma|1)$/.test(value)||/^(?:sim|confirma|confirmo|confirmar|pode confirmar|pode salvar)$/.test(value))return '1';if(/^(?:(?:a |o )?(?:opcao|numero)\s+)?(?:dois|duas|2)$/.test(value))return '2';return null;}
type PendingRow={user_id:string;sender:string;finance_confirmation?:string;confirmation_code?:string;confirmation_used?:boolean};
function readPending(token:string,user:string,sender:string,key:string,now:number){return token.startsWith(feedbackTokenPrefix)?readFeedback(token,user,sender,key,now):readFinance(token,whatsappActor(user,sender),key,now);}
function numberChoice(text:string,rows:PendingRow[],user:string,sender:string,key:string,choice:'1'|'2',now:number){
 if(confirmationChoice(text)!==choice)return null;
 const valid=rows.filter(r=>r.user_id===user&&r.sender===sender&&!r.confirmation_used&&r.finance_confirmation).filter(r=>{try{const p=readPending(r.finance_confirmation!,user,sender,key,now);return r.confirmation_code===p.id.replaceAll('-','').slice(0,10).toUpperCase();}catch{return false;}});
 if(valid.length>1)throw new AppError('Há mais de uma proposta pendente. Toque no botão da proposta desejada ou envie '+(choice==='1'?'CONFIRMAR':'EDITAR')+' seguido do código dela.');
 if(!valid.length)throw new AppError('Não há proposta válida aguardando resposta. Ela pode ter sido concluída, cancelada ou expirado. Envie um novo pedido.');
 return valid[0].confirmation_code!;
}
export function whatsappPending(plan:FinancePlan,user:string,sender:string,key:string,now=Date.now(),incomplete:string[]=[]){return {finance_confirmation:signFinance(plan,whatsappActor(user,sender),key,now,incomplete),confirmation_code:plan.id.replaceAll('-','').slice(0,10).toUpperCase(),confirmation_used:false};}
export function whatsappFeedbackChoice(text:string,rows:PendingRow[],user:string,sender:string,key:string,now=Date.now()){
 const explicit=text.trim().match(/^(confirmar|cancelar)\s+([a-f0-9]{10})[.!]?$/i),choice=/^2[.!]?$/.test(text.trim())?'2':'1';
 const code=explicit?.[2].toUpperCase()||numberChoice(text,rows,user,sender,key,choice,now);if(!code)return null;
 const pending=rows.find(row=>row.user_id===user&&row.sender===sender&&row.confirmation_code===code);if(!pending?.finance_confirmation?.startsWith(feedbackTokenPrefix))return null;
 if(pending.confirmation_used)throw new AppError('Essa proposta já foi concluída ou cancelada.');
 const plan=readFeedback(pending.finance_confirmation,user,sender,key,now);return {plan,pending,cancel:explicit?explicit[1].toLowerCase()==='cancelar':choice==='2'};
}
export function confirmedWhatsappPlan(text:string,rows:{user_id:string;sender:string;finance_confirmation?:string;confirmation_code?:string;confirmation_used?:boolean}[],user:string,sender:string,key:string,now=Date.now()){
 const code=text.trim().match(/^confirmar\s+([a-f0-9]{10})[.!]?$/i)?.[1]?.toUpperCase()||numberChoice(text,rows,user,sender,key,'1',now);if(!code)return null;
 const pending=rows.find(r=>r.user_id===user&&r.sender===sender&&r.confirmation_code===code);if(pending?.confirmation_used)throw new AppError('Essa proposta já foi concluída ou cancelada. Confira o histórico.');if(!pending?.finance_confirmation)throw new AppError('Confirmação não encontrada para este número. Prepare novamente o comando.');
 return {plan:readFinance(pending.finance_confirmation,whatsappActor(user,sender),key,now),pending};
}
export function cancelledWhatsappPlan(text:string,rows:PendingRow[],user:string,sender:string,key:string,now=Date.now()){
 const code=text.trim().match(/^cancelar\s+([a-f0-9]{10})[.!]?$/i)?.[1]?.toUpperCase();if(!code)return null;
 const pending=rows.find(r=>r.user_id===user&&r.sender===sender&&r.confirmation_code===code);
 if(pending?.confirmation_used)throw new AppError('Essa proposta já foi concluída ou cancelada. Confira o histórico.');
 if(!pending?.finance_confirmation)throw new AppError('Proposta não encontrada para este número.');
 if(pending.finance_confirmation.startsWith(editingPrefix))readWhatsappEdit(pending.finance_confirmation,user,sender,key,now);else readFinance(pending.finance_confirmation,whatsappActor(user,sender),key,now);return pending;
}
export function editedWhatsappPlan(text:string,rows:PendingRow[],user:string,sender:string,key:string,now=Date.now()){
 const code=text.trim().match(/^editar\s+([a-f0-9]{10})[.!]?$/i)?.[1]?.toUpperCase()||numberChoice(text,rows,user,sender,key,'2',now);if(!code)return null;
 const pending=rows.find(r=>r.user_id===user&&r.sender===sender&&r.confirmation_code===code);if(!pending?.finance_confirmation||pending.confirmation_used)throw new AppError('Essa proposta já foi concluída, substituída ou cancelada.');
 return {pending,plan:readFinance(pending.finance_confirmation,whatsappActor(user,sender),key,now)};
}
export function whatsappPlanReply(plan:FinancePlan,code?:string){
 const lines=plan.lines.filter(line=>line.trim()).map(line=>'• '+line.replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g,'$3/$2/$1'));
 return `*${code?'⏳ Aguardando confirmação — ainda não salvo':'✅ Registrado'}*\n\n${plan.title}\n\n${lines.join('\n')}\n\n`+(code?`*1 — Confirmar*\n*2 — Editar*\n\nAinda não foi salvo. Responda em até 10 minutos.\nPara desistir: CANCELAR ${code}.\nSe houver várias propostas, use o botão ou envie CONFIRMAR ${code} / EDITAR ${code}.`:'Você já pode conferir no painel.');
}

// A bare consent gets a deterministic instruction, never an automatic write or a new AI request.
export function whatsappConfirmationHint(text:string,rows:{user_id:string;sender:string;finance_confirmation?:string;confirmation_code?:string;confirmation_used?:boolean}[],user:string,sender:string,key:string,now=Date.now()){
 const normalized=text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
 if(!/^(?:(?:ok|sim|certo|beleza)[,.!]?[ ]+)?(?:pode[ ]+(?:salvar|lancar|registrar)|confirmo|confirmar|salvar|salva|registre|registra|lancar)[.!]?$/.test(normalized))return null;
 const candidates=rows.filter(r=>r.user_id===user&&r.sender===sender&&!r.confirmation_used&&!!r.finance_confirmation),valid=candidates.filter(r=>{
  try{const plan=readPending(r.finance_confirmation!,user,sender,key,now);return r.confirmation_code===plan.id.replaceAll('-','').slice(0,10).toUpperCase();}catch{return false;}
 });
 if(valid.length===1)return 'Toque em Confirmar ou responda 1 para salvar a proposta. Responda 2 para editar.\n\nVocê também pode enviar CONFIRMAR '+valid[0].confirmation_code+'. Ainda não foi salvo.';
 if(valid.length>1)return 'Há mais de uma proposta aguardando confirmação. Responda CONFIRMAR seguido do código da proposta que deseja salvar.';
 return candidates.length?'A proposta expirou ou perdeu a validade. Repita o pedido financeiro para receber uma nova confirmação. Nenhuma alteração foi salva.':'Não há proposta aguardando confirmação para este número. Confira o histórico ou envie um novo pedido financeiro.';
}
