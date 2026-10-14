# Lançamentos e agenda pelo WhatsApp

Pesquisa e implementação em 14/10/2026. O catálogo organiza famílias de pedidos e variações de linguagem; não pretende enumerar todas as frases possíveis. Texto e transcrição de áudio seguem o mesmo processamento, sempre na conta vinculada ao remetente.

## Referências e decisões

- [Banco Central — Caderno de Educação Financeira](https://www.bcb.gov.br/pre/pef/port/caderno_cidadania_financeira.pdf): orçamento com receitas, despesas e compromissos sazonais. Recorrência e valor fixo não são sinônimos: água e energia podem repetir mensalmente com valor variável. No Anotei, o usuário informa o valor para agendar; pode corrigir cada vencimento antes de registrar pagamento.
- [Todoist — datas recorrentes](https://www.todoist.com/pt-BR/help/todoist/features/introduction-to-recurring-dates-YUYVJJAV): exemplos de linguagem natural, repetição baseada no vencimento e diferenciação entre ocorrência e regra contínua. A conta mensal usa o dia informado, preservado entre meses, sem mudar a regra ao registrar pagamento com atraso.
- [Google Agenda — eventos recorrentes](https://support.google.com/calendar/answer/37115?co=GENIE.Platform%3DDesktop&hl=pt-BR): frequência, início/fim e confirmação de alterações. Os compromissos avulsos do Anotei mantêm data, horário, local opcional e lembretes existentes. Nesta alteração, a repetição contínua implementada é de contas mensais, não uma promessa de repetir compromissos semanais ou anuais.
- [OpenAI — saídas estruturadas](https://developers.openai.com/api/docs/guides/structured-outputs): o intérprete devolve intenção e campos tipados. Valores e datas são verificados no servidor; o modelo não grava diretamente. Pedidos simples completos têm processamento local para evitar uma chamada adicional à IA.

## Catálogo de pedidos

| Família | Exemplos de frases |
|---|---|
| Gasto de agora | “Gastei 25 reais de sorvete”; “Anota 150 reais de combustível”; “Acabei de pagar 40 reais no almoço”; “Registra 200 reais de supermercado”. |
| Gasto de outra data | “Ontem gastei 60 reais com gasolina”; “Esqueci de lançar 25 reais do almoço de ontem”; “Registra a compra de 100 reais de 10/10”; “Anteontem paguei 80 reais na farmácia”. |
| Pagamento futuro avulso | “Vou pagar 80 reais de internet dia 22”; “Comprei um celular, 900 reais, vou pagar dia 10 do mês que vem”; “Agenda 400 reais de aluguel amanhã”; “Lança essa conta como a pagar”. |
| Conta mensal contínua | “Pago meu carro todo dia 22, 1500 reais, agenda para mim”; “Meu aluguel é 1200 reais todo mês dia 5”; “Registra internet todo dia dez por 100 reais”; “Cadastra academia de 80 reais todo mês dia 15”. |
| Sequência com quantidade | “Agende 12 contas mensais de 400 reais, começando dia 10 do próximo mês”; “São 3 parcelas de 100 reais”; “Comprei por 900 reais em 3 vezes”; “Tenho 6 prestações mensais de 250 reais”. |
| Recebimento | “Recebi meu salário de 6000 reais”; “Ganhei 80 reais fazendo Uber”; “Ganhei 150 reais como garçom”; “Recebi 200 reais de um bico”. |
| Custo de renda extra | “Gastei 25 reais de gasolina fazendo Uber”; “Ganhei 80 com Uber e gastei 25 de gasolina”; “Gastei 30 reais de material para o bico”; “Registra esse custo da atividade”. |
| Registrar pagamento feito | “Já paguei o aluguel”; “Quite a conta que eu já paguei”; “Marca o boleto como pago hoje”; “Paguei a conta de internet de 22/10”. Se houver contas com o mesmo nome, identificar o vencimento antes de preparar a alteração. |
| Compromisso | “Agenda uma consulta dia 10 de novembro às 14h”; “Coloque na agenda que amanhã às três da tarde tenho dentista”; “Me lembra da reunião na próxima segunda às 9 horas”; “Marque um evento dia 10 do mês 11 às 14 horas”. |
| Editar proposta | “2”; botão “Editar”; “O valor certo é 1600 reais”; “Dia 25”; “Às 15h”; “Troque a descrição para consulta”. A edição produz outro resumo, sem gravação automática. |
| Editar registro salvo | “Corrige o valor da compra para 95 reais”; “Altera o vencimento da conta”; “Muda a consulta para amanhã às 15h”; “O pagamento ainda não aconteceu, desfaz a baixa”. Identificação única e nova confirmação são necessárias. |
| Cancelar ou retomar | “CANCELAR código” desiste de uma proposta; “Cancelar” desiste durante a edição; “Cancela a recorrência mensal do carro” interrompe os próximos vencimentos; “Arquiva a consulta”; “Restaura o compromisso”. |
| Consultar contas | “Tenho alguma conta vencida?”; “Quanto tenho a pagar este mês?”; “Quais boletos vencem hoje?”; “Quanto são minhas despesas fixas?”; “Qual meu saldo e tenho contas vencidas?”. |
| Consultar agenda | “Qual minha agenda desta semana?”; “O que tenho amanhã?”; “Quais meus próximos compromissos?”; “Tenho alguma consulta marcada?”; “Qual o horário da reunião?”. |
| Entender o programa | “Como faço para cadastrar uma conta?”; “Para que serve a Agenda?”; “Onde vejo as despesas fixas?”; “Como corrijo uma proposta?”. Ajuda e consultas não criam lançamentos. |

## Confirmação e edição

1. A IA lê o pedido e mostra identificação, valor, vencimento/horário e repetição quando houver.
2. **1 — Confirmar** salva a proposta; **2 — Editar** abre a correção. Botões preservam o código; quando incompatíveis, o texto oferece os números.
3. O usuário escreve a correção. Um novo resumo pede novamente 1 ou 2. A proposta anterior perde a validade e seu código não pode salvar os dados antigos.
4. Falta de valor, data indispensável ou alvo único pede só o dado faltante. Não perguntar categoria ou data de um gasto imediato completo.
5. Várias propostas não são escolhidas silenciosamente: usar o botão ou CONFIRMAR/EDITAR seguido do código. Confirmações e edições são assinadas, vinculadas à conta e número, válidas por dez minutos. Eventos repetidos não gravam novamente.

Feedback continua com seu fluxo próprio: 1 confirma e 2 cancela o envio. A mudança de 2 para editar aplica-se às propostas financeiras e de agenda.

## Recorrência mensal

Sem quantidade/fim explicitamente informados, “todo dia 22” cria uma regra contínua. O primeiro vencimento é a próxima ocorrência do dia informado, incluindo hoje. Os primeiros 12 vencimentos são previstos; o worker autorizado continua preenchendo o horizonte dos próximos meses. Dia 31 usa o último dia nos meses menores e volta ao dia 31 nos seguintes.

Agendamento não debita o saldo. Somente registrar um pagamento realizado muda o caixa. A Agenda apresenta as regras com ação de cancelar/retomar, sempre mediante confirmação. Cancelar a regra interrompe a geração e arquiva vencimentos de hoje em diante; contas antigas em atraso e pagamentos realizados ficam preservados. Arquivar uma ocorrência isolada não cancela a regra.

Nova migração: `supabase/migrations/20261014210626_recurring_bills.sql`, após as migrações atuais do Anotei. Reutiliza documentos financeiros com RLS, sem tabela ou acesso público novo. A expansão é função exclusiva do servidor, com revalidação da assinatura e vínculo WhatsApp, trava por conta e identificador estável por regra/mês.
