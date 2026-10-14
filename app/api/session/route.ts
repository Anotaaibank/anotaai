import {cookies} from 'next/headers';
import {assistantName} from '@/lib/assistant-name';
import {AppError,object} from '@/lib/model';
import {authorize,body,config,cookieName,failure,json,localMode,sameOrigin} from '@/lib/server';
import {loginLocal,logoutLocal,registerLocal,throttleLocal} from '@/lib/local-db';
import {attributeRegistration,campaignSecret} from '@/lib/commerce-server';
import {attributeLocalRegistration} from '@/lib/commerce-local';
import {readReferral,referralCookie} from '@/lib/commerce-referral';
import {registerPersonalInvitation} from '@/lib/invitation-registration';
import {registerCloudInvitation} from '@/lib/invitation-registration-cloud';
import {authFetch,loginCloud,createCloudSession,logoutCloud,type CloudTokens} from '@/lib/cloud-auth';
export const runtime='nodejs';
export async function GET(){try{const {user}=await authorize();return json({user});}catch(e){return failure(e);}}
export async function POST(req:Request){try{
 sameOrigin(req);const input=object(await body(req)),email=typeof input.email==='string'?input.email.trim().toLowerCase():'',password=input.password,name=typeof input.name==='string'?input.name.trim():'';
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254||typeof password!=='string'||password.length>128||password.length<(input.action==='register'?10:1)||input.action==='register'&&(name.length<2||name.length>80))throw new AppError('Confira nome, e-mail e senha. Para criar a conta, use pelo menos 10 caracteres na senha.');
 throttleLocal('login:'+email,10,600000);let token:string,user;const referral=(await cookies()).get(referralCookie)?.value;
 if(input.invitation&&input.action!=='register')throw new AppError('Use o cadastro pessoal do convite.',400);
 if(localMode()){const origin=referral?readReferral(referral,campaignSecret()):null;const result=input.action==='register'?(input.invitation?registerPersonalInvitation({...input,email,password,name}):registerLocal(email,password,name,assistantName(input.assistant_name),origin?userId=>{attributeLocalRegistration(userId,origin);}:undefined)):loginLocal(email,password);token=result.token;user=result.user;}
 else {
  if(input.invitation){const result=await registerCloudInvitation({...input,email,password,name});token=result.token;user=result.user;}
  else if(input.action==='register'){
   const response=await authFetch('signup','POST',{email,password,data:{name,assistant_name:assistantName(input.assistant_name)}});
   if(!response.ok)throw new AppError('Não foi possível criar a conta. Confira os dados.',401);
   const tokens=await response.json() as CloudTokens;
   if(tokens.user&&referral)await attributeRegistration(tokens.user.id,referral,tokens.user.created_at).catch(()=>console.warn('Não foi possível registrar a origem deste cadastro.'));
   if(!tokens.access_token)return json({confirmation_required:true,message:'Confira seu e-mail para ativar a conta. Depois entre com sua senha.'});
   const result=createCloudSession(tokens);token=result.token;user=result.user;
  }else{const result=createCloudSession(await loginCloud(email,password));token=result.token;user=result.user;}
 }
 const origin=req.headers.get('origin');const secure=process.env.APP_URL?.startsWith('https:')||!!origin&&origin===process.env.ANOTA_PUBLIC_URL&&origin.startsWith('https:');
 (await cookies()).set(cookieName,token,{httpOnly:true,sameSite:'strict',secure:!!secure,path:'/',maxAge:86400});return json({user});
 }catch(e){return failure(e);}}
export async function DELETE(req:Request){try{sameOrigin(req);const cookie=(await cookies()).get(cookieName)?.value;if(cookie){if(localMode())logoutLocal(cookie);else await logoutCloud(cookie);}(await cookies()).delete(cookieName);return json({ok:true});}catch(e){return failure(e);}}
