import test from 'node:test';
import assert from 'node:assert/strict';
import {apiOrigin,ApiError,request} from '../src/core/api.ts';
import {cents,manualCommand} from '../src/core/forms.ts';
import {createAppConfig} from '../config/app-config.ts';
import {monthDays} from '../src/core/calendar.ts';
import {endSession} from '../src/core/session-close.ts';
test('URL mobile: HTTPS em distribuição; somente redes locais no desenvolvimento',()=>{
 assert.equal(apiOrigin('https://example.test',false),'https://example.test');assert.equal(apiOrigin('http://192.168.0.20:3100',true),'http://192.168.0.20:3100');
 for(const url of ['http://example.test','http://192.168.0.20:3100','https://example.test/?token=secret','https://user:pass@example.test','https://example.test/api'])assert.throws(()=>apiOrigin(url,false));
});
test('valores e datas são explícitos; renda, conta avulsa, mensal e agenda são distintos',()=>{
 assert.equal(cents('1250,99'),125099);for(const bad of ['1.250,99','1e3','-20','0','2,999',''])assert.throws(()=>cents(bad));
 const data={description:'Carro',amount:'1500,00',date:'2027-02-05',time:'',monthly:false,expected:true};
 assert.equal(manualCommand('income',data).action,'income_upsert');assert.equal(manualCommand('expense',data).action,'expense_create');assert.equal(manualCommand('expense',{...data,monthly:true}).action,'expense_schedule');assert.equal(manualCommand('appointment',data).action,'appointment_upsert');assert.throws(()=>manualCommand('expense',{...data,date:'2027-02-31'}));
});
test('variantes têm identificadores diferentes sem inventar projeto Expo',()=>{
 const dev=createAppConfig({}),preview=createAppConfig({APP_VARIANT:'preview'}),prod=createAppConfig({APP_VARIANT:'production'});
 assert.equal(dev.android.package,'com.anoteinahora.app.dev');assert.equal(preview.android.package,'com.anoteinahora.app.preview');assert.equal(prod.android.package,'com.anoteinahora.app');assert.equal('eas' in prod.extra,false);assert.throws(()=>createAppConfig({APP_VARIANT:'fake'}));
});
test('transporte omite cookies e não repete automaticamente escritas após erro',async()=>{
 let count=0;await assert.rejects(()=>request('https://example.test',{action:'confirm'},'native-token',async(_,options)=>{count++;assert.equal(options?.credentials,'omit');assert.equal((options?.headers as Record<string,string>).Authorization,'Bearer native-token');return Response.json({error:'Sessão expirada'},{status:401});}),ApiError);assert.equal(count,1);
});
test('calendário acomoda início da semana e fevereiro bissexto',()=>{const days=monthDays('2028-02');assert.equal(days.filter(Boolean).length,29);assert.ok(days.includes('2028-02-29'));assert.equal(days.length%7,0);});
test('falha no armazenamento seguro não impede a tentativa de revogação no servidor',async()=>{let revoked=false;await assert.rejects(()=>endSession(async()=>{throw Error('storage failed');},async()=>{revoked=true;}),/storage failed/);assert.equal(revoked,true);});
test('falha de rede no logout mantém a limpeza local concluída e informa falha',async()=>{let cleared=false;await assert.rejects(()=>endSession(async()=>{cleared=true;},async()=>{throw Error('network failed');}),/network failed/);assert.equal(cleared,true);});
