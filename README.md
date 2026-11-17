# Lonely Wallet v3.3.22

## v3.3.22

- Adicionada configuração persistente do intervalo de sincronização automática da Pluggy: desativado, 15 ou 30 minutos, 1 hora, 4 horas, 12 horas ou 1 vez ao dia.
- A sincronização automática é executada pelo navegador enquanto o Lonely Wallet estiver aberto; a preferência fica salva no banco local.
- A sincronização continua consultando somente investimentos e movimentações de investimento, sem transações bancárias.
- A página Rentabilidade inicia com as séries da carteira e dos índices CDI, IPCA, IFIX, IBOV, SMLL, IDIV e IVVB11 selecionadas.
- As séries de índices são alinhadas ao período disponível da carteira, sem inventar pontos históricos. Comparações dependem de dados reais e períodos coincidentes.
- A série da carteira continua baseada no histórico de operações e cotações disponível, incluindo operações importadas da Pluggy. O saldo atual da Pluggy, isoladamente, não é tratado como histórico mensal.

## Dados e atualização

Preserve integralmente o volume persistente `/DATA/AppData/lonely-wallet/data:/data`, incluindo `/data/carteira.db` e `/data/.api-credentials.key`. Não apague nem recrie esses arquivos ao atualizar.

Porta externa recomendada no ZimaOS: `8085`, apontando para a porta interna `8080`. Fuso: `America/Sao_Paulo`.

## Limites de validação

Compilação Python, sintaxe dos scripts JavaScript e integridade do ZIP verificadas. A sincronização automática depende do navegador permanecer aberto. Não foram realizadas chamadas reais às APIs neste ambiente; a cobertura do gráfico depende do histórico efetivamente retornado pelos provedores e das operações disponíveis na carteira.


Aplicativo pessoal para acompanhamento de carteira de investimentos.

## v3.3.23

- Corrige o gráfico de Rentabilidade para que os índices CDI, IPCA, IFIX, IBOV, SMLL, IDIV e IVVB11 sejam plotados mesmo quando a carteira ainda não possui uma série histórica mensal completa.
- A linha da carteira utiliza primeiro a série histórica patrimonial; quando ela não está disponível, utiliza a série acumulada calculada a partir das operações importadas e dos preços históricos disponíveis.
- O eixo temporal passa a considerar a união dos meses disponíveis nos índices e na carteira, em vez de depender exclusivamente dos meses da carteira. Isso evita um gráfico vazio com apenas o rótulo “Atual”.
- Operações Pluggy importadas continuam compondo os fluxos de investimento usados no cálculo; a série da carteira só é desenhada nos meses com dados efetivos, sem inventar cotações ou retornos.
- A nota do gráfico esclarece a disponibilidade do histórico e a cobertura dos ativos.

## v3.3.15

- Pluggy passa a sincronizar exclusivamente investimentos e movimentações de investimento. A consulta a contas e transações bancárias foi removida.
- Dados bancários em cache de versões anteriores são apagados na inicialização; conexões Pluggy e credenciais são preservadas.
- Tela de APIs não exibe transações bancárias nem contadores de contas bancárias.
- Colunas do cabeçalho de Renda Fixa usam a mesma grade das demais classes; a posição de Variação fica reservada, mas sem indicador para Renda Fixa.
- Indicadores de variação positiva/negativa recebem cores explícitas verde/vermelho.
- A antiga nota manual foi substituída por avaliação automática baseada nos indicadores fundamentalistas efetivamente retornados pela APIs de fundamentos da brapi e Alpha Vantage (quando habilitada), incluindo valuation, ROE, margens, endividamento, liquidez, geração de lucro/caixa, crescimento, payout e distância da máxima de 52 semanas quando disponíveis.
- A avaliação informa cobertura e indicadores utilizados. Com menos de três indicadores válidos, mostra análise incompleta e não inventa uma pontuação; a distribuição ideal volta à divisão igualitária da classe até haver dados suficientes.
- Observações pessoais permanecem editáveis, mas não interferem na avaliação automática.
- Tooltip de variação usa o tema visual do aplicativo e não abre o tooltip branco nativo do navegador.

## Dados e atualização

Preserve integralmente o volume persistente `/DATA/AppData/lonely-wallet/data:/data`, incluindo `/data/carteira.db` e `/data/.api-credentials.key`. Não apague nem recrie esses arquivos ao atualizar. A inicialização desta versão remove apenas os caches legados de contas e transações bancárias Pluggy, pois o aplicativo passa a ser exclusivamente voltado a investimentos.

Porta externa recomendada no ZimaOS: `8085`, apontando para a porta interna `8080`. Fuso: `America/Sao_Paulo`.

## Limites de validação

A avaliação fundamentalista depende dos campos realmente fornecidos pelo endpoints fundamentalistas da brapi e, quando habilitada, da Alpha Vantage para cada ativo e plano. A integração HG Brasil permanece como fonte alternativa de cotação, mas não é tratada como fornecedora de fundamentos quando esses dados não são retornados. Não foi possível testar chamadas reais às APIs neste ambiente.

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


## v3.3.9
- Pré-carregamento concorrente de cotações para reduzir o tempo de abertura do resumo.
- Destaques calculam retorno total desde a primeira compra usando movimentações Pluggy (compras, vendas, custos e proventos), com fallback quando não há histórico Pluggy.
- Percentual do resultado total exibido ao lado do patrimônio, com tooltip em reais.
- Destaques com cores neutras, seguindo a paleta padrão do projeto.

## v3.3.10
- Botão **Abrir MeuPluggy** atualizado para o mesmo estilo visual dos botões do projeto.
- Seletor de limpeza agora permite escolher uma conexão específica ou **Todas as conexões**.
- Limpeza de todas as conexões executada individualmente, preservando conexões, credenciais e lançamentos manuais/B3.
- Card **Destaques da carteira** simplificado, com melhor distribuição dos dois destaques e sem informações secundárias de saldo/resultado.
- Card **Posições no lucro** reorganizado para distribuir melhor o total, percentual, barra e contadores, mantendo o estilo existente.
- **Variação** passa a representar o ganho/perda desde a primeira compra registrada na Pluggy, considerando compras, vendas, custos e valor atual, sem proventos.
- **Rentabilidade** usa o mesmo histórico e inclui os proventos recebidos.
- Tooltip da variação informa o resultado financeiro em reais e a data da primeira compra.
- Quando não há histórico Pluggy suficiente, os cálculos locais anteriores são mantidos.


## v3.3.18

- Corrigido o tooltip da coluna **Variação**: agora ele é renderizado em uma camada fixa diretamente no documento, fora dos contêineres da tabela, evitando cortes por `overflow`.
- Posicionamento automático acima ou abaixo do valor, respeitando os limites da janela.
- Removido o destaque/escurecimento da célula ao passar o mouse; a variação continua sem ação de clique.


## v3.3.18
- Proventos recebidos consolidados por prioridade de origem: lançamentos manuais, pagamentos identificados pela Pluggy, tabela B3 e demais APIs.
- Somente eventos com pagamento confirmado e data efetiva até hoje entram nos totais, rentabilidade e metas.
- Proventos futuros continuam vindo das fontes de mercado e lançamentos manuais, sem usar Pluggy.
- Edição de lançamentos importados preserva a identificação de origem Pluggy. Exclusões manuais são respeitadas em sincronizações futuras.


## v3.3.21
- Tooltip da coluna Variação simplificado para exibir apenas a pergunta e o valor financeiro correspondente.
- Proventos recebidos limitados aos registros vinculados às importações Pluggy e B3.
- Lançamentos manuais e eventos de outras APIs deixam de compor os totais de proventos recebidos.
- Mantida a exclusão de pagamentos futuros da apuração de recebimentos.


## v3.3.24 · Histórico completo de rentabilidade
- A legenda do gráfico inicia somente com **Rentabilidade** selecionada.
- CDI, IPCA, IFIX, IBOV, SMLL, IDIV e IVVB11 ficam disponíveis para ativação individual pelo usuário.
- A consulta de benchmarks passa a solicitar o histórico completo disponível desde 1990, independentemente da data da primeira operação da carteira.
- O histórico de cada série continua limitado à disponibilidade real da respectiva fonte; não são criados pontos artificiais.


## v3.3.25 · Navegação e gerenciamento Pluggy
- Removidas as páginas Rentabilidade e Metas do menu e da interface.
- Gerenciamento da Pluggy concentrado no botão **Gerenciar API**, com credenciais, conexões, sincronização manual, limpeza de dados e acesso ao MeuPluggy dentro de uma janela dedicada.
- O seletor de sincronização automática foi movido para a janela de gerenciamento.
- A preferência de intervalo permanece salva em `app_settings` no SQLite e é carregada ao abrir o aplicativo.
- O intervalo configurado também é respeitado pelo controle de frequência do endpoint de sincronização.
- A sincronização automática pelo navegador funciona enquanto o aplicativo estiver aberto em uma aba do navegador.


## v3.3.26 · Organização da Pluggy
- Credenciais Pluggy voltaram à página principal da API, como antes, com salvar, testar, ativar/desativar e remover.
- Cadastro de conexões, sincronização manual, lista de conexões e acesso ao MeuPluggy permanecem na página principal.
- A janela **Gerenciar API** agora contém somente o intervalo de sincronização automática e a exclusão dos dados importados.
- O seletor de conexão para exclusão permanece dentro da janela, permitindo limpar uma conexão específica ou todas.


## v3.3.27 · Personalização visual e navegação
- Tooltip da coluna **% Ideal** agora usa o mesmo estilo visual do tooltip de variação: fundo, tipografia, borda e sombra consistentes, com cores de destaque positivas/negativas.
- Ordem das páginas **Lançamentos** e **Distribuição** invertida no menu.
- Criada a página **Configurações** ao lado de APIs.
- Adicionado seletor de idioma (Português Brasil, English e Español), com preferência salva localmente.
- Adicionado catálogo de oito cores de destaque (Oceano, Lavanda, Esmeralda, Âmbar, Rosa, Rubi, Ciano e Dourado), com aplicação imediata e preferência salva.


## v3.3.28 · Ajustes de interface e auditoria de proventos
- Removida a página Configurações, incluindo os seletores de idioma e catálogo de cores.
- Corrigido o hover da coluna Variação: ao passar o mouse na linha, a célula acompanha a mesma cor de realce das demais colunas, sem retângulo escuro isolado.
- Ajustada a identificação de proventos da Pluggy: o tipo documentado `INTEREST` continua reconhecido como distribuição; a inferência por descrição agora só é usada quando o tipo vier vazio, `UNKNOWN` ou `OTHER`, evitando classificar TAX, TRANSFER ou AMORTIZATION como renda.
- Mantido o volume `/data` e a estrutura dos registros existentes.
