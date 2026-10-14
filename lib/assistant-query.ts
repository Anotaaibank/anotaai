import {AppError,object,brazilDay} from './model.ts';
import {financeQuery} from './finance-report.ts';
import {personalCategory} from './personal-expenses.ts';
import {fold} from './finance-date.ts';
// Route the model's intent to existing readers. No totals or financial rules live here.
export function assistantQuery(raw:string,today=brazilDay(),source=''){
 if(typeof raw!=='string'||raw.length>2000)throw new AppError('Confira o pedido da consulta.');
 const input=object(JSON.parse(raw)),b=Object.fromEntries(Object.entries(input).filter(([,v])=>v!==null));
 if(b.filters!==undefined){const filters=object(b.filters),financial=['pagamentos','atrasos','receber','custos','agenda','viagens'].includes(String(b.topic)),allowed=financial?['category','trip','search','payment_method','activity','kind','payment_state','status']:['category','trip','audience','nature','search','status'];if((b.topic!=='gastos'&&!financial)||Object.keys(filters).some(k=>!allowed.includes(k)))throw new AppError('Confira os filtros da consulta.');for(const [k,v]of Object.entries(filters)){if(b[k]!==undefined&&b[k]!==v)throw new AppError('Confirme o filtro desejado.');if(v!==null)b[k]=v;}delete b.filters;}
 if(['pagamentos','atrasos'].includes(String(b.topic))&&b.status==='PREVISTO')delete b.status;
 let filtered=['category','trip','audience','nature','search','status'].some(k=>b[k]!==undefined&&b[k]!=='');
 if(b.topic==='gastos'&&!filtered&&source&&!/\b(?:geral|tudo|todos os gastos|todas as despesas|resumo)\b/.test(fold(source))){const category=personalCategory('',source);if(category!=='Outras despesas pessoais'){b.category=category;filtered=true;}}
 if(filtered&&b.topic==='gastos'){delete b.topic;delete b.explain;}
 if(!b.topic&&filtered&&['hoje','amanha','semana_atual','proxima_semana'].includes(String(b.period))){const dates=financeQuery({topic:'gastos',period:b.period},today);b.period='personalizado';b.from=dates.from;b.to=dates.to;}
 return JSON.stringify(b);
}
