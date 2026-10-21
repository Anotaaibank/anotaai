# Anotei na Hora — base nativa

Expo SDK 58 + React Native + Expo Router. Aplicativo nativo separado do site, sem WebView ou segredos de servidor.

Comandos: pnpm --dir mobile install --frozen-lockfile; pnpm --dir mobile run validate --bundles; pnpm --dir mobile start --go; pnpm --dir mobile run release.

Configurar .env.local pela .env.example e usar API de homologação. A API nova está desligada por padrão. Cadastro/recuperação/exclusão, áudio nativo, cobrança e aparelhos reais continuam pendentes.

Guias em ../docs/RELATORIO_MOBILE.md, CONFIGURACAO_WINDOWS.md, ARQUITETURA.md e PENDENCIAS_MANUAIS.md.

release prepara fonte sanitizada e bloqueios, sem upload por padrão. Não rodar EAS na raiz do site. Nenhuma publicação, contratação ou alteração de produção automática.
