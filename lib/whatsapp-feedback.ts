import {createHmac,timingSafeEqual} from 'node:crypto';
import {AppError,object} from './model.ts';
import {feedbackInput,feedbackStatusLabel,type Feedback,type FeedbackInput} from './commerce.ts';
export type FeedbackPlan={id:string;feedback:FeedbackInput};
export const feedbackTokenPrefix='feedback.v1.';
const sign=(body:string,key:string)=>createHmac('sha256',key).update('anota-whatsapp-feedback-v1:'+body).digest('base64url');
export function signFeedback(plan:FeedbackPlan,user:string,sender:string,key:string,now=Date.now()){
 const input=feedbackInput(plan.feedback);if(input.id!==plan.id)throw new AppError('Confira a proposta de feedback.');
 const body=Buffer.from(JSON.stringify({actor:user+':whatsapp:'+sender,expires:now+600000,feedback:input})).toString('base64url');return feedbackTokenPrefix+body+'.'+sign(body,key);
}
export function readFeedback(token:string,user:string,sender:string,key:string,now=Date.now()):FeedbackPlan{
 try{if(!token.startsWith(feedbackTokenPrefix)||token.length>18000)throw Error();const [body,signature,...extra]=token.slice(feedbackTokenPrefix.length).split('.');if(extra.length||!body||!signature||!/^[a-zA-Z0-9_-]+$/.test(body))throw Error();const expected=Buffer.from(sign(body,key)),supplied=Buffer.from(signature);if(expected.length!==supplied.length||!timingSafeEqual(expected,supplied))throw Error();const value=object(JSON.parse(Buffer.from(body,'base64url').toString('utf8')));if(Object.keys(value).some(k=>!['actor','expires','feedback'].includes(k))||value.actor!==user+':whatsapp:'+sender||typeof value.expires!=='number'||!Number.isFinite(value.expires)||value.expires<=now||value.expires>now+600000)throw Error();const feedback=feedbackInput(value.feedback);return {id:feedback.id,feedback};}
 catch{throw new AppError('A proposta de feedback expirou ou não pertence a este número. Envie o pedido novamente.');}
}
export function feedbackReply(plan:FeedbackPlan,code?:string){return `*${code?'📝 Confira seu feedback':'✅ Feedback enviado'}*\n\nÁrea: ${plan.feedback.topic}\nTipo: ${plan.feedback.kind}\n\n${plan.feedback.message}\n\n`+(code?`*1 — Confirmar*\n*2 — Cancelar*\n\nAinda não foi enviado. Responda em até 10 minutos. Se houver várias propostas, use CONFIRMAR ${code} / CANCELAR ${code}.`:'Você pode perguntar por aqui pelo andamento e pelo retorno da equipe.');}
export function feedbackAnswer(rows:Feedback[]){return '*💬 Seus feedbacks*\n\n'+(rows.length?`${rows.length} feedback${rows.length===1?'':'s'} enviados.\n\n`+rows.slice(0,10).map(row=>`• *${row.topic} · ${feedbackStatusLabel[row.status]}*\n${row.message}\n${row.response?'Retorno da equipe: '+row.response:'Ainda sem resposta da equipe.'}`).join('\n\n')+(rows.length>10?`\n\nMais ${rows.length-10} feedbacks estão registrados.`:''):'Você ainda não enviou feedbacks. Para enviar, diga: “Envie um feedback sobre Meu dinheiro: gostaria de mais detalhes do saldo.”');}
