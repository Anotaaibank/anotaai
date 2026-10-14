import {realDate} from './model.ts';
import {expenseFold} from './personal-expenses.ts';

// Read dates from the actual message. Model excerpts cannot invent or require a date.
export function expenseDate(transcript:string,excerpt:string|null|undefined,today:string){
 void excerpt;
 const source=expenseFold(transcript),months=['janeiro','fevereiro','marco','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
 const pattern=new RegExp(`\\b(?:\\d{4}-\\d{2}-\\d{2}|\\d{1,2}[/-]\\d{1,2}(?:[/-]\\d{4})?|(?:dia )?\\d{1,2} de (?:${months.join('|')})(?: de \\d{4})?|anteontem|ontem|hoje)\\b`,'g');
 const words=[...source.matchAll(pattern)].map(m=>m[0]),dates=new Set<string>();
 for(const word of words){let date='';
 if(['hoje','ontem','anteontem'].includes(word)){const d=new Date(today+'T12:00:00Z');d.setUTCDate(d.getUTCDate()-(word==='ontem'?1:word==='anteontem'?2:0));dates.add(d.toISOString().slice(0,10));continue;}
 const iso=word.match(/^\d{4}-\d{2}-\d{2}$/),br=word.match(/^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{4}))?$/),written=word.match(/^(?:dia )?(\d{1,2}) de (janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)(?: de (\d{4}))?$/);
 if(iso)date=word;
 else if(br)date=`${br[3]||today.slice(0,4)}-${br[2].padStart(2,'0')}-${br[1].padStart(2,'0')}`;
 else if(written){const month=['janeiro','fevereiro','marco','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'].indexOf(written[2])+1;date=`${written[3]||today.slice(0,4)}-${String(month).padStart(2,'0')}-${written[1].padStart(2,'0')}`;}
 if(!date||!realDate(date)||date<'2000-01-01'||date>today)throw new Error('Confira a data: informe um pagamento já realizado, com dia, mês e ano.');
 dates.add(date);}
 if(dates.size>1||/\b(?:semana passada|mes passado|ano passado|amanha|semana que vem|dia \d{1,2}(?![\d /-]| de))\b/.test(source))throw new Error('Confirme a data do pagamento, com dia, mês e ano.');
 return [...dates][0]||today;
}
