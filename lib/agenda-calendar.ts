export function calendarDays(month:string):(string|null)[]{
 if(!/^\d{4}-(?:0[1-9]|1[0-2])$/.test(month))throw new Error('Mês inválido.');
 const [year,m]=month.split('-').map(Number),offset=new Date(Date.UTC(year,m-1,1)).getUTCDay(),count=new Date(Date.UTC(year,m,0)).getUTCDate();
 return Array.from({length:Math.ceil((offset+count)/7)*7},(_,i)=>i>=offset&&i<offset+count?month+'-'+String(i-offset+1).padStart(2,'0'):null);
}
export function moveCalendarMonth(month:string,step:number){const [year,m]=month.split('-').map(Number);return new Date(Date.UTC(year,m-1+step,1)).toISOString().slice(0,7);}
