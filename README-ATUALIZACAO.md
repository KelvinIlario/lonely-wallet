# Lonely Wallet 1.1 — atualização de interface e importação B3

## O que mudou
- Dashboard responsiva com navegação lateral, cartões de resumo e lista de ativos.
- Importador passa a reconhecer o extrato B3 com as colunas Entrada/Saída, Data, Movimentação, Produto, Instituição, Quantidade, Preço unitário e Valor da Operação.
- Todos os eventos são preservados na tabela `importacoes_b3` com hash único para evitar duplicação do mesmo registro.
- Rendimentos, dividendos e JCP identificados são registrados na tabela de proventos.
- Transferências, subscrições, atualizações e eventos ambíguos ficam no histórico para conferência. Eles NÃO alteram automaticamente posição/preço médio, pois crédito/débito por si só não prova compra/venda.
- Mantida a rota `/api/importar` e a estrutura do banco existente. O banco é ampliado automaticamente sem apagar tabelas antigas.

## Atualização
1. Faça backup da pasta persistente `/DATA/AppData/lonely-wallet/data`.
2. Substitua os arquivos do repositório pelos arquivos desta pasta.
3. Faça commit e push para `main`.
4. Aguarde o GitHub Actions publicar `lonker/lonely-wallet:latest`.
5. No ZimaOS, atualize/recrie o container usando a mesma imagem e mantenha a mesma montagem de volume e o mesmo `BRAPI_TOKEN`.
6. Não apague a pasta de dados.

## Observação importante sobre o extrato de exemplo
O arquivo analisado contém 239 registros. O importador identificou 75 proventos (rendimentos, dividendos e JCP), 137 transferências que precisam ser conferidas, 14 eventos de subscrição, 12 atualizações e 1 evento rotulado como COMPRA / VENDA. Para evitar alterar seu patrimônio de forma incorreta, transferências não são convertidas automaticamente em compras/vendas nesta versão. Todos os registros ficam preservados e deduplicados para uma próxima etapa de conciliação/revisão.

## Segurança dos dados
O importador não apaga operações existentes e não transforma transferências ambíguas em negociações. Antes de usar em produção, faça backup do SQLite. O extrato deve ser exportado em `.xlsx`.
