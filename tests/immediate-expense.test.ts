import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {prepareFinanceDraft,type FinanceDraft} from '../lib/finance-ai.ts';
import {VoiceResources,answerVoiceTools} from '../lib/assistant-client.ts';
const user=randomUUID(),state={documents:[],expenses:[]};
function draft(date?:string,excerpt?:string,status:'REALIZADO'|'PREVISTO'='REALIZADO'):FinanceDraft{return {intent:'COMMAND',command:{action:'expense_create',description:'Sorvete',amount_cents:2500,category:'Restaurante',status,...(date?{date}:{})},confidence:'ALTA',question:'',target_excerpt:'',money_evidence:[{field:'amount_cents',excerpt:'25 reais'}],date_evidence:excerpt?[{field:'date',excerpt}]:[],query:''};}
test('gasto pago sem data usa o dia do pedido, inclusive na virada de mês',()=>{
 for(const text of ['Acabei de gastar 25 reais de sorvete.','Lança 25 reais de sorvete.','Gastei 25 reais de sorvete.']){
  const plan=prepareFinanceDraft(draft(),text,state,user,randomUUID(),'2026-10-01');assert.equal(plan.expenses[0].payload.entry_date,'2026-10-01');assert.equal(plan.expenses[0].payload.status,'REALIZADO');assert.match(plan.lines.join(' '),/01\/10\/2026/);
 }
 const echoed=prepareFinanceDraft(draft('2026-09-15'), 'Acabei de gastar 25 reais de sorvete.',state,user,randomUUID(),'2026-10-01');assert.equal(echoed.expenses[0].payload.entry_date,'2026-10-01');
});
test('ontem e data explícita prevalecem sobre agora; futuro sem vencimento continua perguntando',()=>{
 const yesterday=prepareFinanceDraft(draft('2026-10-01','ontem'),'Ontem gastei 25 reais de sorvete e esqueci de falar.',state,user,randomUUID(),'2026-10-01');assert.equal(yesterday.expenses[0].payload.entry_date,'2026-09-30');
 const dated=prepareFinanceDraft(draft('2026-10-01','08/09/2026'),'Gastei 25 reais de sorvete em 08/09/2026.',state,user,randomUUID(),'2026-10-01');assert.equal(dated.expenses[0].payload.entry_date,'2026-09-08');
 assert.throws(()=>prepareFinanceDraft(draft(undefined,undefined,'PREVISTO'),'Vou pagar 25 reais de sorvete.',state,user,randomUUID(),'2026-10-01'),/data de vencimento/);assert.deepEqual(state,{documents:[],expenses:[]});
});
test('fechar durante a conversa desliga trilhas, áudio, conexão e consultas; é idempotente',async()=>{
 const r=new VoiceResources();let tracks=0,peers=0,channels=0,audios=0;
 r.stream={getTracks:()=>[{stop:()=>tracks++}]} as unknown as MediaStream;
 r.peer={close:()=>peers++} as unknown as RTCPeerConnection;
 const sent:string[]=[];r.channel={readyState:'open',send:(s:string)=>sent.push(s),close:()=>channels++} as unknown as RTCDataChannel;
 r.audio={pause:()=>audios++,srcObject:{}} as unknown as HTMLAudioElement;
 let reply!:(value:unknown)=>void;const work=answerVoiceTools(r,[{type:'function_call',call_id:'waiting',name:'consultar_financas',arguments:'{"topic":"saldo"}'}],()=>new Promise(resolve=>{reply=resolve;}));await Promise.resolve();r.close();r.close();reply({ok:true,answer:'Saldo sintético'});await work;
 assert.equal(tracks,1);assert.equal(peers,1);assert.equal(channels,1);assert.equal(audios,1);assert.equal(r.abort.signal.aborted,true);assert.equal(r.audio.srcObject,null);assert.deepEqual(sent,[]);
});
test('fechar enquanto aguarda permissão não deixa o microfone recebido depois ligado',()=>{
 const r=new VoiceResources();r.close();let stopped=0;assert.equal(r.attachStream({getTracks:()=>[{stop:()=>stopped++}]} as unknown as MediaStream),false);assert.equal(stopped,1);assert.equal(r.stream,null);
});
