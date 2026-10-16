import type {Metadata} from 'next';
import SalesPage from '@/components/SalesPage';
import './sales.css';
export const metadata:Metadata={title:'Anotei na Hora · Contas e agenda pelo WhatsApp',description:'Anote gastos, registre rendas e organize seus compromissos com uma mensagem ou áudio no WhatsApp. Conheça o Anotei na Hora.',robots:{index:false,follow:false}};
export default function Page(){return <SalesPage/>;}
