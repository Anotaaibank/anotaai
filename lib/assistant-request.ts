// Browser requests share a deadline that also covers the first local compilation.
// A read timeout is temporary; it does not mean the assistant lacks permission.
export const voiceToolTimeoutMs=45000;
export async function voiceToolRequest(path:string,input:unknown,signal:AbortSignal,transport:typeof fetch=fetch,timeoutMs=voiceToolTimeoutMs){
 try{
  const response=await transport(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input),signal:AbortSignal.any([signal,AbortSignal.timeout(timeoutMs)])});
  const data=await response.json();
  if(!response.ok)return {ok:false,error:typeof data.error==='string'?data.error:'A consulta não foi concluída. Tente novamente.'};
  return data;
 }catch(e){
  if(signal.aborted)throw e;
  const timeout=e instanceof Error&&['TimeoutError','AbortError'].includes(e.name);
  return {ok:false,error:timeout?'A consulta demorou mais que o esperado. Tente novamente; isso não indica falta de acesso aos seus dados.':'A conexão com o painel falhou. Tente novamente. Não invente valores nem afirme que um lançamento foi salvo.'};
 }
}
