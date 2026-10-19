# Datas relativas no agente — 19/10/2026

O calendário é calculado no servidor a partir do dia de São Paulo. No WhatsApp, a referência continua sendo a data de recebimento da mensagem, mesmo quando a fila demora. Texto e áudio depois da transcrição passam pelas mesmas funções; a transcrição não foi modificada nesta alteração.

`relative-calendar.ts` resolve ontem/hoje/amanhã, anteontem/depois de amanhã, dias da semana anteriores/próximos, dia da próxima semana, intervalos em dias/semanas/meses/anos e ordinais de dia da semana no mês solicitado. Exemplos: primeiro domingo do mês que vem, segunda terça de novembro, último sábado, último dia do mês. `appointmentFacts` extrai primeiro a expressão inteira: o número de dias/semanas e o ordinal não viram valor monetário nem uma data parcial.

- Próxima sexta: primeira sexta estritamente posterior a hoje; se hoje é sexta, em sete dias.
- Sexta passada: primeira sexta estritamente anterior. Sexta sem qualificador usa a direção do pedido (previsão futura ou pagamento passado), mantendo hoje se for o mesmo dia.
- Semana: segunda a domingo. Terça da semana que vem é a terça desse intervalo, não simplesmente a terça mais próxima.
- Semana/mês sem dia: pergunta somente qual dia. A resposta curta completa o pedido anterior, preservando valor e hora; não escolhe segunda-feira/dia 1 por conta própria.
- Um ordinal inexistente, uma data impossível ou duas datas conflitantes impedem a proposta, inclusive se um modelo tentar sugerir hoje. Não se pula para outro mês.
- Intervalo de um mês/ano conserva o dia quando possível e limita ao último dia do mês quando necessário (31 de janeiro + um mês → 28/29 de fevereiro).
- Entrada/saída sem data continuam usando hoje; uma data dita expressamente, como ontem, prevalece. Data futura prepara previsão sem alterar caixa; passado verbal com data futura pede esclarecer a contradição.

O cálculo também é aplicado em `draftCommand`, antes da assinatura, corrigindo omissão/data divergente de uma interpretação estruturada. Alterações em registros existentes conservam as datas expressamente pedidas. A edição 2 do WhatsApp aceita expressões relativas; data e horário corrigidos juntos são mantidos na proposta substituta. Não foram mudados dono, limites de acesso, assinatura, prazo, recibos, idempotência ou banco.

Testes: `relative-calendar.test.ts` contém datas esperadas fixas, viradas de ano, fevereiro bissexto, meia-noite em São Paulo, conflitos e continuação de pedido incompleto. `whatsapp-worker.test.ts` percorre texto/áudio com transcrição e provedor simulados → proposta → edição → confirmação → SQLite → repetição, conferindo calendário, saldo e situação prevista. Não é teste de microfone, ASR real ou entrega no celular. A suíte completa e o build são registrados na verificação desta versão.

Expressões vagas continuam exigindo o detalhe ausente; isso não promete um calendário de feriados/dias úteis, repetição semanal ou compreensão infalível de qualquer frase. Toda gravação continua dependendo da confirmação do usuário.
