
import {Localize} from '@/components/Localization';
import Management from '@/components/Management';
import AccessNotice from '@/components/AccessNotice';
import {authorizeManager} from '@/lib/commerce-server';
import {AppError} from '@/lib/model';
export const runtime='nodejs';
export const metadata={title:'Gestão · Anotei na Hora',robots:{index:false,follow:false}};
export default async function Page(){
 try{await authorizeManager();}catch(e){const login=e instanceof AppError&&e.status===401;return <AccessNotice title={login?'Entre para abrir a gestão':'Acesso restrito'} message={login?'Use a sua conta de administrador do Anotei.':'Este painel é exclusivo da conta responsável pelo aplicativo.'} href={login?'/?next=gestao':'/painel'} label={login?'Entrar na minha conta':'Voltar ao Anotei'}/>;}
 return <Localize><Management/></Localize>;
}
