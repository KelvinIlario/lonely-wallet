# Lonely Wallet v2.0.45

## Atualização automática da interface

- Toda chamada de API concluída com sucesso usando `POST`, `PUT`, `PATCH` ou `DELETE` agora agenda a atualização do dashboard.
- A atualização busca novamente os dados consolidados e redesenha cards, posições, gráficos, tabelas, proventos, lançamentos e metas sem exigir recarga manual do navegador.
- Várias alterações feitas em sequência são agrupadas em uma única atualização automática.
- Chamadas explícitas a `refresh()` reaproveitam uma atualização em andamento e cancelam a atualização agendada, evitando consultas duplicadas desnecessárias.
- Exclusão de lançamentos e metas agora aguarda a atualização da tela e apresenta confirmação visual.
- A sincronização de proventos e as demais operações que já atualizavam a tela continuam funcionando.

## Compatibilidade e preservação

- Base: Lonely Wallet v2.0.44.
- Não altera o esquema do banco SQLite nem apaga registros.
- Preserve `/DATA/AppData/lonely-wallet/data:/data` ao atualizar.
- Mantidos container `lonely-wallet`, porta externa `8085` → interna `8080`, fuso `America/Sao_Paulo`, limite de 4 GB e 1 CPU.
- Mantidos logotipo, ícone, favicon, importação B3 e demais funcionalidades existentes.

## Atualização no ZimaOS

1. Faça backup de `/DATA/AppData/lonely-wallet/data/carteira.db`.
2. Extraia os arquivos do ZIP.
3. Preserve a pasta `/DATA/AppData/lonely-wallet/data` e o banco existente.
4. Na pasta do projeto, execute `docker compose up -d --build`.
5. Abra o Lonely Wallet e teste adicionar/editar/excluir lançamentos, criar/excluir metas e registrar proventos. A interface deve refletir as alterações automaticamente.

## Validação realizada

- Sintaxe Python validada com `py_compile`.
- Sintaxe do JavaScript inline validada com Node.js.
- Integridade do ZIP e presença dos arquivos principais verificadas.
- A execução completa do container e a validação com o banco real do usuário dependem do ambiente ZimaOS.
