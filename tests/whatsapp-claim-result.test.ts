import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {claimedInbox} from '../lib/whatsapp-claim-result.ts';

const job=()=>({id:randomUUID(),user_id:randomUUID(),lease:randomUUID(),sender:'5511999999999',provider_id:'synthetic-message',type:'text',text:'saldo',transcript:'saldo',status:'PROCESSANDO',reply:'',reply_status:'NAO_ENVIADO',created_at:'2026-10-28T15:00:00Z',claimed_at:'2026-10-28T15:00:01Z',reply_version:1});
test('recibo vazio de PostgREST não vira trabalho nem consulta com proprietário ausente',()=>{
 const empty=Object.fromEntries(Object.keys(job()).map(key=>[key,null]));
 for(const result of [null,undefined,[],[null],empty,[empty]])assert.equal(claimedInbox(result),null);
});
test('claim composto único em objeto ou coleção preserva proprietário, lease e revisão',()=>{
 const row=job();assert.equal(claimedInbox(row),row);assert.equal(claimedInbox([row]),row);
});
test('recibos incompletos, múltiplos ou sem cerca válida falham fechados',()=>{
 const row=job();for(const result of [{},true,'ok',[row,row],[[]],{...row,id:null},{...row,user_id:null},{...row,lease:null},{...row,status:'FILA'},{...row,reply_version:-1},{...row,sender:'outside-authorized-format'},{...row,claimed_at:'invalid'}])assert.throws(()=>claimedInbox(result),/Recibo da fila/);
});
