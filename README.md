# Lonely Wallet v1.3.0

## O que mudou
- Navegação separada: Resumo, Posições, Proventos, Patrimônio, Rentabilidade e Lançamentos.
- Tema escuro padrão e alternância para tema claro.
- Controle para ocultar/revelar valores financeiros.
- Gráficos de alocação e evolução do capital líquido aplicado.
- Tabelas de posições, proventos e lançamentos.
- Cadastro manual de operações e importação de extratos `.xlsx` da B3 na página Lançamentos.
- Importação evita duplicar operações idênticas.
- API de saúde em `/api/health`.

## Instalação no ZimaOS
Mantenha a porta `8085:8085`, `DATA_DIR=/data` e o volume persistente:
`/DATA/AppData/lonely-wallet/data:/data`.

Imagem: `lonker/lonely-wallet:latest`.

Não apague o volume de dados durante atualizações. O compose incluído não define BRAPI_TOKEN; configure-o no ZimaOS caso já utilize esse token.

## Limitações importantes
- A série de patrimônio mostra capital líquido aplicado calculado pelas operações; não é uma série histórica de valor de mercado, pois o banco atual não guarda cotações históricas.
- Rentabilidade é calculada com preço atual e custo médio das posições. Comparações com CDI/IPCA/IBOV não são exibidas sem séries históricas.
- Proventos projetados usam a quantidade atual como estimativa e não reconstroem a posição na data-com.
- O arquivo Excel de exemplo anexado nesta conversa contém apenas a célula/cabeçalho “Entrada/Saída”, sem linhas de operações. Para testar importação, use o extrato de negociação da B3 com linhas e colunas de data, tipo, código, quantidade e preço.

## Validação
- Sintaxe Python validada.
- Sintaxe JavaScript validada com `node --check`.
- Não foi realizado teste end-to-end no servidor ZimaOS nem validação com o banco de produção.
