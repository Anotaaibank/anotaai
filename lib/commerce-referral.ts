import {createHmac,timingSafeEqual} from 'node:crypto';
import {uuid} from './model.ts';
export const referralCookie='anotei-campaign';
export const referralDays=30;
export type Referral={campaign_id:string;captured_at:string;expires:number};
export function signReferral(campaignId:string,secret:string,now=Date.now()){
 if(!uuid(campaignId)||!secret)throw new Error('Configuração da campanha inválida.');
 const value:Referral={campaign_id:campaignId,captured_at:new Date(now).toISOString(),expires:now+referralDays*86400000};
 const payload=Buffer.from(JSON.stringify(value)).toString('base64url');return payload+'.'+createHmac('sha256',secret).update('anotei-referral-v1:'+payload).digest('base64url');
}
export function readReferral(token:string|undefined,secret:string,now=Date.now()):Referral|null{
 if(!token||!secret||token.length>1024)return null;
 try{const [payload,mac,...extra]=token.split('.');if(extra.length||!mac)return null;const expected=createHmac('sha256',secret).update('anotei-referral-v1:'+payload).digest(),given=Buffer.from(mac,'base64url');if(expected.length!==given.length||!timingSafeEqual(expected,given))return null;const value=JSON.parse(Buffer.from(payload,'base64url').toString()) as Referral;if(!uuid(value.campaign_id)||!Number.isSafeInteger(value.expires)||value.expires<=now||!Number.isFinite(Date.parse(value.captured_at))||Date.parse(value.captured_at)>now||value.expires-Date.parse(value.captured_at)!==referralDays*86400000)return null;return value;}catch{return null;}
}
