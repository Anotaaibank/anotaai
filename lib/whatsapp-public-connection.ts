import type {Connection} from './whatsapp.ts';

type ConnectionOwner={user_id:string;shared_owner_id?:string|null;connection_user_id?:string|null};
export type ConnectionViewer={viewerId:string;manager:boolean;settings:ConnectionOwner|null;effective:ConnectionOwner|null};
export type PublicWhatsappConnection=Pick<Connection,'configured'|'connected'|'message'>&Partial<Pick<Connection,'connecting'|'wrongNumber'|'phone'|'qr'|'paircode'>>;

// Server-derived identity only. Shared transport credentials never confer pairing
// rights, including when their borrower happens to have management access.
export function canViewWhatsappPairing({viewerId,manager,settings,effective}:ConnectionViewer){
 return manager===true&&!!viewerId&&settings?.user_id===viewerId&&effective?.user_id===viewerId
  &&settings.shared_owner_id==null&&effective.shared_owner_id==null
  &&(settings.connection_user_id==null||settings.connection_user_id===viewerId)
  &&(effective.connection_user_id==null||effective.connection_user_id===viewerId);
}

export function publicWhatsappConnection(connection:Connection|null,viewer:ConnectionViewer):PublicWhatsappConnection|null{
 if(!connection)return null;
 const configured=connection.configured===true,connected=configured&&connection.connected===true;
 const safeMessage=connected?'WhatsApp conectado. Use o contato da IA para enviar seus pedidos.':configured?'A conexão do WhatsApp está sendo verificada.':'O contato da IA ainda não está disponível.';
 const dto:PublicWhatsappConnection={configured,connected,message:safeMessage};
 if(!canViewWhatsappPairing(viewer))return dto;
 // Explicit allowlist: never spread a provider/transport result into a public DTO.
 if(typeof connection.message==='string'&&connection.message.length<=500)dto.message=connection.message;
 if(typeof connection.connecting==='boolean')dto.connecting=connection.connecting;
 if(typeof connection.wrongNumber==='boolean')dto.wrongNumber=connection.wrongNumber;
 if(typeof connection.phone==='string'&&/^55\d{10,11}$/.test(connection.phone))dto.phone=connection.phone;
 if(!connected&&connection.wrongNumber!==true){
  if(typeof connection.qr==='string'&&connection.qr.length<1000000&&/^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/=\s]+$/.test(connection.qr))dto.qr=connection.qr;
  if(typeof connection.paircode==='string'&&/^[A-Za-z0-9-]{4,20}$/.test(connection.paircode))dto.paircode=connection.paircode;
 }
 return dto;
}
