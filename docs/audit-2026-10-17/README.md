# Auditoria de comandos — 17 de outubro de 2026

As correções atingem roteamento, interpretação, validação, confirmação e gravação. Não se limitam ao prompt. Os cinco comportamentos pedidos foram verificados pelo resultado financeiro ou pelo compromisso preparado; uma resposta simpática sem operação correta não conta como acerto.

## Resultado antes e depois

Baseline executado no código `7cdccbb`, antes de editar a aplicação. Os mesmos 36 textos, a mesma data de referência e os mesmos oito WAVs foram reutilizados depois. SHA-256 da matriz: `e831019dfae1a451da4ddaa4ad7521870309e1a05679bfb1db9a3400ea0f24cb`. Há 30 comandos e seis controles: consulta, negação e dados insuficientes. O estado sintético começa com saldo inicial de R$ 1.000 + receita anterior de R$ 300 − despesa anterior de R$ 200 = R$ 1.100; assim, trocar o saldo inicial ou inventar uma receita não passa no teste de ajuste.

| Avaliação | Antes | Depois | O que realmente foi exercitado |
|---|---:|---:|---|
| Regras locais, sem permitir modelo | 18/36 (50%) | 28/36 (77,8%) | Cobertura determinística; os demais precisam do intérprete externo. Não é a taxa global da aplicação. |
| Aplicação com modelo real disponível | 28/36 (77,8%) | 36/36 (100% nesta matriz) | 22/30 → 30/30 comandos preparados corretamente; 6/6 controles nas duas versões. As regras resolvem parte dos casos; chamadas reais caíram de 17 para 8. |
| Mesmos áudios, transcrição real e interpretação | 5/8 (62,5%) | 8/8 | Dados de calendário/valor, tipo, situação e efeito no saldo; 13 → 10 chamadas ASR + interpretação. |
| Frases inéditas após a primeira correção | — | 9/10 na primeira passagem | A frase da prestação final foi confundida com compromisso. Esse resultado permanece preservado. |
| Reteste das frases acima após corrigir o desvio | — | 10/10 | É reteste dirigido, **não** uma nova avaliação independente. |
| Fila da aplicação, IA real, provedor WhatsApp simulado | — | 10/10 | Cinco intenções × texto/áudio; proposta → confirmação → SQLite → repetição sem duplicar. |
| WhatsApp real, entrega no celular e Supabase no mesmo percurso | — | Não executado nesta auditoria | Não confundir a linha anterior com entrega real de ponta a ponta. |

Modelos simulados foram usados nos testes de contrato: resposta externa com valor/data inventados, data futura incorretamente marcada como realizada, regra local incompleta que precisa chegar ao modelo e correção que tenta criar outro registro. Eles demonstram validação e controle de fluxo, não compreensão de linguagem por um modelo real. A suíte de regressão final tem **263 testes aprovados**, incluindo os testes anteriores de autorização, assinatura, expiração, edição e idempotência. Typecheck aprovado. A versão `8df3f8d` foi publicada somente em `icom/anotei`, com build, typecheck e os 263 testes novamente aprovados no Docker; saúde pública HTTP 200, `status: ok`. Evidências em [release-verification.json](release-verification.json).

## Falhas localizadas e correções

| Camada | Evidência e decisão |
|---|---|
| Transcrição | Nos oito áudios iniciais, números, datas e horas essenciais chegaram preservados. Houve pequenas diferenças de palavras de ligação, sem perda desses campos. Não foi necessário trocar o modelo ASR nem acrescentar um pós-processamento que inventasse dados. |
| Regras anteriores à IA | Atualização de saldo era absorvida como consulta, especialmente com valores por extenso; correção genérica pedia identificação indevida. Os guardas agora distinguem consulta de atualização explícita. Regra incompleta que não reconhece uma quantia deixa a interpretação continuar. |
| Interpretação | Não existia ação para corrigir o saldo atual. Criada `balance_adjust`, com valor absoluto. Texto do app e áudio depois de transcrito convergem para `extractFinance`/`localFinanceInterpretation`; a fila conserva seus controles de remetente e confirmação. |
| Validação | Hora por extenso após vírgula era rejeitada; resposta do modelo com uma lista de um único item também era recusada. A normalização só aceita o item único com fonte literal e cobertura dos valores. Data futura explícita de uma nova conta força `PREVISTO`; última parcela continua única, sem inventar série. |
| Calendário × financeiro | Na avaliação inédita, “Agende a prestação final ... R$ 940 ... dia 29. Ainda não paguei” virou compromisso sem valor. Uma regra de agenda não pode descartar quantia associada a pagamento/prestação/boleto; agora cede ao intérprete financeiro. Primeira falha e reteste estão separados nos arquivos. |
| Confirmação | Resumo assinado e com prazo permanece obrigatório. `2` permite editar o valor absoluto desejado; `1` salva. Não há gravação antecipada. Retry de mensagem/confirmar não produz outro lançamento. |
| Persistência | Ajuste é documento próprio, imutável e acrescentado ao histórico, com saldo anterior, alvo, diferença e impressão da base de cálculo. Não é `INCOME` nem alteração do `PROFILE`. Banco e SQLite recalculam/validam a base antes de gravar; saldo alterado desde o resumo exige nova confirmação. |
| Concorrência e isolamento | Escritores de despesas e documentos compartilham bloqueio por proprietário. APIs legadas adquirem esse bloqueio antes dos bloqueios de linha. Recibo idempotente é verificado antes da rejeição de base antiga. RPC pública continua autenticada e a privada não é exposta ao assinante. |

Durante a regressão foram detectados e corrigidos problemas de continuidade: contexto resumido do aplicativo não tem a mesma estrutura de um plano financeiro; o adaptador agora só entrega um plano válido ao parser local. Correções de um registro já confirmado continuam exigindo o mesmo identificador, sem converter uma edição em nova compra. Listas parcialmente completas e perguntas complementares mantêm seus fluxos anteriores.

## Cinco comportamentos prioritários

| Mensagem | Proposta e efeito após confirmar |
|---|---|
| Atualiza meu saldo de 1.100 para 1.500 | Ajuste de +R$ 400 para saldo atual R$ 1.500. Saldo inicial R$ 1.000, receita R$ 300 e despesa R$ 200 permanecem. Ajuste não infla renda complementar. |
| Acabei de ganhar mais 500, adiciona ao saldo | Uma receita realizada de R$ 500; saldo R$ 1.100 → R$ 1.600, sem segundo lançamento. |
| Gastei 25 no McDonald’s | Uma despesa realizada de R$ 25, hoje em São Paulo; saldo R$ 1.075. Sem perguntar data ou categoria já inferível. |
| Dia 25 vou pagar 800 da última parcela da moto | Uma despesa prevista de R$ 800 no próximo dia 25, sem regra mensal nem série de parcelas. Saldo atual preservado até pagamento. |
| Amanhã tenho dentista às 15h | Um compromisso amanhã às 15h, sem movimentação financeira. |

## Tempo e custo medidos

Preços em dólar aplicados aos tokens retornados pelas APIs, incluindo cache efetivamente informado. São estimativas de IA, não valores de fatura. Não incluem servidor, provedor WhatsApp, tráfego, câmbio, impostos nem tempo humano para confirmar. As execuções são pequenas e pontuais, sem carga concorrente; latência real de rede e cache varia.

| Percurso | Antes | Depois |
|---|---:|---:|
| Texto, 30 comandos: p50 / p95 até resumo | 0,021 s / 3,759 s | 0,010 s / 2,976 s |
| Texto: custo total das 36 tentativas | US$ 0,051675 | US$ 0,024195 |
| Texto: custo por proposta correta, incluindo tentativas falhas e controles | US$ 0,002349 | US$ 0,000806 |
| Áudio: p50 / p95 até resumo | 3,366 s / 6,368 s | 1,316 s / 3,356 s |
| Áudio: custo total das oito tentativas | US$ 0,018272 | US$ 0,008280 |
| Áudio: custo por proposta correta, incluindo tentativas falhas | US$ 0,003654 | US$ 0,001035 |

As tabelas anteriores medem **preparação**; não chamam uma proposta de comando concluído. Para conclusão com gravação, a medição controlada da fila deu:

| Cinco comandos por canal | Texto | Áudio |
|---|---:|---:|
| Concluídos, sem escrita prévia e sem duplicação | 5/5 | 5/5 |
| p50 / máximo até gravação, confirmação automática | 0,063 s / 0,203 s | 0,818 s / 0,917 s |
| Custo estimado de IA por comando concluído | US$ 0 | US$ 0,000303 |

O custo zero do texto vale somente para estes cinco comandos resolvidos localmente. Não representa todo uso do produto. Provedor/download/envio foram simulados; o tempo não inclui entrega real do WhatsApp. Não existe baseline anterior de conclusão pela fila para uma comparação equivalente. A avaliação usa `gpt-4.1-mini` e `gpt-4o-mini-transcribe`. Valores e fórmulas reproduzíveis em [comparison.json](comparison.json).

## Banco e evidências de segurança

Migração aditiva `20261017134237_current_balance_adjustment.sql`, criada com o CLI oficial, testada com rollback antes da aplicação e verificada novamente depois. Somente no projeto Supabase `yqbbbqkouedhrunazpqd` do Anotei. Preserva funções implantadas e acrescenta validação de ajuste, sem reintroduzir versões antigas delas.

`scripts/prepare-balance-sql-test.mjs` gera dois usuários sintéticos `example.invalid`, testa cálculo JS/SQL, valor adulterado, `active: null`, alvo de outro proprietário, recibo repetido, histórico/saldo inicial preservados, base antiga, ajuste imutável, leitura RLS e RPC autenticada. Todo esse cenário termina em **ROLLBACK**; nenhum cadastro ou lançamento real foi usado ou alterado. A administração consultou os verificadores de segurança antes e depois; diagnóstico final fica no registro de publicação, sem publicar dados privados dos alertas existentes.

## Limites e erros restantes

- Nenhum erro conhecido permaneceu nos exemplos prioritários e na matriz repetida. Isso não comprova compreensão universal: a falha na primeira avaliação inédita mostra por que manter um conjunto separado importa.
- Os áudios são WAVs sintetizados offline pela voz Microsoft Maria pt-BR; não são gravações de usuários. Mesmo conteúdo e hashes foram reutilizados. Ruído, sotaques diferentes, microfone físico, corte de áudio e perda de rede não foram medidos com ASR real nesta execução; falhas de transporte têm testes simulados existentes.
- Provedor real do WhatsApp, webhook público, entrega, tempo de fila sob carga e gravação na conta real do assinante **não foram exercitados juntos**. A fila foi testada em memória com OpenAI real; a persistência Supabase, em cenário sintético separado.
- Não foi medida a sessão de voz Realtime com microfone e voz sintetizada do navegador. Seu consumo inclui custos que não aparecem no ASR WhatsApp desta avaliação.
- Linguagem ambígua, falta de valor/data indispensável e múltiplos alvos continuam pedindo esclarecimento. Não inventar dados é parte da correção. Uma conta criada para amanhã não debita o caixa hoje.
- Os valores são amostra de custo técnico por operação, não uma previsão suficiente para precificar assinaturas ou prometer velocidade constante.

## Reprodução e arquivos

Execute da raiz com Node 24. Para `real`, o script lê a chave já configurada em `.env.server.local`, sem imprimi-la. Não use dados pessoais nas matrizes.

```powershell
node --experimental-strip-types scripts/audit-commands.mjs nova local
node --experimental-strip-types scripts/audit-commands.mjs nova real
node --experimental-strip-types scripts/audit-commands.mjs nova real --audio
node --experimental-strip-types scripts/audit-commands.mjs novo-holdout real --holdout
node --experimental-strip-types scripts/audit-whatsapp-flow.mjs
node --experimental-strip-types --test --test-isolation=none tests/*.test.ts
```

Matriz em `tests/fixtures/command-audit.json`; conjunto separado em `command-holdout.json`; áudio e gerador em `audio-audit/` e `scripts/generate-audit-audio.ps1`. Não sobrescreva os arquivos `baseline-*`, `release-*` e `holdout-first-pass-real.json`. `iteration-1-*` preserva dois defeitos encontrados antes da versão final. JSONs incluem resultados por frase, artefatos semânticos, tokens, modelo, tempo e, no áudio, transcrição e hash. Não incluem credenciais.

Metodologia segue as orientações de [avaliação da OpenAI](https://developers.openai.com/api/docs/guides/evaluation-best-practices). Custos usam a [tabela oficial de preços](https://developers.openai.com/api/docs/pricing), os modelos [GPT-4.1 mini](https://developers.openai.com/api/docs/models/gpt-4.1-mini) e [GPT-4o mini Transcribe](https://developers.openai.com/api/docs/models/gpt-4o-mini-transcribe). A separação entre áudio original e texto interpretado segue a [API de transcrição](https://developers.openai.com/api/reference/resources/audio/subresources/transcriptions/methods/create). Funções e permissões do banco seguem a [documentação de funções do Supabase](https://supabase.com/docs/guides/database/functions).
