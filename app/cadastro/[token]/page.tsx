
import {Localize} from '@/components/Localization';
import {invitationForToken,rawPersonalBot} from '@/lib/whatsapp-members';
import PersonalRegistration from '@/components/PersonalRegistration';
import AccessNotice from '@/components/AccessNotice';
export const dynamic='force-dynamic';
export const metadata={title:'Crie sua conta · Anotei na Hora',robots:{index:false,follow:false}};
export default async function Page({params}:{params:Promise<{token:string}>}){
 const {token}=await params,invite=await invitationForToken(token);
 if(!invite)return <AccessNotice registration title="Convite indisponível" message="Se você já criou sua conta, entre com seu e-mail e senha. Se ainda não criou, peça um novo convite: este link foi utilizado, expirou ou foi cancelado." href="/" label="Já tenho conta · Entrar"/>;
 return <Localize><PersonalRegistration token={token} phone={invite.phone} initialName={invite.subscriber_name} assistantPhone={(await rawPersonalBot(invite.owner_id))!.phone}/></Localize>;
}
