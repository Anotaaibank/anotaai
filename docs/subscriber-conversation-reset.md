# Reiniciar conversa da IA

Em Gestão → Cadastros e assinaturas → Números e nomes cadastrados, cada contato já cadastrado tem **Reiniciar conversa da IA**. A confirmação explica o alcance antes de executar.

O reinício atua apenas sobre o WhatsApp principal mostrado naquele cartão. Cancela as propostas e edições pendentes e retira as mensagens anteriores do contexto usado na interpretação. Mantém cadastro, senha, assinatura, franquia de uso, saldo, despesas, rendas, agenda e o histórico consultável. O outro número do casal não é alterado. Não exige apagar ou cadastrar o telefone novamente.

A gestão não consegue recolher mensagens já entregues ou em envio no provedor. Os identificadores dos eventos antigos são preservados, para que reenviar um webhook não duplique um lançamento. O reinício invalida a posse de mensagens antigas em processamento; elas não podem gravar usando a posse anterior. Registrar um novo pedido continua exigindo resumo → 1 confirmar / 2 editar.

O endpoint verifica sessão, origem e permissão de gestor. A função do banco só aceita chamadas do servidor, verifica o vínculo entre gestor, convite e telefone, exige a versão exibida e registra auditoria. A mesma requisição repetida não reinicia a conversa uma segunda vez. Nenhum assinante é resetado pela instalação desta migração.

## Falha reproduzida e corrigida

Uma edição ainda válida era tratada antes de um novo comando independente. Na sequência “Saída 25 reais de sorvete” → “2” → “Entrada 80 reais vendi uma cadeira”, o fluxo anterior preparava uma lista juntando o sorvete antigo à entrada nova. O teste criado para essa sequência falhou antes da correção.

Agora um novo prefixo entrada/saída/agenda, ou um novo comando simples completo reconhecido, encerra a edição anterior e é interpretado por conta própria. Complementos como “o valor certo é 30” continuam editando a proposta. O teste verifica texto e áudio com transcrição simulada, confirmação e persistência de uma única receita, sem lançar o gasto antigo.

Isso é evidência de uma falha do fluxo, não diagnóstico confirmado de uma conversa real específica. A leitura da conversa do contato relatado aguarda confirmação da identidade. Nomes e telefones reais não são publicados neste relatório. Não foram feitas chamadas pagas ao modelo nem testes reais de reconhecimento de voz ou envio de mensagens.

## Validação

- Testes TypeScript: validação, autorização, isolamento por contato, preservação dos dados, idempotência, mensagens em processamento e novo pedido durante edição válida.
- Teste SQL: `tests/sql/subscriber-context-reset.sql`, executado com migração e dados sintéticos dentro de BEGIN/ROLLBACK, sem persistir contas ou mensagens de teste.
- Migração: `supabase/migrations/20261020165114_whatsapp_context_reset.sql`.
