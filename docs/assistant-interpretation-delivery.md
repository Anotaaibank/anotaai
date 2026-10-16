# Interpretação e calendário do Anotei

## Diagnóstico

As mensagens relatadas como ausentes no painel apareciam internamente em ESCLARECER, sem operação de gravação. Essa leitura inicial do banco não era suficiente para concluir que o usuário não havia confirmado: em 16 de outubro, a consulta ao provedor comprovou os cliques reais em Confirmar. O Uazapi preenche o campo vote também em ButtonsResponseMessage; o filtro descartava qualquer evento com vote antes de ler a decisão. Corrigido para aceitar decisões explícitas de botões/listas, mantendo o bloqueio de enquetes, grupos, mensagens próprias, remetentes inválidos e IDs divergentes.

A expressão “como pagamento” também acionava indevidamente a ajuda, pois um padrão de “como pagar” aceitava palavras com o mesmo começo. A transcrição já continha os dados; essa falha era de interpretação, não de captação do microfone.

O calendário mostrava apenas compromissos. Os pagamentos futuros e as entradas previstas não participavam de suas datas. O contexto do WhatsApp também não conservava um foco assinado após a gravação para correções curtas.

## Alterações

- Calendário unificado: vermelho para contas a pagar, azul para entradas previstas e verde para compromissos. O dia atual tem contorno dourado. Vários tipos no mesmo dia preservam marcadores distintos. A seleção abre valores, horários e ações correspondentes.
- Pagamento e recebimento no calendário continuam preparando um resumo antes de alterar o caixa. A previsão não vira dinheiro realizado só porque a data chegou.
- O WhatsApp diferencia “Aguardando confirmação — ainda não salvo” de “Registrado”. Uma gravação só recebe sucesso após recibo válido do servidor, com o identificador da operação.
- Consultas, negações, hipóteses e simulações não autorizam gravações. “Já paguei o aluguel?” consulta; “paguei o aluguel” procura uma obrigação pendente única.
- Valores sem “reais”, números por extenso, abreviações e autocorreções explícitas são normalizados sem inventar quantias. Categoria continua automática.
- Conta mensal tem valor por mês e repetição contínua. Parcela finita preserva a diferença entre preço total e valor de cada parcela.
- Compromissos podem ser de dia inteiro. Um pedido de lembrete que dependa de horário pergunta somente a hora ausente.
- O contexto da conversa considera o mesmo dono e número. Consultas seguintes mantêm os filtros; correções de um registro recém-salvo usam seu foco assinado e geram outra confirmação. Não criam um novo registro.
- Listas de até cinco itens podem preparar os registros completos e indicar explicitamente os incompletos. Estes não entram no plano do banco; seu texto segue no contexto assinado para completar depois.
- Botões aceitam as variantes explícitas de resposta selecionada no webhook; IDs divergentes, grupos, mensagens próprias, remetentes não autorizados e eventos repetidos continuam bloqueados.

## Matriz de intenções e ferramentas reais

| Intenção | Entidades e contexto | Leitura ou operação |
| --- | --- | --- |
| Saldo, salário, gastos, reservas e projeções | Período, categoria, atividade e registros do dono | financeReport / expenseReport / whatsappQueryAnswer |
| Vencimentos, atrasos e recebimentos futuros | Data e estado PREVISTO, separados dos realizados | financeStateForQuery + leitores existentes |
| Consulta de agenda e período do dia | Data, horário ou dia inteiro; apenas eventos registrados | Leitura de APPOINTMENT |
| Gasto novo e entrada recebida | Valor literal, descrição e hoje quando aplicável | expense_create / income_upsert |
| Baixa e recebimento de previsão | Registro único e revisão atual | expense_pay / income_receive |
| Conta mensal e parcelas | Dia, recorrência ou quantidade, valor mensal/total/parcela | expense_schedule + BILL_RULE quando contínua |
| Agendamento e correção | Data, horário opcional, ID existente quando alteração | appointment_upsert |
| Cancelamento | Registro e alcance explícitos | Arquivamento reversível; série mensal distingue ocorrência |
| Vários pedidos | Fontes literais não sobrepostas e itens completos/incompletos | prepareFinanceProposal + confirmação assinada |
| Simulação, comparação e situação de pagamento | Dados reais, sem alteração do estado | conversationReport |
| Feedback | Dono autenticado e confirmação para enviar | Ferramentas de feedback existentes |

O modelo recebe um esquema fechado de saída estruturada. Toda quantia, data e identificação é validada novamente no servidor; o modelo não escolhe usuário, permissões ou credenciais.

## Instruções finais

As instruções complementares exatas estão em [assistant-interpretation-rules.ts](../lib/assistant-interpretation-rules.ts). Elas são anexadas ao contrato de ferramentas, às regras financeiras e ao contexto relevante em [finance-ai.ts](../lib/finance-ai.ts).

A sequência é: entender a intenção, aproveitar somente o contexto pertinente, validar dados obrigatórios, consultar ou preparar a ação, confirmar antes de gravar e responder com o resultado real.

## Velocidade e observabilidade

Consultas claras evitam uma chamada ao modelo. Agenda, pagamentos, atrasos e entradas previstas têm consultas no banco filtradas por dono, tipo, situação e período. Perguntas combinadas reutilizam uma leitura; comandos reutilizam o estado carregado durante a mesma mensagem.

O contexto enviado ao intérprete prioriza registros relacionados ao pedido e limita o volume, sem reduzir a validação completa dos alvos no backend. O log de produção separa transcrição, interpretação, consulta, gravação e resposta, contendo apenas identificador aleatório da mensagem, etapa, duração e sucesso. Não registra transcrições, valores financeiros, telefones, chaves ou senhas.

O painel já consulta atualizações a cada dez segundos enquanto visível e ao recuperar o foco. Assim, o registro confirmado no WhatsApp aparece sem sair da conta; uma proposta ainda não confirmada não aparece como conta ou compromisso salvo.

## Verificação

A validação final passou com **225 testes**, verificação de tipos e build. A base semântica contém **141 mensagens**. Na versão publicada, cinco verificações autenticadas passaram: conta mensal com valor e vencimento repetidos, compromisso de dia inteiro, lista parcialmente completa, simulação e consulta de pagamento. Nenhuma delas confirmou lançamentos ou enviou mensagens de WhatsApp. Os tempos observados foram de 374 a 632 ms para essas respostas do aplicativo; não incluem transcrição de áudio nem entrega pelo provedor de WhatsApp.

A correção dos cliques em 16 de outubro passou na verificação de tipos e em **227 testes**. O novo teste de integração percorre o formato real ButtonsResponseMessage com vote e selectedButtonID, fila, confirmação assinada, gravação, calendário e saldo; três cliques distintos salvam compromisso, conta mensal e gasto, e o replay do mesmo evento é rejeitado. O texto citado de um botão não é interpretado como seleção.

A base em [anotei-language-cases.ts](../tests/fixtures/anotei-language-cases.ts) registra mensagem, contexto, intenção, entidades, operação, esclarecimento e efeito esperado. A matriz executa os leitores e a preparação real dos planos; não substitui as respostas por resultados do modelo simulados.

Os testes de integração percorrem transcrição simulada, interpretação, resumo, resposta 1, gravação, calendário, correção, edição, conflito de revisão e replay. Outros casos verificam isolamento, assinatura, expiração, falha de ferramenta e webhook duplicado.

No Supabase, [whatsapp-calendar-persistence.sql](../tests/sql/whatsapp-calendar-persistence.sql) verificou gravação pelo fluxo do WhatsApp, visibilidade pela mesma conta autenticada, doze vencimentos mensais, compromisso com data e hora, idempotência e bloqueio de outra conta. Toda a transação foi revertida. Nenhum dado de cliente ou mensagem real foi criado nesse teste.

A inspeção visual automatizada do calendário unificado não pôde ser concluída porque o controle do navegador excedeu o tempo de resposta, inclusive numa aba nova. A composição dos registros e as datas/cores estão cobertas pelos testes; permanece essa limitação da conferência visual nesta entrega.

## Limitações reais

O aplicativo ainda não possui múltiplas contas bancárias, faturas e limites bancários, pagamentos bancários reais, eventos recorrentes semanais/quinzenais, feriados/dias úteis, duração de eventos, intervalo de viagem nem lembrete com antecedência personalizada. Essas solicitações recebem uma limitação direta; não são convertidas em operações diferentes.

A agenda vazia significa ausência de compromissos registrados, não garantia de disponibilidade. Lembretes dependem de data e horário válidos, conexão e serviço ativos. Contas mensais continuam nos próximos meses; os doze vencimentos materializados não significam doze parcelas restantes.

O contexto do WhatsApp é restrito ao mesmo remetente, aos últimos quinze minutos e aos turnos recentes. A confirmação de uma proposta vale dez minutos. Após expirar, é preciso preparar um novo resumo. Não foi aplicado “1” automaticamente a propostas antigas.
