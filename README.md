# Lonely Wallet v4.2.0

## Objetivo
Versão de estabilidade baseada no pacote v4.1.10. Prioriza integridade de operações importadas, saldos-base, cálculo fiscal, validação financeira e segurança das ações destrutivas. Mantém a interface e o volume persistente `/DATA/AppData/lonely-wallet/data:/data`.

## Correções incluídas

### Importação B3
- Removida a deduplicação aproximada por janela de três dias, que podia confundir execuções parciais e aportes legítimos com duplicatas.
- A comparação semântica agora exige ticker, tipo, lado, data, quantidade e preço correspondentes.
- A lista de linhas novas é calculada antes de inserir o lote; as linhas do mesmo arquivo não são comparadas contra inserções feitas minutos antes no próprio lote.
- O fingerprint exato da linha continua sendo usado para reconhecer a reimportação do mesmo arquivo.

### Validação financeira
- `NaN`, `Infinity` e `-Infinity` são rejeitados em proventos, metas, rendimentos IRPF, DARFs e operações.
- Limite de upload HTTP definido em 16 MiB para reduzir risco de esgotamento de memória durante importações.

### Saldos-base, vendas e IRPF
- A validação de vendas reconhece ativos existentes em saldos importados e snapshots de posição Pluggy, mesmo sem compra local registrada.
- Vendas históricas são validadas contra a posição disponível na data informada, em vez de usar apenas a posição atual.
- O resumo IRPF passa a inicializar/redefinir a posição com snapshots de saldo-base, incluindo ativos sem compras locais, e calcula o resultado das vendas posteriores ao saldo-base.
- O custo fiscal do IRPF considera custos informados nas compras e deduz proporcionalmente o custo nas vendas. A posição operacional continua seguindo a regra de preço médio existente, que não incorpora custos. Esta distinção deve ser conferida com documentos fiscais antes de usar o resumo para declaração.

### Segurança e exclusões
- Valores de ticker e itemId não são mais interpolados diretamente em literais JavaScript inline nos pontos corrigidos; handlers usam argumentos escapados ou atributos `data-*`.
- Mensagens do teste de conexão de provedores externos deixaram de devolver exceções HTTP brutas, evitando expor URLs com parâmetros de API.
- Bloqueio de tentativas do PIN passou a ser isolado por endereço IP, reduzindo a possibilidade de uma origem da rede local bloquear todos os demais usuários. Contadores de tentativas expiram após 15 minutos de inatividade.
- Exclusões em massa exigem confirmação explícita no endpoint e criam backup consistente dos bancos SQLite antes de apagar dados.
- Adicionados cabeçalhos HTTP básicos: `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options` e `Permissions-Policy`.
- O agendador fecha conexões SQLite também em caso de exceção.

### Operação e empacotamento
- `/api/health` lê a versão diretamente do arquivo `VERSION`.
- `scripts/backup.py` agora é copiado para a imagem Docker.
- O backup de chaves de criptografia/sessão é opcional (`--include-keys`); por padrão, as chaves não são copiadas junto com os bancos. Sem a chave original, credenciais criptografadas não poderão ser recuperadas a partir do backup.
- Dependências atualizadas para `requests 2.32.5` e `gunicorn 23.0.0`.
- Adicionado `.dockerignore` para excluir bancos, segredos, bytecode e arquivos locais do contexto de build.

## Limitações conhecidas que permanecem
- O container continua executando como root para manter compatibilidade com bind mounts existentes do ZimaOS. A migração para usuário não-root exige ajustar a propriedade/permissões da pasta `/DATA/AppData/lonely-wallet/data` no host antes da atualização.
- Chart.js ainda é carregado por CDN. A interface de gráficos depende de acesso ao jsDelivr; empacotar a biblioteca localmente e aplicar CSP estrita exige uma etapa específica de frontend, pois a interface atual ainda utiliza handlers inline.
- Não foi aplicada CSP estrita nesta versão para não quebrar os handlers inline existentes.
- A reconciliação completa de snapshots B3/Pluggy e a metodologia contábil de rentabilidade/benchmark precisam de testes com extratos reais adicionais.
- Backups preventivos de exclusões são armazenados em `/data/backups/pre-exclusao-*`; estabeleça política de retenção e espaço em disco no host.

## Testes
A suíte `tests/test_regressions.py` inclui cenários para PIN, origem cruzada, valores não finitos, ativo existente apenas no saldo-base, deduplicação B3 por data e venda de ativo do saldo-base no IRPF.

Para executar em ambiente Python 3.12 com dependências instaladas:

```bash
python -m unittest discover -s tests -v
python -m py_compile app/main.py scripts/backup.py
```

A execução completa de testes funcionais e de integração com APIs depende do ambiente Docker/ZimaOS e de cópias de bancos/planilhas representativas.

## Atualização no ZimaOS
1. Faça backup de `/DATA/AppData/lonely-wallet/data` antes de atualizar.
2. Extraia o pacote v4.2.0.
3. Preserve o volume `/DATA/AppData/lonely-wallet/data:/data`.
4. Execute `docker compose up -d --build`.
5. Confira `http://IP_DO_SERVIDOR:8085/api/health` e confirme `version: 4.2.0`.
6. Teste login, compra/venda, venda retroativa, importação B3 com execuções parciais, proventos, IRPF e DARFs.

### Backup manual
Monte um destino persistente em `/backup` e execute:

```bash
python scripts/backup.py --destination /backup
```

Por padrão, o backup não inclui chaves. Se precisar transportar também as credenciais criptografadas, use `--include-keys` somente para um destino criptografado, com controle de acesso restrito e armazenado separadamente dos backups comuns.
