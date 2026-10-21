# Dependências — resultado e limites

Consulta npm audit em 21/10/2026: 3 avisos distintos, sendo 2 altos e 1 moderado. Não há certificação de segurança ou autorização de lançamento por existir um lockfile.

| Dependência transitiva | Resultado consultado | Encaminhamento |
| --- | --- | --- |
| node-forge ≤1.4.0 | Alto; verificação RSA/ASN.1; sem versão corrigida indicada no advisory | Bloqueio de revisão de segurança antes de produção; acompanhar correção compatível do ecossistema |
| braces ≤3.0.3 | Alto; exaustão de pilha com padrões profundamente aninhados; sem patch indicado | Não aceitar padrões de terceiros nas ferramentas; revisar atualização upstream antes de liberar |
| uuid <11.1.1 via xcode | Moderado; limites de buffers em v3/v5/v6; v4 não é a falha descrita | Não impor troca de major transitiva sem validar plugins/prebuild; revisar caminho e correção compatível |

Os caminhos listados no audit passam por ferramentas Expo/Metro/configuração. A exposição final não foi submetida a pentest ou análise completa de alcance. Não afirmar que a existência da dependência prova exploração no app, nem que as falhas estão resolvidas. A API financeira usa primitivas existentes e não depende dessas bibliotecas para cifrar a nova sessão.

ESLint 9.39.5 foi fixado por compatibilidade com os plugins atuais do eslint-config-expo 58.0.4; o pacote emite aviso de fim de suporte. ESLint 10.13.0 foi inicialmente encontrado, mas tinha peers incompatíveis nos plugins. Atualização coordenada deve ser reavaliada; nenhuma vulnerabilidade adicional de ESLint foi indicada pelo audit desta execução.

EAS 25.3.0 foi retirado da árvore mobile e substituído por 25.2.0 nas ferramentas locais. A versão mais nova estava dentro da janela mínima de idade de publicação do pnpm. Não foi mantida exceção para burlar essa janela. Scripts transitivos desnecessários de instalação permanecem bloqueados. O npm local atende às verificações do doctor.

Expo Doctor e npm audit são verificações distintas: doctor pode passar 20/20 enquanto o audit mantém esses alertas. `dependencyAuditReviewed` permanece falso na política de release.

Fontes primárias: [node-forge](https://github.com/advisories/GHSA-86w9-cpqp-85rv), [braces](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm), [uuid](https://github.com/advisories/GHSA-w5hq-g745-h8pq).

## Ferramentas locais separadas

O audit de .data/mobile-tools (npm/EAS CLI) encontrou 20 avisos: 10 altos, 7 moderados e 3 baixos, sem críticos. Incluem minimatch, tar, nanoid, joi, yaml, ajv, diff, uuid e as falhas sem patch citadas acima. Essa árvore não entra no bundle do aplicativo. Não foram impostos overrides de majors em ferramentas de assinatura/empacotamento sem validar compatibilidade. A revisão de atualização/mitigação da ferramenta continua pendente antes da liberação. Os resultados completos ficam locais, separados do audit mobile.
