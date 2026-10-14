const expenseFold=(s:string)=>s.normalize('NFD').replace(/\p{M}/gu,'').toLocaleLowerCase('pt-BR');

export const expenseAudiences=['FAMILIA','INDIVIDUAL','NAO_INFORMADO'] as const;
export const expenseNatures=['ESSENCIAL','OPCIONAL','NAO_CLASSIFICADO'] as const;
export type ExpenseAudience=typeof expenseAudiences[number];
export type ExpenseNature=typeof expenseNatures[number];
export const audienceLabel=(value?:string)=>value==='FAMILIA'?'Família':value==='INDIVIDUAL'?'Individual':'Não informado';
export const natureLabel=(value?:string)=>value==='ESSENCIAL'?'Essencial':value==='OPCIONAL'?'Opcional':'Não classificado';
// Preserve explicit classifications; uncertain purchases remain unclassified.
export function expenseContext(text:string,category:string){
 const source=expenseFold(text);
 const audience:ExpenseAudience=/\b(familia|filha|filho|filhos|esposa|marido)\b/.test(source)?'FAMILIA':/\b(so para mim|so pra mim|individual)\b/.test(source)?'INDIVIDUAL':'NAO_INFORMADO';
 const nature:ExpenseNature=/\b(superflu[oa]s?|opciona(?:l|is))\b/.test(source)?'OPCIONAL':/\b(essencial|necessari[oa]s?)\b/.test(source)?'ESSENCIAL':['Lazer','Viagem / hospedagem','Assinaturas'].includes(category)?'OPCIONAL':['Escola / educação','Plano de saúde','Saúde / medicamentos','Aluguel / moradia','Condomínio','Água','Energia elétrica','Gás','Supermercado'].includes(category)?'ESSENCIAL':'NAO_CLASSIFICADO';
 return {expense_audience:audience,expense_nature:nature};
}
export function expenseStatusQuestion(text:string){return /\b(?:voce\s+|ja\s+)?(?:lancou|registrou|salvou)\b|\b(?:foi|esta|ficou)\s+(?:lancad[oa]|registrad[oa]|salv[oa])\b/.test(expenseFold(text));}
