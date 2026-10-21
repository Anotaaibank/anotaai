# Integrações — estado observado

| Serviço | Evidência / estado |
| --- | --- |
| Git/GitHub | Repositório Anotaaibank/anotaai existente; branch local codex/mobile-foundation. Visibilidade, main e proteção remota não alteradas |
| Plugin Expo | expo@openai-curated, revisão 5fd93af4, instalado. Essa versão trouxe skills, sem registro automático do MCP |
| Expo skills | building-native-ui, native-data-fetching e expo-deployment lidas |
| Expo MCP | Registrado em https://mcp.expo.dev/mcp; OAuth concluído na conta anotaai Free. CLI confirmou login e enabled/o_auth; ferramentas search_documentation/read_documentation executadas com sucesso |
| Expo CLI | Instalado com SDK; validação local registrada no relatório |
| EAS CLI | 25.2.0, ferramenta local fixada; login separado por dispositivo autorizado e concluído. whoami confirmou anotaai (Owner) e equipe anotaais-team. Projeto ainda não criado/vinculado |
| EAS Build/Submit | Perfis e comandos preparados; nenhuma build na nuvem ou submissão |
| Supabase | Backend existente reaproveitado por código; nenhuma mudança de banco/RLS/Auth de produção |
| Easypanel | Hospedagem atual preservada; API mobile não habilitada em produção |
| OpenAI/Uazapi | Integrações existentes no backend. Nenhuma chave no app nem chamada paga nesta preparação |
| Play/Apple | Usuário informou não ter contas; cadastro, identidade e taxas pendentes |

```powershell
codex plugin list --available --json
codex mcp add expo --url https://mcp.expo.dev/mcp
codex mcp login expo
codex mcp list --json
```

Não repetir add se o servidor existir. Não exibir JSON completo de MCP: mostrar somente nome, enabled e auth_status. A primeira tentativa OAuth foi bloqueada pela revisão automática; após autorização específica foi concluída. Outra tentativa expirou antes do retorno.

Conta visível: anotaai; equipe disponível: anotaais-team. OAuth associado ao plano gratuito pessoal. Definir titularidade antes de criar projeto comercial. As ferramentas Expo foram carregadas na sessão e a consulta oficial de documentação foi executada. Operações de build, logs, stores e workflows aguardam projeto/build e não foram executadas.

Fontes: [Expo no Codex](https://docs.expo.dev/agents/codex/), [MCP](https://docs.expo.dev/mcp/).
