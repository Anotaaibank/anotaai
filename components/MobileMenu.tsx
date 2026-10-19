'use client';
import {Localize} from '@/components/Localization';

import {useEffect,useRef,type ReactNode} from 'react';
import {X} from 'lucide-react';

export default function MobileMenu({open,onClose,children}:{open:boolean;onClose:()=>void;children:ReactNode}){
 const ref=useRef<HTMLDialogElement>(null);
 useEffect(()=>{
  if(!open)return;
  const dialog=ref.current;
  if(!dialog)return;
  const previous=document.activeElement as HTMLElement|null,overflow=document.body.style.overflow;
  dialog.showModal();
  document.body.style.overflow='hidden';
  const media=matchMedia('(min-width: 761px)'),resize=()=>{if(media.matches)onClose();};
  media.addEventListener('change',resize);
  return()=>{media.removeEventListener('change',resize);dialog.close();document.body.style.overflow=overflow;previous?.focus({preventScroll:true});};
 },[open,onClose]);
 return <Localize><dialog ref={ref} id="mobile-app-menu" className="anota-mobile-drawer" aria-labelledby="mobile-menu-title" onCancel={e=>{e.preventDefault();onClose();}} onClick={e=>{if(e.target!==e.currentTarget)return;const r=e.currentTarget.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)onClose();}}>
  <header><div><span>ANOTEI NA HORA</span><h2 id="mobile-menu-title">Tudo ao seu alcance</h2></div><button type="button" autoFocus aria-label="Fechar menu" onClick={onClose}><X size={22}/></button></header>
  {children}
 </dialog></Localize>;
}
