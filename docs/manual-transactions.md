# Cadastro manual na Visão geral

O botão **Entradas e saídas**, acima dos resumos e ao lado de Despesas fixas, abre duas opções:

- **Entradas / Ganhos**: reaproveita o cadastro de recebimentos, com salário, renda extra e previsão de recebimento.
- **Saídas / Despesas**: permite escolher **Avulsa** ou **Fixa mensal** antes de preencher os dados.

A avulsa é um único lançamento na data escolhida. Pago reduz o saldo; Previsto apenas agenda o pagamento. A fixa mensal usa o primeiro vencimento para criar uma regra contínua, até cancelamento. Os próximos 12 vencimentos são gerados inicialmente; o processamento mensal existente mantém a continuidade. Em meses sem o dia escolhido, o vencimento fica no último dia do mês. Nenhuma conta prevista é marcada como paga automaticamente.

O fluxo novo usa `/api/finance`: preparar resumo → confirmação assinada → aplicação idempotente e vinculada ao usuário autenticado. Não depende de IA nem de WhatsApp. Os fluxos anteriores de edição de despesas e parcelamento foram preservados. Não há migração de banco ou alteração de credenciais.

Os testes em `tests/manual-entry.test.ts` verificam saldo antes/depois da confirmação, repetição da mesma confirmação, isolamento por usuário, despesa avulsa futura e recorrência no dia 31. A conta usada para eventual revisão visual local fica em banco separado, sem dados de assinantes ou integrações externas.
