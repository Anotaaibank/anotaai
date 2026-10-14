# Contas a pagar e lembretes

A aba Contas a pagar reúne todas as despesas ativas com situação PREVISTO, incluindo vencimentos de meses anteriores. O vencimento não altera a situação gravada: A vencer, Vence hoje e Em atraso são rótulos calculados pela data de São Paulo. Pago exige confirmação de pagamento. Contas arquivadas não geram alertas.

A visão geral mostra quantidade e total em atraso, e o menu indica quantas contas precisam de atenção. Os alertas usam variação suave de cor e brilho; com preferência por movimento reduzido, ficam estáticos. Registrar pagamento usa a confirmação assinada existente e registra a saída uma única vez.

O processamento de lembretes do WhatsApp verifica as contas de cada usuário, avisa no dia anterior e no vencimento e envia somente aos números que esse usuário autorizou. A janela de envio é das 9h às 21h de São Paulo. Cada conta, vencimento, etapa e destinatário possui uma chave única na fila persistente. O mesmo aviso não se repete após reinício. Avisos antigos não são enviados em um dia posterior.

Antes do envio, o processamento confere novamente o pagamento, vencimento, arquivamento, conexão e autorização do destinatário. O texto usa o valor e a identificação atuais. O lembrete não efetua um pagamento nem altera o caixa. Lembretes de compromissos continuam com suas regras de 24h e 5h. O processamento das consultas do usuário usa uma tarefa separada dos lembretes.

No ambiente local, o aplicativo, receptor, túnel e worker precisam permanecer ativos. Se o serviço voltar no mesmo dia dentro da janela, pode enviar o aviso ainda válido; avisos expirados são descartados. Em produção, esse worker deverá rodar continuamente.

Validação: testes de classificação, fusos e horários, mudança de vencimento, pagamento/arquivamento, deduplicação da fila e isolamento entre usuários. Nenhuma alteração no esquema do banco é necessária.
