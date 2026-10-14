# Conexão do WhatsApp para teste

O aplicativo permanece local. O WhatsApp foi conectado pelo usuário e dois áudios reais receberam respostas aceitas pela Uazapi. A gravação de uma despesa real ainda depende de uma confirmação com código e da conferência no painel.

## Acesso e receptor preparados em 8 de outubro de 2026

- O endereço Uazapi fornecido pelo usuário foi validado por HTTPS. O código fornecido autorizou a consulta administrativa com HTTP 200 e foi configurado somente no servidor. Nenhuma instância existente foi adotada ou alterada; nenhuma mensagem foi enviada.
- A configuração usa `ANOTA_WHATSAPP_WEBHOOK_URL` para o recebimento externo. `APP_URL` permanece `http://localhost:3100`, preservando a origem do painel e suas sessões.
- `scripts/whatsapp-webhook-bridge.mjs` escuta em `127.0.0.1:3101`. Somente POST no caminho do webhook, com conta e chave válidas de um bot próprio habilitado, é encaminhado ao aplicativo. Consultas ao painel, demonstração, finanças e worker retornam 404. Requisições sem autorização retornam 403; corpos têm limite de 50 KB e há limites de requisição e concorrência. Cookies e autorização do navegador não são encaminhados.
- A chave do webhook é enviada ao Next.js em cabeçalho interno, evitando registrá-la na URL dos logs de desenvolvimento. A rota revalida a conta, a chave, o estado do bot e o remetente autorizado antes de enfileirar.
- Cloudflared 2026.10.0 foi obtido do lançamento oficial, com SHA-256 conferido. O canal de teste aponta somente para a ponte da porta 3101. As proteções 404 e 403 foram conferidas pelo endereço HTTPS externo. O painel e a demonstração não foram publicados.
- Receptor, canal temporário e worker estão em processos ocultos. PIDs e origem temporária ficam em `.data/whatsapp-runtime.json`; logs ficam em `.data/whatsapp-*.log`, sem chaves. A origem muda se o canal for reiniciado e depende de o computador e os processos permanecerem ligados. Conferir a disponibilidade antes de gerar o QR.
- 45 testes passaram, incluindo a proteção da ponte e a configuração HTTPS separada; TypeScript e a compilação final passaram. O endpoint do processador respondeu HTTP 200 com sua credencial interna. A compilação gerou 18 páginas e o pacote standalone, mantendo a prévia local aberta.
- O usuário cadastrou os dois números na interface e escaneou o QR com o telefone do assistente. O bot autorizado recebeu áudios e respondeu ao remetente autorizado. Nenhum número foi inventado pelo agente.

## Redução da espera da fila

- A fila passa a ser consultada a cada dois segundos, em vez de quinze. O bloqueio `running` continua impedindo que o mesmo worker faça chamadas sobrepostas. Somente o processo identificado de `scripts/whatsapp-worker.mjs` foi reiniciado para aplicar o intervalo; receptor, canal HTTPS, servidor e banco foram preservados.
- Nos dois áudios observados, a espera entre recebimento e início da leitura foi de aproximadamente cinco segundos antes do ajuste. Esse intervalo de consulta não mede nem promete o tempo total de download, transcrição, interpretação e entrega pelo WhatsApp.
- Consentimento sem código, como “ok pode salvar”, recebe orientação direta sobre a confirmação, sem uma nova consulta à IA. Isso não salva uma alteração. Um único código só é oferecido se a proposta assinada estiver válida e vinculada ao mesmo usuário/remetente; propostas múltiplas exigem escolher o código, e propostas expiradas exigem um novo pedido.
- Permanecem as confirmações com código, prazo, revisão e recibo idempotente. Não se reprocessam mensagens antigas nem se criam lançamentos fictícios para medir a velocidade.

Referências oficiais: [autenticação Uazapi](https://docs.uazapi.com/docs/authentication), [webhooks Uazapi](https://docs.uazapi.com/docs/integrations-webhooks), [canal temporário Cloudflare](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/).

## Preparação realizada

- Integração preparada para Uazapi, com instância exclusiva por usuário do Anota Aí.
- Chave interna `ANOTA_WORKER_SECRET` gerada no servidor, em `.env.local`, sem exibição do valor. Nenhuma chave ou integração do Icom foi copiada nesta preparação.
- Comandos financeiros com resumo e confirmação vinculada ao usuário, remetente e prazo. Repetições não duplicam lançamentos.

## Informações necessárias

- Link do painel do provedor e acesso administrativo somente no servidor: já fornecidos e validados. Não enviar novas chaves ou senhas no chat.
- Número exclusivo que será conectado como assistente e número autorizado que enviará os testes, ambos com DDD e distintos entre si.
- Endereço HTTPS para receber os eventos do provedor. Não expor a demonstração de desenvolvimento nem publicar o banco local.

## Sequência após configurar os acessos

1. Confirmar acesso ao provedor e criar ou recuperar apenas a instância identificada como Anota Aí deste usuário.
2. Salvar os dois números na tela WhatsApp e ativar os comandos.
3. Configurar o recebimento HTTPS e iniciar um único processador de fila com `scripts/whatsapp-worker.mjs`.
4. Gerar o QR Code. O usuário conecta pelo próprio celular, em WhatsApp → Aparelhos conectados → Conectar um aparelho.
5. Conferir que o número conectado corresponde ao cadastrado.
6. Do número autorizado, enviar um comando explícito de teste por texto. Conferir o resumo antes de responder `CONFIRMAR` e o código recebido.
7. Repetir com áudio e conferir o lançamento na Agenda ou em Minhas despesas. Identificar cada registro como teste e arquivá-lo depois.

As mensagens de teste serão enviadas pelo usuário. Nenhum lançamento de teste é criado automaticamente na conta real. Nenhuma mensagem foi enviada ao WhatsApp nesta preparação.
