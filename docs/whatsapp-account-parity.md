# Comandos consistentes entre contas do WhatsApp

## Causa reproduzida e correção compartilhada

Não existe prompt de comandos específico para determinados telefones. O worker e o intérprete são comuns aos cadastros existentes e aos próximos. O nome da assistente, os dados financeiros, os limites da assinatura e a conversa de cada remetente continuam individuais.

Foi reproduzida uma diferença causada pelo histórico: a identificação de novo pedido dependia de uma lista de palavras no começo da mensagem. Um pedido completo começando por “Hoje” ou “Por favor” podia ser tratado como complemento ou edição do pedido antigo. No caso sintético “Hoje gastei 35 reais e 80 centavos na lavanderia”, uma entrada anterior sem valor fazia o gasto virar receita; uma edição anterior podia agrupar dois gastos.

O limite de conversa agora usa o mesmo intérprete determinístico compartilhado dos comandos. Prefixos explícitos iniciam um pedido próprio; outros comandos completos reconhecidos também não herdam pedidos anteriores. Respostas curtas e correções explicitamente relacionadas ao pedido anterior continuam como complementos. Nenhum pedido é salvo sem a confirmação assinada e a validação do servidor.

Também foi reproduzida uma falha entre os dois números de uma assinatura: 55 mensagens do segundo número tiravam a proposta do primeiro dos 50 registros consultados. A busca de contexto agora filtra usuário e remetente antes do limite, e exclui lembretes automáticos. O histórico geral do painel permanece disponível sem esse filtro.

## Evidências e limites

- Matriz sintética: 16 cenários combinando conexão própria/compartilhada, texto/áudio com transcrição simulada e quatro históricos (vazio, incompleto, edição e lançamento concluído). Cada cenário registra saída, entrada e compromisso, verifica confirmação, persistência, repetição e isolamento entre contas.
- Antes: 8 de 16 cenários concluíam corretamente; os oito com pedido incompleto ou edição anterior falhavam. Depois: os 16 cenários concluem corretamente.
- A confirmação após 55 mensagens do segundo número falhava antes da correção e passa depois.
- A suíte existente mantém os casos de correção de horário, consultas, recorrência, autorização e idempotência. Esses testes não substituem a avaliação de novos áudios reais ou uma prova de capacidade para 100 mil usuários simultâneos.
- Auditoria operacional de produção: oito convites, seis cadastros concluídos; todos os seis com vínculo e conexão autorizados. Foram consultados metadados e contagens classificadas no banco, sem coletar textos ou transcrições gerais de assinantes.

A atualização não cria configuração individual por telefone, não recadastra contatos, não reinicia conversas em massa, não altera permissões de assinatura e não reexecuta lançamentos antigos. Não requer migração de banco. A regra comum passa a valer quando o serviço atualizado processa a próxima mensagem.
