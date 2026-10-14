# Publicação do Anotei na Hora

Destino solicitado em 14/10/2026:

- Código: https://github.com/Anotaaibank/anotaai
- Banco: projeto Supabase `yqbbbqkouedhrunazpqd`, organização `gzyulgzcggszdysoxvpq`.
- Hospedagem do aplicativo: Easypanel em `http://72.62.140.186:3000/projects/icom/app/anotei`. O serviço `anotei` foi criado dentro do projeto `icom`, sem alterar os aplicativos existentes, pois o plano recusou criar um quarto projeto. A origem foi vinculada ao GitHub, branch `main`, caminho `/`, com compilação por `Dockerfile`. Nenhum deploy foi iniciado.

## Estado verificado

A conexão dos plugins continua apontando às contas anteriores, por decisão do usuário. Foram criados acessos separados, aprovados explicitamente, com validade até 21/10/2026: GitHub somente com escrita em Contents e leitura de Metadata em `Anotaaibank/anotaai`; Supabase somente no projeto solicitado, com escrita em banco, migrações e Auth Config, leitura das chaves e seus segredos, Project Settings e Advisors. O fluxo amplo do Git Credential Manager foi cancelado. O Easypanel aceitou autenticação direta; sua sessão está guardada em arquivo local criptografado dentro de `.data`.

O código foi enviado ao GitHub. As migrações `schema.sql`, `finance.sql`, `commerce.sql`, `security.sql` e `rpc-identifiers.sql` foram aplicadas no novo Supabase, com histórico registrado. Há 12 tabelas, todas com RLS; nenhuma permite leitura anônima, e as operações de servidor não foram concedidas aos clientes. A última migração corrigiu colisões entre nomes de variáveis PL/pgSQL e colunas, encontradas pelo teste remoto.

O teste com duas contas temporárias confirmou isolamento de leitura, bloqueio de escrita na outra conta e idempotência financeira. Todos os registros de teste foram revertidos na mesma transação; o banco permanece sem usuários ou dados reais. Os advisors não apontaram erros; há oito avisos informativos por tabelas deliberadamente acessíveis apenas ao servidor e quatro alertas para wrappers SECURITY DEFINER autenticados, protegidos por checagem explícita de `auth.uid()`, privilégios revogados para anon e search_path vazio. A aplicação ainda não foi ativada online.

Os acessos administrativos ficam em `.env.deploy.local`; as chaves do novo projeto ficam em `.env.cloud.local`. Ambos são privados e ignorados pelo Git. `.env.local` e os dados do aplicativo local foram preservados. Os tokens temporários servem à implantação; não precisam fazer parte do ambiente da aplicação no servidor.

## Preparação do servidor

`Dockerfile` compila o Next.js em modo standalone, executa typecheck e testes, e usa Node 24. O contexto de construção exclui `.env*`, `.data`, builds anteriores e logs. `compose.yaml` define servidor web, worker separado do WhatsApp, verificação de saúde e volume persistente. O servidor fica disponível ao proxy da hospedagem; configure nele o domínio HTTPS e a rota para a porta 3000. O mapeamento 3100 do Compose é apenas local ao servidor.

Configure os valores de `.env.example` diretamente no painel de segredos da hospedagem. Nunca envie `.env.local`, bancos, chaves ou links individuais para o GitHub. `APP_URL` e `ANOTA_PUBLIC_URL` precisam do endereço HTTPS definitivo. O worker usa `ANOTA_WORKER_URL=http://web:3000` internamente, mantendo os convites no endereço público.

Antes de iniciar, execute `node --env-file=.env.production scripts/deployment-preflight.mjs` em ambiente controlado. O comando só verifica configuração; não conecta serviços e não exibe valores de segredos. A inicialização do container executa essa mesma verificação. Ainda é necessário verificar a autenticação, o isolamento entre duas contas, o envio real de WhatsApp e os lembretes após implantar.

## Etapas pendentes do Supabase

1. Adaptar persistência de convites, vínculos de usuários ao WhatsApp compartilhado e envio de links ao banco remoto, mantendo isolamento por usuário e idempotência.
2. Concluir cadastro, confirmação de e-mail e sessão no fluxo de convite; definir a transição das contas locais. As senhas locais não são importadas diretamente para Supabase Auth.
3. A estrutura inicial e as correções de segurança já foram aplicadas e testadas no projeto separado. Aplicar e validar também as futuras migrações dos convites e do WhatsApp compartilhado, sem dados de demonstração.
4. Configurar segredos no servidor, domínio definitivo e webhook do provedor. Transferir somente dados próprios autorizados, com cópia de segurança e conferência.
5. Após validação, atualizar `supabase_personal_features_ready` em `deployment/target.json`. Enquanto estiver falso, a verificação impede iniciar uma publicação configurada para Supabase.

Para uma implantação explícita com SQLite, o volume `/data` é obrigatório, a aplicação deve ter uma única réplica e os dados precisam de backup próprio. Essa opção não representa migração concluída para o Supabase. O worker acessa o banco através das APIs do servidor, sem volume separado.

Os limites de voz e sessões ainda usam memória do processo; não aumentar o número de réplicas sem adaptar esse armazenamento. `/demo` continua indisponível em produção.
