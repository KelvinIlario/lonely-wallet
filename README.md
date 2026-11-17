# Lonely Wallet v4.1.6

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


## v4.1.6

### Correção da transição após autenticação
- Corrigida a exibição rápida dos títulos “Minhas observações”, “Lançamentos do ativo” e “Editar colunas” após inserir o PIN.
- Os três modais foram movidos para dentro do `<body>`, evitando que o navegador renderize seu conteúdo antes da aplicação dos estilos.
- Os modais continuam disponíveis normalmente quando acionados dentro da carteira.
- Nenhuma alteração na autenticação, no PIN, nos bancos de dados ou nos dados persistidos.

### Atualização
- Preserve o volume `/DATA/AppData/lonely-wallet/data:/data`.
- Faça backup da pasta de dados antes de atualizar.
- Reconstrua a imagem com `docker compose up -d --build`.
