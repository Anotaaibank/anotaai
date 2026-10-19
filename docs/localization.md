# Português e inglês americano

O botão global **Traduzir para inglês / Usar português** alterna a apresentação sem recarregar a página. A preferência fica no cookie `anotei-locale`, restrito a `pt-BR` ou `en-US`, por um ano neste navegador. O layout lê o cookie no servidor para renderizar com o idioma correto; `html.lang` acompanha a seleção. A preferência não concede acesso e não é compartilhada entre contas ou aparelhos.

## Implementação

- `components/Localization.tsx`: contexto React, seletor e limites de apresentação `Localize` / `OriginalText`.
- `lib/localized-tree.ts`: traduz textos e atributos acessíveis de elementos de apresentação. Preserva IDs, URLs, nomes e valores de campos, callbacks, restrições e chaves React. Opções sem `value` explícito mantêm o valor original ao traduzir o rótulo.
- `lib/locale.ts` e `lib/i18n/en-US.json`: catálogo local de inglês americano, mensagens com parâmetros, datas e apresentação dos mesmos valores em BRL. A troca não chama uma API nem custa tokens.
- Limites de apresentação cobrem painel, finanças, calendário, despesas, WhatsApp, gestão, comunicação, cadastro, login, checkout, página de vendas e manual online. Descrições, nomes e mensagens pessoais ficam literais. Não existe tradução por mutação do DOM.
- A próxima sessão de voz do aplicativo recebe a preferência de idioma e transcrição `en` / `pt`, mantendo ferramentas, confirmação assinada, autenticação e limites existentes. Sessões já abertas não são reiniciadas pelo seletor.
- O manual em inglês oferece **Print / save PDF**, usando a versão traduzida no navegador. O PDF ilustrado original continua disponível no manual em português.

## Limites deliberados

A preferência pertence à interface deste navegador. Ela não reescreve registros, não converte BRL em dólares, não muda o fuso de Brasília, não traduz conversas antigas nem modifica a configuração do bot de WhatsApp. Os campos numéricos preservam o formato brasileiro e exibem a orientação `Use comma for decimals: 1.500,00`; não há reinterpretação silenciosa de valores digitados. A interpretação financeira e os documentos assinados mantêm sua representação interna original. Textos livres gerados pela IA e conteúdos cadastrados pelo usuário não têm cobertura garantida pelo catálogo estático; a voz recebe a orientação de falar o idioma escolhido.

## Validação

- `typecheck`, suíte completa (282 testes) e compilação Next.js de produção.
- Doze testes de localização verificam idioma permitido, cobertura dos menus principais, BRL positivo/negativo, parágrafos de relatórios, datas americanas, configuração de voz, valores de formulário, callbacks, dados opacos, saudações dinâmicas, fidelidade do texto de assinatura, orientação de números brasileiros e retorno ao português.
- Navegador: manual e cadastro em inglês; alternância preserva e-mail, senha e estado do olhinho. Verificado em larguras de 390 e 320 pixels; ajustada a quebra do cabeçalho e dos desenhos do manual. Nenhuma conta ou lançamento real foi criado nesses testes.
- A voz em inglês foi verificada na configuração da sessão, sem simular que houve teste de microfone real. As conversas WhatsApp existentes permanecem cobertas pelos testes anteriores de confirmação e persistência.
