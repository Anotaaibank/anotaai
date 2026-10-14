import {test,mock} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {startVoice,closeVoice,claimVoiceRead} from '../lib/assistant-server.ts';
import {integrationReadiness,describeReadiness} from '../scripts/check-integrations.mjs';

test('checagem offline distingue chave presente de conexão real e não expõe segredos',()=>{
  const secret='never-print-this-private-value';
  const local=integrationReadiness({ANOTA_STORAGE:'local',APP_URL:'http://localhost:3100'});
  assert.equal(local.voice.state,'pending');
  assert.ok(local.whatsapp.invalid.includes('APP_URL'));
  const report=integrationReadiness({ANOTA_STORAGE:'local',APP_URL:'https://anota.example',OPENAI_API_KEY:secret,ANOTA_WHATSAPP_URL:'https://provider.example',ANOTA_WHATSAPP_ADMIN_TOKEN:secret,ANOTA_WORKER_SECRET:'a'.repeat(32)});
  assert.equal(report.voice.state,'configured');assert.equal(report.whatsapp.state,'configured');
  const description=describeReadiness(report);
  assert.ok(!description.includes(secret));assert.ok(description.includes('ainda precisam ser testados'));
  assert.equal(integrationReadiness({OPENAI_API_KEY:secret,ANOTA_ASSISTANT_ENABLED:'false'}).voice.state,'disabled');
});

test('voz sem chave não faz chamada externa',async()=>{
  const original=process.env.OPENAI_API_KEY;delete process.env.OPENAI_API_KEY;
  const transport=mock.method(globalThis,'fetch',async()=>{throw new Error('Unexpected network request');});
  try {await assert.rejects(startVoice(randomUUID(),{sdp:'v=0\nm=audio 9',section:'pessoal'},new AbortController().signal),error=>!!error&&typeof error==='object'&&'status' in error&&error.status===503);assert.equal(transport.mock.callCount(),0);}
  finally {transport.mock.restore();if(original===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=original;}
});

test('conversa de voz só aceita consultas e encerramento do usuário proprietário',async()=>{
  const key=process.env.OPENAI_API_KEY,enabled=process.env.ANOTA_ASSISTANT_ENABLED;
  process.env.OPENAI_API_KEY='test-only-placeholder';process.env.ANOTA_ASSISTANT_ENABLED='true';
  const transport=mock.method(globalThis,'fetch',async()=>new Response('v=0\nm=audio 9',{headers:{Location:'/v1/realtime/calls/rtc_test_owner'}}));
  const owner=randomUUID(),other=randomUUID();let session:{id:string}|undefined;
  try {
    session=await startVoice(owner,{sdp:'v=0\nm=audio 9',section:'pessoal'},new AbortController().signal);
    assert.throws(()=>claimVoiceRead(other,session!.id));
    await closeVoice(other,session.id);assert.equal(transport.mock.callCount(),1);
    for(let i=0;i<40;i++)claimVoiceRead(owner,session.id);
    assert.throws(()=>claimVoiceRead(owner,session!.id));
    await closeVoice(owner,session.id);assert.equal(transport.mock.callCount(),2);
    assert.throws(()=>claimVoiceRead(owner,session!.id));
    await closeVoice(owner,session.id);assert.equal(transport.mock.callCount(),2);
  } finally {
    if(session)await closeVoice(owner,session.id);transport.mock.restore();
    if(key===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=key;
    if(enabled===undefined)delete process.env.ANOTA_ASSISTANT_ENABLED;else process.env.ANOTA_ASSISTANT_ENABLED=enabled;
  }
});

test('conversa cancelada durante a resposta do provedor é encerrada sem liberar consulta',async()=>{
  const key=process.env.OPENAI_API_KEY,enabled=process.env.ANOTA_ASSISTANT_ENABLED;
  process.env.OPENAI_API_KEY='test-only-placeholder';process.env.ANOTA_ASSISTANT_ENABLED='true';
  const cancel=new AbortController(),owner=randomUUID();
  const transport=mock.method(globalThis,'fetch',async()=>{if(!cancel.signal.aborted)cancel.abort();return new Response('v=0\nm=audio 9',{headers:{Location:'/v1/realtime/calls/rtc_test_cancel'}});});
  try {await assert.rejects(startVoice(owner,{sdp:'v=0\nm=audio 9',section:'pessoal'},cancel.signal));assert.equal(transport.mock.callCount(),2);}
  finally {transport.mock.restore();if(key===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=key;if(enabled===undefined)delete process.env.ANOTA_ASSISTANT_ENABLED;else process.env.ANOTA_ASSISTANT_ENABLED=enabled;}
});
