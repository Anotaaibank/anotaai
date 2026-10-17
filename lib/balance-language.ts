import {fold,literalMoney,spokenNumber} from './finance-date.ts';
import type {FinanceDraft} from './finance-ai.ts';

export function currentBalanceIntent(text:string){
 const s=fold(text);
 if(!/\bsaldo\b/.test(s)||/\bsaldo inicial\b/.test(s)||/^(?:qual|quanto|como|onde|se eu)\b/.test(s))return false;
 if(/\b(?:ganhei|ganhar|recebi|receber|entrou|entraram|caiu)\b/.test(s)&&!/\b(?:ajuste|corrigir|corrige|corrija)\b/.test(s))return false;
 return /\b(?:atualiz[ae]|atualizar|ajust[ae]|ajustar|corrig[ea]|corrija|corrigir|alter[ae]|deix[ae])\b/.test(s);
}
export function signedBalanceMoney(excerpt:string){const s=fold(excerpt).replace(/^menos\s+/,'-');return s.startsWith('-')?-Math.abs(literalMoney(s.slice(1))):literalMoney(s);}
export function currentBalanceDraft(text:string):FinanceDraft|null{
 if(!currentBalanceIntent(text))return null;
 const s=fold(text),empty:FinanceDraft={intent:'CLARIFY',command:null,question:'Qual é o saldo atual correto, em reais?',query:'',confidence:'ALTA',target_excerpt:'',money_evidence:[],date_evidence:[]};
 if(/\bou\b|nao (?:lembro|sei)|talvez/.test(s))return {...empty,question:'Qual é o saldo correto? Informe apenas um valor para o ajuste.'};
 const pattern=new RegExp('(?<![\\p{L}\\d])(?:menos\\s+|-\\s*)?(?:R\\$\\s*)?'+spokenNumber+'(?:\\s+reais?)?(?![\\p{L}\\d])','giu');
 const amounts=[...text.matchAll(pattern)].filter(m=>!['um','uma'].includes(fold(m[0])));
 if(!amounts.length)return empty;
 // The two-value form names the former value and then the desired absolute balance.
 const target=text.match(new RegExp('\\b(?:para|pra)\\s+((?:menos\\s+|-\\s*)?(?:R\\$\\s*)?'+spokenNumber+'(?:\\s+reais?)?)','iu'));
 if(amounts.length>1&&!target)return null;
 const excerpt=target?.[1]||amounts[0][0];let value:number;try{value=signedBalanceMoney(excerpt);}catch{return null;}
 if(!Number.isSafeInteger(value)||Math.abs(value)>1000000000)return {...empty,question:'Informe um saldo válido de até dez milhões de reais, positivo, zero ou negativo.'};
 return {...empty,intent:'COMMAND',question:'',command:{action:'balance_adjust',balance_cents:value},money_evidence:[{field:'balance_cents',excerpt}]};
}
