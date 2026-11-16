# Lonely Wallet v2.0.73

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
