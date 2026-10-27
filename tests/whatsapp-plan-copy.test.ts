import test from 'node:test';
import assert from 'node:assert/strict';
import {buildFinancePlan,stableId,type FinanceCommand,type FinanceDocument,type FinancePlan,type FinanceState} from '../lib/finance.ts';
import {currency} from '../lib/model.ts';
import {whatsappPlanCopy} from '../lib/whatsapp-plan-copy.ts';

const today='2026-10-27',user=stableId('copy-synthetic-account'),code='A1B2C3D4E5';
let sequence=0;
const plan=(command:FinanceCommand,state:FinanceState={documents:[],expenses:[]})=>buildFinancePlan(command,state,user,stableId('copy-plan-'+sequence++),today);
const dateBR=(date:string)=>date.split('-').reverse().join('/');
const income:FinanceDocument={id:stableId('existing-synthetic-income'),kind:'INCOME',description:'Venda de uma cadeira',amount_cents:25037,date:'2026-10-18',status:'REALIZADO',active:true,details:{salary:false,activity:'Venda ocasional'},updated_at:'2026-10-18T12:00:00Z'};

test('archiving an existing income identifies amount, description and original date without inventing a new expense',()=>{
 const p=plan({action:'document_archive',target_id:income.id},{documents:[income],expenses:[]}),before=JSON.stringify(p);
 const text=whatsappPlanCopy(p,code);
 assert.ok(text.includes(currency(income.amount_cents)));assert.ok(text.includes(income.description));assert.ok(text.includes(dateBR(income.date)));
 assert.match(text,/Cancelamento da entrada/);assert.match(text,/fora dos registros ativos/);assert.match(text,/histórico.*preservado/i);
 assert.match(text,/saldo e a projeção serão recalculados/);assert.doesNotMatch(text,/nova (?:saída|despesa)|transferência|banco|apagado|exclusão permanente/i);
 assert.match(text,/Aguardando confirmação/);assert.doesNotMatch(text,/✅ Registrado/);
 assert.equal(JSON.stringify(p),before);assert.equal(p.documents[0].document.active,false);assert.equal(p.expenses.length,0);
});

test('proposal controls preserve exact codes, both decisions and expiry; missing code keeps the caller receipt precondition',()=>{
 const p=plan({action:'income_upsert',description:'Diária de garçom',amount_cents:12005});
 const pending=whatsappPlanCopy(p,code),completed=whatsappPlanCopy(p);
 assert.match(pending,/\*1 — Confirmar\*\n\*2 — Editar\*/);assert.match(pending,/10 minutos/);
 for(const action of ['CONFIRMAR','EDITAR','CANCELAR'])assert.ok(pending.includes(action+' '+code));
 assert.match(pending,/Ainda não foi salvo/);assert.match(completed,/^\*✅ Registrado\*/);assert.doesNotMatch(completed,/1 — Confirmar|CANCELAR /);
 for(const invalid of ['',code.toLowerCase(),'123','A1B2C3D4E5F',' A1B2C3D4E5'])assert.throws(()=>whatsappPlanCopy(p,invalid),/Código/);
});

test('received and expected income retain cents and dates and do not become a forecast of bank balance',()=>{
 const received=plan({action:'income_upsert',description:'Comissão sintética',amount_cents:1,date:'2026-10-26'});
 const expected=plan({action:'income_upsert',description:'Serviço a receber',amount_cents:125037,status:'PREVISTO',date:'2026-11-03'});
 const a=whatsappPlanCopy(received,code),b=whatsappPlanCopy(expected,code);
 assert.ok(a.includes(currency(1)));assert.ok(a.includes('26/10/2026'));assert.ok(a.includes('Comissão sintética'));
 assert.ok(b.includes(currency(125037)));assert.ok(b.includes('03/11/2026'));assert.match(b,/Entrada prevista/);assert.match(b,/somente na projeção/);
 assert.doesNotMatch(a+'\n'+b,/Saldo final:|saldo no banco|saldo disponível:/i);
});

test('single paid expense and one future bill retain classification and distinct cash effects',()=>{
 const paid=plan({action:'expense_create',description:'Almoço no shopping',amount_cents:2537,category:'Restaurante',date:today,details:{trip_name:'Viagem sintética',expense_audience:'NAO_INFORMADO',expense_nature:'NAO_CLASSIFICADO'}});
 const future=plan({action:'expense_create',description:'Última parcela da moto',amount_cents:80099,date:'2026-11-25',status:'PREVISTO'});
 const a=whatsappPlanCopy(paid,code),b=whatsappPlanCopy(future,code);
 assert.ok(a.includes(currency(2537)));assert.ok(a.includes('Restaurante'));assert.ok(a.includes('Viagem sintética'));assert.match(a,/Pago; reduz o saldo atual/);
 assert.equal(a.split('27/10/2026').length-1,1);
 assert.ok(b.includes('Vencimento: 25/11/2026'));assert.ok(b.includes(currency(80099)));assert.match(b,/Previsto; não reduz o saldo atual/);assert.doesNotMatch(b,/todo mês|repete|conta paga/i);
});

test('appointment retains time, location and reminder condition without making up money or missing details',()=>{
 const timed=plan({action:'appointment_upsert',description:'Dentista',date:'2026-11-03',time:'15:00',location:'Clínica Exemplo'});
 const untimed=plan({action:'appointment_upsert',description:'Evento sem horário',date:'2026-11-04'});
 const a=whatsappPlanCopy(timed,code),b=whatsappPlanCopy(untimed,code);
 assert.ok(a.includes('03/11/2026 às 15:00'));assert.ok(a.includes('Clínica Exemplo'));assert.match(a,/24 horas e 5 horas antes, com a conexão ativada/);
 assert.doesNotMatch(a,/Valor:|R\$/);assert.doesNotMatch(b,/Local:|às \d|\n• \n/);assert.match(b,/Informe o horário/);
});

test('installment fallback shows every due date and exact remainder cents without silently summarizing a batch',()=>{
 const p=plan({action:'expense_schedule',description:'Compra parcelada sintética',amount_cents:10001,dates:['2026-11-05','2026-12-05','2027-01-05'],count:3,amount_mode:'TOTAL',schedule_type:'PARCELAS'});
 const text=whatsappPlanCopy(p,code);
 assert.equal(p.expenses.reduce((total,e)=>total+e.payload.amount_cents,0),10001);
 for(const {payload}of p.expenses){assert.ok(text.includes(dateBR(payload.entry_date)));assert.ok(text.includes(currency(payload.amount_cents)));}
 assert.match(text,/Ainda não reduz o saldo atual/);assert.ok(text.includes(p.title));assert.doesNotMatch(text,/outros.*painel/i);
});

test('mixed activity, recurring rule, reserve and balance adjustment preserve all fallback plan effects',()=>{
 const profile=plan({action:'profile_upsert',profile:{opening_balance_cents:110000,opening_date:today}}).documents[0].document;
 const plans=[
  plan({action:'extra_activity',activity:'Uber',amount_cents:8000,cost_cents:2500,date:today}),
  plan({action:'expense_schedule',description:'Conta mensal sintética',amount_cents:150037,date:'2026-11-05',recurring:true,due_day:5,amount_mode:'PARCELA',schedule_type:'MENSAL'}),
  plan({action:'reserve_upsert',description:'Reserva sintética',amount_cents:5037,date:today,rate_percent:0.7,rate_period:'MENSAL'}),
  plan({action:'balance_adjust',balance_cents:150000},{documents:[{...profile,updated_at:'2026-10-27T12:00:00Z'}],expenses:[]})
 ];
 for(const p of plans){
  const text=whatsappPlanCopy(p,code);
  assert.ok(text.includes(p.title));
  for(const line of p.lines.filter(line=>line.trim()))assert.ok(text.includes(line.replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g,'$3/$2/$1')),line);
 }
 assert.ok(whatsappPlanCopy(plans[0],code).includes(currency(5500)));
 assert.match(whatsappPlanCopy(plans[3],code),/Não é receita nem despesa/);
});

test('extra conditions, long plans and updates are not dropped to fit a template or length target',()=>{
 const simple=plan({action:'income_upsert',description:'Serviço sintético',amount_cents:10037});
 simple.lines.push('Condição adicional do plano: conferir a origem.');
 assert.ok(whatsappPlanCopy(simple,code).includes(simple.lines.at(-1)!));
 const many:FinancePlan={...simple,documents:[...simple.documents,...simple.documents],title:'Conferir lista sintética',lines:Array.from({length:24},(_,i)=>`Item ${i+1}: vencimento confirmado em 2026-11-25, valor e efeito próprios.`)};
 const before=JSON.stringify(many);Object.freeze(many.lines);Object.freeze(many);
 const text=whatsappPlanCopy(many,code);assert.ok(text.length>700);assert.ok(text.includes('Item 1:'));assert.ok(text.includes('Item 24:'));assert.equal(JSON.stringify(many),before);
 const update=plan({action:'income_upsert',target_id:income.id,amount_cents:30000},{documents:[income],expenses:[]});
 assert.ok(whatsappPlanCopy(update,code).includes(update.title));assert.doesNotMatch(whatsappPlanCopy(update,code),/nova receita|nova entrada/i);
});
