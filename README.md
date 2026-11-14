# Lonely Wallet v1.4.0

Painel pessoal de investimentos com navegação por Resumo, Posições, Proventos, Patrimônio, Rentabilidade e Lançamentos. Interface escura, opção de tema claro, ocultação de valores, cadastro manual e importação Excel da B3.

## Executar
`docker compose up -d`

Preserve o volume `/DATA/AppData/lonely-wallet/data:/data` ao atualizar. Não apague a pasta de dados.

## Limitações importantes
A interface organiza os dados existentes; a base atual não armazena snapshots históricos de patrimônio, quantidades na data-com ou séries de CDI/IPCA/Ibovespa. Portanto, não apresenta esses históricos como se fossem reais. A distribuição é indicativa por quantidade de ativos e as séries de capital são derivadas de operações, não de valor de mercado histórico.


## v1.7.0
- Navegação com sete áreas: Resumo, Posições, Proventos, Patrimônio, Rentabilidade, Lançamentos e Metas.
- Importador do extrato de Movimentação da B3 preserva todos os registros, incluindo instituição, transferências, rendimentos, JCP, direitos e atualizações.
- Importação idempotente: linhas já importadas não são duplicadas.
- Apenas movimentos explicitamente identificados como COMPRA / VENDA geram operações que alteram posições. Demais eventos ficam preservados no histórico B3, sem conversão presumida em compra/venda.
- Metas com cadastro, progresso e exclusão.
