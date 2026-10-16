# Apresentação comercial do Anotei

Rota preservada: `/conheca`. Componentes e estilos próprios; não altera cadastro, banco, WhatsApp, assinatura, limites, lembretes ou backend financeiro.

## Jornada

1. Benefício imediato, WhatsApp, preço inicial e chamada de contratação. Smartphone animado mostra mensagem, conferência, confirmação e registro; valores ilustrativos, sem dados reais.
2. Espaço de vídeo 16:9, sem reprodução simulada. A apresentação ainda será fornecida.
3. Três benefícios: gastos, contas e consultas.
4. Exemplos interativos de gasto, conta futura e relatório. Confirmações só atualizam a ilustração local. O relatório soma supermercado 85, combustível 30 e padaria 20: total 135 reais.
5. Rotina simples, sem planilhas e sem julgamento.
6. Catálogo real de planos, limites compartilhados, definição de pedido e minutos. Botões preservam `/?cadastro=1`; não simulam pagamento. Cartão principal em preparação e Pix alternativo permanecem conforme política existente.
7. Dúvidas rápidas, com respostas curtas e regras reais.
8. Chamada final. No celular, o botão fixo aparece após o hero e recolhe durante a exibição dos planos; área final reserva espaço e considera safe area.

O hero tem uma única sequência cinematográfica, sincronizada à rolagem nativa: mensagem → resumo da IA → confirmação → card financeiro → painel e lembrete. O celular ganha profundidade, aproxima e abre espaço para o painel. Ao rolar de volta, a cena retrocede; a página nunca bloqueia ou desloca artificialmente a rolagem. Os quatro botões também permitem explorar as etapas por toque, sem alterar a posição da página.

`SalesScrollStory` usa sticky nativo e requestAnimationFrame sob demanda, com geometria calculada só em resize e valores repetidos descartados. Sem intervalos ou loops permanentes. A dimensão svh mantém a cena estável com barras móveis; a fixação acaba no limite do próprio container. O preço e CTA precedem a cena no celular; há acesso direto aos planos dentro dela.

Movimento reduzido, economia de dados, até dois núcleos lógicos, telas com menos de 680px de altura ou ausência de sticky usam uma ilustração em fluxo normal, navegável por etapas. Sem JavaScript, a ilustração completa continua visível, com descrição textual. Entradas das demais seções respeitam movimento reduzido. Sem bibliotecas novas, fontes remotas, canvas, WebGL ou imagens de terceiros.

Os valores são exemplos locais: R$ 1.000 de saldo inicial menos R$ 85 de gasto = R$ 915. A conta futura de R$ 120 aparece no calendário e não é abatida como pagamento. O movimento de organização só começa depois da confirmação ilustrativa. Nenhum endpoint, cadastro, registro ou pagamento é acionado pela cena.

## Vídeo a adicionar

Produzir entre 45 e 75 segundos, com legendas: despesa por áudio, resumo e confirmação, conta futura, lembrete, consulta rápida, painel e convite para começar. Não mostrar pagamento bancário nem afirmar salvamento antes de confirmar. `PresentationVideo` aceita fonte para reprodução real; `video_play` só dispara com o evento nativo de reprodução. O placeholder não dispara reprodução.

## Eventos preparados

`lib/landing-events.ts` emite eventos DOM `anotei:landing`, com detalhe contendo nome, página e contexto enumerado. Nomes: `landing_view`, `cta_click`, `video_play`, `demo_interaction`, `plans_view`, `plan_selected`, `registration_start`, `payment_start`.

- Não instala tag de terceiros, envia rede, grava cookies ou lê dados pessoais.
- A ferramenta de análise pode ouvir esse evento quando for conectada. Não há destino de rastreamento externo configurado por esta alteração.
- `registration_start` significa clique que leva ao formulário real; não significa cadastro concluído.
- `payment_start` está reservado para o checkout real futuro, sem disparo na landing atual. Não há evento de compra aceita pelo contrato.
- Nomes desconhecidos e campos livres (e-mail, telefone, mensagens ou registros financeiros) são rejeitados.

## Metadados

H1 único, títulos H2 por seção, navegação semântica, canonical, descrição e Open Graph/Twitter. Mantido o `noindex` da página de validação existente; liberar indexação somente na etapa de lançamento. Não publica a demonstração do aplicativo nem habilita contas de exemplo.
