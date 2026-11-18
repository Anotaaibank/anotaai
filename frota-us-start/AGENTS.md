# Minha Frota — locação EUA

Subprojeto integrado ao Anotaí em /minha-frota. Por instrução do Bruno, todo trabalho e armazenamento ficam no Anota aí. Não criar, editar nem salvar arquivos em Logos.

Leia também ../AGENTS.md e ../docs/minha-frota.md. Preserve o login existente, a autorização de gestão, o isolamento por usuário e o volume persistente. Não copiar dados reais ou credenciais para o código, GitHub, imagem Docker ou exemplos. Nunca substituir o banco real por testes ou demonstrações.

No computador, os dados reais ficam em .local/fleet.sqlite; preserve também as cópias .bak. O servidor local usa 4317. Online, a API do Next.js usa bancos por titular em /data/minha-frota. A importação JSON deve ser atômica e permitida somente em frota vazia.

Validação integrada: pnpm build; pnpm typecheck; pnpm test. Validação da frota: pnpm fleet:test. Node 24 é necessário. O build online é scripts/build-host.mjs e o local é scripts/build.mjs. Não usar scripts/build.sh, que é legado. Não habilitar exemplos na versão publicada.
