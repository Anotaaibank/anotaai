import {cookies} from 'next/headers';
import {activeCampaign,campaignSecret} from '@/lib/commerce-server';
import {readReferral,referralCookie,referralDays,signReferral} from '@/lib/commerce-referral';
import {failure} from '@/lib/server';
import {AppError} from '@/lib/model';
export const runtime='nodejs';
export async function GET(req:Request,context:{params:Promise<{code:string}>}){try{
 const {code}=await context.params,campaign=await activeCampaign(code);if(!campaign)throw new AppError('Este link de divulgação não está disponível.',404);
 const secret=campaignSecret(),store=await cookies();if(!readReferral(store.get(referralCookie)?.value,secret))store.set(referralCookie,signReferral(campaign.id,secret),{httpOnly:true,sameSite:'lax',secure:new URL(req.url).protocol==='https:',path:'/',maxAge:referralDays*86400});
 return new Response(null,{status:302,headers:{Location:'/?cadastro=1','Cache-Control':'private, no-store','X-Robots-Tag':'noindex, nofollow','Referrer-Policy':'same-origin'}});
 }catch(e){return failure(e);}}
