import {fold} from './finance-date.ts';
import {AppError,object} from './model.ts';
import {personalCategory} from './personal-expenses.ts';
export function whatsappReadPeriod(s:string,fallback:string){return /mes passado|mes anterior/.test(s)?'mes_anterior':/proxima semana|semana que vem/.test(s)?'proxima_semana':/semana/.test(s)?'semana_atual':/amanha/.test(s)?'amanha':/hoje/.test(s)?'hoje':/este mes|esse mes|nesse mes|neste mes|mes (?:atual|inteiro)|do mes/.test(s)?'mes_atual':/historico|desde o inicio|ate (?:o momento|agora)|ao todo|total/.test(s)?'total':fallback;}
const writes=/\b(?:atualiz\w*|ajust\w*|adicion\w*|acrescent\w*|lanca|lance|lancar|anota|anote|anotar|registra|registre|registrar|cadastra|cadastre|cadastrar|agenda (?:pra|para|um|uma|meu|minha)|agende|agendar|marca|marque|marcar|altera\w*|corrig\w*|edita\w*|exclu\w*|cancela\w*|arquiv\w*|pague|quitar|quite|baixa|dar baixa|marcar como pago|marca como pago|marque como pago|vou pagar|receber agora)\b/;
function one(text:string):Record<string,unknown>|null{
 const s=fold(text).replace(/\banotei(?: na hora)?\b/g,'');
 if(s.length>600||/\d|\b(?:empresa|loja|cliente|contrato|estoque|juridico|cnpj|familia|esposa|marido|filh\w*|opcional|essencial|ontem|antes|depois|entre|exceto|semana passada|ano passado|viagem|ferias|janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\b/.test(s)||writes.test(s))return null;
 const stateQuestion=/^como (?:esta|estao|vai|andam)\b/.test(s);
 if(!stateQuestion&&/\b(?:como|onde|aba|tela|serve)\b/.test(s))return null;
 if(!stateQuestion&&!/\?|^(?:(?:oi|ola|por favor)[, ]+)*(?:qual|quais|quanto|quantos|quantas|confere|confira|verifica|verifique|veja|consulta|consulte|mostra|mostre|lista|liste|manda|mande|me (?:diz|diga|mostra|mostre|manda|mande|envia|envie)|eu tenho (?:algum|alguma)|tenho (?:algum|alguma)|o que|tem |existe |saldo\b|minha agenda\b|meu saldo\b|resumo\b|relatorio\b)/.test(s))return null;
 const hits:{key:string;query:Record<string,unknown>}[]=[],add=(key:string,query:Record<string,unknown>)=>{if(!hits.some(h=>h.key===key))hits.push({key,query});};
 const p=(fallback:string)=>whatsappReadPeriod(s,fallback);
 if(/salario|renda fixa|renda mensal/.test(s))add('salario',{topic:'salario',period:p('mes_atual')});
 if(/cheque especial/.test(s))add('overdraft',{report:'overdraft'});
 const reserves=/poupanca|reservas?\b|dinheiro.*guardado/.test(s),cash=/\b(?:saldo|caixa)\b/.test(s);
 if(reserves)add('reservas',{topic:'reservas'});
 if(cash&&(!reserves||/conta|caixa|saldo e/.test(s)))add('saldo',{topic:'saldo'});
 if(/rendas? (?:extra|complementar)|bicos|(?:ganhei|recebi|ganhos).*(?:uber|garcom|pedreiro|por fora)/.test(s))add('rendas',{topic:'rendas',period:p('mes_atual'),...(/uber/.test(s)?{activity:'Uber'}:{})});
 if(/contas? (?:a|para|pra) receber|(?:dinheiro|valor|algo) (?:a|pra|para) receber|entradas? previstas?|recebimentos? pendentes?/.test(s))add('receber',{topic:'receber',period:p('total')});
 else if(/recebimentos|entradas|quanto (?:eu )?(?:recebi|entrou)|dinheiro (?:que )?entrou/.test(s)&&!hits.some(h=>h.key==='rendas'))add('entradas',{topic:'entradas',period:p('mes_atual')});
 const bills=/\b(?:contas?|pagamentos?|boletos?|parcelas?|dividas?)\b|(?:devo|preciso) pagar/.test(s),overdue=/atrasad|vencid|em atraso|devendo/.test(s),fixed=/despesas? fixas?|contas? fixas?|gastos? fixos/.test(s);
 if(bills||overdue){if(overdue)add('atrasos',{topic:'atrasos',period:p('total'),...(fixed?{kind:'MENSAL'}:{})});else if(/a pagar|para pagar|pra pagar|vencer|vencem|vence\b|vencimento|pendente|em aberto|devo pagar|preciso pagar|pagar hoje|pagar amanha/.test(s))add('pagamentos',{topic:'pagamentos',period:p('mes_atual'),...(fixed?{kind:'MENSAL'}:{}),...(/hoje/.test(s)?{payment_state:'HOJE'}:/a vencer/.test(s)?{payment_state:'FUTURO'}:{})});}
 if(fixed&&!hits.some(h=>['pagamentos','atrasos'].includes(h.key)))add('fixed',{report:'fixed',period:p('mes_atual')});
 if(/agenda|compromissos?|eventos?|reunioes|reuniao|consultas?/.test(s))add('agenda',{topic:'agenda',period:p('semana_atual')});
 if(/viagens/.test(s))add('viagens',{topic:'viagens',period:p('total')});
 if(/feedback|sugestao|retorno do suporte/.test(s))add('feedback',{report:'feedback'});
 if(/custos? (?:de |da |das |do |com )?(?:renda|atividade|uber|trabalho)|gastei (?:para|pra) (?:trabalhar|fazer renda)/.test(s)){add('custos',{topic:'custos',period:p('mes_atual'),...(/uber/.test(s)?{activity:'Uber'}:{})});if(!/renda extra\s+e\s+cust/.test(s)){const income=hits.findIndex(h=>h.key==='rendas');if(income>=0)hits.splice(income,1);}}
 if(!fixed&&!hits.some(h=>['pagamentos','atrasos','custos'].includes(h.key))&&/gastei|gastos|despesas/.test(s))add('gastos',/variaveis/.test(s)?{report:'variable',period:p('total')}:{topic:'gastos',period:p('total')});
 if(/investir|investimento/.test(s))add('investir',{topic:'investir'});
 else if(/sobra|sobrando|quanto (?:eu )?posso gastar|disponivel (?:para|pra) gastar/.test(s))add('available',{report:'available'});
 if(/projecao|saldo projetado/.test(s)){const i=hits.findIndex(h=>h.key==='saldo');if(i>=0)hits.splice(i,1);add('projecao',{topic:'projecao'});}
 if(/patrimonio|quanto (?:eu )?tenho (?:ao todo|no total)/.test(s))add('patrimonio',{topic:'patrimonio'});
 if(!hits.length&&/resumo|relatorio geral|situacao financeira|meu dinheiro|visao geral/.test(s))add('resumo',{topic:'resumo'});
 const category=personalCategory('',text);
 for(const h of hits){if(['pagamentos','atrasos','custos'].includes(h.key)){if(/\bboleto(?:s)?\b/.test(s))h.query.payment_method='BOLETO';else if(/\bpix\b/.test(s))h.query.payment_method='PIX';if(category!=='Outras despesas pessoais')h.query.category=category;}if(h.key==='gastos'){if(category!=='Outras despesas pessoais')h.query.category=category;if(/despesas? pessoais|gastos? pessoais/.test(s))delete h.query.topic;}}
 if(hits.length===1)return hits[0].query;
 if(hits.length>1&&hits.length<=4)return {report:'multiple',queries:hits.map(h=>h.query)};
 return null;
}
export function expandedWhatsappQuery(text:string):string|null{
 const parts=text.split(/\?\s*(?=\S)|;|\s+e\s+(?=(?:qual|quais|quanto|quantos|quantas|tenho|tem |minha agenda|minhas contas|meu salario|minhas despesas)\b)/i).map(s=>s.trim()).filter(Boolean);
 if(parts.length>1){if(parts.length>4)return null;const queries=parts.map(part=>one(part)||one('mostra '+part));if(queries.some(q=>!q))return null;const flat=queries.flatMap(q=>q!.report==='multiple'?q!.queries as Record<string,unknown>[]:[q!]);if(flat.length>4)return null;return JSON.stringify({report:'multiple',queries:flat});}
 const query=one(text);return query?JSON.stringify(query):null;
}
export function multipleWhatsappReads(raw:Record<string,unknown>){
 if(raw.report!=='multiple'||Object.keys(raw).some(k=>!['report','queries'].includes(k))||!Array.isArray(raw.queries)||raw.queries.length<2||raw.queries.length>4)throw new AppError('Confira as perguntas da consulta.');
 return raw.queries.map(q=>{const query=object(q);if(query.report==='multiple'||!Object.keys(query).length)throw new AppError('Confira as perguntas da consulta.');return query;});
}
