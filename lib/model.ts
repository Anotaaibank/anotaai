export const uuid = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value);
export const validId = uuid;
export function realDate(value: string) { return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value+'T12:00:00Z').toISOString().slice(0,10) === value; }
export const currency = (cents: number) => new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(cents/100);
export function brazilDay(now = new Date()) { const parts = new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now); return ['year','month','day'].map(name=>parts.find(p=>p.type===name)!.value).join('-'); }
export class AppError extends Error {status:number;constructor(message:string,status=400){super(message);this.status=status;}}
export type User = {id:string;name:string;email:string;assistant_name?:string};
export function object(value:unknown):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value))throw new AppError('Confira os dados enviados.');return value as Record<string,unknown>;}
export function monthlyDates(first:string,count:number){if(!realDate(first)||!Number.isInteger(count)||count<1||count>60)throw new AppError('Confira a data e a quantidade de meses.');const [year,month,day]=first.split('-').map(Number);return Array.from({length:count},(_,index)=>{const date=new Date(Date.UTC(year,month-1+index,1,12));const last=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,0)).getUTCDate();date.setUTCDate(Math.min(day,last));return date.toISOString().slice(0,10);});}
