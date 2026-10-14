# Organização financeira pessoal — 8 de outubro de 2026

Escopo ampliado por solicitação do usuário: renda, caixa, despesas pagas e futuras, parcelamento, reservas com taxa informada, compromissos e comandos equivalentes na IA e no WhatsApp. A separação de dados e módulos do Icom permanece.

## Renda, orçamento e caixa

- “Meu dinheiro” permite cadastrar renda mensal prevista, dia habitual de recebimento, saldo inicial com data, limite e taxa mensal do cheque especial e margem de segurança.
- O saldo inicial deve representar o dinheiro disponível **antes dos movimentos registrados no dia inicial**. Movimentos anteriores a essa data não alteram o caixa atual.
- Salário cadastrado alimenta o orçamento e a projeção. Só uma entrada marcada como recebida aumenta o caixa. Marcar a entrada como salário substitui a previsão automática desse mês, evitando contar duas vezes.
- Despesa paga reduz o caixa; prevista só entra na projeção. Arquivar exclui o registro dos cálculos; restaurar inclui novamente. Editar um pagamento para Previsto desfaz sua saída do caixa.
- A projeção cobre três meses à frente, inclui vencimentos atrasados, entradas previstas e salário. O menor saldo projetado gera orientações determinísticas para revisar vencimentos e despesas opcionais. O cheque especial mostra uso, limite disponível e juros mensais estimados pela taxa cadastrada.
- Antes de cadastrar o perfil, o painel mostra “A configurar”. O aplicativo não afirma que a pessoa entrou no cheque especial somente por ter despesas cadastradas.

## Pagamentos futuros, parcelas e agenda

“Anotar despesa” aceita Previsto. “Compra parcelada” permite 1–60 parcelas, valor total ou por parcela e datas editáveis individualmente. Se o preço total não dividir exatamente, os centavos restantes são distribuídos entre as primeiras parcelas. A série inteira é gravada em transação.

“Agenda” lista todos os pagamentos previstos, inclusive contas mensais e parcelas. “Marcar como pago” registra a data efetiva e reduz o saldo somente após confirmação. Compromissos permitem descrição, dia, horário opcional, local, edição, conclusão, reabertura, arquivamento e restauração. Notificações externas automáticas ainda não estão ativadas.

Datas relativas são resolvidas no servidor usando São Paulo. Em 8/10/2026, “dia 10 do mês que vem” significa **10/11/2026**. Janeiro após dezembro muda o ano corretamente. Recorrências preservam o dia original, ajustando meses curtos ao último dia. Datas inexistentes são recusadas.

## Poupanças e reservas

Cada reserva possui nome, saldo inicial com data e taxa informada mensal ou anual. O saldo inicial da reserva não é somado ao caixa. Aporte registrado sai do caixa; resgate registrado volta. O aplicativo não movimenta uma conta bancária.

Rendimentos são estimativas com capitalização composta e mês de 30 dias; uma taxa anual é convertida para taxa mensal equivalente. Impostos, tarifas, TR, índices variáveis e mudanças de taxa não são inferidos. O rendimento estimado não aumenta o caixa nem o principal registrado. Um resgate acima do principal registrado é recusado; rendimentos efetivamente recebidos precisam ser registrados antes de resgatar esse valor.

Alterações históricas ou arquivamento de aportes não podem deixar uma reserva negativa. Resgates concorrentes verificam a revisão da reserva e a atualizam na mesma transação. Reservas com movimentações ativas não podem ser arquivadas.

## IA por voz, texto e WhatsApp

Ferramentas de voz: `consultar_despesas`, `consultar_financas`, `preparar_despesa`, `preparar_alteracao`. As duas ferramentas de escrita usam o mesmo plano financeiro, que suporta todas as ações pessoais acima. O painel também oferece “Registrar por texto com a mesma IA”, para testar sem microfone.

A interpretação usa Structured Outputs com `gpt-4.1-mini`. A intenção é interpretada pelo modelo; valores, datas, propriedade dos registros, limites, revisões e regras de caixa são conferidos no servidor. Evidências inválidas só podem ser recuperadas por trechos literais verificáveis da mensagem. Números não presentes no pedido são recusados. Parcelas mensais são calculadas pelo servidor, sem confiar numa sequência inventada pelo modelo. Seleção ambígua para alterar um registro pede esclarecimento.

Toda alteração apresenta resumo e só grava após confirmação. A assinatura vincula conteúdo e usuário, expira em dez minutos e inclui identificador de operação. Repetir a confirmação da mesma operação retorna o resultado anterior. Uma mudança concorrente exige nova preparação.

No WhatsApp, os mesmos comandos geram resumo e código: `CONFIRMAR ABCDE12345` ou `CANCELAR ABCDE12345`. A assinatura também inclui o remetente autorizado. A fila recusa mensagens repetidas, números não autorizados e leases substituídos. A autorização é revalidada dentro da transação que grava. Propostas concluídas ou canceladas não são reutilizadas. Consultas não gravam dados.

Exemplos para testar na própria conta:

- “Comprei um celular de R$ 1.200 e vou pagar dia 10 do mês que vem. Lança como despesa futura.”
- “Acabei de gastar 30 reais com gasolina. Anota para mim.”
- “Comprei um celular de mil reais em três vezes, primeiro vencimento dia 10 do mês que vem.”
- “Meu salário mensal é seis mil reais e recebo dia 5. Cadastra minha renda.”
- “Cadastre minha poupança Emergência com saldo de 2 mil reais e taxa de 0,5 por cento ao mês.”
- “Agenda uma consulta amanhã às 14 horas.”
- “Arquiva a despesa Gasolina.” Se houver duas despesas com o mesmo nome, informe qual registro deseja alterar.

## Armazenamento e estado externo

SQLite local está ativo, por escolha anterior do usuário. Documentos financeiros e recibos de operações têm propriedade por usuário, revisão e auditoria; dados fictícios dos testes não são inseridos na conta Bruno Lira.

`database/finance.sql` está preparado para ser aplicado depois de `database/schema.sql` em um projeto Supabase exclusivo. Inclui RLS, privilégios restritos, escrita em transação e RPC próprio do worker. **Não foi aplicado nem validado em Postgres.** Nenhum banco do Icom foi utilizado.

A chave OpenAI já autorizada permanece somente no servidor. O WhatsApp ainda precisa de credenciais do provedor, endereço HTTPS público, worker e conexão pelo QR Code do número dedicado. Esses requisitos não são substituídos por testes simulados.

Referências de implementação: [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs), [funções no Supabase](https://supabase.com/docs/guides/database/functions), [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security) e documentação do Next.js 16.3.4 instalada em `node_modules/next/dist/docs`.
