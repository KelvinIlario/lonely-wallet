# Lonely Wallet v3.2.1

Aplicativo pessoal para acompanhamento de carteira de investimentos.

## Destaques da versão 3.0.4

- Controles **Ativar/Desativar** para APIs com credenciais. Desativar preserva o token criptografado; Remover continua sendo uma ação separada.
- A desativação da brapi também impede o uso de um token configurado por variável de ambiente como fallback.
- Melhor conciliação de operações Pluggy com lançamentos já importados da B3, considerando ticker, lado, quantidade, proximidade de data e valor financeiro.
- Na sincronização, reconcilia duplicatas antigas somente quando encontra exatamente uma operação B3 correspondente; a operação Pluggy duplicada é removida e a movimentação é vinculada à operação B3 preservada.
- Conciliação de proventos com tolerância pequena de data e valor para reduzir duplicações entre B3 e Pluggy.
- O resumo da sincronização informa quantas duplicatas antigas Pluggy/B3 foram reconciliadas.
- Ajuste da escala vertical do gráfico consolidado quando só existe o ponto atual, evitando rótulos repetidos por arredondamento.

## Dados e atualização

Preserve integralmente o volume persistente `/DATA/AppData/lonely-wallet/data:/data`, incluindo `/data/carteira.db` e `/data/.api-credentials.key`. Não apague nem recrie esses arquivos ao atualizar.

Porta externa recomendada no ZimaOS: `8085`, apontando para a porta interna `8080`. Fuso: `America/Sao_Paulo`.

## Limites de validação

A versão foi verificada por compilação sintática Python, verificação sintática do JavaScript inline e integridade do ZIP. O ambiente de preparação não possui Flask instalado, portanto não foi possível executar o aplicativo completo nem testar conexões reais com provedores externos. A reconciliação automática remove apenas linhas originadas pela Pluggy com uma única correspondência inequívoca da B3; casos ambíguos permanecem intactos para revisão.


## v3.0.4

- Remove da interface o catálogo de APIs nativas/fontes sem token, mantendo as fontes internas necessárias ao funcionamento do aplicativo.
- Define **Últimos 12 meses** como período inicial do gráfico de Consolidação de aportes.
- Adiciona o gerenciamento de importações da B3 ao lado de Novo lançamento. Importações novas registram arquivo, data, quantidades e vínculo dos registros criados, permitindo excluir um lote sem apagar lançamentos manuais.
- Importações antigas aparecem agrupadas pela data de importação, mas não podem ser excluídas individualmente porque a versão anterior não guardava vínculos seguros nem o nome do arquivo.
- Preserva o banco SQLite e o volume `/data`.

## v3.0.5

- Substitui a confirmação nativa do navegador para exclusões de lançamentos e importações B3 por uma janela de confirmação no tema do Lonely Wallet.
- Adiciona **Editar lançamentos de ativos**, com filtros por classe e ativo, listagem de operações, edição individual e exclusão individual.
- Permite excluir todos os lançamentos do ativo selecionado ou todos os lançamentos da carteira, com confirmação explícita e quantidade de registros afetados.
- A exclusão remove os vínculos de rastreamento B3 das operações apagadas e atualiza os totais dos lotes, permitindo reimportar posteriormente uma operação removida.
- A exclusão global afeta somente a tabela de operações; saldos-base importados e proventos independentes são preservados.


## v3.2.0

- Proventos sincronizados somente para ativos com posição atual positiva. Ativos totalmente vendidos deixam de alimentar os indicadores e gráficos da carteira.
- Quando a carteira fica sem posições, recebidos e futuros exibidos no dashboard ficam em R$ 0,00; os registros históricos permanecem armazenados no SQLite.
- Importação B3 e sincronização Pluggy disparam uma verificação de proventos após atualizar as posições.
- A consulta automática do dashboard respeita cache de uma hora para limitar requisições. Uma alteração na lista de ativos atuais invalida a assinatura do cache.
- Fontes de eventos implementadas: endpoints de dividendos da brapi, Alpha Vantage quando configurada/ativa e eventos de dividendos retornados pela cotação brapi. Provedores sem endpoint de proventos implementado não são consultados para esse fim.
- Mantém o banco SQLite e o volume `/DATA/AppData/lonely-wallet/data:/data`; não apague `carteira.db` nem `.api-credentials.key`.


## v3.2.0
- Rentabilidade do Resumo apresentada como resultado consolidado atual, com indicador visual sem curva histórica simulada.
- Confirmações de alterações e exclusões centralizadas em modal próprio, no tema do Lonely Wallet.
- Edição de lançamentos acessada pelo formulário padrão do aplicativo, sem prompts nativos.


## v3.2.0

- Pluggy positions with sufficient contractual data are converted into asset-class operations in the main ledger.
- Fixed-income positions missing indexer or rate are not imported, avoiding incomplete calculations.
- Removed the separate imported-positions panel from the Launches page.
- Removed the secondary New Launch button from the Launches page.


## v3.2.0
- Atualiza o ícone principal e a tela de carregamento com a nova identidade visual.
- Atualiza o favicon do navegador com o ícone arredondado.
- O gerenciamento de lançamentos também remove o cache de investimentos e movimentações de investimento vinculados à Pluggy.
- A exclusão de todos os lançamentos remove os registros de investimentos sincronizados e eventos importados da Pluggy, preservando conexões, credenciais, contas e transações bancárias.


## v3.2.1

- Substitui o ícone principal pela arte enviada, mantendo o fundo preto quadrado.
- Atualiza o ícone da tela de inicialização com a nova identidade visual.
- Atualiza o favicon do navegador com máscara de cantos arredondados.
- Mantém o Docker Compose/YAML da versão anterior sem alterações.
- Preserva o volume `/data`, o banco SQLite e as credenciais existentes.


## Armazenamento v3.3.0

A partir desta versão, o volume persistente `/data` contém dois bancos SQLite: `ativos.db` (carteira, lançamentos, posições, proventos e dados importados) e `tokens.db` (credenciais de APIs criptografadas). A chave de criptografia permanece em `/data/.api-credentials.key`.

Na primeira inicialização, se `ativos.db` ainda não existir e `carteira.db` estiver presente, o sistema copia o banco legado para `ativos.db` e migra as credenciais para `tokens.db`, sem apagar o arquivo legado. Mantenha o volume `/DATA/AppData/lonely-wallet/data:/data` ao atualizar. Não remova `carteira.db`, `ativos.db`, `tokens.db` nem `.api-credentials.key` manualmente durante a migração.

A opção de excluir todos os ativos limpa lançamentos, posições/snapshots, posições e movimentações de investimento importadas pela Pluggy, proventos e referências de importação B3. Ela preserva credenciais, conexões Pluggy, contas e transações bancárias para permitir uma nova sincronização.


## v3.3.1
- Resumo: lista de ativos paginada em blocos de 20.
- Pluggy: sincronização automática ao carregar/recarregar a aplicação; movimentações já processadas são ignoradas pelo identificador externo para evitar duplicidades.
- Importação B3: conciliação semântica por ativo, tipo, lado, data, quantidade e preço, além do fingerprint da planilha.
- Lançamentos: exportação XLSX no layout compatível com a importação de movimentações da B3.


## v3.3.2

- Sincronização automática da Pluggy limitada a uma vez a cada 30 minutos por conexão.
- Atualizar a página (F5) não dispara nova consulta enquanto a conexão estiver dentro do intervalo.
- O servidor aplica a mesma proteção para evitar sincronizações simultâneas/repetidas.
- O botão **Sincronizar tudo** continua permitindo sincronização manual imediata.


## v3.3.3

- Adicionado o botão **Limpar dados importados** na área de conexões MeuPluggy.
- Permite selecionar individualmente a conexão que terá os dados removidos.
- Remove contas, investimentos, transações, movimentações, snapshots e lançamentos/proventos criados pela conexão selecionada.
- Preserva a conexão MeuPluggy, credenciais e lançamentos manuais ou apenas conciliados com operações existentes.
- Reinicia o marcador de última sincronização da conexão para permitir uma nova sincronização imediata.


## v3.3.4
- Formatação automática de valores monetários em operações de compra, venda e edição.
- Separador de milhar e decimal no padrão brasileiro (ex.: `10.000,00`).
- Aceita valores digitados no padrão brasileiro e decimal internacional.


## v3.3.5

- Os formulários de compra, venda e edição de lançamentos solicitam somente a data, sem campo de horário.
- Na seção Resumo > Meus ativos > Renda Fixa, a tabela passa a exibir somente: Ativo, Variação, Rentabilidade, Saldo, Nota, % Carteira, % Ideal, Comprar? e Opções.
- As demais classes e as tabelas fora do Resumo mantêm suas colunas configuráveis.


## v3.3.7
- Importação do histórico completo de compras e vendas da Pluggy, inclusive operações anteriores ao saldo-base.
- Preço unitário de compra/venda preservado a partir do campo `value`, com despesas de corretagem e taxas registradas separadamente.
- Preço médio ponderado calculado a partir das movimentações importadas, usando a posição atual da Pluggy como referência de quantidade.
- Importação de distribuições identificadas como `INTEREST` e eventos de dividendos/JCP, com deduplicação pelo ID externo.
- Posições com status de retirada total ou ausentes da lista atual são tratadas como encerradas, evitando ressuscitar ativos vendidos no histórico.
- Classificação de ativos enriquecida com `subType`/`type` do cadastro B3 da brapi, incluindo identificação de FIIs como MXRF11 sem inferir classe apenas pelo sufixo do ticker.
- Card Destaques da carteira passa a exibir saldo e resultado financeiro das melhores/piores posições e utiliza melhor o espaço disponível.
