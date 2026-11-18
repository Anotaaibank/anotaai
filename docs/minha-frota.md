# Minha Frota no Anotaí

O controle de veículos fica em /minha-frota, no mesmo domínio e serviço do Anotaí. Usa o login existente e permite acesso apenas às contas de gestão configuradas em ANOTA_MANAGER_USER_IDS. Não cria contas nem altera o esquema do Supabase.

Cada conta tem um banco SQLite separado. O nome do arquivo deriva do hash do identificador autenticado; cabeçalhos enviados pelo navegador nunca definem o titular. O diretório padrão é minha-frota ao lado de ANOTA_DATABASE_PATH, portanto /data/minha-frota na implantação existente. Esse diretório deve permanecer no volume persistente e nas cópias de segurança. ANOTA_FLEET_DIRECTORY permite configurar outro diretório persistente.

O código fica em frota-us-start. O build principal gera os recursos com scripts/build-host.mjs antes de compilar o Next.js. A API mantém os valores em centavos de dólar, valida a origem das alterações e vincula cada leitura e escrita ao gestor autenticado. Os recursos públicos não contêm registros.

## Dados locais

O banco original .local/fleet.sqlite permanece no computador. Não enviar esse arquivo, suas cópias ou credenciais para o GitHub ou para a imagem Docker.

Para transferir os dados, exporte a cópia JSON na instalação local. Entre com a conta de gestão na versão publicada e abra Configurações → Trazer os dados do computador. A importação valida toda a cópia antes de gravar, preserva os vínculos entre proprietários, carros e lançamentos e só funciona com a frota online vazia. Nenhum registro existente é substituído. Guarde a cópia local após a transferência.

As versões local e online têm bancos independentes; não há sincronização automática. Após a transferência, use a versão online como controle principal.

## Verificação

Execute pnpm build, pnpm typecheck e pnpm test. Os testes de frota também podem ser executados com pnpm fleet:test. Use registros sintéticos nos testes. Verifique o login, o agrupamento por dono, os custos por categoria e a persistência após reiniciar o serviço.
