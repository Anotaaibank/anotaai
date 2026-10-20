# Conversão de reais e centavos — 20/10/2026

O diagnóstico autorizado de um contato específico confirmou transcrições com valores claros que eram rejeitados na validação monetária. O problema não exigia apagar a conta ou seus dados. Informações pessoais e conversas reais não são incluídas neste documento ou nos testes publicados.

## Causas e correções

- O conversor fazia `Number(valor) * 100` e exigia um inteiro exato. A representação binária de `35.8` produz `3579.9999999999995` nessa multiplicação; assim, R$ 35,80 acabava rejeitado. Agora os dígitos inteiros e decimais são convertidos diretamente em centavos inteiros, sem essa multiplicação de ponto flutuante.
- “38 reais e 80 centavos” misturava dígitos com a rotina que só aceitava números por extenso. O conversor agora aceita as duas partes em dígitos, por extenso ou misturadas, com a parte em centavos validada entre zero e 99.
- Sem a palavra “reais”, a extração parcial de “trinta e cinco e oitenta centavos” somava 35 e 80 como reais. O sufixo explícito “centavos” agora faz parte da expressão completa e determina a separação. Duas quantias com unidades próprias continuam sendo duas quantias.
- O reconhecimento local e a validação usam a mesma expressão monetária. Uma vírgula decimal seguida de espaço só é normalizada se houver exatamente duas casas e a unidade reais em seguida; listas arbitrárias não são unidas.
- O pedido nominal claro “Gasto oitenta reais hoje de almoço” passa pelo mesmo caminho local de despesa realizada. Um novo pedido completo assim também deixa de ser capturado por uma edição anterior.

O ajuste é comum ao aplicativo e ao WhatsApp depois da transcrição. Não altera o modelo, a chave, o cadastro ou o plano do assinante. Não reprocessa mensagens reais antigas nem salva despesas retroativamente. A confirmação continua obrigatória e os recibos/idempotência continuam impedindo duplicação.

## Evidência e limites

Os três novos testes agrupados em `money-language.test.ts` falharam antes da correção e passaram depois. Incluem as cem combinações de centavos para um valor inteiro, separadores brasileiros, negativos, milhares, real singular, reais/centavos em formatos mistos e casos inválidos. Isso demonstra o defeito de conversão; não é uma taxa de compreensão de toda a linguagem natural.

O teste de WhatsApp percorre quatro pedidos por texto e por áudio com transcrição/provedor simulados, iniciando com uma edição pendente: proposta, confirmação, persistência, data, saldo e repetição da confirmação. Nenhum desses testes enviou mensagens reais ou usou uma chamada paga ao modelo. A gravação original de voz não foi reavaliada; foi lido o texto que já estava transcrito na conta autorizada.
