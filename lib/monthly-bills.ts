import {fold,literalMoney,monetaryLiterals} from './finance-date.ts';
import {personalCategory} from './personal-expenses.ts';
import type {FinanceDraft} from './finance-ai.ts';
import {monthlyDates,AppError} from './model.ts';
export function recurringDay(text:string){const s=fold(text),m=s.match(/\b(?:todo(?:s)?(?: os)?|cada)\s+dia\s+(\d{1,2}|(?:vinte|trinta)(?: e (?:um|dois|tres|quatro|cinco|seis|sete|oito|nove))?|um|dois|tres|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|treze|quatorze|catorze|quinze|dezesseis|dezessete|dezoito|dezenove)\b/)||(/\b(?:todo mes|mensal|mensalmente|recorrente)\b/.test(s)?s.match(/\bdia\s+(\d{1,2})\b/):null);if(!m)return null;const day=literalMoney(m[1])/100;if(day<1||day>31)throw new AppError('Informe um dia de vencimento entre 1 e 31.');return {day,excerpt:m[0]};}
export function nextMonthlyDay(day:number,today:string){for(const month of monthlyDates(today.slice(0,8)+'01',2)){const last=new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7)),0)).getUTCDate(),due=month.slice(0,8)+String(Math.min(day,last)).padStart(2,'0');if(due>=today)return due;}throw new AppError('Confira o próximo vencimento.');}
export function quickMonthlyBillDraft(text:string,today:string):FinanceDraft|null{
 const s=fold(text);if(s.length>700||/[\n?]|\b(?:qual|quais|quanto|como|onde|empresa|loja propria|cnpj|estoque|clientes|contratos|nao|editar|corrigir|alterar|cancela\w*|semanal|semanas|anual|anos|parcelas|vezes|meses|ate|ontem|amanha|comecando|partir)\b/.test(s))return null;
 const recurring=recurringDay(text);if(!recurring)return null;
 let amount=monetaryLiterals(text);if(!amount.length){const withoutDay=s.replace(fold(recurring.excerpt),' ');amount=[...withoutDay.matchAll(/(?<![\w.,/-])\d+(?:[.,]\d+)*(?![\w.,/-])/g)].map(m=>m[0]);}
 if(amount.length!==1||!(/\b(?:pago|pagar|agenda\w*|lanc[ae]\w*|registra\w*|cadastr\w*|anot[ae]\w*|mensal|parcela|prestacao|mensalidade|compromisso)\b/.test(s)))return null;
 let name=s.replace(fold(recurring.excerpt),' ').replace(amount[0],' ').replace(/\b(?:o valor e|o valor|valor e|a parcela e|a mensalidade e)\b/g,' ').replace(/\b(?:todo mes|mensalmente|mensal|por favor|pra mim|para mim|valor de|valor|reais|eu|meu|minha|tenho|um compromisso|uma despesa|um pagamento|pago|pagar|agenda\w*|lanc[ae]\w*|registra\w*|cadastr\w*|anot[ae]\w*|uma conta|conta|ai)\b/g,' ').replace(/^[\s,.!:;-]*(?:de |do |da |o |a )?/,'').replace(/[,.!:;-]+/g,' ').replace(/\s+/g,' ').trim().replace(/\s+(?:de|do|da|por|no|na|em|e|sao)$/,'');
 if(name.length<2||name.length>120||/\d|\be\b/.test(name))return null;name=name[0].toUpperCase()+name.slice(1);
 for(const acronym of text.match(/\b[A-Z]{2,8}\b/g)||[])name=name.replace(new RegExp('\\b'+acronym+'\\b','gi'),acronym);
 return {intent:'COMMAND',command:{action:'expense_schedule',description:name,amount_cents:literalMoney(amount[0]),schedule_type:'MENSAL',amount_mode:'PARCELA',recurring:true,due_day:recurring.day,date:nextMonthlyDay(recurring.day,today),category:personalCategory('',name)},confidence:'ALTA',question:'',query:'',target_excerpt:'',money_evidence:[{field:'amount_cents',excerpt:amount[0]}],date_evidence:[{field:'date',excerpt:recurring.excerpt}]};
}
export function continuedMonthlyBill(previous:string,current:string,today:string){
 if(!/\b(?:mensal|mensalidade|todo dia|todo mes|recorrente|parcela|prestacao)\b/.test(fold(previous))||/[?]|\b(?:como|qual|quanto|cancela\w*|editar|paguei|recebi|ganhei)\b/.test(fold(previous)))return null;
 const source=previous.trim()+' '+current.trim();if(source.length>700)return null;
 const complement=/^(?:(?:o |a )?(?:valor|vencimento|dia|parcela) (?:e |sera )?|(?:e |sao |de )?)(?:r\$\s*)?[\d.,]+(?:\s*reais?)?[.! ]*$/.test(fold(current))||/^(?:todo mes |mensal |)?(?:todo |cada )?dia\s+(?:\d{1,2}|cinco|dez|quinze|vinte)[.! ]*$/.test(fold(current));
 const words=(s:string)=>fold(s).match(/[a-z]{3,}/g)?.filter(w=>!['parcela','mensal','todo','dia','valor','reais','pagar','pago','compromisso','tenho','para','mim'].includes(w))||[];
 const named=!/\d|\b(?:agenda\w*|lanc\w*|paguei|gastei|recebi|ganhei|outro|outra|nova|novo)\b/.test(fold(current))&&words(current).some(w=>words(previous).includes(w));
 if(!complement&&!named)return null;
 const draft=quickMonthlyBillDraft(source,today);if(!draft)return null;
 if(named&&current.trim().length>=2&&current.trim().length<=120){draft.command={...(draft.command as import('./finance.ts').FinanceCommand),description:current.trim().replace(/[.!]+$/,''),category:personalCategory('',current)};}
 return {source,draft};
}
