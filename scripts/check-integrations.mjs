import {readFileSync} from 'node:fs';
import {parseEnv} from 'node:util';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';

const filled = value => typeof value === 'string' && value.trim().length > 0;

// Offline configuration check only. Never print values, open the database or contact providers.
export function integrationReadiness(env) {
  const local = env.ANOTA_STORAGE === 'local';
  const voiceMissing = filled(env.OPENAI_API_KEY) ? [] : ['OPENAI_API_KEY'];
  const voice = {state: env.ANOTA_ASSISTANT_ENABLED === 'false' ? 'disabled' : voiceMissing.length ? 'pending' : 'configured', missing: voiceMissing};
  const whatsappMissing = ['OPENAI_API_KEY', 'ANOTA_WHATSAPP_ADMIN_TOKEN'].filter(key => !filled(env[key]));
  const whatsappInvalid = [];
  for (const key of ['ANOTA_WHATSAPP_URL', env.ANOTA_WHATSAPP_WEBHOOK_URL ? 'ANOTA_WHATSAPP_WEBHOOK_URL' : 'APP_URL']) {
    if (!filled(env[key])) {whatsappMissing.push(key);continue;}
    try {
      const url = new URL(env[key]);
      if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') whatsappInvalid.push(key);
    } catch {whatsappInvalid.push(key);}
  }
  if (!filled(env.ANOTA_WORKER_SECRET)) whatsappMissing.push('ANOTA_WORKER_SECRET');
  else if (env.ANOTA_WORKER_SECRET.length < 32) whatsappInvalid.push('ANOTA_WORKER_SECRET');
  if (!local) {
    if (!filled(env.ANOTA_WHATSAPP_ENCRYPTION_KEY)) whatsappMissing.push('ANOTA_WHATSAPP_ENCRYPTION_KEY');
    else if (env.ANOTA_WHATSAPP_ENCRYPTION_KEY.length < 32) whatsappInvalid.push('ANOTA_WHATSAPP_ENCRYPTION_KEY');
  }
  return {storage: local ? 'local' : 'supabase', voice, whatsapp: {state: whatsappMissing.length || whatsappInvalid.length ? 'pending' : 'configured', missing: whatsappMissing, invalid: whatsappInvalid}};
}

export function describeReadiness(report) {
  const lines = ['Anota Aí — configuração das integrações (sem chamadas externas)', `Banco: ${report.storage === 'local' ? 'local' : 'Supabase; este comando não valida o banco'}`];
  lines.push(report.voice.state === 'disabled' ? 'Voz: desativada na configuração.' : report.voice.state === 'configured' ? 'Voz: chave presente; conexão e áudio real ainda precisam ser testados.' : 'Voz: aguarda OPENAI_API_KEY própria ou autorizada.');
  lines.push(report.whatsapp.state === 'configured' ? 'WhatsApp: configuração presente; QR, autorização dos remetentes e worker ainda precisam ser testados.' : 'WhatsApp: configuração pendente.');
  if (report.whatsapp.missing.length) lines.push('Faltam: ' + report.whatsapp.missing.join(', '));
  if (report.whatsapp.invalid.length) lines.push('Revisar: ' + report.whatsapp.invalid.join(', '));
  lines.push('Nenhuma chave, mensagem ou despesa foi exibida ou enviada.');
  return lines.join('\n');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let fileEnv = {};
  try {fileEnv = parseEnv(readFileSync('.env.local', 'utf8'));}
  catch (error) {if (error.code !== 'ENOENT') {console.error('Não foi possível ler .env.local. Confira o arquivo local.');process.exit(1);}}
  console.log(describeReadiness(integrationReadiness({...fileEnv, ...process.env})));
}
