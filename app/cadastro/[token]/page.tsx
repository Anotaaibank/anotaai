import {invitationForToken,rawPersonalBot} from '@/lib/whatsapp-members';
import PersonalRegistration from '@/components/PersonalRegistration';
export const dynamic='force-dynamic';
export const metadata={title:'Crie sua conta · Anotei na Hora',robots:{index:false,follow:false}};
export default async function Page({params}:{params:Promise<{token:string}>}){
 const {token}=await params,invite=await invitationForToken(token);
 if(!invite)return <main className="anotei-registration"><section className="bank-card"><h1>Convite indisponível</h1><p>Se você já criou sua conta, entre com seu e-mail e senha. Se ainda não criou, peça um novo convite: este link foi utilizado, expirou ou foi cancelado.</p><a className="bank-primary" href="/">Já tenho conta · Entrar</a></section></main>;
 return <PersonalRegistration token={token} phone={invite.phone} initialName={invite.subscriber_name} assistantPhone={(await rawPersonalBot(invite.owner_id))!.phone}/>;
}
