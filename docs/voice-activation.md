# Próxima etapa: IA por voz

O painel pessoal foi validado e o banco continua local. Em 8 de outubro de 2026, a chave OpenAI do Experiência Icom foi reutilizada no servidor local por autorização expressa do usuário. O acesso ao modelo, a interpretação de uma despesa pessoal, a recusa de uma despesa empresarial e a negociação e o encerramento de uma chamada WebRTC passaram com o provedor real. Microfone, resposta audível e confirmação de um lançamento pela interface ainda exigem teste do usuário.

## Ativação

Execute `pnpm integrations:check` para conferir as pendências sem fazer chamadas externas, ler despesas ou mostrar os valores das credenciais. Chave presente não significa serviço conectado: o áudio real continua exigindo teste.

1. A chave autorizada está em `OPENAI_API_KEY`, no arquivo ignorado `.env.local` do servidor. Não envie seu valor pelo chat nem use `NEXT_PUBLIC_`. O banco, as contas e as mensagens do Icom permanecem separados.
2. Mantenha `ANOTA_ASSISTANT_ENABLED=true`. O modelo configurável é `OPENAI_REALTIME_MODEL`; o padrão atual é `gpt-realtime-2.1-mini`.
3. Após o servidor carregar a configuração, abra a Anota IA na sua conta e inicie uma conversa. O usuário concede a permissão ao microfone.

A conexão usa a interface unificada WebRTC: o servidor autentica a criação da chamada e a chave permanece no servidor. Referências: [OpenAI Docs — WebRTC](https://developers.openai.com/api/docs/guides/voice-webrtc) e [modelo configurado](https://developers.openai.com/api/docs/models/gpt-realtime-2.1-mini).

## Teste real na conta do usuário

- Dizer uma despesa com valor, finalidade e data. Conferir o resumo e confirmar pelo botão. Verificar um único lançamento no painel.
- Preparar outra despesa e cancelar. Verificar que nenhuma despesa foi salva.
- Perguntar o total do mês e comparar com as despesas pagas no painel.
- Informar uma despesa de viagem ou da família e conferir os campos correspondentes.
- Informar uma despesa da loja. Verificar a recusa sem lançamento pessoal.
- Encerrar a conversa e verificar que o microfone foi desligado.

Esses cenários aguardam execução com o microfone do usuário. A próxima integração será o WhatsApp com acesso ao provedor autorizado, instância exclusiva, números autorizados, endereço HTTPS, fila ativa e teste do QR no celular.
