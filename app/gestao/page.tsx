import Management from '@/components/Management';
import {authorizeManager} from '@/lib/commerce-server';
import {AppError} from '@/lib/model';
export const runtime='nodejs';
export const metadata={title:'Gestão · Anotei na Hora',robots:{index:false,follow:false}};
export default async function Page(){
 try{await authorizeManager();}catch(e){const login=e instanceof AppError&&e.status===401;return <main className="commerce-gate"><h1>{login?'Entre para abrir a gestão':'Acesso restrito'}</h1><p>{login?'Use a sua conta de administrador do Anotei.':'Este painel é exclusivo da conta responsável pelo aplicativo.'}</p><a className="bank-primary" href={login?'/?next=gestao':'/painel'}>{login?'Entrar na minha conta':'Voltar ao Anotei'}</a></main>;}
 return <Management/>;
}
