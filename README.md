# Lonely Wallet v2.0.76

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
