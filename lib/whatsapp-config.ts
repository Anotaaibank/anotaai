import {AppError} from './model.ts';

export function whatsappWebhookOrigin(env:Record<string,string|undefined>=process.env){
 const raw=env.ANOTA_WHATSAPP_WEBHOOK_URL||env.APP_URL;
 try{const url=new URL(raw||'');if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.pathname!=='/')throw new Error();return url.origin;}
 catch{throw new AppError('Configure o endereço HTTPS de recebimento do WhatsApp antes de conectar.',503);}
}
export function whatsappIntegrationReady(env:Record<string,string|undefined>=process.env){
 try{whatsappWebhookOrigin(env);const url=new URL(env.ANOTA_WHATSAPP_URL||'');return url.protocol==='https:'&&!url.username&&!url.password&&!url.search&&!url.hash&&url.pathname==='/'&&!!env.ANOTA_WHATSAPP_ADMIN_TOKEN&&(env.ANOTA_WORKER_SECRET?.length||0)>=32;}
 catch{return false;}
}
