import {AppError,object} from './model.ts';
import {assistantHelp,assistantScreen} from './assistant-guide.ts';

export const assistantViews=['panel','profile_form','income_form','reserve_form','transfer_form','appointment_form','expense_form','cost_form','review'] as const;
export type AssistantView=typeof assistantViews[number];
export function assistantView(value:unknown):AssistantView{if(value===undefined)return 'panel';if(!assistantViews.includes(value as AssistantView))throw new AppError('Formulário não disponível.');return value as AssistantView;}
const formSteps:Partial<Record<AssistantView,string[]>>={
 profile_form:['Informe o salário mensal previsto e o dia do recebimento. Confira também o saldo inicial e a data desse saldo.','Se houver, informe limite e taxa do cheque especial e margem de segurança. Confira o resumo antes de confirmar.'],
 income_form:['Informe a origem, o valor e a data da entrada. Confira se o dinheiro já foi recebido ou ainda é previsto.','Identifique se é salário ou renda extra. Confira o resumo antes de confirmar; uma previsão não aumenta o saldo atual.'],
 reserve_form:['Informe o nome da reserva e seu saldo inicial. Depois confira a taxa de rendimento e se é mensal ou anual.','Confira a data do saldo e o resumo antes de confirmar. O rendimento informado será uma estimativa.'],
 transfer_form:['Selecione a reserva e escolha aporte ou resgate. Informe o valor e a data da movimentação já realizada.','Confira o resumo antes de confirmar. Esse cadastro registra uma movimentação, sem transferir dinheiro no banco.'],
 appointment_form:['Informe o compromisso e a data. Você pode acrescentar horário e local.','Confira os dados e o resumo antes de confirmar. O compromisso ficará na Agenda.'],
 expense_form:['Confira identificação, valor, data e categoria. Depois escolha a situação e a forma de pagamento.','Se for uma conta fixa, confira os vencimentos e a repetição. Revise os dados antes de salvar.'],
 cost_form:['Informe a atividade que gerou o custo, o valor gasto e a data.','Confira o resumo antes de confirmar. Esse custo reduz o caixa e o resultado da renda extra uma única vez.'],
 review:['Confira a identificação, os valores e as datas no resumo. Se estiverem corretos, use o botão de confirmação; para desistir, Cancelar.'],
};
export function assistantManual(raw:unknown,current:unknown,view:unknown='panel'){
 const b=object(raw);if(Object.keys(b).some(k=>!['section','mode','step'].includes(k))||b.step!==undefined&&(!Number.isInteger(b.step)||Number(b.step)<1||Number(b.step)>20))throw new AppError('Confira a etapa da orientação.');
 const help=assistantHelp({section:b.section,mode:b.mode},current),v=assistantView(view),steps=v==='panel'||help.section!==assistantScreen(current)?help.steps:formSteps[v]||help.steps;
 const index=Math.min(Number(b.step||1)-1,Math.max(0,steps.length-1));
 return {...help,current_view:{section:assistantScreen(current),form:v},suggested_step:index+1,next_step:index+1<steps.length?index+2:null,steps,answer:help.mode==='PASSOS'?steps[index]||help.explanation:help.explanation};
}
// Only fixed UI titles are observed. Input values and labels containing user data are never read.
export function visibleAssistantView(root:Pick<Document,'querySelectorAll'>,pending=false):AssistantView{
 if(pending)return 'review';
 const elements=Array.from(root.querySelectorAll('.anota-modal h2'));
 for(const el of elements.reverse()){
  const title=(el.textContent||'').normalize('NFD').replace(/\p{M}/gu,'').toLowerCase();
  if(el.closest?.('.finance-confirm'))return 'review';
  if(/renda e saldo|renda e (?:meu )?caixa|salario e saldo/.test(title))return 'profile_form';
  if(/entrada|renda extra/.test(title)&&!/custo/.test(title))return 'income_form';
  if(/poupanca|reserva/.test(title)&&!/aporte|resgate/.test(title))return 'reserve_form';
  if(/aporte|resgate/.test(title))return 'transfer_form';
  if(/compromisso/.test(title))return 'appointment_form';
  if(/custo.*atividade|custo para/.test(title))return 'cost_form';
  if(/despesa/.test(title))return 'expense_form';
 }
 return 'panel';
}
