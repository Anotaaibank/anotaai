# Monetização — proposta sem ativação

Planos web existentes permanecem no servidor. Não foram criados produtos das lojas, contratado gateway ou ativados pagamentos nativos. `mobile/src/core/billing.ts` prevê mensal, anual, funcionalidade premium e restauração; permanece desabilitado. Não há checkout Pix externo na base nativa.

Servidor deve armazenar titular/provedor/produto, transação original, expiração e versão do evento. Só recibo validado oficialmente concede acesso. Notificações assinadas de renovação, reembolso, falha, expiração e cancelamento entram em fila idempotente, inclusive fora de ordem. Nunca confiar em flag do telefone. Impedir que uma transação libere duas contas.

Estados propostos: pendente → ativo → tolerância/falha → expirado. Cancelar renovação respeita o período já pago. Restauração consulta o provedor e reconcilia o titular. Sandbox separado; testar interrupções, repetição, reembolso, webhook reordenado e troca de conta. Tabelas/endpoints de billing dependem da escolha aprovada, sem migração automática em produção.

## Brasil — consulta em 21/10/2026

Google exige seu billing para serviços digitais salvo exceções/programas. Alternativas regionais, inclusive no Brasil, exigem adesão, APIs, relatórios e tarifas; não basta abrir um link Pix. A tabela padrão consultada para assinaturas auto-renováveis no Brasil indica 15%; mudanças anunciadas para outras regiões não devem ser aplicadas por inferência.

As condições brasileiras Apple de 2026 admitem alternativas sob termos/entitlements e avisos específicos. Comissão indicada: 21%, ou 10% para programas elegíveis/assinatura após primeiro ano; processamento Apple soma 5%. Links externos têm condições e comissão próprias. Confirmar contrato/eligibilidade, sem aplicar automaticamente a antiga tabela global 30%/15%.

Antes de integrar: comparar billing oficial e programas regionais, custo de provedor opcional, manutenção, renovação, cancelamento e restauração. Preço, período, termos e renovação devem ser claros. Aprovação obrigatória antes de cadastrar produtos definitivos, contratar ou habilitar cobrança.

Fontes: [Google Payments](https://support.google.com/googleplay/android-developer/answer/9858738?hl=pt-BR), [tarifas](https://support.google.com/googleplay/android-developer/answer/112622?hl=en), [alternativas](https://support.google.com/googleplay/answer/11174377), [Apple Brasil](https://developer.apple.com/br/support/payment-options-on-the-app-store-in-brazil/).
