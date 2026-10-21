# Relatório de preparação mobile — Anotei na Hora

Data: 21/10/2026. Versão nativa: **0.1.0**. Branch local: **codex/mobile-foundation**. Base web preservada: commit `014f81ca08b5d008f6aa77a7ddb7bbc807e5b6d2`. A revisão desta entrega fica no commit local que acompanha este relatório; o ZIP de código é gerado dessa revisão, sem histórico Git ou arquivos de ambiente privados.

**Resultado: infraestrutura e base nativa implementadas e verificadas localmente; aplicativo ainda não liberado para lojas ou produção.** Nenhum deploy, envio a loja, pagamento real ou alteração do banco de produção foi feito.

## O que foi executado

- Auditados Windows, Node, pnpm, Git, Codex, arquitetura web e acessos.
- Instalados plugin oficial Expo e ferramentas locais npm/EAS. MCP e EAS CLI autenticados separadamente, com aprovação do titular, na conta gratuita `anotaai`.
- Executadas chamadas reais `search_documentation` e `read_documentation` no MCP Expo, além de `eas whoami`. As conexões anteriores do Codex foram preservadas; somente Expo foi acrescentado.
- Criado `mobile/` com Expo SDK 58, React Native 0.88, React 19.3, TypeScript 6 e Expo Router. React/TypeScript/lockfile mobile ficam separados do Next existente.
- Implementadas telas nativas de login, resumo, calendário, anotação manual, assistente por texto e conta/uso, com barra inferior, temas e estados de erro/carregamento. Sem WebView.
- Implementada API nativa com sessão cifrada e revogável, titular derivado da autenticação, franquia existente e os mesmos planos/confirmadores de finanças. A API permanece desligada por padrão.
- Preparados variantes, identificadores provisórios, perfis EAS, workflow GitHub, pacote de fonte para EAS, bloqueios de publicação e documentação de operação/lojas/privacidade/custos.

## Verificações reais

| Verificação | Resultado | Limite da evidência |
| --- | --- | --- |
| Web TypeScript | Passou | Ambiente local isolado |
| Web testes | **304 passaram** | Inclui regras/modelos simulados existentes; não é teste novo do modelo real |
| Web build Next | Passou, cerca de **253 s** | Build local; não houve deploy |
| Mobile tipos e lint | Passaram | Código da base; não valida aparelho |
| Mobile testes | **8 passaram** | Contratos, formulários, calendário, logout e sanitização |
| Gateway HTTP real | **5 checagens passaram**, cerca de **101 s** com inicialização | Conta sintética, banco em memória, servidor loopback |
| Expo Doctor | **20/20 passaram** | Não substitui auditoria de vulnerabilidades |
| Configuração Expo/EAS | Validada | Schema EAS oficial local; sem credenciais de assinatura |
| Bundle Android | Gerado, cerca de **116 s** | JavaScript/Hermes, **não APK/AAB** |
| Bundle iOS | Gerado, cerca de **83 s** | JavaScript/Hermes, **não IPA** |
| Bloqueio de build sem aprovação | Recusou como esperado | Nenhuma build remota iniciada |
| Preparação de fonte EAS | Executada localmente | Nenhum código enviado ao Expo |

O teste HTTP confirmou entrada de R$500, saída de R$25, saldo final R$475, conta futura sem débito no caixa, compromisso, ausência de recorrência indevida, confirmação repetida sem duplicação, recusa de dono no corpo e revogação no logout. O teste de integração em processo também verifica confirmação de outro titular e isolamento de contas.

Os testes usaram dados sintéticos e variáveis de produção esvaziadas. Chamadas pagas de IA: **zero**; alterações em dados de produção: **zero**. Não foram enviados testes WhatsApp nem executadas novas transcrições reais nesta etapa. A API reaproveita a inteligência atual; esta entrega não é uma nova avaliação de compreensão de linguagem.

A exportação final na pasta original falhou com `EINVAL readlink` do Metro dentro de `node_modules` sob OneDrive. A mesma fonte foi copiada por lista permitida, sem arquivos de ambiente, para uma pasta temporária fora da sincronização; instalação com lockfile, tipos, lint, 8 testes e os dois bundles passaram nessa cópia. Não foi necessário alterar código de produto para contornar a falha de leitura. O helper e os hashes permitem reproduzir a verificação; isso não substitui QA visual.

Evidências sanitizadas: [verification-mobile-2026-10-21.json](verification-mobile-2026-10-21.json). Logs detalhados e pacotes ficam em `.data/`, fora do Git.

## Problemas encontrados e pendências

**Acessos:** as credenciais locais antigas de gestão do GitHub e do Supabase retornaram HTTP **401** na auditoria. Isso não demonstra falha nas credenciais do servidor publicado. O endpoint público de saúde do site respondeu HTTP 200; ele não é auditoria do banco. Não houve troca/desconexão dos plugins existentes. Renovar acessos específicos ao repositório/projeto por autenticação oficial, sem enviar chaves na conversa. Push, regras remotas e auditoria live de RLS ficaram pendentes.

**Dependências:** o audit mobile registrou 3 avisos (2 altos/1 moderado). Ferramentas locais npm/EAS: 20 avisos (10 altos/7 moderados/3 baixos), sem críticos. São árvores distintas; não somar como vulnerabilidades independentes, pois há sobreposição. Alguns advisories não têm patch publicado; não foram forçados upgrades de major em empacotamento/assinatura. Ver [análise de dependências](DEPENDENCIAS_MOBILE.md). A publicação permanece bloqueada.

**Prévia visual:** o login foi renderizado inicialmente e o botão Mostrar/Ocultar senha respondeu. Uma atualização automática do módulo de sessão gerou erro de contexto; a identidade do contexto foi separada do provider. A automação da guia deixou de responder na recarga limpa, impedindo comprovar visualmente o resultado final. A rota local respondeu HTTP 200, o código passou em tipos/lint/bundles, mas isso não comprova a interface. QA visual e testes Android/iPhone continuam pendentes. A captura do erro ficou local, sem dados de clientes.

**Produto:** a base ainda não porta todas as telas web. Faltam cadastro/convite nativo, recuperação e exclusão de conta, gravação/transcrição nativa, billing oficial/restauração e validação em aparelhos. Formulários iniciais e catálogo de categorias ainda precisam de refinamento de UX antes de lançamento. Os placeholders da interface informam esses limites.

**Contas:** Expo já criado/autenticado; projeto EAS ainda não criado/vinculado. Titular deve decidir conta pessoal/equipe. Google Play e Apple Developer ainda não foram criados. Não existem APK, AAB, IPA, TestFlight ou links de loja desta versão.

## Status das 15 etapas

| Etapa | Status | Evidência / próximo requisito |
| --- | --- | --- |
| 1 Auditoria | Concluída | Ambiente, arquitetura e acessos verificados; falhas registradas |
| 2 Expo/Codex | Concluída | Plugin, skills, CLI, OAuth MCP e EAS; consultas MCP reais |
| 3 Base mobile | Pendente | Código e bundles existem; QA visual e aparelhos ainda faltam |
| 4 Git/CI | Pendente | Branch/workflow locais; sem push/execução remota/proteção de main |
| 5 Backend/auth | Pendente | Login/sessão/comandos testados; recuperação/exclusão/onboarding faltam |
| 6 Android/iOS | Pendente | Configs/perfis/bundles; falta projeto, assinatura e builds reais |
| 7 Google Play | Bloqueada | Conta, identidade, taxa e requisitos de qualidade |
| 8 Apple | Bloqueada | Conta, identidade, anuidade e requisitos de qualidade |
| 9 Monetização | Pendente | Arquitetura/contratos preparados; provedor/produtos não escolhidos |
| 10 Privacidade | Pendente | Inventário e rascunhos; fluxos e revisão responsável faltam |
| 11 Testes | Pendente | Verificações locais passaram; segurança residual/QA em aparelho faltam |
| 12 Operação/publicação | Pendente | Preparação e barreiras locais funcionam; envio/distribuição não executados |
| 13 Documentação | Concluída | Guias solicitados criados |
| 14 Autorizações | Concluída | Logins separados aprovados; sem gasto/deploy/publicação automática |
| 15 Relatório | Concluída | Este documento e evidências |

## Custos e como continuar

Referências oficiais consultadas: Expo Free com quota limitada; Starter opcional US$19/mês; Play US$25 uma vez; Apple US$99/ano ou valor local disponível. Referência inicial das duas lojas: US$124 no primeiro ano, além da operação e de eventuais serviços. Nenhuma contratação foi feita. Ver [custos e fontes](CUSTOS.md) e [monetização regional](MONETIZACAO.md).

Reprodução e comandos: [Windows](CONFIGURACAO_WINDOWS.md). Publicação separada por plataforma: [Android](PUBLICACAO_ANDROID.md) / [iOS](PUBLICACAO_IOS.md). Pendências e aprovações: [lista](PENDENCIAS_MANUAIS.md) / [checklist](CHECKLIST_LANCAMENTO.md).

Próxima sequência: renovar acessos específicos; concluir QA visual; aprovar/criar homologação isolada; escolher titular do projeto Expo; depois autorizar build de teste com quota/custo conferidos. A versão pública do Anotei permanece no estado anterior a esta preparação.
