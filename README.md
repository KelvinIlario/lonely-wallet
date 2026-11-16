# Lonely Wallet v2.0.59

## Atualização desta versão

- Corrigida a posição das setas dos filtros em **Histórico Mensal** e **Meus proventos**.
- As setas agora ficam ancoradas no lado direito dos botões e centralizadas verticalmente, sem depender do tamanho do texto ou do filtro selecionado.
- Mantidos os estilos dos filtros e a responsividade da página Proventos.

# Lonely Wallet v2.0.56

Aplicação Flask + SQLite para controle pessoal de investimentos, preparada para Docker/ZimaOS.

## Atualização desta versão

- Ajuste responsivo do gráfico de rentabilidade para ocupar a área útil do card.
- Padronização visual dos filtros da página Rentabilidade.
- Nova página **APIs**, ao lado de Metas, com catálogo de provedores, cadastro, teste e remoção de tokens.
- Tokens de integração armazenados criptografados no volume persistente (`/data/.api-credentials.key` e banco SQLite).
- Brapi e HG Brasil podem fornecer séries históricas adicionais de índices quando a chave e o plano cobrirem o endpoint.
- CDI e IPCA continuam consultados nas séries oficiais do Banco Central.

## Instalação

Preserve o volume persistente configurado em `docker-compose.yml`. Não exclua `/DATA/AppData/lonely-wallet/data`, pois ele contém o banco e a chave local de criptografia das credenciais.

## Correções da versão 2.0.56

- A legenda permite ocultar e reexibir também a linha **Rentabilidade**.
- CDI continua vindo do SGS 12 do Banco Central; IPCA usa SGS 433 e conferência independente pelo SIDRA/IBGE quando disponível.
- A competência atual do IPCA não é preenchida antes da divulgação oficial.
- Adicionada integração opcional **Dados B3** para séries de retorno total de IBOV, IFIX, SMLL e IDIV. Sem chave, a fonte pode devolver apenas 30 pregões; com a chave gratuita, a série completa fica disponível conforme a cota do provedor.
- HG Brasil, brapi e Yahoo Finance permanecem como fontes alternativas, com a fonte escolhida e a última competência expostas ao usuário. Não se faz média entre séries de metodologias diferentes.
- Os cards de último mês e últimos 12 meses passam a usar meses fechados; os 12 meses são compostos a partir dos retornos mensais.
- A comparação com índices usa um mês anterior de referência quando disponível e não apresenta comparação sem base suficiente.
- Corrigida a invalidação do cache de benchmarks ao salvar ou remover credenciais.


## v2.0.57

- Atualizado o favicon exibido na aba do navegador com o novo ícone Lonely Wallet.
- Atualizado o ícone do aplicativo no catálogo/launcher do CasaOS e ZimaOS.
- URLs dos ícones versionadas para evitar que o navegador e o launcher reutilizem a imagem antiga em cache.

## v2.0.58

- Os cards de rentabilidade agora aparecem na ordem: Últimos 12 meses, Último mês e Rentabilidade total.
- Filtros da aba Proventos receberam menus mais compactos, cantos mais arredondados, espaçamento consistente e setas alinhadas nos cabeçalhos.
- Cotações sem resposta válida da brapi agora tentam, em sequência, HG Brasil, Twelve Data, Alpha Vantage e Yahoo Finance, quando disponíveis. O aplicativo mantém um único provedor por cotação para não misturar preço e variação de fontes diferentes.
- Histórico de preços da carteira ganhou fallback por ativo via Twelve Data e Alpha Vantage antes do fallback Yahoo, quando há credenciais configuradas.
- Mantida a deduplicação idempotente de eventos sincronizados por chave de evento e a reconciliação com lançamentos manuais/B3; fontes não são somadas entre si como se fossem eventos diferentes.
- CDI e IPCA continuam priorizando as séries oficiais do Banco Central, com conferência do IPCA pelo IBGE; índices de mercado priorizam Dados B3 e usam fontes alternativas identificadas quando necessário.
- Fontes sem escopo de cotação de ativos (FRED, CVM, IBGE, Tesouro Transparente e catálogo B3) não são tratadas como se fornecessem preço intradiário ou proventos por ticker.


## v2.0.60

### Correção visual dos filtros de Proventos
- Corrigido o alinhamento vertical das setas dos filtros em **Meus proventos**.
- Corrigido o alinhamento vertical das setas dos filtros em **Histórico mensal**.
- Setas posicionadas no centro vertical dos campos e alinhadas à direita, dentro dos filtros.
- Mantido o estilo e o espaçamento dos demais elementos da página.


## v2.0.61

### Padronização global dos filtros
- Unificado o chevron dos filtros fechados, com traço fino, centralização vertical e alinhamento à direita.
- Aplicado o mesmo padrão aos campos select do projeto, incluindo filtros e formulários.
- Padronizadas as listas nativas de opções para tema escuro e claro, com destaque azul para a opção selecionada.
- Os menus de **Histórico Mensal** e **Meus Proventos** agora usam listas retangulares de texto, sem checkboxes.
- Os filtros de tipo de ativo e ativo passaram a permitir uma seleção por vez, com opção para mostrar todos.
- Mantido o seletor de período com seu layout próprio de opções rápidas e filtro mensal.
