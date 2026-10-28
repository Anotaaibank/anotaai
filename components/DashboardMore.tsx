'use client';
import {MessageCircle,Mic,WalletCards,BookOpen,ChevronRight,LogOut,Users} from 'lucide-react';
import {Localize} from './Localization';
import type {DashboardSection} from '@/lib/dashboard-navigation';

export default function DashboardMore({canManage,demo,onNavigate,onLogout}:{canManage:boolean;demo:boolean;onNavigate:(section:DashboardSection)=>void;onLogout:()=>void}){
 return <Localize><div className="dashboard-more">
  <section aria-label="Mais opções" className="dashboard-more-grid">
   <button className="dashboard-more-card featured" onClick={()=>onNavigate('whatsapp')}><MessageCircle size={25}/><span><strong>WhatsApp</strong><small>Conecte seu número e confira suas mensagens.</small></span><ChevronRight size={20}/></button>
   <button className="dashboard-more-card" onClick={()=>onNavigate('uso')}><Mic size={24}/><span><strong>Meu uso</strong><small>Veja seus pedidos e minutos disponíveis.</small></span><ChevronRight size={20}/></button>
   <a className="dashboard-more-card" href="/assinatura"><WalletCards size={24}/><span><strong>Meu plano e pagamento</strong><small>Consulte sua assinatura e a renovação.</small></span><ChevronRight size={20}/></a>
   {canManage&&!demo&&<a className="dashboard-more-card" href="/gestao"><Users size={24}/><span><strong>Gestão de assinantes</strong><small>Acesso exclusivo da administração.</small></span><ChevronRight size={20}/></a>}
   <a className="dashboard-more-card" href="/manual"><BookOpen size={24}/><span><strong>Como usar</strong><small>Um passo a passo simples para começar.</small></span><ChevronRight size={20}/></a>
   <button className="dashboard-more-card" onClick={()=>onNavigate('feedback')}><MessageCircle size={24}/><span><strong>Enviar feedback</strong><small>Conte o que podemos melhorar.</small></span><ChevronRight size={20}/></button>
  </section>
  <button className="dashboard-sign-out" onClick={onLogout}><LogOut size={19}/>{demo?'Ir para minha conta':'Sair da conta'}</button>
 </div></Localize>;
}
