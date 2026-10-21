# Pendências

1. Expo gratuito `anotaai` criado, OAuth MCP e login EAS CLI concluídos com autorizações separadas. Definir titular do projeto: conta pessoal ou equipe `anotaais-team`. Criar/vincular projeto ainda exige decisão/autorização.
2. Play e Apple: usuário ainda não tem contas. Cadastro, identidade, contratos e taxas dependem dele; não contratados.
3. Aprovar identificadores provisórios `com.anoteinahora.app`, nome e ícone final.
4. Definir ambiente e conta de homologação, sem dados reais de assinantes.
5. Escolher billing e autorizar produtos/contratos antes de ativação.
6. Informar controlador/razão social, suporte/LGPD, retenção, público e mercados; não inventar dados legais.
7. Renovar a autenticação de gestão restrita ao GitHub `Anotaaibank/anotaai` e ao projeto Supabase solicitado. Os acessos locais antigos retornaram HTTP 401; as conexões existentes foram preservadas. Não enviar senhas ou chaves na conversa.

Trabalho técnico restante: cadastro por convite mobile, recuperação/exclusão, áudio nativo, billing/restauração, aparelhos reais, exclusão externa, ficha/imagens, observabilidade/carga e restauração de backup. Revisar também os 3 alertas transitivos em DEPENDENCIAS_MOBILE.md. Esta entrega é uma base nativa em desenvolvimento, não portabilidade de todas as telas.

Habilitar API em um serviço requer aprovação; nenhum deploy foi feito. Segredo mobile deverá ser gerado no servidor, nunca enviado em conversa.

Pedidos anteriores de acesso do Douglas não foram concluídos por esta entrega: convites GitHub/Supabase e isolamento/licença Easypanel continuam com suas pendências próprias. Não ampliar acesso ao projeto icom inteiro, que contém outros serviços.
