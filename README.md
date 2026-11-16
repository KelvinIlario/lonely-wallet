# Lonely Wallet v2.0.56

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

## Correções da versão 2.0.56

- A legenda permite ocultar e reexibir também a linha **Rentabilidade**.
- CDI continua vindo do SGS 12 do Banco Central; IPCA usa SGS 433 e conferência independente pelo SIDRA/IBGE quando disponível.
- A competência atual do IPCA não é preenchida antes da divulgação oficial.
- Adicionada integração opcional **Dados B3** para séries de retorno total de IBOV, IFIX, SMLL e IDIV. Sem chave, a fonte pode devolver apenas 30 pregões; com a chave gratuita, a série completa fica disponível conforme a cota do provedor.
- HG Brasil, brapi e Yahoo Finance permanecem como fontes alternativas, com a fonte escolhida e a última competência expostas ao usuário. Não se faz média entre séries de metodologias diferentes.
- Os cards de último mês e últimos 12 meses passam a usar meses fechados; os 12 meses são compostos a partir dos retornos mensais.
- A comparação com índices usa um mês anterior de referência quando disponível e não apresenta comparação sem base suficiente.
- Corrigida a invalidação do cache de benchmarks ao salvar ou remover credenciais.


## v2.0.57

- Atualizado o favicon exibido na aba do navegador com o novo ícone Lonely Wallet.
- Atualizado o ícone do aplicativo no catálogo/launcher do CasaOS e ZimaOS.
- URLs dos ícones versionadas para evitar que o navegador e o launcher reutilizem a imagem antiga em cache.
