# Assinaturas, casal e Pix

Somente a gestão cadastra novos assinantes, envia convites e altera os números autorizados. A lista do administrador não possui limite comercial de assinantes. O aplicativo do assinante mostra os números cadastrados, sem controles para criar novos contatos ou conectar outra instância do provedor.

Cada convite cria uma conta pessoal com um número principal. A gestão pode adicionar um segundo número à mesma conta. Ambos consultam e alteram o mesmo saldo, salário, despesas e agenda pelo WhatsApp; no aplicativo, usam o e-mail e senha da conta. O número principal é preservado e não pode ser transferido entre assinaturas. Um terceiro número é recusado no servidor e no banco. Remover o segundo revoga o vínculo e remove a autorização da conexão compartilhada, evitando que ele seja confundido com o gestor.

Sair do aplicativo encerra somente a sessão daquele dispositivo. A sessão do outro integrante continua podendo renovar seu acesso, respeitando a validade da assinatura.

Na gestão, abrir **Cadastros e assinaturas → Assinantes, acesso do casal e Pix**. Há formulário para cadastrar e enviar convite, selecionar uma conta e informar o segundo telefone, configurar o Pix fixo e revisar pagamentos pendentes.

A tela `/assinatura` fica disponível ao usuário autenticado mesmo sem acesso às finanças. Exibe a chave fixa e o recebedor cadastrados pelo administrador, valor e prazo. O usuário paga em seu banco e informa o identificador ou observação; isso apenas cria uma solicitação pendente. A administração confere o crédito em seu banco e aprova ou recusa. O sistema não executa transferência, não comprova automaticamente o recebimento e não inicia cobrança recorrente pelo Pix.

Uma aprovação concede o prazo configurado, incluindo o dia inicial. Aprovação antecipada estende a validade a partir do fim do período atual. A mesma solicitação aprovada duas vezes não prolonga o prazo novamente. Vencimento, cancelamento ou pagamento não aprovado bloqueiam consultas e alterações financeiras no app e no WhatsApp. As finanças permanecem armazenadas para uma renovação posterior. A conta de gestão é isenta.

Testes gratuitos só valem quando cadastrados manualmente pela gestão como TESTE, com uma data de término válida. Marcar um plano Pix como ATIVA no formulário comercial sem uma aprovação correspondente não libera o acesso.

Migrações adicionais: `household-billing.sql` e `household-routing-fix.sql`, após as sete migrações anteriores. São quatro novas tabelas com RLS e sem privilégios de cliente; operações administrativas usam funções exclusivas do servidor. As leituras financeiras têm proteção de licença nas políticas, e as escritas têm proteção em trigger. O cadastro inicial usa uma exceção delimitada à transação de registro do convite. O servidor exige assinatura em produção; não confia em metadados editáveis para conceder acesso.
