
import {Localize} from '@/components/Localization';
import type {Metadata} from 'next';
import SalesPage from '@/components/SalesPage';
import './sales.css';
import './cinematic.css';
const title='Anotei · Suas contas organizadas. Sem complicação.';
const description='Mande um áudio ou mensagem no WhatsApp e organize gastos, contas e compromissos com o Anotei. Planos a partir de R$ 49,90 por 30 dias.';
const site='https://icom-anotei.pqaykh.easypanel.host';
export const metadata:Metadata={metadataBase:new URL(site),title,description,alternates:{canonical:'/conheca'},openGraph:{title,description,type:'website',locale:'pt_BR',siteName:'Anotei na Hora',url:'/conheca',images:[{url:'/anotei-na-hora.jpeg',alt:'Anotei na Hora · Falou. Anotou. Organizou.'}]},twitter:{card:'summary_large_image',title,description,images:['/anotei-na-hora.jpeg']},robots:{index:false,follow:false}};
export default function Page(){return <Localize><SalesPage/></Localize>;}
