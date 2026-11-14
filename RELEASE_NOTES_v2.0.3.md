# Lonely Wallet v2.0.3

## Novidades
- O botão superior `＋ Lançamento` foi substituído por `Importar B3`.
- Importação de planilhas Excel (.xlsx) exportadas pela B3.
- Prévia antes da gravação, com contagem de operações, proventos e duplicidades.
- Compras e vendas de liquidação são adicionadas em Lançamentos.
- Dividendos, JCP e rendimentos são adicionados em Proventos.
- Controle de importação por linha da planilha para evitar reimportações duplicadas, preservando linhas distintas mesmo quando têm os mesmos valores.
- Eventos que não representam uma operação ou provento com valor identificável são ignorados.

## Docker / ZimaOS
- Porta publicada: `8085`
- Porta interna: `8080`
- Persistência: `/DATA/AppData/lonely-wallet/data:/data`
- Limites: 4 GB RAM e 1 CPU

## Observações
- A importação é manual: selecionar arquivo, analisar a prévia e confirmar.
- A versão mantém a instalação limpa, sem importar dados de demonstração automaticamente.
- Faça backup do banco antes de atualizar a instalação existente.
