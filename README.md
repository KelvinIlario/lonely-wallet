# Lonely Wallet — interface redesenhada

Interface reorganizada para seguir a estrutura visual das referências fornecidas do Investidor10: barra superior, navegação horizontal, cartões de indicadores, painéis, tabelas e seis páginas (Resumo, Posições, Proventos, Patrimônio, Rentabilidade e Lançamentos).

## Atualização no ZimaOS
Faça backup da pasta persistente de dados antes de atualizar. Mantenha o volume `/DATA/AppData/lonely-wallet/data:/data`, a porta publicada e as variáveis de ambiente do seu Compose. Atualize a imagem somente depois que a tag correspondente estiver publicada no registry.

## Limitações atuais
- A interface é uma implementação própria inspirada nas referências, não uma cópia do código ou dos serviços do Investidor10.
- Os gráficos usam somente os lançamentos e posições disponíveis na base; não inventam séries históricas ou benchmarks.
- O importador B3 permanece no backend existente; teste com uma cópia da planilha antes de importar em produção.
- A aplicação não foi executada no ZimaOS neste ambiente. Valide a versão em uma cópia/backup antes de substituir a instalação em uso.
