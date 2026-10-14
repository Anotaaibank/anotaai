import './finance.css';
import type {Metadata} from 'next';
import './base.css';
import './voice.css';
import './personal.css';
import './anotei.css';
import './clarity.css';
import './activity.css';
import './commerce.css';
import './login-access.css';
import './payments.css';
import './whatsapp-contacts.css';
import './registration.css';
export const metadata:Metadata={title:'Anotei na Hora · Suas finanças pessoais',description:'Falou. Anotou. Organizou. Salário, saldo, contas e renda extra com inteligência artificial por voz e WhatsApp.'};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="pt-BR"><body>{children}</body></html>;}
