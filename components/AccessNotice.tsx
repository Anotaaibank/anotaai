'use client';
import {Localize} from './Localization';
export default function AccessNotice({title,message,href,label,registration=false}:{title:string;message:string;href:string;label:string;registration?:boolean}){
 return <Localize><main className={registration?'anotei-registration':'commerce-gate'}><section className={registration?'bank-card':undefined}><h1>{title}</h1><p>{message}</p><a className="bank-primary" href={href}>{label}</a></section></main></Localize>;
}
