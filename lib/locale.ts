import english from './i18n/en-US.json' with {type:'json'};

export type AppLocale='pt-BR'|'en-US';
export const localeCookie='anotei-locale';
export const appLocale=(value:unknown):AppLocale=>value==='en-US'?'en-US':'pt-BR';
export function localeFromCookie(value:string|null|undefined):AppLocale {
 return appLocale(value?.split(';').map(part=>part.trim()).find(part=>part.startsWith(localeCookie+'='))?.slice(localeCookie.length+1));
}
const catalog:Readonly<Record<string,string>>=english;
const escape=(s:string)=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const templates=Object.entries(catalog).filter(([s])=>s.includes('__ANOTEI_')).map(([source,target])=>{
 const tokens=source.match(/__ANOTEI_\d+__/g)||[];
 const pieces=source.split(/__ANOTEI_\d+__/g);
 return {source,target,tokens,pattern:new RegExp('^'+pieces.map(escape).join('([\\s\\S]+?)')+'$')};
}).filter(t=>t.source.replace(/__ANOTEI_\d+__/g,'').trim().length>=5||t.source==='Olá, __ANOTEI_0__').sort((a,b)=>b.source.length-a.source.length);
const cache=new Map<string,string>();
const monthNames=['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
function englishDate(source:string):string|undefined {
 const numeric=/^(\d{2})\/(\d{2})\/(\d{4})$/.exec(source);
 if(numeric)return numeric[2]+'/'+numeric[1]+'/'+numeric[3];
 const named=/^(?:(?:domingo|segunda-feira|terça-feira|quarta-feira|quinta-feira|sexta-feira|sábado),?\s*)?(?:(\d{1,2}) de )?([a-zç]+) de (\d{4})$/i.exec(source);
 if(!named)return;const month=monthNames.indexOf(named[2].toLocaleLowerCase('pt-BR'));if(month<0)return;
 return new Intl.DateTimeFormat('en-US',{month:'long',...(named[1]?{day:'numeric' as const}:{}),year:'numeric',timeZone:'UTC'}).format(new Date(Date.UTC(Number(named[3]),month,Number(named[1]||1))));
}
export function translatedText(source:string,locale:AppLocale):string {
 if(locale==='pt-BR'||!source.trim())return source;
 const saved=cache.get(source);if(saved!==undefined)return saved;
 // Preserve report paragraphs instead of flattening them for catalog matching.
 if(source.includes('\n'))return source.split('\n').map(line=>translatedText(line,locale)).join('\n');
 const trimmed=source.trim(),key=trimmed.replace(/\s+/g,' ');
 let translated=catalog[key]??englishDate(key);
 if(!translated&&key.length<=6000){for(const template of templates){const match=template.pattern.exec(key);if(!match)continue;const values=new Map(template.tokens.map((token,i)=>[token,match[i+1]]));translated=template.target.replace(/__ANOTEI_\d+__/g,token=>values.get(token)||token);break;}}
 if(!translated&&/ · |: /.test(trimmed))translated=trimmed.split(/( · |: )/).map(part=>/^( · |: )$/.test(part)?part:translatedText(part,locale)).join('');
 if(!translated&&/^\*[^*]+\*$/.test(trimmed))translated='*'+translatedText(trimmed.slice(1,-1),locale)+'*';
 if(!translated)translated=trimmed;
 // Presentation only: same BRL amount, never a conversion to US dollars.
 const originalAmounts=[...source.matchAll(/R\$\s*(-?(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{1,2})?)(?![\d.,])/g)].map(m=>Number(m[1].replace(/\./g,'').replace(',','.')));let moneyIndex=0;
 translated=translated.replace(/R\$\s*-?[\d.,]+/g,amount=>{const value=originalAmounts[moneyIndex++];return value===undefined?amount:new Intl.NumberFormat('en-US',{style:'currency',currency:'BRL'}).format(value);});
 if(/^\d+,\d{2}$/.test(translated))translated=translated.replace(',','.');
 const result=source.slice(0,source.indexOf(trimmed))+translated+source.slice(source.indexOf(trimmed)+trimmed.length);
 if(cache.size>6000)cache.clear();cache.set(source,result);return result;
}
export const hasTranslation=(source:string)=>Object.hasOwn(catalog,source.trim().replace(/\s+/g,' '));
