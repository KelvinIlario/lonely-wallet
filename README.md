# Lonely Wallet v1.4.0

Painel pessoal de investimentos com navegação por Resumo, Posições, Proventos, Patrimônio, Rentabilidade e Lançamentos. Interface escura, opção de tema claro, ocultação de valores, cadastro manual e importação Excel da B3.

## Executar
`docker compose up -d`

Preserve o volume `/DATA/AppData/lonely-wallet/data:/data` ao atualizar. Não apague a pasta de dados.

## Limitações importantes
A interface organiza os dados existentes; a base atual não armazena snapshots históricos de patrimônio, quantidades na data-com ou séries de CDI/IPCA/Ibovespa. Portanto, não apresenta esses históricos como se fossem reais. A distribuição é indicativa por quantidade de ativos e as séries de capital são derivadas de operações, não de valor de mercado histórico.


## v1.5.0
- Botão Importar B3 no cabeçalho, ao lado de Adicionar lançamento.
- Importador `.xlsx` com reconhecimento de variações comuns dos títulos de coluna da B3.
- Proteção contra reimportação de operações idênticas.
- Resumo da importação informa operações novas, duplicadas e linhas ignoradas.
- Ajustes na apresentação de rentabilidade e ocultação de valores.
- Mantidas somente as seis páginas da carteira.
