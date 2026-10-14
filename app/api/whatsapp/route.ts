import {authorize,body,failure,json,localMode,sameOrigin} from '@/lib/server';
import {getBot,rawBot,history} from '@/lib/whatsapp-store';
import {saveBot,connectBot,statusBot} from '@/lib/whatsapp-server';
import {AppError} from '@/lib/model';
import {whatsappIntegrationReady} from '@/lib/whatsapp-config';
import {createPersonalInvitation,localInvitationViews,publicAppOrigin} from '@/lib/whatsapp-members-local';
import {isManager,requireManager} from '@/lib/commerce';
import {queueAccessLink,accessLinkViews} from '@/lib/whatsapp-access-links-local';
export const runtime='nodejs';
export const maxDuration=60;
async function result(user:string,live?:Awaited<ReturnType<typeof statusBot>>){
 const [settings,bot,items]=await Promise.all([rawBot(user),getBot(user),history(user)]),participants=localMode()?localInvitationViews(user):[];
 let invitationReady=false;try{publicAppOrigin();invitationReady=localMode()&&isManager(user)&&!!settings&&!settings.shared_owner_id;}catch{}
 return {settings:settings?{phone:settings.phone,allowed_phones:settings.allowed_phones,enabled:settings.enabled,status:settings.status,updated_at:settings.updated_at}:null,connection:live||(bot?await statusBot(bot):null),shared_connection:!!settings?.shared_owner_id,can_invite:!settings?.shared_owner_id&&isManager(user),invitation_ready:invitationReady,participants,access_links:localMode()&&isManager(user)?accessLinkViews(user):[],personal_active_count:bot?.enabled?(settings?.shared_owner_id?bot.allowed_phones.length:bot.allowed_phones.length+participants.filter(p=>p.active).length):0,history:items.map(({id,sender,transcript,status,reply,reply_status,created_at})=>({id,sender,transcript,status,reply,reply_status,created_at})),ai_configured:!!process.env.OPENAI_API_KEY,integration_ready:whatsappIntegrationReady()};
}
export async function GET(){try{const auth=await authorize();return json(await result(auth.user.id));}catch(e){return failure(e);}}
export async function POST(req:Request){try{sameOrigin(req);const auth=await authorize(),input=await body(req);if(input.action==='save')await saveBot(auth,input);else if(input.action==='invite'){requireManager(auth.user.id);if(!localMode())throw new AppError('O cadastro individual precisa ser ativado no banco online.',503);if(typeof input.expected_updated_at!=='string')throw new AppError('Atualize a lista antes de convidar.');createPersonalInvitation(auth.user.id,input.number,input.expected_updated_at);}else if(input.action==='send_access_link'){requireManager(auth.user.id);if(!localMode())throw new AppError('O envio individual precisa ser ativado no banco online.',503);queueAccessLink(auth.user.id,input.number,input.request_id,input.expected_updated_at);}else if(input.action==='connect')return json(await result(auth.user.id,await connectBot(auth)));else throw new AppError('Escolha uma ação disponível.');return json(await result(auth.user.id));}catch(e){return failure(e);}}
