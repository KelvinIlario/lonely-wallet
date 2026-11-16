# Lonely Wallet v3.0.4

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


## v3.0.9

- Proventos sincronizados somente para ativos com posição atual positiva. Ativos totalmente vendidos deixam de alimentar os indicadores e gráficos da carteira.
- Quando a carteira fica sem posições, recebidos e futuros exibidos no dashboard ficam em R$ 0,00; os registros históricos permanecem armazenados no SQLite.
- Importação B3 e sincronização Pluggy disparam uma verificação de proventos após atualizar as posições.
- A consulta automática do dashboard respeita cache de uma hora para limitar requisições. Uma alteração na lista de ativos atuais invalida a assinatura do cache.
- Fontes de eventos implementadas: endpoints de dividendos da brapi, Alpha Vantage quando configurada/ativa e eventos de dividendos retornados pela cotação brapi. Provedores sem endpoint de proventos implementado não são consultados para esse fim.
- Mantém o banco SQLite e o volume `/DATA/AppData/lonely-wallet/data:/data`; não apague `carteira.db` nem `.api-credentials.key`.


## v3.0.9
- Rentabilidade do Resumo apresentada como resultado consolidado atual, com indicador visual sem curva histórica simulada.
- Confirmações de alterações e exclusões centralizadas em modal próprio, no tema do Lonely Wallet.
- Edição de lançamentos acessada pelo formulário padrão do aplicativo, sem prompts nativos.
