# Publicação do Anotei na Hora

Publicado para testes em 14/10/2026:

- Aplicativo: https://icom-anotei.pqaykh.easypanel.host
- Código: https://github.com/Anotaaibank/anotaai, branch `main`.
- Banco próprio: Supabase `yqbbbqkouedhrunazpqd`, organização `gzyulgzcggszdysoxvpq`.
- Serviço: `icom/anotei`, proxy HTTPS para porta 3000. Painel em http://72.62.140.186:3000/projects/icom/app/anotei.

O serviço foi criado dentro do projeto existente porque o plano recusou um quarto projeto. Os outros aplicativos e as conexões dos plugins foram preservados. Git direto e Dockerfile permitem operar sem o computador e sem túnel temporário.

## Banco e contas

Sete migrações aplicadas: schema, finance, commerce, security, rpc-identifiers, personal-access e legacy-auth. As 14 tabelas públicas têm RLS, sem leitura anônima. Convites, vínculos, filas e funções de servidor são privados. Wrappers financeiros autenticados validam identidade, revisão e idempotência.

Foram transferidos somente o gestor e contas vinculadas a convites registrados. Contas soltas de testes e exemplos foram excluídas da seleção. O snapshot privado conserva os dados originais; o conteúdo transferido foi comparado. Despesas, perfil financeiro, operações, auditoria, integração e convites foram preservados. Mensagens antigas não são reproduzidas e suas confirmações não podem gravar novamente.

Os UUIDs foram preservados. O primeiro login correto converte a senha local scrypt em senha Supabase após prova criptográfica e conferência de identidade, removendo o hash legado. Não é necessário definir outra senha. Novos convites usam Auth, confirmação dupla de senha e vínculo atômico do perfil financeiro. Convites usados não criam outra conta.

Cookies opacos são HttpOnly, Secure e SameSite, válidos por 24 horas. Tokens de acesso e renovação ficam criptografados no volume do servidor. A renovação valida o UUID; sair remove a sessão e revoga o acesso no provedor. Metadados editáveis não concedem gestão.

## Servidor

Dockerfile usa Node 24, Next standalone, typecheck e testes antes de produzir a imagem. O contexto exclui dados, ambientes privados, logs e builds anteriores. O processo roda como usuário node.

Há uma réplica e volume próprio `/data` para sessões e limitadores. `scripts/app-runtime.mjs` verifica a configuração e supervisiona servidor e worker; a saída de qualquer processo encerra o container para reinício. `ANOTA_RUN_WORKER=1` e `ANOTA_WORKER_URL=http://127.0.0.1:3000` mantêm o processamento interno. Mensagens: 1 segundo; convites: 5 segundos; lembretes: 30 segundos. O worker revalida remetente e propriedade antes de responder ou gravar.

O Compose é uma alternativa com worker separado; não iniciar um segundo worker no processo web. Antes de aumentar réplicas, substituir sessões, limitadores e contexto em memória por armazenamento compartilhado. `/demo` retorna 404 em produção; nenhum exemplo é habilitado automaticamente.

Segredos foram configurados apenas no serviço. Tokens temporários de implantação não fazem parte desse ambiente. `.env.deploy.local`, `.env.cloud.local`, `.env.server.local` e `.data` são privados e ignorados por Git e Docker. `APP_URL`, `ANOTA_PUBLIC_URL` e receptor WhatsApp usam o domínio definitivo; a origem do provedor permanece separada.

## WhatsApp e testes

O webhook da instância própria do Anotei foi transferido ao HTTPS definitivo. O provedor informou o celular da IA, final 0219, desconectado. Entrar no aplicativo, abrir WhatsApp, clicar em Conectar e ler o QR com esse celular. Depois, enviar a pergunta pelo número autorizado do cliente.

Links enviados em túneis antigos continuam apontando ao endereço anterior. Usar **Enviar link de acesso** para enviar o endereço definitivo. Convite pendente válido conserva o token; vencido é renovado. Uma conta cadastrada recebe a entrada pública. Não compartilhar o convite individual de uma pessoa com outra.

Cadastro não inicia cobrança nem assinatura paga. A gestão de assinantes existe; integração com processador de cobrança recorrente permanece separada.
