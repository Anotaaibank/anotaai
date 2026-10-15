import {financeDate,fold,literalMoney} from './finance-date.ts';
import type {FinanceDraft} from './finance-ai.ts';

const number='(?:\\d{1,2}|(?:vinte|trinta)(?: e (?:um|dois|tres|quatro|cinco|seis|sete|oito|nove))?|zero|um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|treze|quatorze|catorze|quinze|dezesseis|dezessete|dezoito|dezenove)';
const months='(?:janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)';
type Span={start:number;end:number;excerpt:string;value:string};
type Facts={date?:Span;time?:Span;description:string};
const command=/^(?:(?:ola|oi|por favor|nao)[,! ]+)*(?:(?:eu )?quero (?:que voce )?)?(?:pode )?(?:agenda|agende|agendar|marca|marque|marcar|me lembra|me lembre)\b/i;
const forbidden=/\b(?:empresas?|lojas?|clientes?|contratos?|estoque|juridico|cnpj|pagar|pagamento|reais|recorr\w*|mensal|todo|toda|semanal|alter\w*|edit\w*|corrig\w*|cancel\w*|arquiv\w*|nao (?:agenda|agende|marca|marque))\b/;
const value=(s:string)=>/^\d+$/.test(s)?Number(s):literalMoney(s)/100;
function timeValue(hour:string,minute:string|undefined,period:string|undefined){
 let h=value(hour),m=minute==='meia'?30:minute?value(minute):0;
 if(h>23||m>59||period==='manha'&&h>12||period&&h===0&&period!=='madrugada')throw Error('Horário inválido');
 if(period==='tarde'||period==='noite'){if(h<12)h+=12;}else if((period==='manha'||period==='madrugada')&&h===12)h=0;
 return String(h).padStart(2,'0')+':'+String(m).padStart(2,'0');
}
export function appointmentFacts(text:string,today:string):Facts|null{
 const original=text.normalize('NFC').trim(),s=fold(original),dates:Span[]=[],times:Span[]=[];
 const add=(list:Span[],pattern:RegExp,convert:(m:RegExpMatchArray)=>string)=>{
  for(const m of s.matchAll(pattern)){const start=m.index!,end=start+m[0].length;if(list.some(span=>start<span.end&&end>span.start))continue;list.push({start,end,excerpt:original.slice(start,end),value:convert(m)});}
 };
 try{
  for(const pattern of [
   /\b\d{4}-\d{2}-\d{2}\b/g,
   /\bdaqui a?\s*(?:\d+|[a-z ]+?)\s+dias?\b/g,
   /\b(?:dia\s+)?\d{1,2}[/-]\d{1,2}(?:[/-]\d{4})?\b/g,
   new RegExp('\\b(?:dia\\s+)?'+number+'\\s+(?:do|de|no)\\s+(?:mes\\s+)?(?:que vem|seguinte|proximo|atual|este mes|'+number+'|'+months+')(?:\\s+(?:de|do ano)\\s+\\d{4})?\\b','g'),
   new RegExp('\\b(?:dia\\s+)?'+number+'\\s+(?:de\\s+)?'+months+'(?:\\s+de\\s+\\d{4})?\\b','g'),
   /\b(?:depois de amanha|amanha|hoje|(?:(?:proxima|proximo|nesta|neste|essa|esse)\s+)?(?:segunda|terca|quarta|quinta|sexta|sabado|domingo)(?:-feira)?)\b/g,
   new RegExp('\\bdia\\s+'+number+'\\b','g')
  ])add(dates,pattern,m=>financeDate(m[0],today,true));
  add(times,new RegExp('\\b(?:as|pelas)\\s+('+number+')(?:(?::|h)(\\d{2}))?(?:\\s+e\\s+('+number+'|meia))?(?:\\s*(?:horas?|h))?(?:\\s+(?:da|de)\\s+(manha|tarde|noite|madrugada))?\\b','g'),m=>timeValue(m[1],m[2]||m[3],m[4]));
  add(times,/\b(\d{1,2})(?::(\d{2})|h(?:(\d{2}))?|\s+horas?)(?:\s+(?:da|de)\s+(manha|tarde|noite|madrugada))?\b/g,m=>timeValue(m[1],m[2]||m[3],m[4]));
 }catch{return null;}
 if(new Set(dates.map(d=>d.value)).size>1||new Set(times.map(t=>t.value)).size>1)return null;
 let title=original;for(const span of [...dates,...times].sort((a,b)=>b.start-a.start))title=title.slice(0,span.start)+' '.repeat(span.end-span.start)+title.slice(span.end);
 title=title.slice(s.match(command)?.[0].length||0).replace(/\b(?:pra mim|para mim|por favor|ou seja|quer dizer|eu tenho|eu vou|eu quero|no próximo|no proximo)\b/gi,' ').replace(/\b(?:um compromisso|o compromisso|um evento)\b/gi,' ')
  .replace(/\s+/g,' ').replace(/(?:\s*[,;:]\s*)+/g,', ').replace(/^[\s,.:;!?-]*(?:(?:no|na|em|para|às|as|um|uma|o|a)\b[\s,.:;!?-]*)*/i,'').replace(/[\s,.:;!?-]+$/,'').trim();
 return {date:dates[0],time:times[0],description:title};
}
export function naturalAppointmentDraft(text:string,today:string):FinanceDraft|null{
 const source=fold(text);if(text.length>900||source.includes('\n')||!command.test(source)||forbidden.test(source))return null;
 const facts=appointmentFacts(text,today);if(!facts?.date||!facts.time&&/\bme lembr[ae]\b/.test(source)||facts.description.length>160)return null;
 if(/\b(?:e outr[oa]|tambem (?:agenda|marca)|outra? (?:reuniao|consulta|compromisso))\b/.test(fold(facts.description)))return null;
 return {intent:'COMMAND',command:{action:'appointment_upsert',description:facts.description||'Compromisso',date:facts.date.value,...(facts.time?{time:facts.time.value}:{})},confidence:'ALTA',question:'',target_excerpt:'',query:'',money_evidence:[],date_evidence:[{field:'date',excerpt:facts.date.excerpt}]};
}
// Reuse literal facts only for a short complement or an unmistakable repetition
// of the same incomplete appointment. Never carry them to another event or date.
export function continuedAppointment(previous:string,current:string,today:string):{draft:FinanceDraft;source:string}|null{
 if(naturalAppointmentDraft(current,today)&&appointmentFacts(current,today)?.time)return null;
 if(!command.test(fold(previous))||forbidden.test(fold(previous))||forbidden.test(fold(current)))return null;
 const old=appointmentFacts(previous,today),next=appointmentFacts(current,today);if(!old||!next||!old.date)return null;
 if(next.date&&next.date.value!==old.date.value)return null;
 if(command.test(fold(current))&&!next.date)return null;
 const keywords=(s:string)=>fold(s).match(/[a-z]{3,}/g)?.filter(w=>!['agenda','agende','agendar','compromisso','evento','para','mim','quero','voce','nao','tenho','uma','por','favor'].includes(w))||[];
 const common=keywords(next.description).filter(w=>keywords(old.description).includes(w));
 const complement=!command.test(fold(current))&&next.description.length<3&&!!(next.date||next.time);
 if(!complement&&new Set(common).size<2)return null;
 const date=next.date||old.date,time=next.time||old.time,description=complement?old.description:next.description;
 if(!time||description.length<2||description.length>160)return null;
 const source=previous+'\nComplemento do mesmo compromisso: '+current;if(source.length>4000)return null;
 return {source,draft:{intent:'COMMAND',command:{action:'appointment_upsert',description,date:date.value,time:time.value},confidence:'ALTA',question:'',target_excerpt:'',query:'',money_evidence:[],date_evidence:[{field:'date',excerpt:date.excerpt}]}};
}
