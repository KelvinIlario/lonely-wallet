# Lonely Wallet v3.0.3

Aplicativo pessoal para acompanhamento de carteira de investimentos.

## Destaques da versão 3.0.3

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
