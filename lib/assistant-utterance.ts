// Browser-only: correlate a final transcript with the current audio turn.
// Never substitute a model's rewritten tool argument for what the user said.
export class VoiceUtterance {
 private id:string|null=null;
 private text:string|null=null;
 private listeners=new Set<(text:string|null)=>void>();
 begin(id:unknown){if(typeof id!=='string'||!id||id.length>160)return;this.clear();this.id=id;}
 complete(id:unknown,text:unknown){if(id!==this.id||typeof text!=='string'||text.trim().length<2||text.length>4000)return false;this.text=text.trim();for(const notify of this.listeners)notify(this.text);return true;}
 clear(){this.id=null;this.text=null;for(const notify of this.listeners)notify(null);this.listeners.clear();}
 read(signal:AbortSignal,timeoutMs=3000):Promise<string>{if(signal.aborted)return Promise.reject(new Error('Conversa encerrada.'));if(this.text)return Promise.resolve(this.text);return new Promise((resolve,reject)=>{const done=(value:string|null)=>{clearTimeout(timer);signal.removeEventListener('abort',abort);this.listeners.delete(done);if(value)resolve(value);else reject(new Error('Não consegui conferir sua fala. Repita o pedido ou envie por texto.'));};const abort=()=>done(null),timer=setTimeout(()=>done(null),timeoutMs);this.listeners.add(done);signal.addEventListener('abort',abort,{once:true});});}
}
