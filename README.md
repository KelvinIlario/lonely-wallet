# Lonely Wallet v3.0.2

Aplicação Flask + SQLite para controle pessoal de investimentos, posições, rentabilidade e proventos.

## Instalação

- Preserve o volume persistente `/DATA/AppData/lonely-wallet/data` configurado no `docker-compose.yml`.
- Não exclua o banco SQLite nem o arquivo `.api-credentials.key`, pois eles armazenam os dados da carteira e a chave local usada para criptografar credenciais.
- A aplicação é publicada na porta `8085` do host.
- Configure os tokens dos provedores na aba **APIs**. A cobertura depende do plano e do suporte de cada endpoint ao ticker.

## Integridade dos dados

- A sincronização de proventos usa uma chave de evento e uma deduplicação adicional por ticker, data de pagamento e valor total.
- A integração complementar Alpha Vantage depende de token configurado e da cobertura do endpoint `DIVIDENDS` para o ticker.
- Fontes que não oferecem datas de pagamento confiáveis não são tratadas como confirmação de provento recebido ou futuro.


## v2.0.74

- Corrige o gráfico de rentabilidade para exibir a série histórica mensal da carteira quando "Todos os tipos" estiver selecionado.
- Permite exibir as séries dos índices selecionados junto à carteira, sem exigir a seleção de uma classe específica.
- Resume o status da sincronização de proventos na tela principal.
- Move erros e avisos detalhados dos provedores para uma seção técnica expansível, sem expor uma longa mensagem na página.


## v2.0.77
- Integração pessoal MeuPluggy com cadastro local de itemIds, sincronização de contas, investimentos e transações.
- Conciliação de compras/vendas de investimentos com lançamentos manuais e B3.
- Proteção contra duplicidade de proventos por origem, ticker, data e valor.


## v3.0.1
- Separa visualmente a Pluggy em uma área própria de Open Finance, fora das APIs de mercado e indicadores.
- Exibe diagnóstico resumido das conexões Pluggy: dados recebidos, sincronização sem dados ou aguardando primeira sincronização.
- A curva de rentabilidade histórica passa a ser exibida quando houver meses calculáveis, mesmo com cobertura parcial, com aviso explícito e identificação dos ativos sem histórico.
- Mantém o retorno consolidado atual separado da curva histórica parcial.


## v3.0.2
- O gráfico de rentabilidade em “Todos os tipos” agora usa o mesmo retorno consolidado atual exibido no Resumo, evitando comparar a carteira inteira com uma curva histórica parcial de apenas alguns ativos.
- A comparação com índices fica desativada no modo consolidado enquanto não houver histórico completo; por classe, a série histórica e a comparação permanecem disponíveis.
- O card Pluggy ocupa toda a largura disponível na seção Open Finance.
- O diagnóstico distingue item cadastrado ainda não sincronizado de sincronização executada sem dados.
- Exibe também a quantidade de movimentações de investimento, separada das transações bancárias.
- A sincronização sem dados deixa de apresentar mensagem de sucesso genérica e informa que a API não retornou registros.
