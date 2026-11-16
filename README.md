# Lonely Wallet v2.0.72

## Integração de dados de mercado

- Identificação explícita da fonte de cada cotação BRAPI e dos históricos por ativo (brapi, Twelve Data, Alpha Vantage ou fallback legado).
- A API do dashboard passa a expor cobertura, período, quantidade de pontos e se a série histórica é ajustada por eventos, permitindo conferir a origem dos gráficos de rentabilidade.
- A seção de integridade dos dados informa as fontes de cotações, histórico e sincronização de proventos.
- Ao salvar, alterar ou remover credenciais, os caches de mercado e a janela de sincronização de proventos são invalidados para aplicar imediatamente a nova configuração.
- Mantida uma fonte única por ativo para cotações e séries históricas. Séries de provedores diferentes não são somadas nem emendadas.
- Proventos continuam centralizados na sincronização idempotente da brapi e conciliados com lançamentos manuais/importação B3. Não adicionamos fontes paralelas de dividendos, evitando duplicidade.

# Lonely Wallet v2.0.59

## Atualização desta versão

- Corrigida a posição das setas dos filtros em **Histórico Mensal** e **Meus proventos**.
- As setas agora ficam ancoradas no lado direito dos botões e centralizadas verticalmente, sem depender do tamanho do texto ou do filtro selecionado.
- Mantidos os estilos dos filtros e a responsividade da página Proventos.

# Lonely Wallet v2.0.56

Aplicação Flask + SQLite para controle pessoal de investimentos, preparada para Docker/ZimaOS.

## Atualização desta versão

- Ajuste responsivo do gráfico de rentabilidade para ocupar a área útil do card.
- Padronização visual dos filtros da página Rentabilidade.
- Nova página **APIs**, ao lado de Metas, com catálogo de provedores, cadastro, teste e remoção de tokens.
- Tokens de integração armazenados criptografados no volume persistente (`/data/.api-credentials.key` e banco SQLite).
- Brapi e HG Brasil podem fornecer séries históricas adicionais de índices quando a chave e o plano cobrirem o endpoint.
- CDI e IPCA continuam consultados nas séries oficiais do Banco Central.

## Instalação

Preserve o volume persistente configurado em `docker-compose.yml`. Não exclua `/DATA/AppData/lonely-wallet/data`, pois ele contém o banco e a chave local de criptografia das credenciais.

## Correções da versão 2.0.56

- A legenda permite ocultar e reexibir também a linha **Rentabilidade**.
- CDI continua vindo do SGS 12 do Banco Central; IPCA usa SGS 433 e conferência independente pelo SIDRA/IBGE quando disponível.
- A competência atual do IPCA não é preenchida antes da divulgação oficial.
- Adicionada integração opcional **Dados B3** para séries de retorno total de IBOV, IFIX, SMLL e IDIV. Sem chave, a fonte pode devolver apenas 30 pregões; com a chave gratuita, a série completa fica disponível conforme a cota do provedor.
- HG Brasil, brapi e Yahoo Finance permanecem como fontes alternativas, com a fonte escolhida e a última competência expostas ao usuário. Não se faz média entre séries de metodologias diferentes.
- Os cards de último mês e últimos 12 meses passam a usar meses fechados; os 12 meses são compostos a partir dos retornos mensais.
- A comparação com índices usa um mês anterior de referência quando disponível e não apresenta comparação sem base suficiente.
- Corrigida a invalidação do cache de benchmarks ao salvar ou remover credenciais.


## v2.0.57

- Atualizado o favicon exibido na aba do navegador com o novo ícone Lonely Wallet.
- Atualizado o ícone do aplicativo no catálogo/launcher do CasaOS e ZimaOS.
- URLs dos ícones versionadas para evitar que o navegador e o launcher reutilizem a imagem antiga em cache.

## v2.0.58

- Os cards de rentabilidade agora aparecem na ordem: Últimos 12 meses, Último mês e Rentabilidade total.
- Filtros da aba Proventos receberam menus mais compactos, cantos mais arredondados, espaçamento consistente e setas alinhadas nos cabeçalhos.
- Cotações sem resposta válida da brapi agora tentam, em sequência, HG Brasil, Twelve Data, Alpha Vantage e Yahoo Finance, quando disponíveis. O aplicativo mantém um único provedor por cotação para não misturar preço e variação de fontes diferentes.
- Histórico de preços da carteira ganhou fallback por ativo via Twelve Data e Alpha Vantage antes do fallback Yahoo, quando há credenciais configuradas.
- Mantida a deduplicação idempotente de eventos sincronizados por chave de evento e a reconciliação com lançamentos manuais/B3; fontes não são somadas entre si como se fossem eventos diferentes.
- CDI e IPCA continuam priorizando as séries oficiais do Banco Central, com conferência do IPCA pelo IBGE; índices de mercado priorizam Dados B3 e usam fontes alternativas identificadas quando necessário.
- Fontes sem escopo de cotação de ativos (FRED, CVM, IBGE, Tesouro Transparente e catálogo B3) não são tratadas como se fornecessem preço intradiário ou proventos por ticker.


## v2.0.60

### Correção visual dos filtros de Proventos
- Corrigido o alinhamento vertical das setas dos filtros em **Meus proventos**.
- Corrigido o alinhamento vertical das setas dos filtros em **Histórico mensal**.
- Setas posicionadas no centro vertical dos campos e alinhadas à direita, dentro dos filtros.
- Mantido o estilo e o espaçamento dos demais elementos da página.


## v2.0.61

### Padronização global dos filtros
- Unificado o chevron dos filtros fechados, com traço fino, centralização vertical e alinhamento à direita.
- Aplicado o mesmo padrão aos campos select do projeto, incluindo filtros e formulários.
- Padronizadas as listas nativas de opções para tema escuro e claro, com destaque azul para a opção selecionada.
- Os menus de **Histórico Mensal** e **Meus Proventos** agora usam listas retangulares de texto, sem checkboxes.
- Os filtros de tipo de ativo e ativo passaram a permitir uma seleção por vez, com opção para mostrar todos.
- Mantido o seletor de período com seu layout próprio de opções rápidas e filtro mensal.



## v2.0.62

### Padronização dos filtros expandidos em todo o projeto
- Substituídos os menus nativos quadrados dos filtros por dropdowns customizados seguindo as referências visuais.
- Aplicado em Evolução de Proventos, Evolução do Patrimônio, Rentabilidade, Lançamentos, Resumo e filtros de comparação de benchmarks.
- Listas escuras retangulares, sem checkboxes, com opção selecionada destacada em azul.
- Chevron fino, centralizado verticalmente e alinhado à direita nos filtros fechados.
- Mantida a integração com os eventos de alteração existentes e com opções carregadas dinamicamente.
- Suporte aos temas escuro e claro.


## v2.0.63

### Padronização completa dos filtros e seletores
- Ampliada a personalização para todos os campos `select` simples visíveis do projeto, sem depender de uma lista fixa de IDs.
- Incluídos filtros de Resumo, Proventos, Patrimônio, Rentabilidade, Lançamentos, benchmarks e seletores de formulários.
- Todos os menus expandidos usam a mesma lista escura retangular, sem caixas de seleção, com item ativo destacado em azul.
- Todos os campos fechados usam chevron fino, centralizado verticalmente e alinhado à direita.
- Campos ocultos e seletores múltiplos não são interceptados.
- Mantida a atualização de opções dinâmicas e os eventos `change` já existentes.
- Compatibilidade visual com temas escuro e claro.


## v2.0.64

### Ajuste visual dos menus de filtros
- Corrigido o acabamento dos menus expandidos para corresponder ao layout de referência.
- Contêineres com cantos arredondados, borda discreta e espaçamento interno.
- Opções com altura uniforme e destaque azul com cantos levemente arredondados.
- Largura do menu alinhada à largura do respectivo filtro.
- Aplicado ao componente global de seletores simples, mantendo suporte aos temas escuro e claro.


## v2.0.65

### Correções nos filtros da página Proventos
- Menus de filtros agora funcionam de forma exclusiva: abrir um fecha os demais.
- Aplicada coordenação entre filtros de status, tipo, ativo, período e seletores personalizados.
- Clique fora e tecla Esc fecham os menus abertos.
- Padronizada a paleta dos menus expandidos, incluindo o seletor de período da Evolução de Proventos.
- Mantidos os controles específicos de período, incluindo opções rápidas e seleção anual.


## v2.0.66

### Correção definitiva da abertura simultânea de filtros em Proventos
- Centralizado o fechamento de todos os menus da página em um único coordenador.
- Antes de abrir qualquer filtro, todos os outros menus são fechados, incluindo período do gráfico, filtros do histórico mensal, filtros de Meus Proventos e seletores personalizados.
- Reaberto somente o menu solicitado pelo usuário.
- Estado `aria-expanded` sincronizado nos botões.
- Mantidos os estilos, opções, filtros e regras de seleção existentes.


## v2.0.67

### Correção da abertura simultânea de filtros
- Implementado coordenador global em fase de captura, executado antes dos eventos individuais dos filtros.
- Ao clicar em outro filtro, qualquer menu aberto anteriormente é fechado antes da abertura do novo.
- Abrange os menus personalizados de período, status, tipo de ativo, ativos e os selects customizados do restante do projeto.
- Mantido o comportamento de alternância ao clicar novamente no mesmo filtro.

### Padronização das cores das tabelas
- Cabeçalhos das tabelas passam a utilizar a variável de cor de superfície do tema.
- Estados de hover usam uma variável compartilhada entre tema escuro e claro.
- Listas de ativos da página Patrimônio alinhadas às cores dos demais painéis e tabelas.


## v2.0.68

### Resumo: últimos ativos lançados
- O card vazio da página Resumo agora exibe os três ativos distintos com lançamentos mais recentes.
- A ordenação considera a data de execução do lançamento, com fallback para a data registrada.
- Cada linha apresenta ticker, classe do ativo e data do lançamento mais recente daquele ativo.
- O card é atualizado junto com os demais indicadores da carteira.
- Quando ainda não há lançamentos, é exibida uma mensagem informativa.


## v2.0.69

### Evolução histórica do patrimônio
- O gráfico passa a utilizar séries históricas diárias das APIs configuradas e consolida os fechamentos por mês.
- Reconstrói as quantidades mantidas em cada mês a partir das compras, vendas e, quando existente, do saldo-base importado.
- Exibe capital líquido aplicado e ganho/prejuízo acumulado em cada mês, em vez de concentrar todo o resultado no mês atual.
- A série é disponibilizada também por tipo de ativo para respeitar os filtros do gráfico.
- Quando houver ativos sem histórico, o gráfico informa a cobertura parcial em vez de inventar cotações.
- Fontes históricas: brapi (v2 e endpoint legado), Twelve Data e Alpha Vantage conforme credenciais, cobertura e limites disponíveis.
- Renda fixa e Tesouro com dados contratuais informados usam o histórico do indexador consultado no Banco Central; posições importadas sem dados do indexador mantêm o valor-base informado, sem estimar rendimento.


## v2.0.70

### Gráfico de evolução do patrimônio
- Ajustado o gráfico para utilizar exclusivamente barras, seguindo o modelo visual de referência.
- Barras empilhadas exibem **Valor aplicado** e **Ganho de Capital** em cada mês.
- Ganhos positivos aparecem em verde-claro; prejuízos aparecem em vermelho e abaixo da linha zero.
- Removida a linha de capital aplicado.
- Tooltip mantém o patrimônio mensal e o resultado de ganho ou prejuízo.


## v2.0.71

### Gráfico de evolução do patrimônio
- Refinado o gráfico para seguir o modelo visual de referência do Investidor10.
- Mantidas exclusivamente barras empilhadas: valor aplicado em verde e ganho de capital em verde-claro.
- Ganhos positivos aparecem acima do valor aplicado; prejuízos aparecem abaixo da linha zero, também em verde-claro.
- Mantidos os filtros de período e tipo de ativo, com atualização do gráfico conforme a seleção.
