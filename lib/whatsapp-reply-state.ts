/** Fencing contract shared by local JSON rows and the cloud reply CAS. */
export type ReplyState={id:string;user_id:string;sender:string;lease:string|null;status:string;reply:string;reply_status:string;reply_version?:number;finance_confirmation?:string;confirmation_code?:string;confirmation_used?:boolean;context_reset_at?:string|null};
const fields=['status','reply','finance_confirmation','confirmation_code','confirmation_used','context_reset_at'] as const;
export function replyVersion(row:Pick<ReplyState,'reply_version'>){const version=row.reply_version===undefined?0:row.reply_version;return Number.isSafeInteger(version)&&version>=0?version:null;}
export function sameReplyFence(current:ReplyState,expected:ReplyState){const version=replyVersion(expected);return version!==null&&current.id===expected.id&&current.user_id===expected.user_id&&current.sender===expected.sender&&current.lease===expected.lease&&replyVersion(current)===version;}
export function canClaimReply(current:ReplyState,expected:ReplyState){return sameReplyFence(current,expected)&&!!current.reply&&current.reply_status==='NAO_ENVIADO'&&['LANCADO','RESOLVIDO','ESCLARECER','ERRO'].includes(current.status);}
function field(row:ReplyState,key:typeof fields[number]){return row[key]??(key==='confirmation_used'?false:null);}
export function patchedReply<T extends ReplyState>(current:T,patch:Partial<T>):T{
 const version=replyVersion(current);if(version===null)throw Error('Versão de resposta inválida.');
 const next={...current,...patch},changed=fields.some(key=>field(current,key)!==field(next,key));
 if(changed&&version===Number.MAX_SAFE_INTEGER)throw Error('Versão de resposta acima do limite.');
 return {...next,reply_version:version+(changed?1:0)};
}
