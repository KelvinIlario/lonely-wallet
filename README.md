# Lonely Wallet v2.0.47\n\nAtualização de sincronização automática da interface após operações de gravação.\n\n# Lonely Wallet — atualização de interface v2.0.43

# Lonely Wallet v2.0.44

## Correções
- Gráfico de distribuição de ativos na página Resumo prioriza tons azuis, verdes, roxos e amarelos, evitando vermelho enquanto houver cores alternativas.
- Gráfico de barras da aba Proventos ocupa toda a largura disponível do painel, com canvas responsivo e sem encolhimento horizontal em layouts flexíveis.
- Mantida a interação de clique nas barras para abrir a distribuição circular do mês correspondente.
- Mantidos o logotipo, o ícone e o favicon oficiais da identidade visual atual.

## Novidades da v2.0.42
- O card **Resumo** da aba Proventos agora permite alternar o total recebido entre **Total do mês**, **Total do ano** e **Total últimos 12 meses**. O cálculo considera somente pagamentos efetivamente recebidos.
- A média mensal de proventos pode ser vinculada à meta mensal cadastrada. O card mostra o valor-alvo, percentual de atingimento, barra de progresso e atalho para a meta.
- O botão **Criar meta** abre um fluxo guiado com **Meta de Patrimônio**, **Meta de Ativos** e **Meta de Proventos**, com campos específicos para cada modalidade.
- Metas agora armazenam categoria, ativo, variação anual estimada e classes de proventos selecionadas, com migração automática e preservação das metas existentes.
- O progresso das metas é calculado a partir dos valores atuais da carteira, do ativo selecionado ou da média mensal de proventos recebidos nos últimos 12 meses.
- Corrigido o estado selecionado dos botões **Mensal/Anual** para respeitar os temas claro e escuro.
- Reforçada a renderização do painel de Proventos ao abrir a aba, para atualizar o gráfico e os elementos do resumo sem precisar alternar o período.
- A distribuição detalhada de proventos utiliza uma paleta ampliada, evitando repetir cores entre os ativos e priorizando tons que não sejam vermelhos.
- Os valores ao passar o mouse sobre os nomes na distribuição detalhada aparecem em um balão de informação, no mesmo padrão visual do gráfico.

---

## Novidades da v2.0.41
- Na aba **Lançamentos**, cada operação agora oferece **Editar lançamento** à esquerda de **Excluir**. A edição permite atualizar ativo, classe, compra/venda, quantidade, preço, custos, data e campos específicos, preservando o registro no banco.
- Na aba **Proventos**, o card lateral foi reorganizado: o indicador inferior agora mostra **Total de proventos** recebidos, em vez do patrimônio da carteira.
- O gráfico de distribuição no card lateral destaca os três ativos que mais geraram proventos nos últimos 12 meses.
- O botão **Ver todos** abre uma janela com distribuição completa **Por Ativo** e **Por Tipo**, percentuais e valores recebidos ao passar o mouse sobre os itens.
- O histórico de Proventos agora é agrupado por classe e usa paginação independente de até 15 registros por classe, com navegação Anterior, páginas e Próximo.
- O gráfico principal **Evolução de Proventos**, seus filtros, alternância Mensal/Anual e interação por mês foram preservados.

---

# Lonely Wallet v45

Aplicação Flask + SQLite para controle pessoal de investimentos, preparada para Docker/ZimaOS.


## Correções da versão 44 — baseada na versão estável v43
- Mini gráfico de Rentabilidade redesenhado como SVG para garantir a renderização da linha Total mesmo quando só existe um ponto de referência do saldo-base. A série dos últimos 12 meses só é desenhada com cotações reais disponíveis; não são inventados retornos mensais.
- Gráfico Evolução do Patrimônio reforçado para sempre usar o capital investido consolidado da carteira ou da classe filtrada, inclusive quando a janela começa depois do saldo-base. O ganho de capital permanece em uma série separada e empilhada.
- Gráfico mensal de Proventos mantém a janela histórica selecionada e acrescenta os meses futuros que contenham pagamentos anunciados. As barras empilham proventos recebidos e a receber; o cabeçalho mostra os dois subtotais e a soma.
- Pagamentos manuais com data futura permanecem como **A receber**; após a data informada passam para o histórico recebido conforme a regra do módulo.
- Restaurado o fallback da versão estável: além dos endpoints v2 de dividendos, o sistema volta a ler `dividendsData.cashDividends` da cotação v1, para recuperar pagamentos anunciados quando a cobertura do endpoint específico não inclui o ticker.
- O cálculo de quantidade na data-com usa `lastDatePrior` quando a fonte fornece esse campo e reconstrói a posição a partir do saldo-base e das operações posteriores. Quando o histórico é incompleto, a linha do provento fica sinalizada como estimada, em vez de desaparecer silenciosamente.
- A sincronização permanece idempotente: a chave do evento impede duplicação na tabela automática, e registros manuais são comparados para evitar duplicação visual.
- O banco original é preservado; as tabelas de integração são criadas automaticamente.


## Correção da carteira vazia — v45
- Corrigido o saldo-base importado de 31/10/2026: antes, ele era inserido automaticamente em toda inicialização e continuava compondo o patrimônio mesmo depois que o usuário apagava todos os lançamentos.
- Ao excluir o último lançamento, a fotografia importada é removida e o patrimônio/posições passam a refletir a carteira vazia.
- Em bancos atualizados da v44, se a aplicação encontrar zero lançamentos e a fotografia antiga ainda existir, ela a remove automaticamente na primeira inicialização da v45.
- A remoção é idempotente e registrada em `integracao_estado`; a fotografia não reaparece ao reiniciar ou reconstruir o container. Instalações novas e vazias também não recebem mais os 24 ativos de exemplo automaticamente.
- O saldo-base é mantido enquanto houver lançamentos cadastrados, pois continua sendo necessário como referência para a posição consolidada importada.
- Proventos já recebidos continuam preservados como histórico financeiro independente dos lançamentos de compra/venda. Excluí-los exige apagar os registros de proventos separadamente; eles não representam patrimônio atual.

### Atualizar para v45 no ZimaOS
1. Faça backup de `data/carteira.db`.
2. Extraia os arquivos da v45 sobre a pasta atual, mantendo o volume `./data:/data` apontando para o banco em uso.
3. Preserve o `.env` e o `data/carteira.db`.
4. Execute `docker compose up -d --build`.
5. Na primeira inicialização, a migração verifica o número de lançamentos e remove a fotografia antiga somente quando a carteira estiver sem operações.

## Atualização no ZimaOS
1. **Faça uma cópia de segurança de `data/carteira.db`** antes de atualizar. O banco existente é preservado e recebe as novas colunas automaticamente.
2. Extraia esta versão em uma pasta de atualização.
3. Confira se o volume `./data:/data` do `docker-compose.yml` aponta para a mesma pasta de dados usada pela instalação atual. Não substitua nem apague o banco existente.
4. Na pasta do projeto, execute `docker compose up -d --build`.
5. Acesse `http://IP_DO_ZIMAOS:8080`.

## Lançamentos e posição importada — v30
- A aba Lançamentos agora separa o histórico em tabelas por classe: Ações, FIIs, ETFs, BDRs, internacionais, Stocks, REITs, Criptomoedas, Renda Fixa, Tesouro Direto, Fundos e Outros.
- O painel de posições importadas mostra os ativos agrupados por classe, com quantidade, preço médio/custo estimado, preço de referência e valor total na captura.
- Foi adicionada uma fotografia consolidada da carteira em 31/10/2026: 8 ações, 12 FIIs e 4 aplicações de renda fixa (24 ativos ativos no total). Ativos antigos ausentes da fotografia (como AURE3) deixam de compor a posição atual, mas seus lançamentos históricos permanecem salvos.
- A fotografia entra em uma tabela SQLite própria (`saldos_importados`) e não como compra fictícia. As 27 operações já existentes continuam no histórico original, sem duplicação. O lançamento agendado de MXRF11 permanece pendente e só afeta a posição quando for executado.
- A fotografia funciona como saldo-base: operações executadas depois de 31/10/2026 são aplicadas sobre ela; operações anteriores não são somadas novamente ao saldo atual.
- Em ações e FIIs, quantidade, preço médio e preço de referência foram transcritos da captura. Em renda fixa, o saldo atual foi transcrito; o custo foi reconstituído a partir da rentabilidade indicada na imagem e, por isso, deve ser tratado como estimativa.
- As imagens de histórico não foram convertidas em ordens individuais quando os dados de preço/data/quantidade não estavam suficientemente legíveis. Para evitar inventar negócios, a importação garante o saldo final consolidado e preserva os lançamentos que já estavam no banco.
- A fotografia é mantida em uma tabela própria e gerenciada pelo ciclo de vida descrito na seção v45; ela não é recriada depois de a carteira ser esvaziada.

## Correções do Resumo — v29
- Evolução do patrimônio no Resumo exibe valor aplicado em verde e ganho de capital em verde-claro; resultado negativo fica abaixo da linha zero, também em verde-claro.
- O ganho de capital atual é mostrado somente no mês de referência, sem distribuir valores estimados por meses sem cotações históricas próprias.
- Mini gráficos de rentabilidade passam a usar retornos mensais calculados a partir do histórico de preços retornado pela brapi, com compras/vendas tratadas como fluxos e proventos cadastrados considerados no mês.
- O indicador de 12 meses só exibe um percentual quando há 12 meses completos de dados; a linha mostra os meses que já estão disponíveis.
- A rosca do Resumo agrupa por classe em “Todos os tipos”; ao filtrar uma classe, divide por ativo e usa cores distintas.
- O histórico de preços é consultado em lote e armazenado em cache por 30 minutos para reduzir chamadas à API.
- O histórico da rentabilidade usa os endpoints atuais v2 da brapi para ações/ETFs/BDRs e FIIs, com fallback individual para o endpoint legado.
- A série usa `adjustedClose` quando toda a janela está ajustada; nesse caso, proventos já refletidos no preço ajustado não são somados novamente.
- Ativos sem histórico (por exemplo, produtos de renda fixa cadastrados manualmente ou ativos fora da cobertura do token/plano) não bloqueiam os demais. O painel informa a cobertura parcial e lista os tickers sem histórico.
- Respostas históricas vazias não ficam presas no cache por 30 minutos; após corrigir token ou cobertura, a próxima atualização pode buscar os dados novamente.

## Alterações desta versão
- O modo Venda lista os ativos separados pela categoria selecionada (Ações, FIIs, Renda Fixa, Tesouro Direto etc.).
- A validação do servidor também impede vender um ativo informando uma categoria diferente da categoria cadastrada.
- O modo Venda lista e aceita somente ativos com posição positiva na carteira.
- A quantidade de venda não pode ultrapassar o saldo disponível; a validação também é aplicada no servidor.
- Quantidade de ativos negociados em cotas/unidades inicia em 1, com incremento de uma unidade pelas setas do campo.
- Ao selecionar um ativo e obter sua cotação, o preço unitário é preenchido e o valor total é recalculado imediatamente.
- Lançamentos com data anterior à data atual são registrados como executados, sem agendamento para pregão futuro.
- Ativos da classe Renda Fixa (CDB, LCI, LCA e similares) são registrados imediatamente, sem depender do calendário ou horário da B3. Se a data informada for histórica, ela é preservada.
- Ícones de informação com dicas ao passar o mouse/focar nos cards de Patrimônio total, Destaques da carteira, Posições no lucro e Oportunidades de compra.
- Explicação da Rentabilidade Ponderada no card de Rentabilidade do Resumo, incluindo o tratamento de aportes/retiradas, dividendos e a atualização diária.
- Menu Opções por ativo com atalhos para lançamento, histórico, fundamentos no Investidor10, observações, edição de colunas e exclusão.
- Histórico individual de cada ativo em janela modal, com paginação, edição de quantidade/preço/data/custos e exclusão de lançamentos.
- Observações por ativo e por data, salvas no armazenamento local do navegador.
- Editor de colunas em grupos (dados básicos, dividendos, dados fundamentalistas e rebalanceamento), com preferências salvas no navegador e restauração do padrão.
- Colunas sem dados disponíveis na fonte aparecem como “—”; P/L, P/VP e preço-teto Bazin usam os dados já retornados pela cotação.
- A opção “Ver fundamentos” abre a página correspondente ao tipo do ativo no Investidor10.
- Rentabilidade: quando a fonte não retorna cotação, o sistema não interpreta o preço como R$ 0,00 nem registra perda fictícia de 100%. Mantém o custo como valor provisório, sinaliza a ausência de cotação e não apresenta preço atual inventado.
- Operações: registra compra/venda, data de registro, data/hora prevista de execução, status e campos específicos da classe.
- Calendário B3: operações informadas em fins de semana, feriados ou fora da sessão regular são agendadas para a próxima abertura prevista. O calendário considera feriados nacionais e datas móveis usuais da B3; a quarta-feira de cinzas tem abertura prevista às 13h.
- Um processo em segundo plano atualiza automaticamente o status de operações agendadas quando chega o horário previsto.
- Lançamentos específicos: Renda Fixa, Tesouro Direto, Fundos, investimentos internacionais/Stocks/REITs, Cripto e Outros exibem campos complementares próprios.
- Histórico de lançamentos mostra data/hora, classe, detalhes e status (agendada/executada).

## Importante sobre agendamento
O agendamento organiza a data de execução **dentro do Lonely Wallet**. Ele não envia ordens à corretora nem executa compras/vendas reais na B3. Para registrar uma operação histórica, selecione a data passada; ela será mantida como executada, sem ser empurrada para o próximo pregão.

## Configuração
- Configure `BRAPI_TOKEN` no `.env` para ampliar a cobertura de cotações e do histórico na brapi.dev. A cobertura depende do plano contratado e do tipo de ativo; o histórico dedicado de FIIs pode exigir o plano Pro.
- O banco SQLite fica em `./data/carteira.db` e permanece salvo ao recriar o container.
- Sem cotação, o valor de mercado fica provisoriamente igual ao custo de aquisição, com indicação explícita de que não há cotação disponível.
- O teto Bazin é uma estimativa simplificada e não deve ser tratado como recomendação de investimento.
- Não há integração bancária/corretora nem cálculo oficial de IR/DARF.

## Melhorias da versão 9
- Dashboard de Proventos inspirado nas referências: indicadores de patrimônio, lucro, proventos recebidos em 12 meses e rentabilidade; resumo, gráfico mensal/acumulado, histórico mensal e tabela de pagamentos.
- Pagamentos futuros anunciados pela fonte de cotação são exibidos como **A receber**, calculados pela taxa por cota e pela quantidade elegível na data-com, quando a fonte disponibiliza esses dados.
- Proventos já registrados manualmente permanecem como **Pago**; os dados manuais existentes são preservados.
- Posições passam a exibir P/VP, preço-teto Bazin e situação em relação ao teto.
- Nova tabela automática para posições com P/VP positivo abaixo de 1,5.
- A seção de proventos diferencia dados confirmados manualmente de estimativas futuras obtidas na fonte de cotações.


## Melhorias da versão 10
- Resumo reorganizado no estilo visual do Investidor10: patrimônio total, lucro total (ganho de capital + proventos), proventos recebidos em 12 meses e rentabilidade acumulada.
- Gráfico de evolução em barras e gráfico de distribuição da carteira por classe.
- Posições agrupadas por classe com valor total, variação diária, rentabilidade, participação atual e percentual ideal.
- Tabela de posições ampliada com quantidade, preços, saldo, proventos, P/L, P/VP, preço-teto Bazin e sinalização de compra abaixo do preço médio.
- Modal de oportunidades de compra ampliado para mostrar os mesmos indicadores e os percentuais da carteira.
- A seção de ativos com P/VP abaixo de 1,5 permanece disponível em Posições.
- A coluna Nota fica como “—” até que exista uma avaliação cadastrada; nenhum score é inventado.
- O gráfico histórico usa os aportes líquidos acumulados registrados, pois a aplicação ainda não armazena snapshots históricos do valor de mercado da carteira.


### v22
- Corrigido o ícone de informação para evitar sobreposição visual.
- Tickers de ativos negociados em bolsa abrem a página correspondente no Investidor10.
- Cartão Posições no lucro abre painel com alternância entre lucro e prejuízo e paginação.
- Venda de renda fixa apresenta seletor de investimentos já existentes na carteira, com saldo disponível.

### v23
- O botão Ver ativos recebeu animação de hover equivalente ao destaque do cartão Posições no lucro.
- Corrigido o ícone de informação duplicado/sobreposto nos indicadores do Resumo.
- Adicionados tooltips explicativos a Patrimônio total, Lucro total, Proventos recebidos (12M) e Rentabilidade.

### v24
- Padronizado o feedback de interação em todos os elementos clicáveis: botões, links, cartões acionáveis, linhas selecionáveis e cabeçalhos expansíveis.
- Ao passar o mouse, os elementos recebem elevação suave e realce; ao clicar, há uma resposta breve; foco por teclado fica destacado.
- Elementos desabilitados não recebem animação de clique.

### v25
- Adicionados logotipos/ícones dos ativos na coluna Ativo, com fallback visual quando a imagem não estiver disponível.
- Melhorada a busca de cotações: quando a consulta individual não traz preço, o sistema tenta localizar o ticker na lista de cotações da Brapi.
- Variação diária exibida em cápsula colorida com seta, mantendo o tooltip com o impacto financeiro.


## v26 — IRPF, DARFs e distribuição comparativa
- A aba **Distribuição** agora compara a participação atual de cada classe com o percentual desejado, incluindo valor atual, percentual ideal e diferença.
- A aba **IRPF** passou a organizar a carteira por ano-base: bens e direitos em 31/12, rendimentos isentos cadastrados, rendimentos sujeitos à tributação exclusiva e resultados estimados das vendas por mês, separados entre ativos comuns e FIIs/REITs.
- Rendimentos do IRPF podem ser cadastrados, editados, excluídos e exportados em CSV.
- A aba **DARFs** permite cadastrar, editar, excluir, filtrar por ano e situação, acompanhar vencimentos e registrar a data de pagamento. Os dados também podem ser exportados em CSV.
- O banco SQLite recebe automaticamente as tabelas `irpf_lancamentos` e `darfs`; as tabelas e registros já existentes são preservados.
- **Limite importante:** o módulo não apura imposto, não identifica day trade, não determina códigos de receita, não gera DARF oficial e não transmite declaração. Os resultados de vendas são estimativas baseadas no preço médio e nos lançamentos cadastrados. Confira os documentos e as regras aplicáveis antes de declarar ou pagar.

### Atualizar para v26 no ZimaOS
> Por segurança, este ZIP não inclui `data/carteira.db`; assim, a extração da atualização não sobrescreve o banco pessoal enviado com o projeto.
1. Pare o container e faça uma cópia de segurança do `data/carteira.db` que está em uso.
2. Extraia os arquivos da v26 sobre a pasta do projeto existente. Mantenha o `data/carteira.db` atual no mesmo caminho.
3. Confirme que `docker-compose.yml` mantém o volume `./data:/data` apontando para essa pasta de dados.
4. Execute `docker compose up -d --build` dentro da pasta do projeto.
5. A aplicação criará as duas tabelas novas na inicialização. Não apague nem substitua o arquivo `data/carteira.db`.

Para uma instalação em pasta nova, copie seu banco atual para `data/carteira.db` antes de iniciar o container. Sem um banco copiado, o SQLite iniciará uma carteira vazia.


## v45 estável + lançamentos manuais das capturas

Esta compilação mantém o código de interface e os gráficos da versão estável v45.
A única alteração funcional é uma migração idempotente que registra as operações
transcritas das capturas como compras/vendas individuais na tabela `operacoes`.

- Não cria posição-base artificial.
- Preserva operações já existentes e evita duplicá-las.
- Mantém linhas repetidas que aparecem separadamente nas capturas.
- Remove somente a posição-base artificial identificada pela origem da captura de 31/10/2026.
- As 3 quantidades de BTC são aproximadas porque a captura mostrava `<0,01`; isso fica anotado nos detalhes.
- Renda fixa usa quantidade 1 por lançamento e mantém os detalhes do produto.

A migração ocorre uma única vez na inicialização. Faça backup de `data/carteira.db` antes
de atualizar o container. Não apague a pasta `data`.


## v2.0.2 — instalação limpa

A aplicação não importa mais automaticamente operações de arquivos de captura nem inclui uma carteira de demonstração. Em uma instalação nova, o banco começa sem operações, posições e proventos cadastrados. Preferências de distribuição podem vir com valores padrão, mas não representam patrimônio.

No ZimaOS, a porta publicada é `8085` e a porta interna da aplicação é `8080`. Os dados persistentes ficam em `/DATA/AppData/lonely-wallet/data`.

**Atenção:** atualizar a imagem mantendo um banco persistente não apaga registros que já existam nesse banco. Faça backup antes de qualquer limpeza; para começar do zero, use um banco/pasta de dados vazios.


## v2.0.3 — Importação de movimentações B3

- O botão superior agora abre a importação de planilhas Excel (.xlsx) exportadas pela B3.
- A tela apresenta uma prévia com operações, proventos e duplicidades antes da confirmação.
- Compras/vendas de liquidação são gravadas em Lançamentos; dividendos, JCP e rendimentos em Proventos.
- A importação mantém uma chave por movimentação para evitar reimportação duplicada.
- Eventos sem preço/valor negociado ou sem classificação segura são ignorados, em vez de criar operações incorretas.
- A porta do ZimaOS é 8085 (host) → 8080 (container).

A importação não é automática: o usuário seleciona a planilha, confere a prévia e confirma a gravação.


## v2.0.4
- Correções visuais na aba Posições e exibição correta da contagem de oportunidades de compra.
- Ícone integrado à configuração do CasaOS e ao container Docker.

## v2.0.5 — Renda fixa por indexador
- Cálculo do saldo bruto de CDB, LCI, LCA e demais aplicações com base na data de cada aplicação e nos campos Indexador, Taxa e Forma salvos em `detalhes`.
- CDI e Selic usam séries diárias oficiais do SGS; IPCA e IGP-M usam variações mensais compostas; Prefixado usa taxa anual efetiva em base 252 dias úteis.
- Títulos híbridos acumulam o indexador e a taxa adicional informada.
- A categoria Renda Fixa não exibe mais a coluna Proventos Recebidos.
- Lançamentos antigos sem indexador/taxa não recebem rendimento estimado: precisam ter os dados contratuais preenchidos para cálculo correto.
- Rendimentos exibidos são brutos, sem estimativa de IR/IOF ou taxas do emissor.


## Padronização visual — v2.0.6
- Cards e gráficos com espaçamento, alinhamento e dimensões consistentes.
- Os quatro indicadores da aba Posições ficam em uma única linha em telas desktop largas; em telas menores há reorganização responsiva.
- Setas, percentuais e indicadores numéricos alinhados de forma uniforme.


## Lonely Wallet v2.0.39

- Os cards Patrimônio total, Destaques da carteira, Posições no lucro e Oportunidades de compra foram movidos para o Resumo, acima de Meus ativos.
- A página Posições foi removida; o acompanhamento da carteira fica concentrado no Resumo.
- Os controles de movimentação das classes agora ocupam uma coluna própria no cabeçalho, antes do ícone e do nome da classe, sem sobrepor os ativos ao expandir.
- A movimentação por setas continua disponível no Resumo e mantém os limites de primeira e última classe.
