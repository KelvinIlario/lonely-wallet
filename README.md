# Lonely Wallet v1.2.0

Atualização da interface e da navegação, preservando o banco SQLite existente.

## O que mudou
- Dashboard com indicadores de patrimônio, lucro, proventos dos últimos 12 meses e rentabilidade.
- Filtro por classe de ativo que atualiza indicadores, lista e gráficos.
- Filtro de período: desde o início, 30 dias, 12 meses, 2, 5 e 10 anos.
- Gráfico de distribuição por classe e gráfico de evolução do capital aplicado.
- Páginas separadas: Dashboard, Carteira, Movimentações e Proventos.
- API de consulta de proventos e histórico.

## Importante sobre os gráficos
O banco atual guarda operações, não cotações históricas diárias/mensais. Por isso, o gráfico de evolução mostra **capital aplicado líquido acumulado**, e não valor de mercado histórico. A rentabilidade do cartão é calculada com preço atual disponível e custo das posições. Para mostrar rentabilidade histórica real, será necessário armazenar cotações históricas daqui para frente ou obter uma fonte histórica confiável.

O total de proventos em 12 meses usa os registros de proventos existentes e a posição atual como estimativa. Para apuração exata por data de pagamento, será necessário registrar a quantidade detida na data-com/pagamento.

## Atualização no ZimaOS
1. Mantenha o volume atual: `/DATA/AppData/lonely-wallet/data:/data`.
2. Mantenha `DATA_DIR=/data`, a porta `8085:8085` e as demais variáveis atuais.
3. Atualize a imagem para `lonker/lonely-wallet:latest`.
4. Não remova nem recrie a pasta `/data`.
5. Após subir o container, abra o app e confira Dashboard, Carteira, Movimentações e Proventos.

## Dados
A inicialização usa `CREATE TABLE IF NOT EXISTS`; não apaga nem recria as tabelas existentes. Esta versão não executa importação automática nem limpa operações existentes.
