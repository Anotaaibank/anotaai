# Gestão do Anotei

O painel privado fica em `/gestao`, separado da navegação financeira do consumidor. A aba **Feedback** fica no `/painel`. A gestão acompanha cadastros, assinaturas e mensagens dos usuários; não consulta suas finanças pessoais.

## Pesquisa e decisões

A [documentação de assinaturas da Stripe](https://docs.stripe.com/billing/subscriptions/overview) distingue teste, assinatura ativa, atraso e cancelamento. O [guia de assinantes ativos](https://support.stripe.com/questions/understanding-active-subscribers) separa cadastros de clientes pagantes. Por isso, o painel mostra ambos separadamente e apresenta a receita mensal dos planos ativos como previsão, sem afirmar que o dinheiro foi recebido.

As [notificações de assinaturas](https://docs.stripe.com/billing/subscriptions/webhooks) são a base para acompanhar renovações, falhas de cobrança e mudanças de situação automaticamente. A primeira versão usa controle **manual**; não instala um provedor de pagamentos nem realiza cobranças. A integração automática depende da definição do provedor, planos, preços e configuração da conta de cobrança. A pesquisa não determina que Stripe deva ser o provedor escolhido.

Feedbacks têm área, tipo, mensagem, autor, datas, andamento e retorno da equipe. O usuário consulta somente suas próprias mensagens e respostas; o gestor filtra todos por área, andamento e busca. Os retornos ficam no aplicativo, sem enviar mensagens externas.

## Acesso e armazenamento

- `ANOTA_MANAGER_USER_IDS`: lista de IDs de usuários autorizados, separada por vírgulas, configurada apenas no servidor. Nome, e-mail, primeiro cadastro e metadados editáveis não concedem acesso. A conta local do proprietário atual foi configurada explicitamente.
- Usuários sem sessão recebem 401 nas APIs; usuários comuns recebem 403 na gestão. Toda alteração verifica sessão, autorização e origem. Nenhuma tela pública recebe os dados da gestão.
- SQLite: tabelas `feedbacks` e `subscriptions`, criadas sem inserir exemplos ou assinaturas. Dados persistem no banco local do Anotei. Alterações da gestão são auditadas e verificam a versão esperada.
- Supabase: aplicar `database/commerce.sql` somente no projeto próprio, depois de `schema.sql`, e configurar o ID do gestor desse ambiente. RLS limita feedbacks ao autor; os campos administrativos não podem ser escritos pelo cliente. Assinaturas são acessíveis exclusivamente ao servidor. O esquema online está preparado, mas não foi aplicado a um banco remoto nesta etapa.
- Uma assinatura manual não cobra, cancela pagamentos ou muda o acesso às funcionalidades do consumidor.

## Uso

1. Entre na sua conta e abra `/gestao`.
2. **Cadastros e assinaturas → Gerenciar** registra situação, plano, valor mensal e próxima renovação. Contas existentes começam sem assinatura; o painel não as transforma em clientes pagos.
3. No aplicativo, **Feedback** permite escolher Visão geral, Meu dinheiro, as demais áreas ou Outros e enviar uma sugestão, problema, elogio ou dúvida.
4. Na gestão, **Feedbacks → Acompanhar / responder** atualiza a situação e deixa um retorno. O usuário vê esse retorno em Seus feedbacks.

Página pública de vendas ficou fora desta etapa, conforme a escolha do usuário.

## Divulgação por influenciadores e cartão recorrente

A gestão foi ampliada para a estratégia de assinaturas mensais no **cartão recorrente**, com **boleto opcional**. Isso prepara o acompanhamento comercial; não ativa um serviço de pagamentos. Não foram criadas cobranças, preços fictícios ou páginas públicas de venda.

### Pesquisa aplicada

- [Stripe — Subscription analytics](https://docs.stripe.com/billing/subscriptions/analytics): receita recorrente, ticket médio, relatórios por plano, exportação e análise histórica. Os indicadores usam definições explícitas; cadastro não equivale a pagante. A definição local de receita prevista inclui apenas planos pagos ativos e exclui testes, atrasos e cancelamentos.
- [ChartMogul — Subscription analytics](https://chartmogul.com/subscription-analytics/): acompanhamento por origem de aquisição e planos, retenção e histórico. As taxas de cancelamento e conversão exigem uma base histórica por período; não são estimadas com o estoque atual de cadastros.
- [Asaas — Assinaturas](https://docs.asaas.com/docs/assinaturas) e [FAQ](https://docs.asaas.com/docs/faq-assinaturas): no cartão, cada ciclo pode gerar a cobrança e a tentativa de pagamento; no boleto, o cliente precisa quitar a cobrança. Criação de assinatura não comprova recebimento. Não há recomendação definitiva de provedor nesta etapa.
- [Mercado Pago — Planos de assinatura](https://www.mercadopago.com.br/developers/pt/docs/subscription-plans/overview): planos com preço, periodicidade e link de adesão. Para implementar o checkout escolhido, será preciso definir o serviço, conta, plano e preço.

### Novas áreas e funcionamento

1. **Acompanhamento**: assinaturas em atraso ou com renovação vencida, renovações nos próximos sete dias, testes perto do fim, datas ausentes, retornos marcados pelo gestor e feedbacks sem resposta há pelo menos três dias. São alertas internos; não enviam cobrança nem contato ao cliente.
2. **Cadastros e assinaturas**: forma de cobrança, notas internas, data de acompanhamento e motivo do cancelamento. Cartão é a opção inicial para novas assinaturas; registros antigos ficam com forma não informada. Cancelamentos feitos pelo formulário exigem motivo. Datas de assinatura ativa vencidas indicam revisão, sem afirmar que houve recusa do cartão.
3. **Influenciadores e links**: campanha, influenciador, canal, código único e fixo, comissão configurada e pausa/reativação. Mostra cadastros atribuídos, assinantes ativos e receita mensal prevista dessa origem. Comissão configurada não é comissão devida; pagamentos confirmados ainda não estão conectados.
4. **Relatórios e histórico**: receita por plano, ticket médio mensal (receita prevista / pagantes ativos), previsão anual (receita mensal × 12), formas de cobrança e histórico com situação anterior/nova, valor e motivo. Exibe os últimos 50 dos até 1.000 eventos carregados; registros anteriores à ativação do histórico não são reconstruídos. CSV de cadastros/assinaturas e campanhas, acessível somente ao gestor, neutraliza fórmulas de planilhas.
5. **Cobrança recorrente**: painel de preparação mostra cartão como principal e boleto como opcional; conexão, checkout/preço e domínio público ficam identificados como pendentes. A situação manual não altera o acesso do consumidor e não efetua transações.

### Origem do cadastro

`/convite/[code]` valida uma campanha ativa e redireciona ao cadastro existente. O primeiro convite válido gera um cookie HttpOnly, assinado com HMAC, com prazo de 30 dias e propósito exclusivo de campanha. Outro convite nesse prazo não substitui a primeira origem. Cookie alterado ou expirado é rejeitado. Na criação da conta, o servidor confere a assinatura, a existência/atividade da campanha e a data de criação do usuário; contas anteriores ao convite não ganham uma origem retroativa. A associação é única por usuário.

No banco local, cadastro e origem são gravados na mesma transação; uma falha não deixa uma conta parcialmente criada. No fluxo online, o cadastro do Supabase e a atribuição são operações separadas: eventual falha de atribuição mantém o cookie para nova tentativa na autenticação, com aviso técnico sem dados pessoais. Este caminho remoto ainda precisa ser validado no banco próprio antes de uso público.

`ANOTA_PUBLIC_URL` define o domínio público HTTPS para os links. Sem domínio público, a interface identifica os links como **teste local**. Eles não devem ser divulgados como acesso público. Em produção, `ANOTA_CAMPAIGN_SIGNING_KEY` é uma chave própria, apenas no servidor. Localmente usa o segredo persistente do próprio Anotei, com separação de propósito criptográfico. Não copia chaves ou registros do Icom.

### Persistência e autorização

SQLite acrescenta `commercial_profiles`, `campaigns`, `acquisition` e `subscription_events`, sem povoar exemplos. As alterações de assinatura, notas e histórico usam transação e versões esperadas independentes para assinatura e perfil. Uma edição concorrente aborta a operação inteira. As ações de campanhas também verificam autorização, origem e versão.

`database/commerce.sql` prepara as mesmas tabelas para o Supabase próprio, todas com RLS e acesso revogado de `anon`/`authenticated`. A função `anota_manage_subscription`, `SECURITY INVOKER`, fica executável somente pelo servidor (`service_role`) e grava assinatura, perfil, evento e auditoria na mesma transação. Serializa também a criação inicial por usuário. Este SQL está preparado, não aplicado ou validado contra um banco remoto nesta etapa.

## Verificação desta etapa

- 138 testes automatizados aprovados, incluindo campanhas privadas, código único/imutável, pausa, atribuição de cadastro novo, cookie adulterado/expirado, preservação da primeira origem, atomicidade, conflito de versões, alertas com fuso de São Paulo e CSV protegido.
- Teste HTTP no servidor real confirmou 401/403 na gestão/exportações, bloqueio de origem inválida, convite assinado, cadastro atribuído, forma cartão, histórico, cancelamento e link pausado. Contas, campanhas, eventos e sessões temporárias foram removidos; registros existentes foram preservados.
- Interface de campanhas, formulário e relatórios inspecionados no navegador do Codex.
- Typecheck e build de produção aprovados. A gestão, sua API e os convites permanecem dinâmicos; dados privados não são pré-renderizados. Resultado em `.data/commerce-growth-build.log`.
- O build usou `ANOTA_BUILD_CHECK=commerce`, em `.next-validation-commerce`, porque a limpeza da pasta anterior encontrou diretórios com ReparsePoint do OneDrive. A configuração aceita sufixos de validação de até 40 letras minúsculas, números ou hífens, sempre dentro do projeto; o modo normal continua em `.next`.

### Para ativar a venda

Definir o serviço de cobrança e o preço/periodicidade do plano; configurar checkout hospedado, webhooks assinados/idempotentes, confirmação de recebimentos, falhas/tentativas, cancelamentos e vínculo seguro entre o pagador e o usuário. Depois validar em ambiente de teste do provedor e configurar o domínio público. Esses passos ainda não foram executados.
