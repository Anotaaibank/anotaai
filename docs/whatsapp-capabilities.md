# Consultas e comandos no WhatsApp

O WhatsApp usa o mesmo estado financeiro e os mesmos leitores do painel. Perguntas comuns têm interpretação local; perguntas com formas diferentes ou filtros complexos passam pelo intérprete estruturado. O modelo classifica a intenção e os filtros, e o servidor calcula a resposta. O número autorizado é associado à conta por uma conexão assinada; os pedidos não podem escolher outro usuário.

Áreas disponíveis:

A tela WhatsApp permite cadastrar até 100 números autorizados na mesma conta. Use “Cadastrar novo número” e “Adicionar e salvar”; cada inclusão e remoção persiste no servidor, com validação de DDD, duplicatas e número da própria IA. A lista mostra os cadastrados e quantos estão ativos para comandos (zero quando a integração é pausada). Os assinantes devem ter contas próprias para manter as finanças separadas; adicionar participantes nesta lista não cria assinaturas. Remover um número revoga seus comandos e lembretes, com revalidação nas filas existentes.

O esquema de criação `database/schema.sql` prepara o mesmo limite de 100 para o futuro banco próprio. Essa preparação não foi aplicada nem validada em Postgres nesta etapa; o cadastro foi validado no armazenamento local ativo. Uma instalação online que já tenha o limite antigo precisará atualizar sua restrição antes de usar mais de dez números.

- Meu dinheiro: salário previsto, saldo registrado, entradas recebidas, reservas, cheque especial, patrimônio e projeção.
- Rendas complementares: ganhos, custos e resultado líquido, com filtro da atividade; entradas previstas a receber não aumentam o caixa.
- Contas a pagar: pendentes, vencendo hoje, futuras e em atraso. A consulta de atraso sem período inclui meses anteriores e exclui contas pagas/arquivadas. Tipo fixo/variável, categoria, forma de pagamento e identificação podem filtrar a leitura.
- Agenda: consulta por período ou identificação e os comandos de agendar, editar, concluir e arquivar existentes.
- Despesas pessoais: totais, categorias, família, natureza, viagem e período. Despesas fixas e variáveis mantêm seus tipos. Custos de renda extra permanecem separados.
- Viagens: agrupamentos com total pago e previsto, e consultas dos lançamentos de uma viagem.
- Feedback: consulta dos feedbacks próprios e retorno da equipe. Envio pelo comando `Envie um feedback sobre Meu dinheiro: mensagem` prepara uma proposta antes de enviar à gestão.
- Ajuda: `menu` e perguntas sobre finalidade e uso de qualquer área devolvem explicações e exemplos reais de comandos no WhatsApp.

Registrar um pagamento anota que o dinheiro já saiu; não executa uma operação bancária. Agendamentos, ganhos, despesas, correções, arquivamentos e feedbacks pedem confirmação assinada, vinculada ao remetente e válida por dez minutos. Resposta 1 confirma, 2 cancela; várias propostas exigem o código da proposta. Feedbacks usam assinatura com finalidade distinta, limite por usuário e identificador estável para impedir duplicidade.

Consultas sempre leem o estado atual; não criam lançamentos. Os totais usam todos os registros que passaram pelos filtros, mesmo quando a resposta limita a quantidade de itens exibidos. Perguntas não reconhecidas como um atalho conservam texto e filtros no intérprete, em vez de responder com dados de outra categoria ou afirmar falta de acesso.

“Qual o valor do meu saldo, e se tenho contas vencidas?” retorna dois blocos na mesma resposta: saldo atual e contas em atraso, incluindo vencimentos de meses anteriores quando não há período solicitado. As duas leituras usam o mesmo estado da conta, sem chamada ao modelo. “Esse mês” e “desse mês” selecionam o mês atual nos relatórios.

Validação: testes de variações de perguntas, vencimentos, tipos fixo/variável, filtros, receitas previstas, atividades, viagens, ajuda, feedback, confirmação/expiração/idempotência, isolamento e comandos existentes. Conferência de atraso no estado local do proprietário e teste do intérprete real com dados sintéticos, sem mensagens ou lançamentos reais de teste.
