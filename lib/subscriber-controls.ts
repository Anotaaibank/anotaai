import {AppError,object} from './model.ts';
import {phoneBR} from './whatsapp.ts';
export function subscriberActiveInput(raw:unknown){
 const b=object(raw);
 if(Object.keys(b).some(k=>!['phone','active','expected'].includes(k))||typeof b.active!=='boolean'||typeof b.expected!=='string'||!Number.isFinite(Date.parse(b.expected)))throw new AppError('Confira o assinante e atualize a lista.');
 return {phone:phoneBR(b.phone),active:b.active,expected:b.expected};
}
export function accessLinkStatus(status:string){return ({NAO_ENVIADO:'Na fila de envio',AUTOMATICO:'Na fila de envio',ENVIANDO:'Enviando — aguarde',ACEITO:'Aceito pelo serviço · entrega não confirmada',INCERTO:'Sem confirmação de envio',FALHOU:'Falha no envio',CANCELADO:'Envio cancelado'} as Record<string,string>)[status]||'Sem informação de envio';}
