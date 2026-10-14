import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
const target=JSON.parse(readFileSync(new URL('../deployment/target.json',import.meta.url),'utf8'));
const filled=value=>typeof value==='string'&&value.trim().length>0;
export function deploymentReadiness(env,capabilities=target){
 const problems=[];
 for(const key of ['APP_URL','ANOTA_PUBLIC_URL','ANOTA_WHATSAPP_URL']){try{const u=new URL(env[key]||'');if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||u.pathname!=='/'||u.hostname==='localhost'||u.hostname.endsWith('.trycloudflare.com'))throw Error();}catch{problems.push(key+': configure uma origem HTTPS permanente.');}}
 for(const key of ['OPENAI_API_KEY','ANOTA_WHATSAPP_ADMIN_TOKEN'])if(!filled(env[key]))problems.push(key+': configure no servidor.');
 for(const key of ['ANOTA_WORKER_SECRET','ANOTA_CAMPAIGN_SIGNING_KEY'])if(!filled(env[key])||env[key].length<32)problems.push(key+': use um segredo de pelo menos 32 caracteres.');
 if(!filled(env.ANOTA_MANAGER_USER_IDS)||env.ANOTA_MANAGER_USER_IDS.split(',').some(id=>! /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(id.trim())))problems.push('ANOTA_MANAGER_USER_IDS: configure somente IDs validos do gestor.');
 if(!['local','supabase'].includes(env.ANOTA_STORAGE))problems.push('ANOTA_STORAGE: escolha explicitamente local ou supabase.');
 if(env.ANOTA_STORAGE==='supabase'){
  for(const key of ['SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY','ANOTA_WHATSAPP_ENCRYPTION_KEY'])if(!filled(env[key]))problems.push(key+': configure no servidor.');
  if(env.ANOTA_WHATSAPP_ENCRYPTION_KEY?.length<32)problems.push('ANOTA_WHATSAPP_ENCRYPTION_KEY: segredo insuficiente.');
  try{const u=new URL(env.SUPABASE_URL||'');if(u.origin!=='https://'+capabilities.supabase_project_ref+'.supabase.co'||u.pathname!=='/'||u.username||u.password||u.search||u.hash)throw Error();}catch{problems.push('SUPABASE_URL: o destino deve ser o projeto separado do Anotei.');}
  if(!capabilities.supabase_personal_features_ready)problems.push('Supabase: falta concluir e validar convites pessoais, WhatsApp compartilhado e migracao das contas.');
 }
 return {configuration_ready:problems.length===0,storage:env.ANOTA_STORAGE||null,problems};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){const result=deploymentReadiness(process.env);console.log(JSON.stringify(result));if(!result.configuration_ready)process.exitCode=2;}
