import {fold} from './finance-date.ts';
import {screenGuide,type AssistantScreen} from './assistant-guide.ts';
const sections:[AssistantScreen,RegExp][]=[['feedback',/feedback|sugestao|suporte/],['pagamentos',/contas a pagar|contas em atraso|vencimento/],['rendas',/rendas? complementares?|renda extra|bicos|uber/],['mensais',/despesas? fixas?|contas? fixas?/],['viagens',/viagen|ferias/],['agenda',/agenda|compromisso|evento|reuniao/],['despesas',/minhas despesas|despesas pessoais|gasto|despesa/],['dinheiro',/meu dinheiro|salario|saldo|poupanca|reserva/],['whatsapp',/whatsapp|numero autorizado|qr code/],['resumo',/visao geral|resumo/]];
export const whatsappExamples:Record<AssistantScreen,string[]>={
 resumo:['Qual é meu resumo financeiro?','Qual é meu saldo atual?'],dinheiro:['Meu salário é 6 mil reais.','Recebi 6 mil reais de salário hoje.','Qual é meu saldo?'],rendas:['Ganhei 80 reais fazendo Uber e gastei 25 de gasolina.','Quanto recebi de renda extra neste mês?','Tenho contas a receber?'],pagamentos:['Tenho contas em atraso?','Quais contas vencem hoje?','Já paguei o aluguel.'],mensais:['Quais são minhas despesas fixas?','Agende 12 contas mensais de aluguel de 400 reais, começando dia 10 do próximo mês.'],viagens:['Quais são minhas viagens?','Quanto gastei na viagem Férias?'],agenda:['Qual é minha agenda desta semana?','Agenda uma consulta dia 10 de novembro às 14h.'],despesas:['Gastei 25 reais com sorvete.','Quanto gastei com supermercado neste mês?'],whatsapp:['Envie perguntas e comandos deste número autorizado.','Responda 1 para confirmar ou 2 para cancelar a proposta.'],feedback:['Quais são meus feedbacks?','Envie um feedback sobre Meu dinheiro: gostaria de ver mais detalhes do saldo.']};
export function whatsappHelp(text:string){
 const s=fold(text);
 if(/^(?:oi|ola|bom dia|boa tarde|boa noite|menu|ajuda)[.! ]*$/.test(s)||/o que (?:voce|eu) (?:pode|posso) fazer|quais (?:comandos|funcoes)|como (?:usar|funciona) (?:o |este )?(?:anotei|aplicativo|programa)|todas as abas/.test(s))return '*Anotei pelo WhatsApp*\n\n'+sections.filter(([screen])=>screen!=='whatsapp').map(([screen])=>`• *${screenGuide[screen].title}*: ${whatsappExamples[screen][0]}`).join('\n\n')+'\n\nVocê pode consultar, agendar, corrigir e registrar pagamentos. Alterações pedem confirmação: 1 confirma, 2 cancela. Posso explicar qualquer uma dessas áreas.';
 if(!/para que serve|pra que serve|como (?:eu )?(?:faco|cadastr\w*|registr\w*|anot\w*|configur\w*|us\w*|envi\w*|agend\w*|pag\w*|receb\w*|corrig\w*|alter\w*|exclu\w*|quit\w*)|onde (?:eu )?(?:clico|fica|cadastro)|explica.*(?:aba|tela)|nao entendi.*(?:aba|tela)/.test(s))return null;
 const section=sections.find(([,pattern])=>pattern.test(s))?.[0];
 if(!section)return 'Qual área você quer entender: Meu dinheiro, rendas complementares, contas a pagar, agenda, despesas, viagens ou feedback?';
 return `*${screenGuide[section].title}*\n\n${screenGuide[section].explanation}\n\n*Você pode pedir por aqui:*\n`+whatsappExamples[section].map(example=>'• '+example).join('\n')+'\n\nOs pedidos de alteração mostram um resumo antes de salvar. Registrar um pagamento anota algo que você já pagou; não realiza pagamento no banco.';
}
export function feedbackRequest(text:string){
 const s=fold(text),match=text.match(/^(?:por favor[, ]+)?(?:(?:envia|envie|enviar|registra|registre|registrar|mandar|manda|mande)\s+(?:um |uma |meu |minha )?(?:feedback|sugest[aã]o|reclama[cç][aã]o|elogio)|quero (?:dar|enviar|registrar) (?:um |uma )?(?:feedback|sugest[aã]o|reclama[cç][aã]o|elogio))\s*(?:sobre\s+([^:]{2,80})\s*:|:)?\s*([\s\S]+)$/i);
 if(!match)return null;
 const area=fold(match[1]||''),screen=sections.find(([,pattern])=>pattern.test(area))?.[0];
 const topic=screen&&screen!=='pagamentos'?screenGuide[screen].title:'Outros';
 return {topic,kind:/reclamacao|problema|erro|nao funciona/.test(s)?'Problema':/elogio|gostei|parabens/.test(s)?'Elogio':'Sugestão',message:match[2].trim()};
}
