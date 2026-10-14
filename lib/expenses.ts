import {expenseAudiences,expenseNatures,expenseContext,type ExpenseAudience,type ExpenseNature} from './expense-context.ts';
import {personalCategory,personalCategories,tripName} from './personal-expenses.ts';
import {AppError,brazilDay,object,realDate,uuid} from './model.ts';
export type AdminDetails={notes?:string;payment_method?:string;trip_name?:string;expense_audience?:ExpenseAudience;expense_nature?:ExpenseNature;income_activity?:string};
export type AdminEntry={id:string;user_id:string;kind:'PESSOAL'|'MENSAL';scope:'PESSOAL';entry_date:string;description:string;category:string;status:'PREVISTO'|'REALIZADO';amount_cents:number;details:AdminDetails;active:boolean;created_at:string;updated_at:string;origin:'MANUAL'|'VOICE'|'WHATSAPP'};
export type ExpensePayload=Omit<AdminEntry,'user_id'|'active'|'created_at'|'updated_at'|'origin'>;
export const paymentMethods=['PIX','DINHEIRO','CARTAO','BOLETO','TRANSFERENCIA','OUTRO'] as const;
export function incomeActivity(value:unknown){const s=text(value,80);if(s&&s.length<2)throw new AppError('Informe a atividade da renda extra.');return s.replace(/\s+/g,' ');}
export function adminMoneyInput(raw:string){const value=raw.trim().replace(/^R\$\s*/,'');if(!/^(?:\d{1,7}|\d{1,3}(?:\.\d{3}){1,2})(?:,\d{1,2})?$/.test(value))throw new AppError('Informe o valor em reais. Exemplo: 250,00.');const [reais,centavos='']=value.replaceAll('.','').split(',');const cents=Number(reais)*100+Number(centavos.padEnd(2,'0'));if(!Number.isSafeInteger(cents)||cents<=0||cents>1000000000)throw new AppError('Informe um valor maior que zero, até R$ 10.000.000,00.');return cents;}
export const adminMoneyText=(cents:number)=>new Intl.NumberFormat('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}).format(cents/100);
function text(value:unknown,max:number,fallback=''){if(value===undefined||value===null)return fallback;if(typeof value!=='string'||value.length>max||/[\u0000-\u0008]/.test(value))throw new AppError('Confira os textos da despesa.');return value.trim();}
export function adminInput(raw:Record<string,unknown>){
 const allowed=['id','kind','scope','entry_date','description','category','status','amount_cents','details','expected_updated_at'];
 if(Object.keys(raw).some(k=>!allowed.includes(k)))throw new AppError('Há campos que não pertencem a despesas pessoais.');
 const id=text(raw.id,36),kind=raw.kind??'PESSOAL',scope=raw.scope??'PESSOAL',entry_date=text(raw.entry_date,10),description=text(raw.description,160),status=raw.status??'REALIZADO',amount_cents=raw.amount_cents;
 if(!uuid(id)||!['PESSOAL','MENSAL'].includes(String(kind))||scope!=='PESSOAL')throw new AppError('O Anota Aí registra somente despesas pessoais.');
 if(!realDate(entry_date)||entry_date<'2000-01-01'||entry_date>'2100-12-31'||description.length<2||!['REALIZADO','PREVISTO'].includes(String(status)))throw new AppError('Confira a data, descrição e situação.');
 if(status==='REALIZADO'&&entry_date>brazilDay())throw new AppError('Uma despesa futura deve ficar como Previsto.');
 if(typeof amount_cents!=='number'||!Number.isSafeInteger(amount_cents)||amount_cents<=0||amount_cents>1000000000)throw new AppError('Confira o valor da despesa.');
 const input=object(raw.details??{});if(Object.keys(input).some(k=>!['notes','payment_method','trip_name','expense_audience','expense_nature','income_activity'].includes(k)))throw new AppError('Há detalhes que não pertencem a despesas pessoais.');
 const category=personalCategory(text(raw.category,80),description);if(!personalCategories.includes(category as typeof personalCategories[number]))throw new AppError('Escolha uma categoria pessoal.');
 const inferred=expenseContext(description,category),expense_audience=input.expense_audience??inferred.expense_audience,expense_nature=input.expense_nature??inferred.expense_nature,payment_method=input.payment_method??'OUTRO';
 if(!expenseAudiences.includes(expense_audience as ExpenseAudience)||!expenseNatures.includes(expense_nature as ExpenseNature)||!paymentMethods.includes(payment_method as typeof paymentMethods[number]))throw new AppError('Confira o contexto, classificação e forma de pagamento.');
 const activity=incomeActivity(input.income_activity);if(activity&&kind==='MENSAL')throw new AppError('Registre custos de renda extra quando acontecerem.');
 const details:AdminDetails={notes:text(input.notes,2000),payment_method:payment_method as string,trip_name:tripName(input.trip_name),expense_audience:expense_audience as ExpenseAudience,expense_nature:expense_nature as ExpenseNature,...(activity?{income_activity:activity}:{})};
 const expected=raw.expected_updated_at??null;if(expected!==null&&(typeof expected!=='string'||!Number.isFinite(Date.parse(expected))))throw new AppError('Atualize a despesa antes de salvar.');
 return {id,kind:kind as ExpensePayload['kind'],scope:'PESSOAL' as const,entry_date,description,category,status:status as ExpensePayload['status'],amount_cents,details,expected_updated_at:expected as string|null};
}
export function csv(rows:AdminEntry[]){const escape=(v:string|number)=>'"'+String(v).replaceAll('"','""').replace(/^[=+@-]/,"'$&")+'"';return '\uFEFF'+[['Data','Descrição','Categoria','Viagem','Contexto','Classificação','Valor (R$)','Pagamento','Situação'],...rows.map(e=>[e.entry_date,e.description,e.category,e.details.trip_name||'',e.details.expense_audience||'',e.details.expense_nature||'',(e.amount_cents/100).toFixed(2).replace('.',','),e.details.payment_method||'',e.status])].map(row=>row.map(escape).join(';')).join('\r\n');}
