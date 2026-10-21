# Apple — preparação

**Sem upload e sem IPA assinada nesta entrega.** Bundle ID provisório `com.anoteinahora.app`, variantes `.dev` e `.preview`. EAS fornece macOS na nuvem, sem MacBook local.

Desde 28/04/2026 uploads exigem Xcode 26+ e SDK iOS 26+. O SDK Expo 58 requer Xcode 26.4+ e iOS 16.4+ no aparelho. Confirmar imagem e versões nos logs de build; bundle JavaScript não equivale a IPA.

1. Titular cria Apple Developer, conclui identidade/contratos e paga anuidade. Organização deve cumprir os requisitos empresariais da Apple.
2. Confirmar proprietário Expo/Bundle ID, criar app no App Store Connect e informar ascAppId.
3. Após autorização, configurar certificados/provisioning pelas ferramentas oficiais. Chaves .p8/.p12 fora do Git, API key com menor escopo.
4. Executar validações e preparar sem upload: `pnpm --dir mobile run release`.
5. Com autorização de custo e código: `pnpm --dir mobile run release -- --build --platform ios --profile production --approve-cloud-upload --approve-costs`.
6. Após revisar build real e autorizar upload: `pnpm --dir mobile run release -- --submit --platform ios --profile production --build-id ID_EXATO --approve-cloud-upload --approve-costs --approve-store-upload`.
7. TestFlight interno primeiro; externo pode exigir Beta App Review. Preview físico depende de dispositivos/provisioning. Development foi configurado para simulador, não instalação automática em iPhone.
8. Submissão à revisão final e publicação pública dependem de autorização separada. Usar liberação manual na loja.

Ficha provisória em `mobile/store/pt-BR.json`. Faltam imagens e capturas reais, URLs finais, classificação etária, App Privacy e conta de revisor segregada. O login atual é e-mail/senha; reavaliar Sign in with Apple se entrar login social de terceiro para a conta principal. Recuperação, exclusão dentro do app, billing e restauração ainda bloqueiam lançamento.

Fontes: [requisitos](https://developer.apple.com/news/upcoming-requirements/), [SDK](https://docs.expo.dev/versions/v58.0.0/), [EAS iOS](https://docs.expo.dev/submit/ios/), [Review Guidelines](https://developer.apple.com/app-store/review/guidelines/).
