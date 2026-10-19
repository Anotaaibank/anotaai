import {AppError,realDate} from './model.ts';

const weekdays='(?:segunda|terca|quarta|quinta|sexta|sabado|domingo)(?:-feira| feira)?';
const months='(?:janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)';
const number='(?:\\d{1,3}|um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|quinze|vinte|trinta)(?: e (?:um|dois|tres|quatro|cinco|seis|sete|oito|nove))?';
const monthScope='(?:mes(?: que vem| seguinte| proximo| atual| passado| anterior| retrasado)?|proximo mes|este mes|esse mes|'+months+'(?: de \\d{4})?)';
const weekScope='(?:semana que vem|proxima semana|semana seguinte|semana passada|semana anterior|esta semana|essa semana|semana atual)';
const ordinal='(?:primeir[oa]|segund[oa]|terceir[oa]|quart[oa]|quint[oa]|ultim[oa]|penultim[oa]|[1-5][ºª°]?)';
// Long expressions must be consumed before their embedded weekday/day words.
export function relativeCalendarPatterns(){return [
 ordinal+' '+weekdays+' (?:do|de|no) '+monthScope,
 '(?:primeiro|ultimo|penultimo) dia (?:do|de|deste|desse) '+monthScope,
 '(?:fim|final) (?:do|de) '+monthScope,
 weekdays+' (?:da|na|desta|dessa) '+weekScope,
 weekdays+' (?:desta|dessa|nesta|nessa) semana',
 weekScope+'(?:,)? (?:na|no|de) '+weekdays,
 '(?:daqui (?:a|ha)|em|dentro de) '+number+' (?:dias?|semanas?|meses|mes|anos?)',
 '(?:ha|faz) '+number+' (?:dias?|semanas?|meses|mes|anos?)',
 number+' (?:dias?|semanas?|meses|mes|anos?) atras',
 '(?:(?:proxim[oa]|ultim[oa]|passad[oa]|nesta|neste|essa|esse) )?'+weekdays+'(?: (?:passad[oa]|anterior|que vem|agora))?',
 '(?:antes de ontem|anteontem|depois de amanha|ontem|amanha|hoje)'
 ].map(p=>new RegExp('\\b(?:(?:na|no|em|para)\\s+)?'+p+'\\b','g'));}
const fold=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const dayNumber:Record<string,number>={domingo:0,segunda:1,terca:2,quarta:3,quinta:4,sexta:5,sabado:6};
const units:Record<string,number>={um:1,uma:1,dois:2,duas:2,tres:3,quatro:4,cinco:5,seis:6,sete:7,oito:8,nove:9,dez:10,onze:11,doze:12,quinze:15,vinte:20,trinta:30};
const iso=(d:Date)=>d.toISOString().slice(0,10);
const addDays=(d:Date,n:number)=>{const next=new Date(d);next.setUTCDate(next.getUTCDate()+n);return next;};
function monthBase(scope:string,base:Date,direction:boolean|'past'=false){
 const s=scope.replace(/^mes (?:de )?/,'').trim(),named=s.match(new RegExp('^('+months+')(?: de (\\d{4}))?$'));
 if(named){const month=['janeiro','fevereiro','marco','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'].indexOf(named[1]);let year=Number(named[2]||base.getUTCFullYear());if(!named[2]&&direction===true&&month<base.getUTCMonth())year++;if(!named[2]&&direction==='past'&&month>base.getUTCMonth())year--;return new Date(Date.UTC(year,month,1,12));}
 const offset=/que vem|seguinte|proximo/.test(scope)?1:/retrasado/.test(scope)?-2:/passado|anterior/.test(scope)?-1:0;
 return new Date(Date.UTC(base.getUTCFullYear(),base.getUTCMonth()+offset,1,12));
}
function weekStart(scope:string,base:Date){const start=addDays(base,-((base.getUTCDay()+6)%7)),offset=/que vem|proxima|seguinte/.test(scope)?7:/passada|anterior/.test(scope)?-7:0;return addDays(start,offset);}
export function relativeCalendarDate(raw:string,today:string,direction:boolean|'past'=false):string|null{
 if(!realDate(today))throw new AppError('A data de referência do calendário é inválida.');
 const s=fold(raw).replace(/^(?:(?:para|pra) (?:o |a )?|no |na )/,'').replace(/[,.!; ]+$/,''),base=new Date(today+'T12:00:00Z');
 const daily:Record<string,number>={hoje:0,ontem:-1,anteontem:-2,'antes de ontem':-2,amanha:1,'depois de amanha':2};
 if(s in daily)return iso(addDays(base,daily[s]));
 const nth=s.match(new RegExp('^('+ordinal+') ('+weekdays+') (?:do|de|no) ('+monthScope+')$'));
 if(nth){
  const start=monthBase(nth[3],base,direction),weekday=dayNumber[nth[2].replace(/(?:-feira| feira)$/,'')],word=nth[1],ord=/^primeir/.test(word)?1:/^segund/.test(word)?2:/^terceir/.test(word)?3:/^quart/.test(word)?4:/^quint/.test(word)?5:parseInt(word);
  let date:Date;
  if(/ultim/.test(word)){const end=new Date(Date.UTC(start.getUTCFullYear(),start.getUTCMonth()+1,0,12));date=addDays(end,-((end.getUTCDay()-weekday+7)%7)-(/^penultim/.test(word)?7:0));}
  else date=addDays(start,(weekday-start.getUTCDay()+7)%7+7*(ord-1));
  if(date.getUTCMonth()!==start.getUTCMonth())throw new AppError('Esse dia da semana não ocorre tantas vezes nesse mês. Informe outra data.');
  if(new RegExp('^'+months+'$').test(nth[3])&&(direction===true&&iso(date)<today||direction==='past'&&iso(date)>today))return relativeCalendarDate(s+' de '+(start.getUTCFullYear()+(direction===true?1:-1)),today,direction);
  return iso(date);
 }
 const boundary=s.match(new RegExp('^(?:(primeiro|ultimo|penultimo) dia|fim|final) (?:do|de|deste|desse) ('+monthScope+')$'));
 if(boundary){const start=monthBase(boundary[2],base,direction),date=boundary[1]==='primeiro'?iso(start):iso(new Date(Date.UTC(start.getUTCFullYear(),start.getUTCMonth()+1,boundary[1]==='penultimo'?-1:0,12)));if(new RegExp('^'+months+'$').test(boundary[2])&&(direction===true&&date<today||direction==='past'&&date>today))return relativeCalendarDate(s+' de '+(start.getUTCFullYear()+(direction===true?1:-1)),today,direction);return date;}
 const scoped=s.match(new RegExp('^('+weekdays+') (?:da|na|desta|dessa) ('+weekScope+')$')),
  reversed=s.match(new RegExp('^('+weekScope+')(?:,)? (?:na|no|de) ('+weekdays+')$'));
 const currentWeek=s.match(new RegExp('^('+weekdays+') (?:desta|dessa|nesta|nessa) semana$'));
 if(currentWeek)return iso(addDays(weekStart('esta semana',base),(dayNumber[currentWeek[1].replace(/(?:-feira| feira)$/,'')]+6)%7));
 if(scoped||reversed){const weekday=(scoped?.[1]||reversed![2]).replace(/(?:-feira| feira)$/,''),scope=scoped?.[2]||reversed![1];return iso(addDays(weekStart(scope,base),(dayNumber[weekday]+6)%7));}
 const offset=s.match(new RegExp('^(daqui (?:a|ha)|em|dentro de|ha|faz) ('+number+') (dias?|semanas?|meses|mes|anos?)$')),
  ago=s.match(new RegExp('^('+number+') (dias?|semanas?|meses|mes|anos?) atras$'));
 if(offset||ago){const amount=offset?.[2]||ago![1],n=/^\d+$/.test(amount)?Number(amount):amount.split(/\s+e\s+/).reduce((sum,p)=>sum+(units[p]||0),0),unit=offset?.[3]||ago![2],sign=ago||/^(?:ha|faz)$/.test(offset![1])?-1:1;
  if(n<1||n>366||unit.startsWith('semana')&&n>52||/mes|ano/.test(unit)&&n>24)throw new AppError('Informe um intervalo de até 366 dias, 52 semanas ou 24 meses/anos.');
  if(unit.startsWith('dia')||unit.startsWith('semana'))return iso(addDays(base,sign*n*(unit.startsWith('semana')?7:1)));
  const next=new Date(Date.UTC(base.getUTCFullYear()+(unit.startsWith('ano')?sign*n:0),base.getUTCMonth()+(unit.startsWith('mes')?sign*n:0),1,12)),last=new Date(Date.UTC(next.getUTCFullYear(),next.getUTCMonth()+1,0,12)).getUTCDate();next.setUTCDate(Math.min(base.getUTCDate(),last));return iso(next);
 }
 const weekday=s.match(new RegExp('^(?:(proxim[oa]|ultim[oa]|passad[oa]|nesta|neste|essa|esse) )?('+weekdays+')(?: (passad[oa]|anterior|que vem|agora))?$'));
 if(weekday){const index=dayNumber[weekday[2].replace(/(?:-feira| feira)$/,'')],explicitPast=/passad|ultim|anterior/.test(s),explicitFuture=/proxim|que vem/.test(s);let delta=(index-base.getUTCDay()+7)%7;
  if(explicitPast)delta=delta===0?-7:delta-7;
  else if(explicitFuture){if(!delta)delta=7;}
  else if(direction==='past'&&delta)delta-=7;
  return iso(addDays(base,delta));
 }
 return null;
}

export function relativeCalendarPeriods(text:string,today:string){
 const s=fold(text),base=new Date(today+'T12:00:00Z');
 return [...s.matchAll(new RegExp('\\b('+weekScope+'|mes que vem|proximo mes|mes seguinte|mes passado|mes anterior)\\b','g'))].map(m=>{const weekly=/semana/.test(m[0]),start=weekly?weekStart(m[0],base):monthBase(m[0],base),end=weekly?addDays(start,6):new Date(Date.UTC(start.getUTCFullYear(),start.getUTCMonth()+1,0,12));return {start:m.index!,end:m.index!+m[0].length,from:iso(start),to:iso(end),question:weekly?'Em qual dia dessa semana será? Pode dizer, por exemplo, terça-feira.':'Em qual dia desse mês será?'};});
}
