import {expenseContext,audienceLabel,natureLabel,type ExpenseAudience,type ExpenseNature} from './expense-context.ts';
import {expenseDate} from './expense-date.ts';
import {personalCategories,personalCategory,tripName,expenseFold} from './personal-expenses.ts';
import {createHash,timingSafeEqual} from 'node:crypto';
import {phoneBR} from './whatsapp.ts';
import {adminInput} from './expenses.ts';
import {brazilDay,currency} from './model.ts';


export const botName='anota-ai-assistente';
export type ExpenseDraft={intent:'DESPESA'|'OUTRO'|'MULTIPLAS'|'CONSULTA';query_audience?:ExpenseAudience|null;query_nature?:ExpenseNature|null;scope:'PESSOAL'|'LOJA';description:string;category:string;amount:string|null;amount_excerpt:string|null;paid:boolean|null;payment_method:'PIX'|'DINHEIRO'|'CARTAO'|'TRANSFERENCIA'|'OUTRO'|null;date:string|null;date_excerpt?:string|null;trip_name?:string|null;trip_excerpt?:string|null;query_period?:'total'|'mes_atual'|'mes_anterior';uses_previous?:boolean;plate:string|null;confidence:'ALTA'|'BAIXA';question:string};
export type BotMessage={provider_id:string;sender:string;type:'audio'|'text';text:string;sent_at:string};
const object=(v:unknown):Record<string,unknown>=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:{};
export function secureEqual(a:unknown,b:string){if(typeof a!=='string'||!b)return false;return timingSafeEqual(createHash('sha256').update(a).digest(),createHash('sha256').update(b).digest());}
export function messageFromWebhook(value:unknown,phone:string,now=Date.now()):BotMessage|null{
 const root=object(value),m=object(root.message);
 if(root.EventType!=='messages'||m.fromMe!==false||m.isGroup!==false||m.wasSentByApi===true||m.edited||m.reaction||m.vote)return null;
 let owner:string,sender:string;try{owner=phoneBR(root.owner);sender=phoneBR(String(m.sender_pn||m.sender||'').split('@')[0]);}catch{return null;}
 const chat=String(m.chatid||''),pn=/^\d+@s\.whatsapp\.net$/.test(chat)&&chat.split('@')[0]===sender;
 const lid=/^\d+@lid$/.test(chat)&&m.sender_lid===chat&&/^\d+@s\.whatsapp\.net$/.test(String(m.sender_pn||''));
 if(owner!==phone||!pn&&!lid)return null;
 const id=m.messageid||m.id;if(typeof id!=='string'||! /^[A-Za-z0-9:_-]{1,180}$/.test(id))return null;
 let ms=Number(m.messageTimestamp);if(ms<100000000000)ms*=1000;
 if(!Number.isFinite(ms)||ms<now-600000||ms>now+60000)return null;
 const type=String(m.messageType||'').toLowerCase(),content=object(m.content);
 const audio=['audio','audiomessage','ptt','voice','voicemessage'].includes(type)||!!content.audioMessage;
 const response=object(content.buttonsResponseMessage),list=object(object(content.listResponseMessage).singleSelectReply),buttonReply=object(content.buttonReply);
 const choices=[m.buttonOrListid,m.buttonOrListId,response.selectedButtonId,response.selectedButtonID,list.selectedRowId,buttonReply.selectedId].filter((v):v is string=>typeof v==='string'&&!!v);
 if(new Set(choices).size>1)return null;
 const choice=choices[0];
 const button=typeof choice==='string'&&/^(?:CONFIRMAR|EDITAR|CANCELAR) [a-f0-9]{10}$/i.test(choice)?choice:'';
 const text=button||(typeof m.text==='string'?m.text.trim():typeof m.content==='string'&&!audio?m.content.trim():'');
 if(!audio&&!button&&!['conversation','extendedtextmessage','text'].includes(type)||!audio&&(!text||text.length>4000))return null;
 return {provider_id:id,sender,type:audio?'audio':'text',text:audio?'':text,sent_at:new Date(ms).toISOString()};
}
export function expenseCents(value:unknown){if(typeof value!=='string'||!/^\d{1,7}(?:,\d{2})?$/.test(value))throw new Error('Informe um único valor em reais, por exemplo R$ 250,00.');const [reais,centavos='00']=value.split(',');const cents=Number(reais)*100+Number(centavos);if(!Number.isSafeInteger(cents)||cents<=0||cents>1000000000)throw new Error('Informe um valor positivo dentro do limite do sistema.');return cents;}
export function expensePayload(d:ExpenseDraft,transcript:string,id:string,_stocks:unknown[],today=brazilDay(),origin:'WHATSAPP'|'VOICE'='WHATSAPP'){
 if(d.intent==='OUTRO')throw new Error('Envie uma despesa para lançar: o que foi pago e o valor.');
 if(d.intent==='MULTIPLAS')throw new Error('Envie uma despesa por mensagem, com o valor de cada uma separado.');
 if(d.intent!=='DESPESA')throw new Error('Envie uma despesa já paga para registrar.');
 if(d.confidence!=='ALTA')throw new Error('Não entendi a despesa com segurança. Envie novamente o valor e a finalidade, por texto ou áudio.');
 if(!d.amount||!d.amount_excerpt||!transcript.toLocaleLowerCase('pt-BR').includes(d.amount_excerpt.toLocaleLowerCase('pt-BR')))throw new Error('Qual foi o valor? Informe a despesa e o valor em reais.');
 const amount_cents=expenseCents(d.amount);
 const numeric=d.amount_excerpt.replace(/^R\$\s*/i,'').trim();
 if(/^\d+(?:[.,]\d+)*$/.test(numeric)){const normalized=numeric.includes(',')?numeric.replaceAll('.',''):numeric.replace(/\.(?=\d{3}(?:\.|$))/g,'');if(expenseCents(normalized)!==amount_cents)throw new Error('O valor não ficou claro. Confirme o valor em reais.');}
 if(d.payment_method!==null&&!['PIX','DINHEIRO','CARTAO','TRANSFERENCIA','OUTRO'].includes(d.payment_method))throw new Error('Informe como a despesa foi paga.');
 if(d.paid!==true)throw new Error('A despesa já foi paga? Diga que já pagou e informe a despesa e o valor para registrar a saída.');
 if(d.scope!=='PESSOAL'||typeof d.description!=='string'||d.description.trim().length<2||d.description.length>160||typeof d.category!=='string'||d.category.length>80)throw new Error('Informe para que foi a despesa pessoal.');
 const date=expenseDate(transcript,d.date_excerpt,today);
 const details:Record<string,unknown>={notes:origin==='VOICE'?'Origem: Anota IA por voz · confirmação no painel':`Origem: WhatsApp Anota Aí · mensagem ${id}`,payment_method:d.payment_method||'OUTRO'};
 if(d.trip_name){const name=tripName(d.trip_name);if(!d.trip_excerpt||!/(?:viagem|ferias)/.test(expenseFold(d.trip_excerpt))||!expenseFold(transcript).includes(expenseFold(d.trip_excerpt))||!expenseFold(d.trip_excerpt).includes(expenseFold(name)))throw new Error('Confirme o nome da viagem.');details.trip_name=name;}
 const personal=personalCategory(d.category,d.description),category=d.scope==='PESSOAL'?(personalCategories.includes(personal as typeof personalCategories[number])?personal:'Outras despesas pessoais'):d.category;
 if(d.scope==='PESSOAL')Object.assign(details,expenseContext(transcript,category));
 return adminInput({id,kind:'PESSOAL',scope:'PESSOAL',description:d.description.trim(),category,entry_date:date,amount_cents,status:'REALIZADO',details,expected_updated_at:null});
}
export function expenseReply(p:Omit<ReturnType<typeof expensePayload>,'expected_updated_at'>){return `✅ Lançado no Anota Aí: ${currency(p.amount_cents!)} — ${p.description}.\nCategoria: ${p.category}${p.details.trip_name?' · Viagem: '+p.details.trip_name:''} · ${audienceLabel(p.details.expense_audience)} · ${natureLabel(p.details.expense_nature)}.\nData: ${p.entry_date.split('-').reverse().join('/')} · ${p.details.payment_method}.\nConfira em Despesas pessoais. Código: ${p.id.slice(0,8)}.`;}
