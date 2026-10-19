'use client';
import {createContext,useContext,useEffect,useMemo,useRef,useState,type ReactNode} from 'react';
import {Languages} from 'lucide-react';
import {appLocale,localeCookie,translatedText,type AppLocale} from '@/lib/locale';
import {localizedTree} from '@/lib/localized-tree';

const LanguageContext=createContext<AppLocale>('pt-BR');
export function useAppLocale(){return useContext(LanguageContext);}
// Account names, user-entered descriptions and messages remain verbatim.
export function OriginalText({children}:{children:ReactNode}){return children;}
export function Localize({children}:{children:ReactNode}) {
 const locale=useAppLocale();return useMemo(()=>localizedTree(children,locale),[children,locale]);
}
export function LanguageProvider({initialLocale,children}:{initialLocale:AppLocale;children:ReactNode}) {
 const [locale,setLocale]=useState(appLocale(initialLocale));
 const originalTitle=useRef<string|null>(null);
 useEffect(()=>{if(locale==='en-US'){originalTitle.current??=document.title;document.title=translatedText(originalTitle.current,locale);}else if(originalTitle.current)document.title=originalTitle.current;},[locale]);
 function toggle(){const next=locale==='pt-BR'?'en-US':'pt-BR';document.cookie=localeCookie+'='+next+'; Path=/; Max-Age=31536000; SameSite=Lax'+(location.protocol==='https:'?'; Secure':'');document.documentElement.lang=next;setLocale(next);}
 return <LanguageContext value={locale}><div className="anotei-language-toolbar" translate="no"><span>Português / English</span><button type="button" onClick={toggle} aria-label={locale==='pt-BR'?'Traduzir para inglês americano':'Switch to Brazilian Portuguese'} lang={locale==='pt-BR'?'pt-BR':'en-US'}><Languages size={16}/>{locale==='pt-BR'?'Traduzir para inglês':'Usar português'}</button></div>{children}</LanguageContext>;
}
