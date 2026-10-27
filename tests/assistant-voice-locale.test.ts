import test from 'node:test';
import assert from 'node:assert/strict';
import {VoiceResources,answerVoiceTools,prepareVoiceTools} from '../lib/assistant-client.ts';
import {voiceSession} from '../lib/assistant-session.ts';
import type {AppLocale} from '../lib/locale.ts';

const call={type:'function_call',name:'consultar_financas',call_id:'synthetic_balance',arguments:'{"topic":"saldo"}'};
function browserCookie(cookie:string){const old=Object.getOwnPropertyDescriptor(globalThis,'document');let current=cookie;Object.defineProperty(globalThis,'document',{configurable:true,value:{get cookie(){return current;}}});return {set(value:string){current=value;},restore(){if(old)Object.defineProperty(globalThis,'document',old);else Reflect.deleteProperty(globalThis,'document');}};}
function channel(r:VoiceResources){const sent:Record<string,any>[]=[];r.channel={readyState:'open',send:(s:string)=>sent.push(JSON.parse(s)),close:()=>{}} as unknown as RTCDataChannel;return sent;}
function checkLocale(instructions:string,locale:AppLocale){if(locale==='en-US'){assert.match(instructions,/American English/);assert.doesNotMatch(instructions,/Fale português brasileiro/);}else assert.match(instructions,/Fale português brasileiro/);}

for(const locale of ['pt-BR','en-US'] as const){
 test('IW-B: resposta curta e repetição preservam '+locale+' sem reexecutar ferramenta',async()=>{
  const b=browserCookie('anotei-locale='+locale);const r=new VoiceResources(),sent=channel(r);let requests=0;const result={ok:true,saved:false,answer:'Seu saldo atual registrado é R$ 6.000,00.'};
  try{const request=async(name:string,args:unknown)=>{requests++;assert.equal(name,'consultar_financas');assert.deepEqual(args,{topic:'saldo'});return result;};prepareVoiceTools(r,[call],request);await answerVoiceTools(r,[call],request);await answerVoiceTools(r,[call],request);
   assert.equal(requests,1);assert.equal(sent.length,2);assert.deepEqual(JSON.parse(sent[0].item.output),result);const response=sent[1];assert.equal(response.type,'response.create');assert.deepEqual(response.response.tools,[]);assert.equal(response.response.tool_choice,'none');checkLocale(response.response.instructions,locale);assert.doesNotMatch(response.response.instructions,/6\.000/,'Dados da ferramenta não viram instruções');
  }finally{r.close();b.restore();}
 });
 test('IW-B: resumo pendente usa '+locale+' sem afirmar gravação ou mudar dados',async()=>{
  const b=browserCookie('anotei-locale='+locale),r=new VoiceResources(),sent=channel(r),result={ok:true,saved:false,title:'Registrar saída',lines:['25,00 BRL · 27/10/2026 · McDonald’s'],message:'Confira o resumo. 1 confirmar / 2 editar.'};
  try{await answerVoiceTools(r,[{...call,name:'preparar_alteracao',call_id:'pending',arguments:'{"transcript":"Saída 25 reais almoço"}'}],async()=>result);assert.deepEqual(JSON.parse(sent[0].item.output),result);checkLocale(sent[1].response.instructions,locale);assert.match(sent[1].response.instructions,locale==='en-US'?/saved is false/:/saved é false/);assert.deepEqual(sent[1].response.tools,[]);assert.equal(sent[1].response.tool_choice,'none');}
  finally{r.close();b.restore();}
 });
 test('IW-B: falha de ferramenta mantém instruções da sessão '+locale+' e não repete escrita',async()=>{
  const b=browserCookie('anotei-locale='+locale),r=new VoiceResources(),sent=channel(r);let attempts=0;
  try{await answerVoiceTools(r,[{...call,name:'preparar_alteracao'}],async()=>{attempts++;throw Error('synthetic failure');});await answerVoiceTools(r,[call],async()=>{throw Error('must not retry');});assert.equal(attempts,1);const result=JSON.parse(sent[0].item.output);assert.equal(result.ok,false);assert.match(result.error,/Não afirme que salvou/);assert.deepEqual(sent[1],{type:'response.create'});const session=voiceSession('resumo','Lucy',locale);if(locale==='en-US')assert.match(session.instructions,/user selected American English/);else assert.doesNotMatch(session.instructions,/user selected American English/);}
  finally{r.close();b.restore();}
 });
 test('IW-B: encerrar durante a ferramenta em '+locale+' não envia resultado nem nova fala',async()=>{
  const b=browserCookie('anotei-locale='+locale),r=new VoiceResources(),sent=channel(r);let resolve!:(result:unknown)=>void;
  try{const pending=answerVoiceTools(r,[call],()=>new Promise(done=>{resolve=done;}));await Promise.resolve();r.close();resolve({ok:true,answer:'Valor sintético'});await pending;assert.deepEqual(sent,[]);assert.equal(r.abort.signal.aborted,true);}
  finally{r.close();b.restore();}
 });
 test('IW-B: canal fechado durante ferramenta em '+locale+' não força resposta',async()=>{
  const b=browserCookie('anotei-locale='+locale),r=new VoiceResources(),sent=channel(r);let resolve!:(result:unknown)=>void;
  try{const pending=answerVoiceTools(r,[call],()=>new Promise(done=>{resolve=done;}));await Promise.resolve();Object.defineProperty(r.channel,'readyState',{value:'closed'});resolve({ok:true,answer:'Valor sintético'});await pending;assert.deepEqual(sent,[]);}
  finally{r.close();b.restore();}
 });
}
test('IW-B: idioma capturado no início não muda por cookie de outra sessão',async()=>{
 const b=browserCookie('anotei-locale=en-US'),english=new VoiceResources(),sent=channel(english);let resolve!:(result:unknown)=>void;
 try{const pending=answerVoiceTools(english,[call],()=>new Promise(done=>{resolve=done;}));await Promise.resolve();b.set('anotei-locale=pt-BR');resolve({ok:true,answer:'Saldo sintético'});await pending;checkLocale(sent[1].response.instructions,'en-US');const portuguese=new VoiceResources(),next=channel(portuguese);try{await answerVoiceTools(portuguese,[call],async()=>({ok:true,answer:'Saldo sintético'}));checkLocale(next[1].response.instructions,'pt-BR');}finally{portuguese.close();}}
 finally{english.close();b.restore();}
});
test('IW-B: preferência ausente ou inválida conserva padrão pt-BR',async()=>{
 for(const cookie of ['', 'anotei-locale=en-GB','other=en-US']){const b=browserCookie(cookie),r=new VoiceResources(),sent=channel(r);try{await answerVoiceTools(r,[call],async()=>({ok:true,answer:'Saldo sintético'}));checkLocale(sent[1].response.instructions,'pt-BR');}finally{r.close();b.restore();}}
});
