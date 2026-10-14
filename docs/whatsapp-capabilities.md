# Consultas e comandos no WhatsApp

O WhatsApp usa o mesmo estado financeiro e os mesmos leitores do painel. Perguntas comuns têm interpretação local; perguntas com formas diferentes ou filtros complexos passam pelo intérprete estruturado. O modelo classifica a intenção e os filtros, e o servidor calcula a resposta. O número autorizado é associado à conta por uma conexão assinada; os pedidos não podem escolher outro usuário.

Áreas disponíveis:

A gestão cadastra assinantes e cada conta pessoal aceita até dois números do casal, compartilhando as mesmas finanças. Apenas a gestão cadastra e altera números. Autorizações são revalidadas na fila e nos lembretes. Ver `docs/subscriber-access.md`.

- Meu dinheiro: salário previsto, saldo registrado, entradas recebidas, reservas, cheque especial, patrimônio e projeção.
- Rendas complementares: ganhos, custos e resultado líquido, com filtro da atividade; entradas previstas a receber não aumentam o caixa.
- Contas a pagar: pendentes, vencendo hoje, futuras e em atraso. A consulta de atraso sem período inclui meses anteriores e exclui contas pagas/arquivadas. Tipo fixo/variável, categoria, forma de pagamento e identificação podem filtrar a leitura.
- Agenda: consulta por período ou identificação e os comandos de agendar, editar, concluir e arquivar existentes.
- Despesas pessoais: totais, categorias, família, natureza, viagem e período. Despesas fixas e variáveis mantêm seus tipos. Custos de renda extra permanecem separados.
- Viagens: agrupamentos com total pago e previsto, e consultas dos lançamentos de uma viagem.
- Feedback: consulta dos feedbacks próprios e retorno da equipe. Envio pelo comando `Envie um feedback sobre Meu dinheiro: mensagem` prepara uma proposta antes de enviar à gestão.
- Ajuda: `menu` e perguntas sobre finalidade e uso de qualquer área devolvem explicações e exemplos reais de comandos no WhatsApp.

Registrar um pagamento anota que o dinheiro já saiu; não executa uma operação bancária. Agendamentos, ganhos, despesas, correções, arquivamentos e feedbacks pedem confirmação assinada, vinculada ao remetente e válida por dez minutos. Nas propostas financeiras e de agenda, 1 confirma e 2 abre edição; a correção gera um novo resumo antes de salvar. CANCELAR seguido do código desiste da proposta. Feedback mantém 1 confirma e 2 cancela. Várias propostas exigem o código da proposta. Feedbacks usam assinatura com finalidade distinta, limite por usuário e identificador estável para impedir duplicidade.

Consultas sempre leem o estado atual; não criam lançamentos. Os totais usam todos os registros que passaram pelos filtros, mesmo quando a resposta limita a quantidade de itens exibidos. Perguntas não reconhecidas como um atalho conservam texto e filtros no intérprete, em vez de responder com dados de outra categoria ou afirmar falta de acesso.

“Qual o valor do meu saldo, e se tenho contas vencidas?” retorna dois blocos na mesma resposta: saldo atual e contas em atraso, incluindo vencimentos de meses anteriores quando não há período solicitado. As duas leituras usam o mesmo estado da conta, sem chamada ao modelo. “Esse mês” e “desse mês” selecionam o mês atual nos relatórios.

Validação: testes de variações de perguntas, vencimentos, tipos fixo/variável, filtros, receitas previstas, atividades, viagens, ajuda, feedback, confirmação/expiração/idempotência, isolamento e comandos existentes. Conferência de atraso no estado local do proprietário e teste do intérprete real com dados sintéticos, sem mensagens ou lançamentos reais de teste.

Contas mensais contínuas, variações pesquisadas de comandos e fluxo de edição estão documentados em `docs/whatsapp-command-research.md`. “Pago meu carro todo dia 22, 1500 reais, agenda para mim” prepara a regra mensal e vencimentos previstos, sem pedir quantidade de meses e sem debitar o caixa antes de registrar pagamento.
