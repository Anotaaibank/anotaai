POSTGRESQL DESCARTAVEL PARA TESTES DO ANOTEI

Este runner cria seu proprio servidor e banco vazios. Nunca aponte estes
fixtures ou o bootstrap-auth.sql para Supabase, staging ou banco persistente.
Nao aceita DSN, host, banco, data directory nem credenciais externas. Nao le
.env e nao herda PG*, DATABASE_URL ou chaves dos provedores.

Requisitos: Node 24.19 e Docker, ou binarios PostgreSQL 17 locais confiaveis.
O checkout deve conter toda a base SQL e migracoes listadas no manifesto.

Planejar sem iniciar servidor:
  node scripts/test-postgres.mjs --plan

Validar as guardas sem banco:
  node --test --test-isolation=none tests/sql/*.test.mjs

Modo CI / Docker:
  node --experimental-strip-types scripts/test-postgres.mjs --docker
Cria postgres:17.11-bookworm sem rede, portas publicadas ou volumes do host.
O download da imagem exige acesso ao registro antes do isolamento do container.
A identidade aleatoria e labels sao verificadas antes do uso e da remocao.

Alternativa local Windows, sem instalar servico nem modificar PATH:
  node --experimental-strip-types scripts/test-postgres.mjs --postgres-bin <bin>
Use o diretorio que contem initdb, pg_ctl e psql da versao 17. O runner cria
um cluster em pasta temporaria exclusiva, senha sintetica e porta loopback
127.0.0.1. Para o cluster antes de remover a pasta e recusa limpar pasta de
outro dono. Se nao conseguir parar, preserva a pasta em vez de apaga-la.

O marcador aleatorio do servidor e validado ANTES do bootstrap. A base e as
migracoes sao aplicadas no banco novo, em ordem explicita. Arquivos SQL novos
ausentes do manifesto fazem o runner falhar: atualizar a lista exige revisar
a ordem e testar o conjunto completo.

Cada fixture e validado antes de iniciar o servidor e executado dentro de
BEGIN / ROLLBACK, com limites de statement e lock. O wrapper rejeita COMMIT,
controle externo de transacao, comandos psql e placeholders nao resolvidos.
Nao e um sandbox para SQL malicioso: scripts revisados do checkout possuem
privilegios elevados exclusivamente no servidor descartavel. Nao carregar
SQL nao confiavel. Confirmar novamente ausencia de usuarios apos cada fixture.

bootstrap-auth.sql simula apenas roles, auth.users e auth.uid necessarios aos
testes de RLS/RPC. Nao testa o servico Supabase Auth, JWT real, PostgREST, rede,
latencia de producao, dashboard ou politicas implantadas no projeto remoto.

A evidencia da ultima execucao fica em .data/postgres-test-results.json:
engine, instante UTC, hash do bootstrap, fixtures, resultado e duracao.
O arquivo local nao prova execucao do workflow no GitHub. Nunca anunciar
PostgreSQL/RLS aprovado com base apenas em --plan ou guards simuladas.

Nao executa deploy, SQL remoto, EAS, modelo pago ou mensagens WhatsApp reais.
