# Lonely Wallet v4.1.9

## Objetivo desta versão
Versão de manutenção baseada no pacote v4.1.6 enviado pelo usuário. Preserva a estrutura da aplicação, os bancos existentes e o volume `/data`.

## Correções implementadas

### Segurança e autenticação
- O endpoint de desativação do PIN agora usa o mesmo limite de cinco tentativas e bloqueio temporário de cinco minutos do login.
- O contador de falhas e o bloqueio são compartilhados entre login e desativação do PIN.
- Requisições de alteração de estado com cabeçalho `Origin` de outra origem são rejeitadas, inclusive nos endpoints públicos de autenticação.
- A opção `SESSION_COOKIE_SECURE` permite exigir cookies Secure quando a aplicação estiver atrás de HTTPS. O padrão permanece desativado para compatibilidade com instalações que acessam diretamente por HTTP.
- A chave de sessão continua persistida no volume de dados.

### Integridade financeira
- Operações novas e editadas rejeitam `NaN`, infinito positivo e infinito negativo em quantidade, preço e custos.
- Lançamentos manuais de proventos rejeitam valores não finitos.
- A apuração de proventos recebidos agora inclui lançamentos manuais com data de pagamento não futura, além dos registros importados, preservando a deduplicação entre origens importadas. Lançamentos manuais distintos não são eliminados apenas por terem ticker, data e valor iguais.

### Backup consistente
- Incluído `scripts/backup.py`, que usa a API de backup do SQLite para copiar os bancos sem depender de copiar arquivos WAL manualmente.
- O script valida cada banco de destino com `PRAGMA integrity_check` e copia as chaves de criptografia/sessão quando presentes.
- Exemplo dentro do container: `python scripts/backup.py --destination /backup` (monte previamente um diretório de backup persistente em `/backup`).
- O script é manual; agendamento e retenção automática devem ser configurados no host para evitar consumo inesperado de disco.

### Operação e infraestrutura
- Adicionado endpoint `/api/health` para verificar a disponibilidade dos bancos.
- Adicionado healthcheck ao Docker Compose.
- Adicionada a opção Docker `no-new-privileges`.
- Atualizada a referência visual do ícone para v4.1.9.
- Removido `__pycache__` do pacote para evitar distribuir bytecode de outra versão do Python.
- Delimitada a faixa de versões de `cryptography` para evitar atualizações incompatíveis inesperadas.

## Compatibilidade e preservação
- Mantidos `ativos.db`, `tokens.db`, arquivos de chaves e demais dados no volume `/DATA/AppData/lonely-wallet/data:/data`.
- Não há migração destrutiva nem exclusão de registros.
- Não alterada a regra de preço médio ou a metodologia de rentabilidade: essas regras precisam de decisão contábil explícita e testes com extratos reais antes de qualquer mudança.
- Não foi implementado nesta versão um limitador global de cotas para todos os provedores externos; os mecanismos de cache/timeouts já existentes foram preservados.
- A reconciliação de snapshots da Pluggy/B3 não foi reescrita nesta manutenção para evitar risco de exclusão ou duplicação de dados históricos.

## Atualização no ZimaOS
1. Faça backup da pasta `/DATA/AppData/lonely-wallet/data` antes de atualizar.
2. Substitua os arquivos do projeto pelos arquivos deste pacote.
3. Preserve o volume `/DATA/AppData/lonely-wallet/data:/data`.
4. Execute `docker compose up -d --build`.
5. Confirme que o container fica `healthy` e acesse `/api/health`.
6. Teste login, desativação do PIN, compra/venda, importação B3/Pluggy e gráficos de proventos.

### HTTPS
Se utilizar proxy reverso com HTTPS, configure `SESSION_COOKIE_SECURE: "true"` no ambiente do serviço. Não habilite essa opção se continuar acessando a aplicação diretamente por HTTP, pois o navegador não enviará o cookie Secure nessa conexão.

## Testes
- Testes de regressão incluídos em `tests/test_regressions.py`.
- Compilação Python, sintaxe JavaScript, testes de regressão, validação do Compose e integridade do ZIP devem ser executados antes da publicação.
- Integrações externas e cálculos com dados reais dependem de validação no ambiente do usuário; não são certificados apenas por testes locais.

## Release notes
- Consulte as notas de lançamento desta versão na seção acima. Não é necessário adicionar um arquivo separado de release notes ao ZIP.

## v4.1.9

- Removido o atalho redundante de Segurança da conta ao lado do botão de privacidade.
- Acesso à segurança mantido exclusivamente pela aba Segurança na navegação principal.
- Removida a função JavaScript que atendia somente ao atalho removido.
- Verificadas sintaxe Python, sintaxe JavaScript inline e leitura do Docker Compose.


## v4.1.9 · Interface, diagnóstico e cotação

- Padronizados os elementos visuais dos ícones de navegação.
- Melhorada a navegação horizontal e os controles da página Segurança em telas pequenas.
- A página APIs diferencia a última consulta de cotação da alteração da credencial; a data só aparece quando há registro no cache desta sessão.
- Adicionada a página Diagnóstico com verificações rápidas dos bancos SQLite e visão do cache local de cotações.
- Adicionada indicação de cotação possivelmente desatualizada após 15 minutos, sem afirmar que a fonte externa está indisponível.
- O diagnóstico é somente leitura e não força chamadas externas.

### Limitações do diagnóstico

As datas de consulta de cotação e o cache são mantidos em memória. Reiniciar o container limpa esse histórico de sessão. A ausência de registro não significa falha da API. O diagnóstico executa `PRAGMA quick_check` nos bancos e não substitui um backup.
