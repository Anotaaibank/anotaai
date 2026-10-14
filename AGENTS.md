# Anota Aí

Este projeto é uma cópia especializada dos módulos pessoais do Experiência Icom. Preserve a separação. Não copie credenciais, dados reais, clientes, contratos, cobranças, estoque, vendas ou integrações do Icom.

O escopo é pessoa física: renda e caixa, despesas pessoais pagas e futuras, parcelas, reservas com taxa informada, compromissos, contexto familiar, categorias, viagens, contas mensais, IA por voz/texto e WhatsApp por usuário. Toda leitura e escrita deve estar vinculada ao usuário autenticado. As confirmações de voz são assinadas, com prazo e idempotência. A fila do WhatsApp deve bloquear remetentes não autorizados e eventos repetidos.

Leia a documentação correspondente em node_modules/next/dist/docs antes de alterar APIs do Next.js desta versão. Valide com typecheck, testes e build. Credenciais ficam apenas no servidor. Não publicar a demonstração nem habilitar automaticamente dados de exemplo.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
