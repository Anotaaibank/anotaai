import {expenseContext,type ExpenseAudience,type ExpenseNature} from './expense-context.ts';
import type {AdminEntry} from './expenses.ts';

// Based on IBGE POF household spending groups, detailed for the owner's daily use.
export const personalCategories=['Restaurante','Supermercado','Escola / educação','Plano de saúde','Saúde / medicamentos','Aluguel / moradia','Condomínio','Água','Energia elétrica','Gás','Internet / telefone','Combustível','Transporte / estacionamento','Veículo pessoal','Viagem / hospedagem','Lazer','Vestuário / compras','Cuidados pessoais','Serviços domésticos','Pets','Seguros','Impostos / taxas','Assinaturas','Outras despesas pessoais'] as const;export const fixedCategories=['Aluguel / moradia','Condomínio','Água','Energia elétrica','Gás','Internet / telefone','Escola / educação','Plano de saúde','Seguros','Assinaturas','Serviços domésticos','Outras despesas pessoais'] as const;
export const expenseFold=(s:string)=>s.normalize('NFD').replace(/\p{M}/gu,'').toLocaleLowerCase('pt-BR').trim().replace(/\s+/g,' ');
const aliases:[RegExp,(typeof personalCategories)[number]][]=[
 [/\b(restaurante|restaurantes|restauranti|lanchonete|delivery|ifood|almoco|jantar|sorvete|sorveteria|acai|pizza|pizzaria|hamburguer|lanche|cafeteria)\b/,'Restaurante'],[/\b(supermercado|mercado|feira|acougue|padaria)\b/,'Supermercado'],
 [/\b(escola|educacao|faculdade|curso|material escolar|creche)\b/,'Escola / educação'],[/\b(plano (de )?(saude|medico)|convenio|unimed)\b/,'Plano de saúde'],[/\b(saude|medicamento|medicamentos|farmacia|medico|dentista|consulta|exame)\b/,'Saúde / medicamentos'],
 [/\b(aluguel|moradia|prestacao da casa)\b/,'Aluguel / moradia'],[/\b(condominio)\b/,'Condomínio'],[/\b(agua|sabesp)\b/,'Água'],[/\b(energia|luz|eletricidade)\b/,'Energia elétrica'],[/\b(gas|botijao)\b/,'Gás'],[/\b(internet|telefone|celular)\b/,'Internet / telefone'],
 [/\b(combustivel|gasolina|etanol|diesel|abasteci|abastecimento)\b/,'Combustível'],[/\b(uber|taxi|onibus|transporte|estacionamento|pedagio)\b/,'Transporte / estacionamento'],[/\b(pneu|oficina|manutencao|carro pessoal|veiculo pessoal)\b/,'Veículo pessoal'],
 [/\b(hotel|hospedagem|passagem|viagem|viagens)\b/,'Viagem / hospedagem'],[/\b(lazer|cinema|parque|show)\b/,'Lazer'],[/\b(roupa|vestuario|calcado|compras)\b/,'Vestuário / compras'],[/\b(salao|cabelo|barbeiro|academia|manicure|pedicure|unhas|cuidados pessoais)\b/,'Cuidados pessoais'],
 [/\b(diarista|empregada|servicos domesticos)\b/,'Serviços domésticos'],[/\b(pet|pets|racao|veterinario)\b/,'Pets'],[/\b(seguro|seguros)\b/,'Seguros'],[/\b(imposto|ipva|iptu|taxa|multa)\b/,'Impostos / taxas'],[/\b(assinatura|streaming|netflix|spotify)\b/,'Assinaturas'],
];
export function personalCategory(category:string,description=''){
 const exact=personalCategories.find(c=>expenseFold(c)===expenseFold(category));if(exact)return exact;
 return aliases.find(([r])=>r.test(expenseFold(category)))?.[1]||aliases.find(([r])=>r.test(expenseFold(description)))?.[1]||category.trim()||'Outras despesas pessoais';
}
export function tripName(raw:unknown){if(raw===null||raw===undefined||raw==='')return '';if(typeof raw!=='string'||raw.length>80||/[\u0000-\u001f]/.test(raw))throw new Error('Informe um nome de viagem com até 80 caracteres.');return raw.trim().replace(/\s+/g,' ');}
export function personalSummary(entries:AdminEntry[],category='',trip='',from='2000-01-01',to='2100-12-31',audience?:ExpenseAudience,nature?:ExpenseNature){
 const context=(e:AdminEntry)=>({...expenseContext(e.description,personalCategory(e.category,e.description)),...Object.fromEntries(Object.entries(e.details).filter(([k,v])=>['expense_audience','expense_nature'].includes(k)&&v))});
 const rows=entries.filter(e=>!e.details.income_activity&&e.active&&e.scope==='PESSOAL'&&e.status==='REALIZADO'&&e.entry_date>=from&&e.entry_date<=to&&(!audience||context(e).expense_audience===audience)&&(!nature||context(e).expense_nature===nature)&&(!category||expenseFold(personalCategory(e.category,e.description))===expenseFold(personalCategory(category)))&&(!trip||expenseFold(e.details.trip_name||'')===expenseFold(trip)));
 const sum=(list:AdminEntry[])=>list.reduce((n,e)=>n+Number(e.amount_cents||0),0);
 const group=(name:(e:AdminEntry)=>string)=>{const map=new Map<string,{name:string;amount_cents:number;count:number}>();for(const e of rows){const label=name(e);if(!label)continue;const key=expenseFold(label),g=map.get(key)||{name:label,amount_cents:0,count:0};g.amount_cents+=Number(e.amount_cents||0);g.count++;map.set(key,g);}return [...map.values()].sort((a,b)=>b.amount_cents-a.amount_cents||a.name.localeCompare(b.name));};
 return {rows,amount_cents:sum(rows),count:rows.length,categories:group(e=>personalCategory(e.category,e.description)),trips:group(e=>e.details.trip_name||''),audiences:group(e=>String(context(e).expense_audience)),natures:group(e=>String(context(e).expense_nature)),missing:rows.filter(e=>e.amount_cents===null).length};
}
