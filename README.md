# Lonely Wallet v2.0.55

Aplicação Flask + SQLite para controle pessoal de investimentos, preparada para Docker/ZimaOS.

## Atualização desta versão

- Ajuste responsivo do gráfico de rentabilidade para ocupar a área útil do card.
- Padronização visual dos filtros da página Rentabilidade.
- Nova página **APIs**, ao lado de Metas, com catálogo de provedores, cadastro, teste e remoção de tokens.
- Tokens de integração armazenados criptografados no volume persistente (`/data/.api-credentials.key` e banco SQLite).
- Brapi e HG Brasil podem fornecer séries históricas adicionais de índices quando a chave e o plano cobrirem o endpoint.
- CDI e IPCA continuam consultados nas séries oficiais do Banco Central.

## Instalação

Preserve o volume persistente configurado em `docker-compose.yml`. Não exclua `/DATA/AppData/lonely-wallet/data`, pois ele contém o banco e a chave local de criptografia das credenciais.
