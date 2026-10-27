import {quickEditedPlan} from '../lib/whatsapp-edit.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {extractFinance,prepareFinanceDraft,draftCommand,independentFinanceRequest} from '../lib/finance-ai.ts';
import {sourceWithVerifiedTarget} from '../lib/conversation-language.ts';
import {buildFinancePlan,financeSnapshot,readFinance,type FinanceState} from '../lib/finance.ts';
import {localFinanceState,applyLocalFinance} from '../lib/finance-store.ts';
import {registerLocal} from '../lib/local-db.ts';
import {whatsappPending,confirmedWhatsappPlan,cancelledWhatsappPlan,whatsappPlanReply} from '../lib/whatsapp-finance.ts';
import {whatsappConversationContext} from '../lib/whatsapp-context.ts';
import type {Inbox} from '../lib/whatsapp-store.ts';

process.env.ANOTA_STORAGE='local';process.env.ANOTA_DATABASE_PATH=':memory:';
const today='2026-10-27',now=Date.parse('2026-10-27T12:00:00Z'),key='synthetic-income-archive',sender='5511900000011';
const noModel:typeof fetch=async()=>{throw Error('Não deve adivinhar alvo por modelo');};
function account(){return registerLocal(randomUUID()+'@example.test','synthetic-password','Conta Teste').user.id;}
function add(user:string,description:string,amount_cents:number,date:string){const plan=buildFinancePlan({action:'income_upsert',description,amount_cents,date,status:'REALIZADO'},localFinanceState(user),user,randomUUID(),today);applyLocalFinance(user,plan,'WHATSAPP');return plan;}
function row(user:string,plan:ReturnType<typeof buildFinancePlan>,at=now-1000,author=sender):Inbox{return {id:randomUUID(),user_id:user,sender:author,provider_id:randomUUID(),type:'text',text:'1',transcript:'1',reply:'Registrado',status:'LANCADO',reply_status:'ACEITO',created_at:new Date(at).toISOString(),claimed_at:null,lease:null,entry_id:null,...whatsappPending(plan,user,author,key,at-1000),confirmation_used:true};}
async function interpret(text:string,state:FinanceState,context:unknown=undefined){return extractFinance(text,state,'synthetic-only',today,noModel,undefined,'resumo',context);}

test('IW-D: cancela entrada por data prepara archive realizado e só desfaz receita após confirmar',async()=>{
 for(const text of ['cancela a entrada do dia 20','por favor cancela a entrada de 20/10/2026','exclui a entrada de ontem']){
  const user=account(),date=text.includes('ontem')?'2026-10-26':'2026-10-20',old=add(user,'Venda da cadeira',4300,date),state=localFinanceState(user),before=JSON.stringify(state);
  const draft=await interpret(text,state);assert.equal(draft.intent,'COMMAND',draft.question);assert.equal((draft.command as {action:string}).action,'document_archive');const plan=prepareFinanceDraft(draft,sourceWithVerifiedTarget(text,draft),state,user,randomUUID(),today);assert.equal(plan.documents.length,1);assert.equal(plan.documents[0].document.id,old.documents[0].document.id);assert.equal(plan.documents[0].document.active,false);assert.equal(JSON.stringify(localFinanceState(user)),before);
  const pending={user_id:user,sender,...whatsappPending(plan,user,sender,key,now)};assert.match(whatsappPlanReply(plan,pending.confirmation_code),/1 — Confirmar[\s\S]*2 — Editar/);const confirmed=confirmedWhatsappPlan('1',[pending],user,sender,key,now+1)!;applyLocalFinance(user,confirmed.plan,'WHATSAPP');assert.equal(applyLocalFinance(user,confirmed.plan,'WHATSAPP').replayed,true);assert.equal(localFinanceState(user).documents.length,1);assert.equal(localFinanceState(user).documents[0].active,false);assert.equal(financeSnapshot(localFinanceState(user),today).balance_cents,0);
 }
});
test('IW-D: data com múltiplas entradas pergunta alvo e não chama modelo nem seleciona primeiro',async()=>{
 const user=account();add(user,'Comissão Ana',10000,'2026-10-20');add(user,'Uber',12000,'2026-10-20');const before=JSON.stringify(localFinanceState(user)),draft=await interpret('cancela a entrada do dia 20',localFinanceState(user));assert.equal(draft.intent,'CLARIFY');assert.match(draft.question,/Comissão Ana/);assert.match(draft.question,/Uber/);assert.equal(JSON.stringify(localFinanceState(user)),before);const selected=await interpret('cancela a entrada do Uber do dia 20',localFinanceState(user));assert.equal(selected.intent,'COMMAND',selected.question);
});
test('IW-D: entrada seguida de saída mantém origem assinada do mesmo autor para última entrada',async()=>{
 const user=account(),income=add(user,'Bico de pintura',9000,'2026-10-26'),other=add(user,'Venda do casal',14000,today);const cost=buildFinancePlan({action:'expense_create',description:'Padaria',amount_cents:1200},localFinanceState(user),user,randomUUID(),today);applyLocalFinance(user,cost,'WHATSAPP');const history=[row(user,cost,now-1000),row(user,other,now-2000,'5511900000012'),row(user,income,now-3000)],context={channel:'whatsapp',...whatsappConversationContext(history,user,sender,key,now)};
 const draft=await interpret('cancela a última entrada que enviei',localFinanceState(user),context);assert.equal(draft.intent,'COMMAND',draft.question);assert.equal((draft.command as {target_id:string}).target_id,income.documents[0].document.id);
});
test('IW-D: última sem origem própria não adivinha registro manual ou do outro número',async()=>{
 const user=account(),p=add(user,'Recebimento do casal',14000,today),before=JSON.stringify(localFinanceState(user));const context={channel:'whatsapp',...whatsappConversationContext([row(user,p,now-1000,'5511900000012')],user,sender,key,now)};const d=await interpret('cancela a última entrada que eu mandei',localFinanceState(user),context);assert.equal(d.intent,'CLARIFY');assert.match(d.question,/descrição|valor|data/i);assert.equal(JSON.stringify(localFinanceState(user)),before);
});
test('IW-D: cancelar proposta por código continua separado de arquivar uma entrada já realizada',()=>{
 const user=account(),plan=buildFinancePlan({action:'income_upsert',description:'Receita ainda pendente',amount_cents:5000},localFinanceState(user),user,randomUUID(),today),pending={user_id:user,sender,...whatsappPending(plan,user,sender,key,now)};assert.equal(cancelledWhatsappPlan('cancela a entrada do dia 20',[pending],user,sender,key,now),null);assert.equal(cancelledWhatsappPlan('CANCELAR '+pending.confirmation_code,[pending],user,sender,key,now)?.confirmation_code,pending.confirmation_code);assert.equal(localFinanceState(user).documents.length,0);
});

test('IW-D: valor e descrição distinguem alvos; negação/data inválida não viram alterações',async()=>{
 const user=account();add(user,'Venda cadeira',4300,'2026-10-20');const wanted=add(user,'Venda mesa',7500,'2026-10-20');for(const text of ['pode cancelar a entrada de 75 reais do dia 20','apaga a receita da mesa de 20/10/2026','tira a entrada de 75 reais, por favor']){const d=await interpret(text,localFinanceState(user));assert.equal(d.intent,'COMMAND',d.question);assert.equal((d.command as {target_id:string}).target_id,wanted.documents[0].document.id);}
 assert.notEqual((await interpret('não cancela a entrada do dia 20',localFinanceState(user))).intent,'COMMAND');assert.equal((await interpret('cancela a entrada do dia 31/02/2026',localFinanceState(user))).intent,'CLARIFY');assert.equal((await interpret('cancela a entrada',localFinanceState(user))).intent,'CLARIFY');
});
test('IW-D: prova errada, reset, ausente, expirada ao confirmar e lacuna mais nova não dão autoria',async()=>{
 const user=account(),p=add(user,'Origem',9000,'2026-10-20'),good=row(user,p),before=JSON.stringify(localFinanceState(user));
 const invalid:Partial<Inbox>[]=[{user_id:randomUUID()},{sender:'5511900000012'},{context_reset_at:new Date(now).toISOString()},{reply_status:'LIMPO'},{finance_confirmation:''},{finance_confirmation:good.finance_confirmation+'x'},{confirmation_code:'BAD'},{confirmation_used:false},{created_at:new Date(now+1000).toISOString()},{finance_confirmation:whatsappPending(p,user,sender,key,now-700000).finance_confirmation}];
 for(const change of invalid){const context={channel:'whatsapp',...whatsappConversationContext([{...good,...change}],user,sender,key,now)};assert.equal((await interpret('cancela a última entrada que enviei',localFinanceState(user),context)).intent,'CLARIFY',JSON.stringify(change));}
 const unknownNewer={...good,id:randomUUID(),created_at:new Date(now-100).toISOString(),finance_confirmation:''},context={channel:'whatsapp',...whatsappConversationContext([unknownNewer,good],user,sender,key,now)};assert.equal((await interpret('cancela a última entrada que enviei',localFinanceState(user),context)).intent,'CLARIFY');assert.equal(JSON.stringify(localFinanceState(user)),before);
});
test('IW-D: assinatura histórica só prova origem; exclusão recebe assinatura NOVA e foco geral não aumenta',async()=>{
 const user=account(),p=add(user,'Receita antiga própria',9000,'2026-10-20'),old=row(user,p,now-7200000),state=localFinanceState(user),context={channel:'whatsapp',...whatsappConversationContext([old],user,sender,key,now)};assert.equal(context.focus,undefined);assert.throws(()=>readFinance(old.finance_confirmation!,user+':whatsapp:'+sender,key,now));
 const d=await interpret('cancela a última entrada que enviei',state,context);assert.equal(d.intent,'COMMAND',d.question);const plan=prepareFinanceDraft(d,sourceWithVerifiedTarget('cancela a última entrada que enviei',d),state,user,randomUUID(),today),pending={user_id:user,sender,...whatsappPending(plan,user,sender,key,now)};assert.ok(confirmedWhatsappPlan('1',[pending],user,sender,key,now+1));assert.equal(localFinanceState(user).documents[0].active,true);
});
test('IW-D: update assinado de renda não é evidência de criação pelo remetente',async()=>{
 const user=account(),p=add(user,'Receita manual do casal',9000,'2026-10-20'),edited=buildFinancePlan({action:'income_upsert',target_id:p.documents[0].document.id,amount_cents:10000},localFinanceState(user),user,randomUUID(),today);applyLocalFinance(user,edited,'WHATSAPP');const context={channel:'whatsapp',...whatsappConversationContext([row(user,edited)],user,sender,key,now)};assert.equal((await interpret('cancela a última entrada que eu enviei',localFinanceState(user),context)).intent,'CLARIFY');
});
test('IW-D: empate e mensagem com várias criações não escolhem ordem arbitrária',async()=>{
 const user=account(),a=add(user,'Uma renda',9000,'2026-10-20'),b=add(user,'Outra renda',12000,'2026-10-20');for(const history of [[row(user,a),row(user,b)],[row(user,{...a,id:randomUUID(),documents:[...a.documents,...b.documents]})]]){const context={channel:'whatsapp',...whatsappConversationContext(history,user,sender,key,now)};assert.equal((await interpret('cancela a última entrada que enviei',localFinanceState(user),context)).intent,'CLARIFY');}
});
test('IW-D: última criação já arquivada ou com tipo divergente não recua para entrada anterior',async()=>{
 const user=account(),older=add(user,'Mais antiga',9000,'2026-10-20'),newer=add(user,'Última',12000,'2026-10-21'),history=[row(user,older,now-2000),row(user,newer,now-1000)],context={channel:'whatsapp',...whatsappConversationContext(history,user,sender,key,now)},state=localFinanceState(user);
 for(const replacement of [{...state.documents.find(d=>d.id===newer.documents[0].document.id)!,active:false},{...state.documents.find(d=>d.id===newer.documents[0].document.id)!,kind:'APPOINTMENT' as const}]){const changed={...state,documents:state.documents.map(d=>d.id===replacement.id?replacement:d)};assert.equal((await interpret('cancela a última entrada que enviei',changed,context)).intent,'CLARIFY');}
});
test('IW-D: 2 editar valor/data em archive ou restore nunca transforma a intenção em income_upsert',()=>{
 const user=account(),p=add(user,'Entrada guardada',4300,'2026-10-20'),active=localFinanceState(user).documents[0];for(const action of ['document_archive','document_restore'] as const){const state={documents:[{...active,active:action==='document_archive'}],expenses:[]},plan=buildFinancePlan({action,target_id:active.id},state,user,randomUUID(),today);for(const text of ['valor 100','dia 25'])assert.equal(quickEditedPlan({plan,source:'pedido original'},text,state,user,randomUUID(),today),null);}
 assert.equal(independentFinanceRequest('cancela a entrada do dia 20',today),true);assert.equal(localFinanceState(user).documents[0].amount_cents,4300);assert.equal(localFinanceState(user).documents[0].active,true);void p;
});
test('IW-D: confirmação de outro dono/número, expirada/usada e alvo de outro tipo não escrevem',()=>{
 const user=account(),other=account(),p=add(user,'Receita',4300,'2026-10-20'),state=localFinanceState(user),archive=buildFinancePlan({action:'document_archive',target_id:p.documents[0].document.id},state,user,randomUUID(),today),pending={user_id:user,sender,...whatsappPending(archive,user,sender,key,now)};
 for(const [owner,number,at]of [[other,sender,now],[user,'5511900000012',now],[user,sender,now+600001]] as const)assert.throws(()=>confirmedWhatsappPlan('1',[pending],owner,number,key,at));assert.throws(()=>confirmedWhatsappPlan('1',[{...pending,confirmation_used:true}],user,sender,key,now));assert.throws(()=>applyLocalFinance(other,archive,'WHATSAPP'));
 const appointment=buildFinancePlan({action:'appointment_upsert',description:'Consulta',date:today},state,user,randomUUID(),today);const mixed={...state,documents:[...state.documents,{...appointment.documents[0].document,updated_at:new Date(now).toISOString()}]};assert.throws(()=>draftCommand({intent:'COMMAND',command:{action:'document_archive',target_id:appointment.documents[0].document.id},question:'',query:'',confidence:'ALTA',target_excerpt:appointment.documents[0].document.id,money_evidence:[],date_evidence:[]},'cancela a entrada do dia 20',mixed,today));assert.equal(localFinanceState(user).documents[0].active,true);
});
