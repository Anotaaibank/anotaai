export function assistantTimer(request:string,observe:(event:{event:string;request:string;stage:string;milliseconds:number;ok:boolean})=>void=event=>{if(process.env.NODE_ENV==='production')console.info(JSON.stringify(event));}){
 return {async stage<T>(stage:string,work:()=>Promise<T>):Promise<T>{const start=performance.now();let ok=false;try{const result=await work();ok=true;return result;}finally{observe({event:'anotei.assistant.timing',request,stage,milliseconds:Math.round(performance.now()-start),ok});}}};
}
