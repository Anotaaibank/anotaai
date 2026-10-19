'use client';
import {Localize} from '@/components/Localization';
export function BrandOrb({className=''}:{className?:string}) {
 return <Localize><span className={'anotei-orb '+className} aria-hidden="true"><img src="/anotei-na-hora.jpeg" alt=""/></span></Localize>;
}
export default function Brand(){return <Localize><span className="anotei-brand-lockup"><BrandOrb/><span className="anotei-wordmark">Anotei<strong>na Hora<span>.</span></strong><small>FALOU. ANOTOU. ORGANIZOU.</small></span></span></Localize>;}
