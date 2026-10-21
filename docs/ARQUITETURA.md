# Arquitetura — web e mobile

Preparação em 21/10/2026. O web existente usa Next.js 16.3.4, React 19.2.6 e TypeScript 5.9.3. A base nativa fica em `mobile/`, com Expo SDK 58, React Native 0.88, React 19.3 e TypeScript 6. Instalações e lockfiles são separados; não compartilhar a instalação React.

## Dados e regras

Aplicativo → HTTPS POST `/api/mobile/v1` → sessão validada → assinatura → regras existentes → registros do titular. Não há WebView, acesso administrativo nativo ou segundo bot WhatsApp. Credenciais Supabase/OpenAI/Uazapi ficam no servidor.

`lib/mobile-api.ts` reutiliza `financeState`, `buildFinancePlan`, `signFinance`, `readFinance`, `applyFinance`, `assistantTurn` e controle de uso. Formulário e assistente geram resumo e confirmação assinada. A gravação exige recibo do banco e é idempotente. Ajustes de saldo continuam separados de receitas.

## Módulos

- `mobile/src/app`: rotas protegidas; início, agenda, anotar, assistente e conta.
- `src/components`: controles acessíveis, loading, erros, confirmação.
- `src/core`: contratos, transporte, formulários, calendário e contrato de billing.
- `src/providers`: tema e sessão; descarta respostas após troca de conta/logout.
- `src/services`: SecureStore no aparelho; preview web somente em memória.
- `config`, `eas.json`, `scripts`, `tests`: variantes, preparação, bloqueios e testes.

A sessão nativa é independente da sessão do navegador, cifrada com domínio próprio, limitada a 24 horas e vinculada à sessão revogável existente. Logout revoga essa sessão subjacente. A API não aceita cookies como alternativa ao token.

## Ambientes

`ANOTA_MOBILE_API_ENABLED=1` habilita a API somente no servidor escolhido. Por padrão fica desligada. Em nuvem, configurar `ANOTA_MOBILE_SESSION_KEY` aleatória, com 32 caracteres ou mais, apenas no servidor. O modo local reutiliza o segredo da base local. Nenhuma variável foi aplicada à produção. Somente `EXPO_PUBLIC_API_URL` pode entrar no bundle.

Não há migração nesta entrega. Cadastro por convite, recuperação, exclusão de conta, captura de áudio nativa e billing ainda precisam de integração. A política de release bloqueia produção até a conclusão comprovada. Esta base não porta todas as telas web.

Sessões e limites atuais usam SQLite no volume do servidor. Antes de múltiplas réplicas ou grande escala, revisar armazenamento compartilhado/afinidade, filas, carga e índices. Testes locais não provam capacidade de 100 mil conexões.
