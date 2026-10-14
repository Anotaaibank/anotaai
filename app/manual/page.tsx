import type {Metadata} from 'next';
import UserManual from '@/components/UserManual';
import './manual.css';
export const metadata:Metadata={title:'Como usar · Anotei na Hora',description:'Manual ilustrado: primeiro acesso, dinheiro, despesas, contas, agenda e IA pelo WhatsApp.'};
export default function Page(){return <div id="top"><UserManual/></div>;}
