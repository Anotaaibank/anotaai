# Google Play — preparação

**Não enviado; produção bloqueada.** Identificador provisório `com.anoteinahora.app`, com `.dev` e `.preview` nas variantes. Confirmar titularidade antes do primeiro cadastro.

Expo SDK 58 usa target API 36. A regra oficial consultada para novos apps/atualizações desde 31/08/2026 exige API 36+. Conferir novamente no envio e no AAB real. Development/preview geram APK; production gera AAB. Assinatura EAS e Play App Signing dependem da conta do titular.

1. Criar Play Console, pagar taxa e concluir identidade/dispositivo quando exigido.
2. Concluir release-policy.json, homologação e revisão de privacidade/billing.
3. Configurar credenciais oficiais com privilégio mínimo; JSON de conta de serviço fora do Git.
4. Preparar sem upload: `pnpm --dir mobile run release`.
5. Com autorização de custos/código: `pnpm --dir mobile run release -- --build --platform android --profile production --approve-cloud-upload --approve-costs`.
6. Inspecionar AAB, permissões, target, assinatura e instalação em teste interno. Primeira carga pode precisar de upload manual na Play Console antes de EAS Submit.
7. Com aprovação específica de envio: `pnpm --dir mobile run release -- --submit --platform android --profile production --build-id ID_EXATO --approve-cloud-upload --approve-costs --approve-store-upload`. Perfil **internal**, sem publicação pública automática.
8. Contas pessoais novas podem precisar de 12 participantes em teste fechado por 14 dias consecutivos antes de solicitar acesso à produção. Registrar feedback real.
9. Pedir aprovação antes de revisão final e lançamento. Reprovação exige reprodução, correção, validação e nova build.

Textos provisórios em `mobile/store/pt-BR.json`. Faltam ícone final, feature graphic e capturas reais nos formatos do console. Preencher Data Safety, público/idade, suporte, URLs de privacidade e exclusão com dados efetivos. Criar conta de revisor sem informações reais e guardar credenciais fora do repositório. Exclusão dentro do app e página externa ainda não implementadas.

Fontes: [target](https://support.google.com/googleplay/android-developer/answer/11926878), [cadastro/taxa](https://support.google.com/googleplay/android-developer/answer/6112435?hl=pt-BR), [teste fechado](https://support.google.com/googleplay/android-developer/answer/14151465?hl=pt-BR), [exclusão](https://support.google.com/googleplay/android-developer/answer/13327111?hl=pt-BR), [EAS Submit](https://docs.expo.dev/submit/android/).
