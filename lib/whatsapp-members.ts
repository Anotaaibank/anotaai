import {createHash,randomBytes,randomUUID} from 'node:crypto';
import * as local from './whatsapp-members-local.ts';
import {localSecret} from './local-db.ts';
import {localMode,service} from './server.ts';
import {seal,unseal} from './secret-box.ts';
import {AppError} from './model.ts';
import {phoneBR} from './whatsapp.ts';
import type {Bot} from './whatsapp-store.ts';
export type {PersonalInvitation} from './whatsapp-members-local.ts';
export const publicAppOrigin=local.publicAppOrigin;
export const invitationHash=(value:string)=>createHash('sha256').update(value).digest('hex');
export function personalSecret(){const key=localMode()?localSecret():process.env.ANOTA_WHATSAPP_ENCRYPTION_KEY;if(!key||key.length<32)throw new AppError('Configure a proteção dos convites no servidor.',503);return key;}
export async function rawPersonalBot(user:string){if(localMode())return local.rawLocalBot(user);const [bot]=await service<Bot[]>('anota_whatsapp_bots?user_id=eq.'+encodeURIComponent(user));return bot||null;}
export async function personalInvitations(owner:string){if(localMode())return local.localInvitations(owner);const result:local.PersonalInvitation[]=[];for(let offset=0;;offset+=1000){const rows=await service<local.PersonalInvitation[]>('anota_whatsapp_invitations?owner_id=eq.'+encodeURIComponent(owner)+'&order=created_at,id&limit=1000&offset='+offset);result.push(...rows);if(rows.length<1000)return result;}}
export async function personalRecipient(owner:string,phone:string):Promise<string|null>{if(localMode())return local.personalRecipient(owner,phone);return service<string|null>('rpc/anota_personal_recipient','POST',{p_owner:owner,p_phone:phone});}
export async function effectivePersonalBot(user:string):Promise<Bot|null>{
 if(localMode())return local.localEffectiveBot(user);
 const own=await rawPersonalBot(user);if(!own)return null;
 if(!own.shared_owner_id){const invitations=await personalInvitations(user),members=new Set(invitations.map(i=>i.phone));return {...own,allowed_phones:own.allowed_phones.filter(phone=>!members.has(phone))};}
 const master=await rawPersonalBot(own.shared_owner_id);
 if(!master||master.shared_owner_id)return {...own,enabled:false};
 const permitted=own.allowed_phones.length>=1&&own.allowed_phones.length<=2&&await personalRecipient(master.user_id,own.allowed_phones[0])===user;
 return {...own,phone:master.phone,status:master.status,enabled:permitted,token_cipher:master.token_cipher,connection_user_id:master.user_id};
}
export async function createPersonalInvitation(owner:string,rawPhone:unknown,expected:string,now=Date.now()){
 if(localMode())return local.createPersonalInvitation(owner,rawPhone,expected,now);
 publicAppOrigin();const phone=phoneBR(rawPhone),prior=(await personalInvitations(owner)).find(i=>i.phone===phone),id=prior?.id||randomUUID(),token=randomBytes(32).toString('base64url');
 return service<local.PersonalInvitation>('rpc/anota_create_invitation','POST',{p_owner:owner,p_phone:phone,p_expected:expected,p_candidate:{id,token_hash:invitationHash(token),token_cipher:seal(token,personalSecret(),'anotei-invitation:'+id)}});
}
export async function invitationForToken(value:unknown,now=Date.now()):Promise<local.PersonalInvitation|null>{
 if(localMode())return local.invitationForToken(value,now);
 if(typeof value!=='string'||! /^[A-Za-z0-9_-]{43}$/.test(value))return null;
 const [invite]=await service<local.PersonalInvitation[]>('anota_whatsapp_invitations?token_hash=eq.'+invitationHash(value));
 if(!invite||!invite.active||invite.user_id||invite.expires_at<=now)return null;
 const master=await rawPersonalBot(invite.owner_id);
 return master?.enabled&&master.status==='PRONTO'&&!master.shared_owner_id&&master.allowed_phones.includes(invite.phone)?invite:null;
}
export function invitationText(invite:local.PersonalInvitation){
 if(localMode())return local.invitationText(invite);
 const token=unseal(invite.token_cipher,personalSecret(),'anotei-invitation:'+invite.id);
 return '*Bem-vindo ao Anotei na Hora!*\n\nCrie sua conta pessoal e cadastre seu salário e saldo atual:\n'+new URL('/cadastro/'+token,publicAppOrigin()).href+'\n\nSuas finanças ficam separadas das outras pessoas. Depois do cadastro, você poderá conversar comigo por áudio ou texto neste WhatsApp.\n\nO convite é individual e vale por 7 dias.';
}
export async function invitationViews(owner:string){
 if(localMode())return local.localInvitationViews(owner);
 return Promise.all((await personalInvitations(owner)).map(async i=>({phone:i.phone,registered:!!i.user_id,active:!!i.active&&!!i.user_id&&await personalRecipient(owner,i.phone)===i.user_id,send_status:i.send_status,expired:i.expires_at<=Date.now()})));
}
