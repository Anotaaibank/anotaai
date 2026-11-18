MINHA FROTA - PRIMEIRA VERSAO

De dois cliques em Abrir Minha Frota.cmd.
O painel abre em http://127.0.0.1:4317 no navegador.

Cadastre o primeiro carro com nome, placa, compra e situacao.
Abra o carro para registrar despesas ou alugueis recebidos.
O nome provisório pode ser alterado em Configuracoes.

Esta versao funciona neste computador. Os dados reais ficam em
.local/fleet.sqlite. Preserve esse arquivo ao atualizar o programa.
Use a exportacao CSV e a copia JSON no painel para guardar copias.

Nenhum registro de teste foi colocado na base real.
O exemplo preenchido e temporario e nao e salvo no banco.

VERSÃO ONLINE NO ANOTAÍ
A integração usa /minha-frota no domínio do Anotaí e o login da conta
de gestão. Consulte ../docs/minha-frota.md para publicar e transferir
a cópia JSON local. Os bancos local e online são independentes.
O código público não contém os registros ou credenciais.

Desenvolvimento: Node 24; npm run build; npm test; npm run dev.
O build oficial e scripts/build.mjs. O build.sh legado nao e usado.

PROPRIETARIOS
No cadastro do carro, selecione o dono ou escolha Cadastrar novo
proprietario e informe nome e cor. O cadastro pode ser reutilizado
em outros carros. Em Minha frota, os carros ficam agrupados por dono
com totais separados, busca e filtro por proprietario.
O botao Proprietarios permite editar nomes e cores.
Carros antigos sem dono ficam no grupo Sem proprietario definido.
Ao mudar o dono de um carro, todo o historico acompanha o carro.
Antes da migracao local, uma copia .bak do banco foi criada em .local.

TIPOS DE CUSTO E RELATORIO
O formulario Registrar despesa tem 41 tipos de custo predefinidos,
organizados em cinco grupos. Selecione o tipo antes de salvar.
Pecas e mao de obra devem ser lancadas separadamente quando os
valores estiverem discriminados na mesma conta.

Em Custos por categoria, filtre por proprietario, carro, tipo de
custo e periodo. Os valores usam a data de pagamento registrada.
Os atalhos Lavagem, Vaga / estacionamento, Check-in, Check-out,
Pecas e Mecanico / mao de obra abrem os filtros correspondentes.
Clique em uma categoria da tabela para ver os lancamentos dela.
Exportar relatorio baixa o resumo e os lancamentos filtrados em CSV.

Os valores de compra e as receitas de locacao permanecem nos
Resultados e nao entram na soma das despesas deste relatorio.
As categorias antigas foram preservadas. Para detalhar um custo
antigo, use Editar no lancamento e selecione o tipo apropriado.
A lista de categorias fica em shared/expense-categories.json;
o build compartilha a mesma lista entre o formulario e o servidor.

LOCALIZACAO ATUAL DO PROJETO
C:\Users\Bruno Lira\OneDrive\Documentos\ChatGPT\Anota aí\frota-us-start
A pasta do Windows usa o nome Anota aí, com acento.
Transferencia concluida em 18/11/2026, com os dados reais preservados.
A antiga pasta Logos/frota-us-start foi retirada da Logos.
Use apenas o projeto no Anota ai para as proximas alteracoes.
Codigo, dados, copias, testes, imagens e atalho foram transferidos.
A infraestrutura de hospedagem pretendida e a do Anota ai.
