# Consultas financeiras e agenda da IA

Atualização de 9 de outubro de 2026. A voz consulta `consultar_financas` com assunto e período; texto no painel e mensagens autorizadas do WhatsApp usam o mesmo relatório. Todos recebem somente o estado da conta autenticada ou do proprietário do bot autorizado. Consultar não cria proposta nem grava lançamento.

## Cálculos

- **Saldo:** saldo inicial + entradas recebidas − despesas pagas + resgates − aportes, desde a data do saldo inicial. O salário cadastrado, renda prevista e limite de cheque especial não são recebimentos.
- **Total registrado:** saldo do caixa + principal das reservas. Juros calculados pela taxa informada são estimativa separada, sem aumentar o caixa.
- **Gasto geral:** pagamentos pessoais + custos das atividades de renda extra. Contas previstas e arquivadas não entram. Categoria, viagem e contexto não são somados como gastos distintos.
- **Renda extra líquida:** recebimentos extras − custos da atividade no período pedido. Salário recebido aparece na consulta de salário ou de todas as entradas.
- **Sobra do mês:** caixa atual − contas previstas até o fim do mês, incluindo atrasadas.
- **Livre para investir:** o menor entre a sobra do mês e o menor saldo projetado, menos a margem de segurança, limitado a zero quando negativo. A projeção usa o horizonte já disponível no painel (aproximadamente três meses); compromissos fora dele não participam desse teste. São valores calculados a partir dos registros, sem operação bancária.

Agregados são calculados antes de limitar os itens exibidos. A resposta pode explicar os componentes do saldo com `explain: true`, usando valores e data reais do saldo inicial.

## Agenda e períodos

A semana vai de segunda a domingo, usando a data atual de São Paulo. Há filtros para hoje, amanhã, esta semana, próxima semana, este mês, mês anterior, histórico completo e intervalo personalizado. Compromissos concluídos e arquivados são excluídos. Os compromissos são ordenados por data e horário; a lista informa o total e mostra até dez, avisando sobre os restantes na aba Agenda. Pagamentos futuros são consultados separadamente; o padrão mensal inclui atrasados.

“Como cadastrar um compromisso?” consulta o guia. “Qual é minha agenda dessa semana?” consulta os registros. “Agenda uma consulta dia ... às ...” continua preparando alteração assinada para confirmação. WhatsApp aceita texto e transcrição de áudio, mantendo autorização do remetente, deduplicação e confirmação por código; as respostas do WhatsApp continuam por texto. A conversa no aplicativo gera a resposta em áudio.

## Verificação

72 testes automatizados e TypeScript passaram. Seis consultas sintéticas ao serviço real foram interpretadas como consultas sem comando de escrita. A conversa Realtime produziu áudio e transcrições corretas para saldo, gasto geral, dinheiro livre, agenda da semana, total com reservas e explicação do saldo. Após ajustar uma fala que narrava a busca, os seis testes passaram sem repetir a pergunta ou anunciar a consulta; houve apenas “Um instante” na primeira resposta. Não foram abertos microfones, alterados registros reais nem enviadas mensagens a contatos.

A compilação de produção concluiu com código de saída 0, gerando as 20 rotas/páginas em `.next-validation`. A primeira tentativa restrita encontrou `spawn EPERM`; a repetição permitiu os subprocessos necessários. Painel HTTP 200 e consultas sem autenticação HTTP 401 na origem correta.

Ao testar no painel, encerre a conversa anterior e abra novamente a esfera para receber as instruções e ferramentas atualizadas.
