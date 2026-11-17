# Lonely Wallet

**Carteira pessoal de investimentos | Self-hosted | Docker / ZimaOS**

> Acompanhe posições, operações, proventos e informações da sua carteira em uma interface web pessoal, hospedada no seu próprio servidor.

- **Versão documentada:** 4.1.1
- **Idioma da interface:** Português (Brasil)
- **Backend:** Python + Flask
- **Persistência:** SQLite
- **Execução:** Docker / Docker Compose
- **Porta padrão:** `8085` no host, `8080` no container

---

## Sumário

1. [Visão geral](#visão-geral)
2. [Funcionalidades](#funcionalidades)
3. [Arquitetura](#arquitetura)
4. [Requisitos](#requisitos)
5. [Instalação com Docker Compose](#instalação-com-docker-compose)
6. [Instalação no ZimaOS](#instalação-no-zimaos)
7. [Persistência e estrutura de dados](#persistência-e-estrutura-de-dados)
8. [Configuração](#configuração)
9. [Autenticação por PIN](#autenticação-por-pin)
10. [Atualização](#atualização)
11. [Backup e restauração](#backup-e-restauração)
12. [Integrações e fontes externas](#integrações-e-fontes-externas)
13. [Aplicativo Android e iOS](#aplicativo-android-e-ios)
14. [Publicação no catálogo do ZimaOS](#publicação-no-catálogo-do-zimaos)
15. [Desenvolvimento](#desenvolvimento)
16. [Diagnóstico](#diagnóstico)
17. [Segurança e limitações](#segurança-e-limitações)
18. [Licença e créditos](#licença-e-créditos)

---

## Visão geral

O Lonely Wallet é uma aplicação pessoal para organizar e acompanhar investimentos. A aplicação é executada em um servidor próprio e acessada pelo navegador por meio da rede local ou de uma conexão remota configurada pelo administrador.

A instalação Docker mantém a aplicação e os dados separados: o código roda no container e os bancos e arquivos persistentes ficam no diretório montado em `/data`.

O projeto não deve ser tratado como corretora, custodiante, banco, consultoria ou recomendação de investimento. Os dados exibidos dependem dos lançamentos cadastrados e da disponibilidade, cobertura e regras das fontes externas utilizadas.

## Funcionalidades

O pacote 4.1.1 contém as seguintes áreas e recursos identificados no código:

- Dashboard da carteira e consulta de posições.
- Cadastro, edição, consulta e exclusão de operações.
- Consulta de ativos e cotações por ticker.
- Área de proventos e sincronização de informações.
- Importação de operações a partir de planilhas B3.
- Histórico de lotes de importação B3 e gerenciamento dos lotes.
- Integração Pluggy: configurações, itens, estado e sincronização.
- Gerenciamento de integrações externas.
- Metas de investimento.
- Distribuição da carteira.
- Benchmarks e resumo de carteira.
- Área de informações para Imposto de Renda.
- Gerenciamento de DARFs.
- Exportação de operações.
- Autenticação opcional por PIN, com opção de continuar sem PIN.
- Armazenamento de dados em bancos SQLite persistentes.

A disponibilidade de cotações, proventos, benchmarks e dados de integrações pode variar conforme o provedor, o ativo e os limites de cada serviço.

## Arquitetura

```text
Navegador / futuro aplicativo móvel
             |
             | HTTP(S)
             v
      Flask + Gunicorn
       container :8080
             |
       +-----+------+
       |            |
       v            v
   ativos.db     tokens.db
   carteira      integrações,
   operações     configurações
       |
       v
   volume persistente /data
```

### Tecnologias identificadas

| Camada | Tecnologia |
|---|---|
| Backend | Python 3.12 |
| Framework web | Flask 3.0.3 |
| Servidor WSGI | Gunicorn 22.0.0 |
| Banco de dados | SQLite |
| Planilhas | openpyxl |
| Requisições HTTP | requests |
| Criptografia | cryptography / Fernet |
| Interface | HTML, CSS e JavaScript |
| Gráficos | Chart.js 4.4.4 via CDN |
| Empacotamento | Docker |

## Requisitos

- Servidor Linux ou NAS compatível com Docker.
- Docker Engine e Docker Compose, ou ZimaOS com suporte a Compose.
- Arquitetura `amd64` para o manifesto atual do ZimaOS.
- Porta TCP `8085` disponível no host.
- Diretório persistente para os dados.
- Acesso à internet para recursos que consultam serviços externos e para carregar a biblioteca Chart.js via CDN.

O consumo real de CPU e memória varia com a quantidade de ativos, operações, sincronizações e acessos simultâneos.

## Instalação com Docker Compose

Crie um diretório para o projeto e salve o arquivo abaixo como `docker-compose.yml`.

```yaml
services:
  lonely-wallet:
    image: lonker/lonely-wallet:latest
    container_name: lonely-wallet
    restart: unless-stopped
    network_mode: bridge
    ports:
      - "8085:8080"
    environment:
      ASSETS_DB_PATH: /data/ativos.db
      TOKEN_DB_PATH: /data/tokens.db
      DB_PATH: /data/carteira.db
      TZ: America/Sao_Paulo
    volumes:
      - /DATA/AppData/lonely-wallet/data:/data
    labels:
      icon: "http://IP_DO_SERVIDOR:8085/static/lonely-wallet-logo.png?v=4.1.1"
    deploy:
      resources:
        limits:
          memory: 4GB
          cpus: "1.00"

x-casaos:
  architectures:
    - amd64
  author: Lonely Wallet
  category: Finance
  description:
    pt_BR: Carteira pessoal para acompanhar investimentos, posições e proventos.
    en_US: Personal investment portfolio dashboard.
  developer: Lonely Wallet
  icon: "http://IP_DO_SERVIDOR:8085/static/lonely-wallet-logo.png?v=4.1.1"
  index: /
  is_uncontrolled: false
  main: lonely-wallet
  port_map: "8085"
  scheme: http
  title:
    custom: Lonely Wallet
```

Substitua `IP_DO_SERVIDOR` pelo endereço IP acessível do seu servidor. Em instalações que usam um endereço ou proxy diferente, ajuste as URLs do ícone e a porta publicada.

Inicie:

```bash
docker compose up -d
```

Acesse:

```text
http://IP_DO_SERVIDOR:8085
```

> **Imagem Docker:** confirme que a tag `lonker/lonely-wallet:latest` aponta para a versão que você pretende instalar. Para instalações reprodutíveis, prefira publicar e utilizar uma tag imutável, por exemplo `lonker/lonely-wallet:4.1.1`, quando essa tag estiver disponível no registry.

## Instalação no ZimaOS

1. Abra a área de instalação de aplicativos personalizados.
2. Cole ou importe o Docker Compose.
3. Ajuste `IP_DO_SERVIDOR` no endereço do ícone.
4. Confira se a porta `8085` está livre.
5. Confirme o volume persistente `/DATA/AppData/lonely-wallet/data:/data`.
6. Instale e aguarde o container iniciar.
7. Abra o endereço do servidor na porta `8085`.

O ícone é servido pela própria aplicação em `/static/lonely-wallet-logo.png`. O sufixo de versão `?v=4.1.1` ajuda a evitar que o painel mantenha uma imagem antiga em cache. Atualize esse sufixo quando trocar o ícone.

## Persistência e estrutura de dados

O diretório `/data` é essencial. Ele deve permanecer montado no host em todas as atualizações.

| Arquivo | Finalidade |
|---|---|
| `/data/ativos.db` | Banco principal da carteira e dos ativos |
| `/data/tokens.db` | Configurações e dados relacionados a integrações e autenticação |
| `/data/.api-credentials.key` | Chave usada para proteger credenciais de APIs, quando criada |
| `/data/.lonely-wallet-session.key` | Material persistente relacionado à sessão, quando criado |
| Arquivos auxiliares SQLite | WAL/SHM temporários, gerenciados pelo SQLite |

Os arquivos auxiliares `-wal` e `-shm` podem aparecer enquanto o banco está em uso. Não os remova manualmente com o container ativo.

**Nunca substitua o volume por um diretório vazio durante uma atualização.** Isso faria a aplicação iniciar com uma base de dados nova, sem os registros anteriores.

## Configuração

Variáveis reconhecidas no Compose:

| Variável | Padrão / exemplo | Descrição |
|---|---|---|
| `ASSETS_DB_PATH` | `/data/ativos.db` | Caminho do banco principal |
| `TOKEN_DB_PATH` | `/data/tokens.db` | Caminho do banco de tokens/configurações |
| `DB_PATH` | `/data/carteira.db` | Caminho legado usado no fluxo de migração inicial |
| `BRAPI_TOKEN` | vazio | Token opcional para provedor de cotações, quando configurado |
| `TZ` | `America/Sao_Paulo` | Fuso horário do container |

Não publique tokens, senhas, chaves ou arquivos de credenciais em repositórios públicos, capturas de tela ou arquivos Compose compartilhados.

## Autenticação por PIN

A versão 4.1.1 permite escolher entre:

- **Usar PIN:** configurar um PIN numérico de 6 a 12 dígitos.
- **Continuar sem PIN:** desativar a barreira de PIN na configuração inicial.
- **Desativar PIN posteriormente:** quando habilitado, informar o PIN atual para desativá-lo.
- **Alterar PIN:** utilizar o fluxo de alteração disponível na aplicação.

O uso de PIN é recomendado, principalmente quando outras pessoas conseguem acessar o endereço da aplicação na rede.

A opção sem PIN não equivale a uma proteção de conta. Qualquer pessoa que consiga alcançar a aplicação poderá tentar abrir a carteira. Para acesso fora da rede local, utilize HTTPS e uma camada de acesso segura, como VPN ou proxy autenticado. Não exponha diretamente a porta da aplicação à internet sem proteção adicional.

## Atualização

1. Faça backup de todo o diretório `/DATA/AppData/lonely-wallet/data`.
2. Atualize a imagem/tag ou substitua os arquivos do projeto conforme o método de instalação utilizado.
3. Preserve o nome do container, as variáveis necessárias e, principalmente, o volume `/data`.
4. Recrie/reinicie o serviço.
5. Confira os logs e abra a aplicação.
6. Verifique carteira, operações, proventos e integrações.

Com Docker Compose:

```bash
docker compose pull
docker compose up -d
docker compose logs -f --tail=100 lonely-wallet
```

Não execute `docker compose down -v` para atualizar. Não remova o diretório de dados.

## Backup e restauração

### Backup recomendado

O backup deve incluir todo o conteúdo de `/DATA/AppData/lonely-wallet/data`, não apenas os arquivos `.db`, pois também podem existir chaves e arquivos de configuração necessários para decifrar credenciais.

Para consistência, pare o serviço antes de copiar os arquivos:

```bash
docker compose stop lonely-wallet
mkdir -p /DATA/Backups
tar -czf /DATA/Backups/lonely-wallet-data-$(date +%F-%H%M).tar.gz \
  -C /DATA/AppData/lonely-wallet data
docker compose start lonely-wallet
```

Armazene o backup em local seguro e, preferencialmente, em outro dispositivo.

### Restauração

1. Pare o container.
2. Preserve uma cópia do diretório atual antes de substituir qualquer arquivo.
3. Restaure o conteúdo do backup para o caminho de dados correto.
4. Confira permissões de leitura e escrita.
5. Inicie o container e verifique os logs.

Não restaure apenas `tokens.db` sem os arquivos de chave correspondentes, caso existam credenciais criptografadas.

## Integrações e fontes externas

O código da versão inclui integração Pluggy e mecanismos para integrações externas, cotações, benchmarks e sincronização de proventos. Cada serviço pode exigir credenciais próprias, autorização do titular, plano contratado e limites de requisição.

- Configure credenciais somente na interface ou no mecanismo documentado para cada integração.
- Confira o estado e o resultado da sincronização.
- Uma falha de provedor externo não deve ser interpretada como ausência de ativos ou proventos.
- Verifique divergências entre lançamentos manuais, importações e dados sincronizados.
- Não compartilhe tokens de acesso ou arquivos de credenciais.

Este README não promete cobertura integral de todos os ativos ou provedores. A disponibilidade depende das APIs e fontes configuradas.

## Aplicativo Android e iOS

A versão 4.1.1 é uma aplicação web. Ela pode ser utilizada pelo navegador de dispositivos móveis, mas **este pacote não contém aplicativos nativos Android ou iOS**, nem builds assinados para Google Play ou App Store.

A evolução móvel planejada deve manter o servidor Lonely Wallet como backend e criar um cliente móvel para Android e iOS. Antes de publicar, serão necessários, entre outros itens:

- Definir a tecnologia do cliente (por exemplo, uma aplicação multiplataforma).
- Definir como o usuário informa o endereço do servidor.
- Implementar armazenamento seguro de sessão e credenciais no dispositivo.
- Tratar HTTPS, renovação/expiração de sessão e desconexões.
- Validar todos os fluxos em aparelhos reais.
- Criar ícones, screenshots, política de privacidade e páginas de suporte.
- Gerar builds assinados e cumprir os requisitos atuais das lojas.

O cliente móvel não deve embutir o banco SQLite do servidor nem credenciais administrativas no aplicativo.

## Publicação no catálogo do ZimaOS

O Compose contém metadados `x-casaos` para facilitar a instalação em plataformas compatíveis. **Isso não significa que o projeto já esteja publicado no catálogo oficial do ZimaOS.**

Para solicitar inclusão no catálogo, o projeto deverá preparar e validar:

- Repositório público com código-fonte e instruções de compilação.
- Imagem Docker publicada em registry acessível, com tags versionadas.
- Compose de catálogo sem IP privado fixo e sem segredos.
- Ícone e imagens promocionais em formatos e dimensões exigidos pelo catálogo.
- Descrição, categoria, arquitetura, portas, volumes e variáveis.
- Política de privacidade, licença e informações de suporte.
- Testes de instalação, atualização, persistência e remoção sem apagar dados inadvertidamente.
- Submissão conforme o processo e as diretrizes vigentes do catálogo ZimaOS.

A publicação depende de revisão e aprovação da equipe responsável pelo catálogo. Os metadados locais do Compose, por si só, não fazem essa publicação.

## Desenvolvimento

### Estrutura do pacote

```text
.
├── Dockerfile
├── docker-compose.yml
├── README.md
├── VERSION
├── requirements.txt
└── app/
    ├── main.py
    ├── static/
    │   ├── lonely-wallet-favicon.png
    │   ├── lonely-wallet-logo.png
    │   └── lonely-wallet-logotype.png
    └── templates/
        ├── auth.html
        └── index.html
```

### Execução local

Requer Python 3.12. Em ambiente virtual:

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
mkdir -p data
ASSETS_DB_PATH="$PWD/data/ativos.db" \
TOKEN_DB_PATH="$PWD/data/tokens.db" \
DB_PATH="$PWD/data/carteira.db" \
TZ=America/Sao_Paulo \
python -m app.main
```

A execução local utiliza a porta `8080`, conforme o `app.run` do módulo. Para uso contínuo, prefira Docker/Gunicorn.

### Dependências

As dependências diretas estão fixadas ou declaradas em `requirements.txt`:

- Flask
- requests
- gunicorn
- openpyxl
- cryptography

A interface carrega Chart.js 4.4.4 por CDN. Portanto, a experiência com gráficos depende de conectividade com o domínio CDN, a menos que essa dependência seja empacotada localmente em uma versão futura.

### Testes

Antes de publicar uma versão, execute ao menos:

- Compilação dos módulos Python.
- Verificação de sintaxe JavaScript.
- Testes de inicialização e health check.
- Testes de criação, login, logout, alteração e desativação de PIN.
- Testes de leitura e gravação dos bancos.
- Testes de migração a partir de uma cópia de dados da versão anterior.
- Testes de importação B3 com arquivos de amostra.
- Testes de sincronização e falha de provedores externos.
- Testes de backup e restauração.
- Testes de instalação e atualização no ZimaOS.

Não publique uma versão como validada em produção sem executar os testes de integração no ambiente-alvo.

## Diagnóstico

### Não consigo acessar a aplicação

- Confirme se o container está em execução.
- Confira se a porta `8085` está livre e publicada.
- Verifique `docker compose logs --tail=200 lonely-wallet`.
- Teste `http://IP_DO_SERVIDOR:8085`.

### O ícone antigo continua aparecendo no ZimaOS

- Confirme se `/static/lonely-wallet-logo.png` apresenta a imagem atual.
- Atualize o parâmetro de versão no URL do ícone, por exemplo `?v=4.1.1`.
- Atualize a página do painel com recarga forçada.

### A carteira parece vazia após atualização

- Não faça novas alterações nem apague arquivos.
- Confirme se o volume `/data` está apontando para o diretório original.
- Verifique se `ASSETS_DB_PATH` e `TOKEN_DB_PATH` apontam para os bancos esperados.
- Pare o container antes de qualquer restauração.
- Recupere o backup se necessário.

### Problemas com integrações

- Verifique credenciais e permissões do provedor.
- Confira conectividade e limites de API.
- Consulte o estado da integração e os logs.
- Não conclua que não há dados apenas porque uma API falhou.

## Segurança e limitações

- Utilize PIN sempre que possível.
- Restrinja o acesso à rede e prefira HTTPS.
- Faça backups regulares, incluindo arquivos de chave.
- Não publique arquivos de dados, tokens ou segredos.
- Atualize dependências e imagem Docker de forma controlada.
- O projeto não substitui extratos oficiais, informes de rendimentos ou orientação fiscal/financeira.
- Cotações, proventos, benchmarks e dados fiscais devem ser conferidos com as fontes oficiais.
- A versão 4.1.1 não inclui cliente móvel nativo nem publicação efetivada no catálogo oficial do ZimaOS.

## Licença e créditos

A licença de distribuição deve ser definida pelo mantenedor do projeto antes de uma publicação pública. Não presuma que o código pode ser redistribuído sob uma licença open source sem essa decisão.

**Projeto:** Lonely Wallet  
**Versão deste README:** 4.1.1  
**Idioma:** Português (Brasil)
