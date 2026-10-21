export function cents(value:string){
 const normalized=value.trim().replace(/^R\$\s*/,''),pattern=/^\d+(?:,\d{1,2})?$/;
 if(!pattern.test(normalized))throw new Error('Informe o valor sem separador de milhar. Exemplo: 1500,50.');
 const [whole,decimal='']=normalized.split(','),amount=Number(whole)*100+Number(decimal.padEnd(2,'0'));
 if(!Number.isSafeInteger(amount)||amount<=0||amount>1000000000)throw new Error('Informe um valor maior que zero.');return amount;
}
export function today(){return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}
export function formatMoney(value:number){return new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(value/100);}
export type EntryKind='income'|'expense'|'appointment';
export function manualCommand(kind:EntryKind,input:{description:string;amount:string;date:string;time:string;monthly:boolean;expected:boolean}){
 if(input.description.trim().length<2)throw new Error('Descreva o que deseja anotar.');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(input.date)||Number.isNaN(Date.parse(input.date+'T12:00:00Z'))||new Date(input.date+'T12:00:00Z').toISOString().slice(0,10)!==input.date)throw new Error('Informe a data no formato AAAA-MM-DD.');
 const common={description:input.description.trim(),date:input.date};
 if(kind==='appointment')return {...common,action:'appointment_upsert',...(input.time?{time:input.time}:{})};
 const money={...common,amount_cents:cents(input.amount)};
 if(kind==='income')return {...money,action:'income_upsert',status:input.expected?'PREVISTO':'REALIZADO'};
 if(input.monthly)return {...money,action:'expense_schedule',category:'Outras despesas pessoais',recurring:true,schedule_type:'MENSAL',amount_mode:'PARCELA',due_day:Number(input.date.slice(8))};
 return {...money,action:'expense_create',category:'Outras despesas pessoais',status:input.expected?'PREVISTO':'REALIZADO'};
}
