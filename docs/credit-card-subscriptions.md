# Cobrança da assinatura

Cartão de crédito é a modalidade comercial principal, com renovação mensal automática. Pix permanece como alternativa, com validação administrativa. Essa decisão está centralizada em `lib/subscription-billing-policy.ts` e aparece na apresentação pública, na assinatura e na gestão.

## Estado atual

- Básico: R$ 49,90; Ilimitado: R$ 99,90. Até dois números compartilham a conta e a franquia do plano.
- O cartão está em preparação, sem coleta de dados bancários, checkout ativo ou autorização para cobrar.
- O Pix existente continua disponível e não sofre alteração de chave, recebedor, acesso ou aprovação. Um pagamento pendente continua visível na assinatura.
- Indicar Cartão no acompanhamento comercial não comprova pagamento nem ativa uma cobrança.

## Contrato para a próxima integração

1. Escolher o serviço de pagamentos e conectar a conta comercial do Anotei. Não reutilizar cadastros ou integrações de outro produto.
2. Criar os dois planos recorrentes no serviço. O servidor decide plano e preço pelo catálogo; o cliente nunca informa um preço confiável.
3. Criar a sessão de pagamento no servidor para o usuário autenticado. Dados do cartão ficam no checkout do serviço, sem armazenamento no Anotei. O botão principal da assinatura passa a abrir esse checkout somente depois da integração validada.
4. Receber eventos autenticados do serviço, validar assinatura/origem, vincular cliente e assinatura ao usuário correto e bloquear eventos repetidos ou fora de ordem. Voltar de uma página de sucesso não comprova pagamento.
5. Atualizar acesso, plano, período, franquia e histórico após os eventos verificados. Testar renovação, falha de pagamento, troca de plano, cancelamento e duplicidade. Definir antes da ativação as regras comerciais de cancelamento, tentativas e prazo de tolerância.
6. Manter Pix como escolha alternativa, sem ativar cartão por variável de configuração isolada. Segredos ficam no servidor; nenhuma chave deve aparecer no repositório ou no navegador.

Essa preparação não habilita cobranças reais. A ativação depende da escolha e conexão do serviço de pagamentos e da validação do fluxo completo.
