# Publicação do Anotei na Hora

Destino solicitado em 14/10/2026:

- Código: https://github.com/Anotaaibank/anotaai
- Banco: projeto Supabase `yqbbbqkouedhrunazpqd`, organização `gzyulgzcggszdysoxvpq`.
- Hospedagem do aplicativo: Easypanel em `http://72.62.140.186:3000/projects/icom/app/anotei`. O serviço vazio `anotei` foi criado dentro do projeto `icom`, sem alterar os aplicativos existentes, pois o plano recusou criar um quarto projeto. O painel da organização Supabase não hospeda este servidor Next.js.

## Estado verificado

A conexão GitHub atual é `icomkids`: leitura permitida, escrita negada no repositório solicitado. A conexão Supabase atual enxerga apenas a organização antiga Logosiabrasil; o novo projeto negou acesso. O usuário pediu para preservar esses plugins e autorizar acesso separado às novas contas. O Git Credential Manager permite adicionar Anotaaibank separadamente; o Easypanel já aceitou a autenticação direta. A sessão do painel está guardada exclusivamente em arquivo local criptografado, dentro de `.data`, excluído da publicação.

Nenhum código ou dado foi publicado e nenhuma migração foi aplicada ao novo Supabase nesta preparação. Apenas o serviço vazio de hospedagem foi criado. Os testes locais e seus dados permanecem no computador. O acesso separado do Supabase pode ser configurado em `.env.deploy.local`, ignorado pelo Git; não trocar o plugin atual. O código de autorização do GitHub é temporário e não deve ser incluído na documentação.

## Preparação do servidor

`Dockerfile` compila o Next.js em modo standalone, executa typecheck e testes, e usa Node 24. O contexto de construção exclui `.env*`, `.data`, builds anteriores e logs. `compose.yaml` define servidor web, worker separado do WhatsApp, verificação de saúde e volume persistente. O servidor fica disponível ao proxy da hospedagem; configure nele o domínio HTTPS e a rota para a porta 3000. O mapeamento 3100 do Compose é apenas local ao servidor.

Configure os valores de `.env.example` diretamente no painel de segredos da hospedagem. Nunca envie `.env.local`, bancos, chaves ou links individuais para o GitHub. `APP_URL` e `ANOTA_PUBLIC_URL` precisam do endereço HTTPS definitivo. O worker usa `ANOTA_WORKER_URL=http://web:3000` internamente, mantendo os convites no endereço público.

Antes de iniciar, execute `node --env-file=.env.production scripts/deployment-preflight.mjs` em ambiente controlado. O comando só verifica configuração; não conecta serviços e não exibe valores de segredos. A inicialização do container executa essa mesma verificação. Ainda é necessário verificar a autenticação, o isolamento entre duas contas, o envio real de WhatsApp e os lembretes após implantar.

## Etapas pendentes do Supabase

1. Adaptar persistência de convites, vínculos de usuários ao WhatsApp compartilhado e envio de links ao banco remoto, mantendo isolamento por usuário e idempotência.
2. Concluir cadastro, confirmação de e-mail e sessão no fluxo de convite; definir a transição das contas locais. As senhas locais não são importadas diretamente para Supabase Auth.
3. Revisar e aplicar migrações no projeto separado solicitado, sem dados de demonstração; validar permissões RLS, auditoria e duas contas independentes.
4. Configurar segredos no servidor, domínio definitivo e webhook do provedor. Transferir somente dados próprios autorizados, com cópia de segurança e conferência.
5. Após validação, atualizar `supabase_personal_features_ready` em `deployment/target.json`. Enquanto estiver falso, a verificação impede iniciar uma publicação configurada para Supabase.

Para uma implantação explícita com SQLite, o volume `/data` é obrigatório, a aplicação deve ter uma única réplica e os dados precisam de backup próprio. Essa opção não representa migração concluída para o Supabase. O worker acessa o banco através das APIs do servidor, sem volume separado.

Os limites de voz e sessões ainda usam memória do processo; não aumentar o número de réplicas sem adaptar esse armazenamento. `/demo` continua indisponível em produção.
