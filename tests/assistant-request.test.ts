import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {voiceToolRequest} from '../lib/assistant-request.ts';
import {VoiceResources,answerVoiceTools} from '../lib/assistant-client.ts';
import {financeReport,financeTopics} from '../lib/finance-report.ts';
import {buildFinancePlan,type FinanceState} from '../lib/finance.ts';

test('consulta aguarda a primeira compilação de 17 segundos sem perder o saldo',async()=>{
 const transport:typeof fetch=async(_url,init)=>new Promise((resolve,reject)=>{
  const signal=init!.signal!,timer=setTimeout(()=>resolve(Response.json({ok:true,saved:false,answer:'Seu saldo atual registrado é R$ 6.000,00.'})),17000);
  signal.addEventListener('abort',()=>{clearTimeout(timer);reject(signal.reason);},{once:true});
 });
 const result=await voiceToolRequest('/api/assistant/finance',{read:true,arguments:{topic:'saldo'}},new AbortController().signal,transport);
 assert.equal(result.ok,true);assert.match(result.answer,/6.000,00/);
});
test('timeout é temporário, sem alegar falta de permissão nem repetir escrita',async()=>{
 let calls=0;const transport:typeof fetch=async()=>{calls++;throw new DOMException('Timeout','TimeoutError');};
 const result=await voiceToolRequest('/api/assistant/finance',{read:true},new AbortController().signal,transport);
 assert.equal(result.ok,false);assert.match(result.error,/demorou/);assert.match(result.error,/não indica falta de acesso/);assert.equal(calls,1);
});
test('erro real de autorização é mantido; encerrar cancela a consulta',async()=>{
 const transport:typeof fetch=async()=>Response.json({error:'Entre na sua conta.'},{status:401});
 assert.deepEqual(await voiceToolRequest('/api/assistant/finance',{},new AbortController().signal,transport),{ok:false,error:'Entre na sua conta.'});
 const abort=new AbortController();abort.abort();
 await assert.rejects(voiceToolRequest('/api/assistant/finance',{},abort.signal,async()=>{throw abort.signal.reason;}));
});
test('saldo e todos os relatórios percorrem a fila de voz com respostas calculadas e estado intacto',async()=>{
 const user=randomUUID(),today='2026-10-09',state:FinanceState={documents:[],expenses:[]};
 const plan=buildFinancePlan({action:'profile_upsert',profile:{opening_balance_cents:600000,opening_date:today,salary_cents:1000000}},state,user,randomUUID(),today);
 state.documents=plan.documents.map(d=>({...d.document,updated_at:today}));const before=JSON.stringify(state);
 const r=new VoiceResources(),sent:string[]=[];r.channel={readyState:'open',send:(data:string)=>sent.push(data),close:()=>{}} as unknown as RTCDataChannel;
 const transport:typeof fetch=async(_url,init)=>{const input=JSON.parse(String(init?.body));assert.equal(input.id,'owner-lease');assert.equal(input.read,true);return Response.json(financeReport(state,input.arguments,today));};
 const topics=financeTopics.filter(t=>t!=='contexto');
 await answerVoiceTools(r,topics.map(topic=>({type:'function_call',name:'consultar_financas',call_id:'read_'+topic,arguments:JSON.stringify({topic})})),(_name,args)=>voiceToolRequest('/api/assistant/finance',{id:'owner-lease',read:true,arguments:args},r.abort.signal,transport));
 const results=sent.map(s=>JSON.parse(s)).filter(e=>e.item?.type==='function_call_output').map(e=>JSON.parse(e.item.output));
 assert.equal(results.length,topics.length);for(const result of results){assert.equal(result.ok,true);assert.equal(result.saved,false);assert.ok(result.answer);}
 assert.match(results.find(x=>x.topic==='saldo').answer,/6.000,00/);assert.equal(JSON.stringify(state),before);assert.equal(sent.map(s=>JSON.parse(s)).filter(e=>e.type==='response.create').length,1);
 r.close();
});
