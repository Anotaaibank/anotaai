import test from 'node:test';
import assert from 'node:assert/strict';
import {deploymentReadiness} from '../scripts/deployment-preflight.mjs';
import {workerConnection} from '../scripts/whatsapp-worker.mjs';

const secret='test-only-secret-never-real-credentials-1234';
function environment(){return {
 APP_URL:'https://app.example.com',ANOTA_PUBLIC_URL:'https://app.example.com',
 ANOTA_WHATSAPP_URL:'https://provider.example.com',OPENAI_API_KEY:secret,
 ANOTA_WHATSAPP_ADMIN_TOKEN:secret,ANOTA_WORKER_SECRET:secret,
 ANOTA_CAMPAIGN_SIGNING_KEY:secret,ANOTA_STORAGE:'supabase',
 ANOTA_MANAGER_USER_IDS:'f604f619-3bdd-4014-9d22-3602bd1c75ab',
 SUPABASE_URL:'https://yqbbbqkouedhrunazpqd.supabase.co',
 SUPABASE_ANON_KEY:secret,SUPABASE_SERVICE_ROLE_KEY:secret,
 ANOTA_WHATSAPP_ENCRYPTION_KEY:secret
};}
const ready={supabase_project_ref:'yqbbbqkouedhrunazpqd',supabase_personal_features_ready:true};

test('deployment blocks incomplete Supabase invitation and shared WhatsApp support',()=>{
 const result=deploymentReadiness(environment());
 assert.equal(result.configuration_ready,false);
 assert.ok(result.problems.some(p=>p.includes('convites pessoais')));
 assert.equal(JSON.stringify(result).includes(secret),false);
});
test('deployment rejects a different database even after compatibility validation',()=>{
 const env=environment();
 assert.equal(deploymentReadiness(env,ready).configuration_ready,true);
 env.SUPABASE_URL='https://unrelated-project.supabase.co';
 assert.equal(deploymentReadiness(env,ready).configuration_ready,false);
});
test('deployment rejects temporary customer URLs and missing worker authentication',()=>{
 const env=environment();
 env.ANOTA_PUBLIC_URL='https://temporary.trycloudflare.com';
 env.ANOTA_WORKER_SECRET='short';
 const result=deploymentReadiness(env,ready);
 assert.equal(result.configuration_ready,false);
 assert.ok(result.problems.some(p=>p.startsWith('ANOTA_PUBLIC_URL:')));
 assert.ok(result.problems.some(p=>p.startsWith('ANOTA_WORKER_SECRET:')));
});
test('worker routes privately without changing the public customer origin',()=>{
 const env={APP_URL:'https://app.example.com',ANOTA_WORKER_URL:'http://web:3000',ANOTA_WORKER_SECRET:secret};
 assert.equal(workerConnection(env).origin,'http://web:3000');
 assert.equal(env.APP_URL,'https://app.example.com');
 assert.equal(workerConnection({APP_URL:env.APP_URL,ANOTA_WORKER_SECRET:secret}).origin,env.APP_URL);
});
test('worker rejects URL credentials and cannot run without authentication',()=>{
 assert.throws(()=>workerConnection({APP_URL:'https://user:private@app.example.com',ANOTA_WORKER_SECRET:secret}),error=>{
  assert.ok(error instanceof Error);
  assert.equal(error.message.includes('private'),false);return true;
 });
 assert.throws(()=>workerConnection({APP_URL:'http://web:3000',ANOTA_WORKER_SECRET:'short'}));
});
