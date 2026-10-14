export function BrandOrb({className=''}:{className?:string}) {
 return <span className={'anotei-orb '+className} aria-hidden="true"><img src="/anotei-na-hora.jpeg" alt=""/></span>;
}
export default function Brand(){return <span className="anotei-brand-lockup"><BrandOrb/><span className="anotei-wordmark">Anotei<strong>na Hora<span>.</span></strong><small>FALOU. ANOTOU. ORGANIZOU.</small></span></span>;}
