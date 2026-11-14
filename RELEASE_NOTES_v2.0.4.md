# Lonely Wallet v2.0.4

## Correções
- Corrigido o card "Oportunidades de compra", que exibia `[object Object]`; agora mostra a quantidade correta de ativos.
- Reorganizados os cards da aba Posições: Patrimônio total, Destaques da carteira e Posições no lucro ficam centralizados em três colunas.
- O card Oportunidades de compra fica centralizado abaixo dos três cards principais.
- Ícone do Lonely Wallet configurado no manifesto do CasaOS e no label do container Docker.

## Instalação no ZimaOS
- Imagem: `lonker/lonely-wallet:latest`
- Porta: `8085`
- Dados persistentes: `/DATA/AppData/lonely-wallet/data:/data`
- O arquivo `docker-compose.yml` usa a imagem publicada. Para que as alterações apareçam, a imagem `lonker/lonely-wallet:latest` precisa ser reconstruída e enviada ao Docker Hub.
