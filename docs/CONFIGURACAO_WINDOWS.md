# Windows — ambiente reproduzível

Auditoria em 21/10/2026: Windows NT 10.0.19045; Node 24.19.0; pnpm 11.25.0; Git 2.53.0.windows.3; Codex 0.163.0-alpha.10.2. npm, EAS, Expo, Java e adb não foram encontrados globalmente no PATH inicial. Não foi alterado o PATH permanente.

npm 12.2.0 e EAS CLI 25.2.0 ficam em `.data/mobile-tools`, ignorada pelo Git. Expo CLI acompanha o SDK; doctor, lint e TypeScript são ferramentas do projeto mobile. iOS será compilado na infraestrutura macOS EAS; Windows não gera IPA assinada localmente.

```powershell
node scripts/setup-mobile-tools.mjs
pnpm --dir mobile install --frozen-lockfile
pnpm --dir mobile run validate
pnpm --dir mobile run validate --bundles
node scripts/validate-mobile-backend.mjs
node scripts/smoke-mobile-api.mjs
```

O primeiro comando instala ferramentas locais fixadas e não autentica nem inicia builds. Se Node/pnpm estiverem ausentes, instalar as versões indicadas das fontes oficiais antes.

Foi observada uma falha `EINVAL readlink` do Metro nas dependências dentro da pasta sincronizada pelo OneDrive. Para verificar o mesmo código fora da sincronização:

```powershell
node mobile/scripts/working-copy.mjs
```

O comando copia apenas fontes permitidas para uma pasta temporária, sem arquivos de ambiente, instala o lockfile e executa tipos, lint, testes e bundles Android/iOS. Registra o caminho e as evidências em `.data/mobile-working-copy*.json`; copia os bundles de volta a `mobile/dist`. A fonte original permanece intacta. Não editar nem publicar diretamente essa cópia temporária. O helper não inicia build EAS nem envia código à nuvem.

Copiar `mobile/.env.example` para `mobile/.env.local`, informar API de homologação e iniciar:

```powershell
pnpm --dir mobile start --go
```

No celular, localhost é o próprio telefone: usar IP local do computador ou HTTPS de homologação. Ler o QR com Expo Go compatível. Preview no navegador não valida armazenamento seguro, teclado, permissões, áudio ou assinatura nativa; a API não abre CORS genérico para esse preview.

Branches `codex/*`; PR antes de main. Commits `feat(mobile):`, `fix(mobile):`, `docs(mobile):`. Versões de package.json/app config devem coincidir; EAS controla número remoto das builds de produção. Não versionar o site junto por acidente.

Solicitação reutilizável ao Codex: “Atualize o aplicativo, execute os testes e prepare uma nova versão para Android e iPhone.” O agente deve revisar o diff, alterar a versão, testar, preparar fonte sanitizada e apresentar evidências. Build, upload, revisão e publicação são operações separadas, com custos e autorização específicos. Os flags dos scripts não substituem conferir o plano e aprovar um valor/limite antes do envio.

Para outro aplicativo, reutilizar a pasta mobile como base, trocar identidade/contratos e usar backend isolado. Não copiar envs, sessões, banco, usuários ou dados de assinantes. Não apontar um novo produto para o banco atual por conveniência.

Fontes: [SDK 58](https://docs.expo.dev/versions/v58.0.0/), [Codex e Expo](https://docs.expo.dev/agents/codex/).
