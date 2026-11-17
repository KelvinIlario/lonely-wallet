# Lonely Wallet v4.1.5

## Ajustes de acesso
- A tela de acesso pré-carrega recursos visuais (logotipo e biblioteca de gráficos) enquanto o PIN é digitado.
- Opção para continuar sem PIN na configuração inicial.
- Opção para desativar o PIN posteriormente, mediante confirmação do PIN atual.
- A proteção pode ser reativada configurando um PIN novamente quando estiver desativada.
- A tela recomenda manter o PIN para proteger a carteira.
- O carregamento dos dados privados da carteira ocorre após a autenticação; os dados não são expostos antes do PIN.

## Persistência
- A configuração de PIN é armazenada em `tokens.db`.
- A migração adiciona a coluna `enabled` sem apagar a configuração existente.
- Os bancos e credenciais existentes permanecem no volume `/data`.

## Atualização
- Manter o volume `/DATA/AppData/lonely-wallet/data:/data`.
- Fazer backup da pasta de dados antes da atualização.


## v4.1.5

- Ajustes visuais da página Segurança para ocupar a largura disponível.
- Botões e campos da página Segurança padronizados com o tema Lonely Wallet.
- Cor de fundo crítica definida desde o início do carregamento para evitar flash branco na transição após autenticação.
