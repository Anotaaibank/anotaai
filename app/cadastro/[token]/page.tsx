import {localMode} from '@/lib/server';
import {invitationForToken,rawLocalBot} from '@/lib/whatsapp-members-local';
import PersonalRegistration from '@/components/PersonalRegistration';
export const dynamic='force-dynamic';
export const metadata={title:'Crie sua conta · Anotei na Hora',robots:{index:false,follow:false}};
export default async function Page({params}:{params:Promise<{token:string}>}){
 const {token}=await params,invite=localMode()?invitationForToken(token):null;
 if(!invite)return <main className="anotei-registration"><section className="bank-card"><h1>Convite indisponível</h1><p>Este link foi utilizado, expirou ou foi cancelado. Peça um novo convite a quem enviou a mensagem.</p><a href="/">Já tenho conta: entrar</a></section></main>;
 return <PersonalRegistration token={token} phone={invite.phone} assistantPhone={rawLocalBot(invite.owner_id)!.phone}/>;
}
