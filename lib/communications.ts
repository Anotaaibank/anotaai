import {AppError,object,uuid} from './model.ts';
export type CommunicationContact={id:string;name:string;phone:string;plan_code:string;subscription_status:string};
export type Communication={id:string;message:string;created_at:string;expires_at:string;confirmed_at:string|null;cancelled_at:string|null;counts:Record<string,number>};
export type CommunicationRecipient={id:string;name:string;phone:string;status:string;updated_at:string};
export type CommunicationDetail={job:Communication;recipients:CommunicationRecipient[];offset:number};
export const communicationStatus:Record<string,string>={RASCUNHO:'Aguardando confirmação',FILA:'Na fila',ENVIANDO:'Enviando',ACEITO:'Aceito pelo serviço · entrega não confirmada',FALHOU:'Falhou',INCERTO:'Sem confirmação · não reenviado automaticamente',CANCELADO:'Cancelado'};
export function communicationMessage(raw:unknown){if(typeof raw!=='string'||raw.trim().length<1||raw.trim().length>2000)throw new AppError('Escreva uma mensagem de até 2.000 caracteres.');return raw.trim();}
export function communicationInput(raw:unknown){const b=object(raw);if(Object.keys(b).some(k=>!['id','message','invitations'].includes(k))||!uuid(b.id)||!Array.isArray(b.invitations)||b.invitations.length<1||b.invitations.length>10000||b.invitations.some(i=>!uuid(i))||new Set(b.invitations).size!==b.invitations.length)throw new AppError('Selecione assinantes e confira a mensagem.');return {id:b.id,message:communicationMessage(b.message),invitations:b.invitations as string[]};}
export function communicationFilter(contacts:CommunicationContact[],search:string,plan:string,status:string){const term=search.trim().toLocaleLowerCase('pt-BR');return contacts.filter(c=>(!plan||c.plan_code===plan)&&(!status||c.subscription_status===status)&&(!term||(c.name+' '+c.phone).toLocaleLowerCase('pt-BR').includes(term)));}
export const communicationText=(message:string)=>'*Anotei na Hora · Comunicado*\n\n'+communicationMessage(message);
