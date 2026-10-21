export class ApiError extends Error{status:number;constructor(message:string,status:number){super(message);this.status=status;}}
export function apiOrigin(value:string|undefined,development:boolean){
 if(!value)throw new Error('Defina EXPO_PUBLIC_API_URL para o servidor de homologação.');
 const url=new URL(value),local=/^(localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(?:1[6-9]|2\d|3[01])\.\d+\.\d+)$/.test(url.hostname);
 if(url.username||url.password||url.search||url.hash||url.pathname!=='/'||url.protocol!=='https:'&&!(development&&local&&url.protocol==='http:'))throw new Error('Use um endereço HTTPS sem caminho ou credenciais. HTTP local só no desenvolvimento.');
 return url.origin;
}
type Transport=(url:string,options:{method:'POST';credentials:'omit';headers:Record<string,string>;body:string;signal:AbortSignal;redirect:'error'})=>Promise<{ok:boolean;status:number;json:()=>Promise<unknown>}>;
export async function request<T>(origin:string,input:Record<string,unknown>,token?:string,transport:Transport=fetch):Promise<T>{
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),45000);
 try{
  let response:Awaited<ReturnType<Transport>>;
  try{response=await transport(origin+'/api/mobile/v1',{method:'POST',credentials:'omit',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(input),signal:controller.signal,redirect:'error'});}catch{throw new ApiError('Sem resposta do servidor. Confira sua conexão. Antes de repetir uma confirmação, confira se foi registrada.',0);}
  let result:unknown;try{result=await response.json();}catch{throw new ApiError('O servidor não devolveu uma resposta válida.',response.status);}
  if(!response.ok)throw new ApiError(typeof (result as {error?:unknown})?.error==='string'?(result as {error:string}).error:'Não foi possível concluir.',response.status);
  return result as T;
 }finally{clearTimeout(timeout);}
}
