# Lonely Wallet v1.1.0 — pacote corrigido

## O que mudou
- Navegação real entre Dashboard, Carteira, Movimentações, Proventos e Importar B3.
- Importador para o layout da B3 com as colunas `Entrada/Saída`, `Data`, `Movimentação`, `Produto`, `Quantidade`, `Preço unitário` e `Valor da Operação`.
- Compras/vendas de `Transferência - Liquidação` entram na posição; rendimentos, dividendos e JCP vão para Proventos; eventos sem efeito de posição ficam no histórico.
- Identificação de importações repetidas para evitar duplicidade.
- Migrações SQLite aditivas; as tabelas existentes não são apagadas.
- GitHub Actions publica `latest`, a tag da Release e uma tag SHA.

## Atualização segura
1. Faça backup da pasta de dados do container (`/data`, que no host é o volume mapeado no ZimaOS).
2. Substitua os arquivos do repositório pelos deste ZIP e faça commit na `main`.
3. Aguarde o GitHub Actions terminar com sucesso.
4. Crie a Release `v1.1.0`; o workflow publica também a tag `v1.1.0`.
5. No ZimaOS, atualize/recrie o container usando `lonker/lonely-wallet:latest`, mantendo exatamente o mesmo volume persistente e as variáveis atuais.
6. Abra o app e teste primeiro a navegação. Faça a importação do extrato apenas uma vez; o importador evita duplicar as linhas se o mesmo arquivo for enviado novamente.

**Importante:** não remova nem recrie a pasta de dados. A aplicação não apaga o banco, mas um backup é indispensável antes de atualizar.
