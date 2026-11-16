import os, sqlite3, time, json, threading, hashlib, io, re, unicodedata
from collections import Counter
from datetime import date, datetime, time as clock_time, timedelta
from zoneinfo import ZoneInfo
import requests
from cryptography.fernet import Fernet, InvalidToken
from openpyxl import load_workbook
from flask import Flask, g, jsonify, render_template, request

app = Flask(__name__)
DB_PATH = os.environ.get('DB_PATH', '/data/carteira.db')
TOKEN = os.environ.get('BRAPI_TOKEN') or os.environ.get('BRAPI_API_KEY', '')
API_KEY_FILE = os.environ.get('API_KEYS_KEY_FILE', '/data/.api-credentials.key')
TZ = ZoneInfo('America/Sao_Paulo')
MARKET_OPEN = clock_time(10, 0)
MARKET_CLOSE = clock_time(17, 55)
CACHE, CACHE_TTL = {}, 300
PORTFOLIO_HISTORY_CACHE, PORTFOLIO_HISTORY_TTL = {}, 1800
PORTFOLIO_HISTORY_EMPTY_TTL = 120
PROVENTOS_SYNC_CACHE = {'time': 0, 'result': None, 'signature': None}
PROVENTOS_SYNC_TTL = 3600
SGS_CACHE = {}
SGS_CACHE_TTL = 12 * 3600
BENCHMARK_CACHE = {'time': 0, 'data': {}}
BENCHMARK_CACHE_TTL = 6 * 3600


def db():
    if 'db' not in g:
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
        g.db.execute('PRAGMA foreign_keys=ON')
    return g.db


@app.teardown_appcontext
def close_db(_):
    con = g.pop('db', None)
    if con:
        con.close()


def init_db():
    os.makedirs(os.path.dirname(DB_PATH) or '.', exist_ok=True)
    con = sqlite3.connect(DB_PATH)
    con.executescript('''
    CREATE TABLE IF NOT EXISTS operacoes (
      id INTEGER PRIMARY KEY AUTOINCREMENT, ticker TEXT NOT NULL,
      tipo TEXT NOT NULL, lado TEXT NOT NULL, quantidade REAL NOT NULL,
      preco REAL NOT NULL, data TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS proventos (
      id INTEGER PRIMARY KEY AUTOINCREMENT, ticker TEXT NOT NULL,
      valor_total REAL NOT NULL, data TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS metas (
      id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT NOT NULL,
      objetivo REAL NOT NULL, aporte REAL DEFAULT 0, tipo TEXT DEFAULT 'patrimonio',
      categoria TEXT DEFAULT '', ticker TEXT DEFAULT '', variacao_anual REAL DEFAULT 0, classes TEXT DEFAULT '[]'
    );
    CREATE TABLE IF NOT EXISTS distribuicao_alvo (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      percentual REAL NOT NULL DEFAULT 0,
      ordem INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS irpf_lancamentos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      grupo TEXT NOT NULL CHECK(grupo IN ('isento','exclusiva')),
      natureza TEXT NOT NULL,
      fonte_pagadora TEXT NOT NULL,
      documento TEXT DEFAULT '',
      valor REAL NOT NULL CHECK(valor >= 0),
      data TEXT NOT NULL,
      observacoes TEXT DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS darfs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      competencia TEXT NOT NULL,
      codigo TEXT NOT NULL,
      valor REAL NOT NULL CHECK(valor >= 0),
      vencimento TEXT NOT NULL,
      pago_em TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pendente' CHECK(status IN ('pendente','pago')),
      observacoes TEXT DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS saldos_importados (
      ticker TEXT NOT NULL,
      tipo TEXT NOT NULL,
      quantidade REAL NOT NULL DEFAULT 0,
      preco_medio REAL NOT NULL DEFAULT 0,
      preco_base REAL NOT NULL DEFAULT 0,
      data_base TEXT NOT NULL,
      nome TEXT NOT NULL DEFAULT '',
      origem TEXT NOT NULL DEFAULT '',
      PRIMARY KEY (ticker, data_base)
    );
    CREATE INDEX IF NOT EXISTS idx_saldos_importados_data ON saldos_importados(data_base);
    CREATE TABLE IF NOT EXISTS proventos_api (
      event_key TEXT PRIMARY KEY,
      ticker TEXT NOT NULL,
      tipo_ativo TEXT NOT NULL DEFAULT 'outros',
      tipo_evento TEXT NOT NULL DEFAULT 'Provento',
      data_aprovacao TEXT DEFAULT '',
      data_com TEXT NOT NULL,
      data_ex TEXT DEFAULT '',
      data_pagamento TEXT NOT NULL,
      valor_por_ativo REAL NOT NULL DEFAULT 0,
      quantidade REAL NOT NULL DEFAULT 0,
      valor_total REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'A receber',
      remarks TEXT DEFAULT '',
      sincronizado_em TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_proventos_api_ticker_pagamento ON proventos_api(ticker,data_pagamento);
    CREATE TABLE IF NOT EXISTS integracao_estado (
      chave TEXT PRIMARY KEY,
      valor TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS api_credentials (
      provider TEXT PRIMARY KEY,
      token_encrypted TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS b3_importados (
      fingerprint TEXT PRIMARY KEY,
      categoria TEXT NOT NULL,
      importado_em TEXT NOT NULL
    );
    ''')
    goal_columns = [row[1] for row in con.execute('PRAGMA table_info(metas)').fetchall()]
    for name, definition in [('categoria', "TEXT DEFAULT ''"), ('ticker', "TEXT DEFAULT ''"), ('variacao_anual', 'REAL DEFAULT 0'), ('classes', "TEXT DEFAULT '[]'")]:
        if name not in goal_columns:
            con.execute(f'ALTER TABLE metas ADD COLUMN {name} {definition}')
    columns = [row[1] for row in con.execute('PRAGMA table_info(operacoes)').fetchall()]
    if 'custos' not in columns:
        con.execute('ALTER TABLE operacoes ADD COLUMN custos REAL NOT NULL DEFAULT 0')
    for name, definition in [('status', "TEXT NOT NULL DEFAULT 'executada'"), ('data_registro', 'TEXT'), ('data_execucao', 'TEXT'), ('detalhes', "TEXT NOT NULL DEFAULT '{}'")]:
        if name not in columns:
            con.execute(f'ALTER TABLE operacoes ADD COLUMN {name} {definition}')
    con.execute("UPDATE operacoes SET data_registro=COALESCE(data_registro,data), data_execucao=COALESCE(data_execucao,data||'T10:00:00-03:00') WHERE data_registro IS NULL OR data_execucao IS NULL")
    count = con.execute('SELECT COUNT(*) FROM distribuicao_alvo').fetchone()[0]
    if count == 0:
        defaults = [
            ('Renda Fixa', 40, 1), ('Ações', 20, 2), ('FIIs', 20, 3),
            ('ETFs', 10, 4), ('ETFs Internacionais', 10, 5)
        ]
        con.executemany('INSERT INTO distribuicao_alvo(nome,percentual,ordem) VALUES(?,?,?)', defaults)

    # Saldo-base capturado em 31/10/2026. Esta fotografia foi importada para
    # reconciliar a posição do usuário, mas não é um lançamento. Ela só pode
    # existir enquanto houver operações na carteira. Na versão 45, se o usuário
    # apagar todas as operações, removemos essa fotografia uma única vez e
    # gravamos o estado para que ela nunca seja recriada em reinicializações.
    snapshot_origin = 'Posição final informada pelo usuário (captura de 31/10/2026)'
    snapshot_date = '2026-10-31'
    snapshot_state_key = 'snapshot_20261031_lifecycle_v45'
    snapshot_rows = [
        ('PETR4','acao',43,40.22,52.66,'Petrobras PN'),
        ('VALE3','acao',23,85.62,62.09,'Vale ON'),
        ('BBDC4','acao',67,18.23,13.86,'Bradesco PN'),
        ('BBAS3','acao',53,22.90,16.45,'Banco do Brasil ON'),
        ('SANB4','acao',38,14.16,11.96,'Santander PN'),
        ('BBSE3','acao',7,34.55,41.24,'BB Seguridade ON'),
        ('WEGE3','acao',2,42.88,48.39,'WEG ON'),
        ('KLBN4','acao',23,3.70,3.40,'Klabin PN'),
        ('HGLG11','fii',6,152.95,149.47,'Pátria Logística FII'),
        ('RBRR11','fii',13,69.81,65.01,'RBR Rendimento High Grade FII'),
        ('MXRF11','fii',92,9.60,8.90,'Maxi Renda FII'),
        ('HGRU11','fii',7,116.48,114.00,'Pátria Renda Urbana FII'),
        ('BTLG11','fii',8,99.91,98.10,'BTG Pactual Logística FII'),
        ('XPML11','fii',8,106.40,96.80,'XP Malls FII'),
        ('CPTS11','fii',109,7.86,7.00,'Capitânia Securities II FII'),
        ('KNRI11','fii',5,156.90,150.50,'Kinea Renda Imobiliária FII'),
        ('VGIR11','fii',81,9.64,8.92,'Valora RE III FII'),
        ('VISC11','fii',5,104.10,99.40,'Vinci Shopping Centers FII'),
        ('KNSC11','fii',11,9.04,8.78,'Kinea Securities FII'),
        ('HGCR11','fii',1,93.23,92.98,'Patria Crédito Imobiliário FII'),
        # Renda fixa: uma aplicação por registro. O saldo é exato; o custo foi
        # reconstituído pelo saldo e pela rentabilidade exibidos na captura.
        ('CDB_NUBANK_120_CDI','renda_fixa',1,19991.77,21695.07,'CDB - Nubank - Pós-Fixado - 120% CDI'),
        ('LCA_BANCO_ORIGINAL_93_CDI','renda_fixa',1,7995.83,8499.57,'LCA - Banco Original - Pós-Fixado - 93% CDI'),
        ('CDB_NUBANK_100_CDI','renda_fixa',1,1999.96,2009.16,'CDB - Nubank - Pós-Fixado - 100% CDI'),
        ('CDB_MERCADO_PAGO_120_CDI','renda_fixa',1,114.69,125.05,'CDB - Mercado Pago - Pós-Fixado - 120% CDI')
    ]
    lifecycle = con.execute(
        'SELECT valor FROM integracao_estado WHERE chave=?', (snapshot_state_key,)
    ).fetchone()
    operations_count = int(con.execute('SELECT COUNT(*) FROM operacoes').fetchone()[0])
    existing_snapshot_count = int(con.execute(
        'SELECT COUNT(*) FROM saldos_importados WHERE data_base=? AND origem=?',
        (snapshot_date, snapshot_origin)
    ).fetchone()[0])

    # Migração de carteiras v44: se todos os lançamentos já foram apagados,
    # o saldo-base fixo antigo não pode continuar aparecendo como patrimônio.
    if lifecycle is None:
        if existing_snapshot_count and operations_count == 0:
            con.execute(
                'DELETE FROM saldos_importados WHERE data_base=? AND origem=?',
                (snapshot_date, snapshot_origin)
            )
            lifecycle_value = 'reset_empty'
        elif existing_snapshot_count:
            lifecycle_value = 'active'
        elif operations_count > 0:
            con.executemany(
                'INSERT OR IGNORE INTO saldos_importados '
                '(ticker,tipo,quantidade,preco_medio,preco_base,data_base,nome,origem) '
                'VALUES(?,?,?,?,?,?,?,?)',
                [(*row[:5], snapshot_date, row[5], snapshot_origin) for row in snapshot_rows]
            )
            lifecycle_value = 'active'
        else:
            # Instalação vazia: não plantar posições pré-cadastradas.
            lifecycle_value = 'empty'
        con.execute(
            'INSERT INTO integracao_estado(chave,valor) VALUES(?,?)',
            (snapshot_state_key, lifecycle_value)
        )
    elif operations_count == 0 and lifecycle[0] == 'active':
        con.execute(
            'DELETE FROM saldos_importados WHERE data_base=? AND origem=?',
            (snapshot_date, snapshot_origin)
        )
        con.execute(
            'UPDATE integracao_estado SET valor=? WHERE chave=?',
            ('reset_empty', snapshot_state_key)
        )

    # Instalação limpa: não importar capturas nem inserir operações/proventos de demonstração.
    # Os registros já existentes em um banco persistente são preservados.

    con.commit(); con.close()


init_db()

API_PROVIDERS = {
    'brapi': {'name':'brapi', 'category':'Brasil · cotações e histórico', 'description':'Ações, FIIs, BDRs, ETFs, índices cobertos, dividendos, fundos, Tesouro Direto e séries macroeconômicas. A cobertura e os limites dependem do plano.', 'auth':True, 'url':'https://brapi.dev/dashboard', 'docs':'https://brapi.dev/docs'},
    'hgbrasil': {'name':'HG Brasil', 'category':'Brasil · mercado e indicadores', 'description':'Cotações B3, índices, moedas, juros e dados históricos. Recursos históricos e cotações por ativo dependem do plano contratado.', 'auth':True, 'url':'https://console.hgbrasil.com/', 'docs':'https://console.hgbrasil.com/documentation/finance'},
    'twelvedata': {'name':'Twelve Data', 'category':'Global · cotações e séries', 'description':'Séries históricas, cotações, ETFs, fundos, ações globais, câmbio e cripto. Verifique a cobertura da B3 e os créditos do plano.', 'auth':True, 'url':'https://twelvedata.com/account', 'docs':'https://twelvedata.com/docs'},
    'alphavantage': {'name':'Alpha Vantage', 'category':'Global · cotações e fundamentos', 'description':'Séries históricas, ETFs, fundos, dividendos, câmbio e indicadores econômicos. A cobertura de tickers brasileiros varia por endpoint.', 'auth':True, 'url':'https://www.alphavantage.co/support/#api-key', 'docs':'https://www.alphavantage.co/documentation/'},
    'fred': {'name':'FRED', 'category':'Macroeconomia internacional', 'description':'Séries macroeconômicas e indicadores econômicos internacionais. Não substitui dados de preços de ativos da B3.', 'auth':True, 'url':'https://fred.stlouisfed.org/docs/api/api_key.html', 'docs':'https://fred.stlouisfed.org/docs/api/fred/'},
    'bcb': {'name':'Banco Central · SGS', 'category':'Brasil · fonte oficial', 'description':'Séries oficiais como CDI, Selic, IPCA e outros indicadores. API pública sem token.', 'auth':False, 'url':'https://www.bcb.gov.br/estabilidadefinanceira/seriestemporais', 'docs':'https://www.bcb.gov.br/gestao_site/webservices.asp'},
    'ibge': {'name':'IBGE · SIDRA', 'category':'Brasil · estatísticas e inflação', 'description':'Séries estatísticas oficiais, indicadores de preços e atividade econômica. API pública sem token; não fornece cotação de ativos.', 'auth':False, 'url':'https://servicodados.ibge.gov.br/api/docs/agregados?versao=3', 'docs':'https://apisidra.ibge.gov.br/'},
    'tesouro': {'name':'Tesouro Transparente', 'category':'Brasil · títulos públicos', 'description':'Dados abertos de taxas e preços diários de títulos do Tesouro Direto, além de relatórios e séries da dívida pública. Sem token.', 'auth':False, 'url':'https://www.tesourotransparente.gov.br/temas/divida-publica-federal/tesouro-direto', 'docs':'https://www.tesourotransparente.gov.br/ckan/dataset'},
    'cvm': {'name':'CVM Dados Abertos', 'category':'Brasil · fundos e demonstrações', 'description':'Dados públicos de fundos, informes e demonstrações financeiras. Não é uma API de cotação em tempo real; acesso aos conjuntos públicos não exige token.', 'auth':False, 'url':'https://dados.cvm.gov.br/', 'docs':'https://dados.cvm.gov.br/'},
    'b3': {'name':'B3 · APIs oficiais', 'category':'Brasil · dados oficiais de mercado e investidor', 'description':'Posições, movimentações, eventos provisionados e negociação. Exige contratação/licença e autorização do investidor; a B3 informa que as APIs do catálogo são voltadas a clientes B2B.', 'auth':False, 'url':'https://www.b3.com.br/pt_br/market-data-e-indices/servicos-de-dados/b3-for-developers/', 'docs':'https://developers.b3.com.br/apis'},
    'yahoo': {'name':'Yahoo Finance', 'category':'Global · fonte complementar', 'description':'Histórico e cotações usados como fonte complementar por endpoints não oficiais. Não há API pública oficial com garantia de disponibilidade ou licença para uso comercial.', 'auth':False, 'url':'https://finance.yahoo.com/', 'docs':'https://finance.yahoo.com/'},
}


def _api_fernet():
    key_path = API_KEY_FILE
    os.makedirs(os.path.dirname(key_path) or '.', exist_ok=True)
    if not os.path.exists(key_path):
        key = Fernet.generate_key()
        fd = os.open(key_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, 'wb') as handle:
            handle.write(key)
    with open(key_path, 'rb') as handle:
        return Fernet(handle.read().strip())


def _get_api_token(provider):
    try:
        row = db().execute('SELECT token_encrypted,enabled FROM api_credentials WHERE provider=?', (provider,)).fetchone()
        if row and row['enabled']:
            return _api_fernet().decrypt(row['token_encrypted'].encode()).decode()
    except (InvalidToken, OSError, ValueError):
        return ''
    if provider == 'brapi':
        return TOKEN
    return ''


def _brapi_token():
    return _get_api_token('brapi') or TOKEN


@app.route('/api/integracoes', methods=['GET'])
def api_integrations_list():
    rows = {row['provider']: row for row in db().execute('SELECT provider,token_encrypted,enabled,updated_at FROM api_credentials').fetchall()}
    providers = []
    for key, meta in API_PROVIDERS.items():
        row = rows.get(key)
        token = _get_api_token(key) if meta['auth'] else ''
        providers.append({'id':key, **meta, 'connected':key in ('brapi','hgbrasil','bcb'), 'configured':bool(token), 'enabled':bool(row['enabled']) if row else bool(token), 'masked':('••••••••' + token[-4:]) if token else '', 'updated_at':row['updated_at'] if row else None})
    return jsonify({'providers':providers})


@app.route('/api/integracoes/<provider>', methods=['POST','DELETE'])
def api_integrations_save(provider):
    if provider not in API_PROVIDERS or not API_PROVIDERS[provider]['auth']:
        return jsonify({'error':'Este provedor não aceita token nesta tela.'}), 400
    if request.method == 'DELETE':
        db().execute('DELETE FROM api_credentials WHERE provider=?', (provider,)); db().commit()
        if provider in ('brapi','hgbrasil'):
            CACHE.clear(); PORTFOLIO_HISTORY_CACHE.clear(); BENCHMARK_CACHE['data'].clear()
        return jsonify({'ok':True})
    payload = request.get_json(silent=True) or {}
    token = str(payload.get('token') or '').strip()
    enabled = bool(payload.get('enabled', True))
    if token:
        encrypted = _api_fernet().encrypt(token.encode()).decode()
        db().execute('INSERT INTO api_credentials(provider,token_encrypted,enabled,updated_at) VALUES(?,?,?,?) ON CONFLICT(provider) DO UPDATE SET token_encrypted=excluded.token_encrypted,enabled=excluded.enabled,updated_at=excluded.updated_at', (provider,encrypted,1 if enabled else 0,datetime.now(TZ).isoformat(timespec='seconds')))
    else:
        db().execute('UPDATE api_credentials SET enabled=?,updated_at=? WHERE provider=?', (1 if enabled else 0,datetime.now(TZ).isoformat(timespec='seconds'),provider))
    db().commit()
    if provider in ('brapi','hgbrasil'):
        CACHE.clear(); PORTFOLIO_HISTORY_CACHE.clear(); BENCHMARK_CACHE['data'].clear()
    return jsonify({'ok':True,'configured':bool(_get_api_token(provider))})


@app.route('/api/integracoes/<provider>/test', methods=['POST'])
def api_integrations_test(provider):
    if provider not in API_PROVIDERS:
        return jsonify({'ok':False,'message':'Provedor desconhecido.'}), 404
    if provider in ('bcb','ibge','tesouro','cvm','b3','yahoo'):
        return jsonify({'ok':False,'message':'Esta fonte não usa token cadastrado. A disponibilidade e os requisitos estão descritos no catálogo.'}), 400
    token = _get_api_token(provider)
    if not token:
        return jsonify({'ok':False,'message':'Cadastre um token antes de testar.'}), 400
    try:
        if provider == 'brapi':
            response = requests.get('https://brapi.dev/api/v2/user/usage', headers={'Authorization':f'Bearer {token}'}, timeout=15)
        elif provider == 'hgbrasil':
            response = requests.get('https://api.hgbrasil.com/finance', params={'key':token}, timeout=15)
        elif provider == 'twelvedata':
            response = requests.get('https://api.twelvedata.com/time_series', params={'symbol':'AAPL','interval':'1day','outputsize':1,'apikey':token}, timeout=15)
        elif provider == 'alphavantage':
            response = requests.get('https://www.alphavantage.co/query', params={'function':'GLOBAL_QUOTE','symbol':'IBM','apikey':token}, timeout=15)
        elif provider == 'fred':
            response = requests.get('https://api.stlouisfed.org/fred/series', params={'series_id':'GDP','api_key':token,'file_type':'json'}, timeout=15)
        response.raise_for_status()
        data = response.json()
        if provider == 'twelvedata' and data.get('status') == 'error': raise ValueError(data.get('message') or 'A API retornou erro.')
        if provider == 'alphavantage' and (data.get('Error Message') or data.get('Note') or data.get('Information')): raise ValueError(data.get('Error Message') or data.get('Note') or data.get('Information'))
        if provider == 'hgbrasil' and data.get('valid_key') is False: raise ValueError('A chave foi recusada pela HG Brasil.')
        return jsonify({'ok':True,'message':'Conexão autenticada. A cobertura de cada ticker e endpoint ainda depende do plano e do provedor.'})
    except (requests.RequestException, ValueError) as exc:
        message = str(exc)[:240] or 'Não foi possível validar a integração.'
        return jsonify({'ok':False,'message':message}), 400


def cotacao(ticker):
    now = time.time()
    ticker = str(ticker or '').strip().upper()
    if ticker in CACHE and now - CACHE[ticker][0] < CACHE_TTL:
        return CACHE[ticker][1]

    data = {}
    headers = {'Authorization': f'Bearer {_brapi_token()}'} if _brapi_token() else {}
    params = {'fundamental': 'true', 'dividends': 'true'}
    if _brapi_token():
        params['token'] = _brapi_token()

    # Primeira tentativa: endpoint de cotação individual.
    try:
        response = requests.get(
            f'https://brapi.dev/api/quote/{ticker}',
            params=params, headers=headers, timeout=8
        )
        response.raise_for_status()
        results = response.json().get('results') or []
        if results and isinstance(results[0], dict):
            data = results[0]
    except Exception:
        data = {}

    # Alguns tickers (principalmente FIIs/BDRs) podem não retornar preço
    # no endpoint individual. Tenta localizar a cotação pela lista da Brapi.
    has_price = any(
        data.get(key) not in (None, '', 0, '0')
        for key in ('regularMarketPrice', 'close', 'price')
    )
    if not has_price and ticker:
        try:
            response = requests.get(
                'https://brapi.dev/api/quote/list',
                params={'search': ticker, 'limit': 20, 'sortBy': 'name', 'sortOrder': 'asc'},
                headers=headers, timeout=8
            )
            response.raise_for_status()
            stocks = response.json().get('stocks') or []
            match = next((
                item for item in stocks
                if str(item.get('stock') or item.get('symbol') or '').upper() == ticker
            ), None)
            if match:
                data = {**data, **match}
        except Exception:
            pass

    CACHE[ticker] = (now, data)
    return data


def _sgs_series(series_id, start_date, end_date):
    """Busca séries históricas oficiais do BCB/SGS, em janelas inferiores a 10 anos."""
    start = date.fromisoformat(str(start_date)[:10])
    end = date.fromisoformat(str(end_date)[:10])
    if end < start:
        return []
    key = (int(series_id), start.isoformat(), end.isoformat())
    cached = SGS_CACHE.get(key)
    if cached and time.time() - cached[0] < SGS_CACHE_TTL:
        return cached[1]
    points = []
    cursor = start
    while cursor <= end:
        chunk_end = min(end, cursor + timedelta(days=8 * 365))
        params = {
            'formato': 'json',
            'dataInicial': cursor.strftime('%d/%m/%Y'),
            'dataFinal': chunk_end.strftime('%d/%m/%Y')
        }
        response = requests.get(
            f'https://api.bcb.gov.br/dados/serie/bcdata.sgs.{int(series_id)}/dados',
            params=params, timeout=18
        )
        response.raise_for_status()
        payload = response.json()
        if not isinstance(payload, list):
            raise ValueError('Resposta inválida do Banco Central')
        for row in payload:
            try:
                d = datetime.strptime(row['data'], '%d/%m/%Y').date()
                value = float(str(row['valor']).replace(',', '.'))
                points.append((d, value))
            except (KeyError, TypeError, ValueError):
                continue
        cursor = chunk_end + timedelta(days=1)
    points.sort(key=lambda item: item[0])
    SGS_CACHE[key] = (time.time(), points)
    return points


def _rate_number(value):
    """Extrai a primeira taxa numérica de campos como '120% do CDI' ou '6,5% a.a.'."""
    raw = str(value or '').strip().replace(',', '.')
    match = re.search(r'(-?\d+(?:\.\d+)?)', raw)
    return float(match.group(1)) if match else 0.0


def _fixed_income_factor(details, start_date, end_date):
    """Fator bruto de acumulação; não desconta IR/IOF nem taxas do emissor."""
    details = details if isinstance(details, dict) else {}
    indexer = str(details.get('indexador') or '').strip().upper()
    form = str(details.get('forma') or '').strip().lower()
    rate_text = str(details.get('taxa') or '').strip()
    rate = _rate_number(rate_text)
    if not indexer or not rate_text or rate <= 0:
        return None, 'Indexador ou taxa não informado'
    try:
        start = date.fromisoformat(str(start_date)[:10])
        end = date.fromisoformat(str(end_date)[:10])
    except (TypeError, ValueError):
        return None, 'Data da aplicação inválida'
    if end <= start:
        return 1.0, None
    hybrid = form == 'híbrido' or '+' in rate_text
    factor = 1.0
    try:
        if indexer == 'CDI':
            for _, daily_pct in _sgs_series(12, start + timedelta(days=1), end):
                daily = max(0.0, daily_pct) / 100.0
                if hybrid:
                    spread_daily = (1 + rate / 100.0) ** (1 / 252) - 1
                    factor *= (1 + daily) * (1 + spread_daily)
                else:
                    factor *= 1 + daily * (rate / 100.0)
        elif indexer in ('SELIC', 'SELIC OVER'):
            for _, daily_pct in _sgs_series(11, start + timedelta(days=1), end):
                daily = max(0.0, daily_pct) / 100.0
                factor *= (1 + daily * (rate / 100.0))
        elif indexer in ('IPCA', 'IGP-M'):
            series_id = 433 if indexer == 'IPCA' else 189
            # Índices de inflação são mensais: só entram competências completas
            # posteriores ao mês da aplicação, evitando aplicar mês cheio em data parcial.
            first_month = date(start.year + (start.month == 12), 1 if start.month == 12 else start.month + 1, 1)
            last_complete_month = date(end.year, end.month, 1) - timedelta(days=1)
            if first_month <= last_complete_month:
                for point_date, monthly_pct in _sgs_series(series_id, first_month, last_complete_month):
                    monthly = max(-99.0, monthly_pct) / 100.0
                    if hybrid:
                        spread_month = (1 + rate / 100.0) ** (1 / 12) - 1
                        factor *= (1 + monthly) * (1 + spread_month)
                    else:
                        factor *= 1 + monthly * (rate / 100.0)
        elif indexer in ('PREFIXADO', 'PRÉ-FIXADO', 'PRE-FIXADO'):
            # Taxa anual efetiva composta em dias úteis (base 252).
            business_days = 0
            current = start + timedelta(days=1)
            holidays = set()
            for year in range(start.year, end.year + 1):
                try:
                    holidays.update(b3_holidays(year))
                except Exception:
                    pass
            while current <= end:
                if current.weekday() < 5 and current not in holidays:
                    business_days += 1
                current += timedelta(days=1)
            factor = (1 + rate / 100.0) ** (business_days / 252)
        else:
            return None, f'Indexador {indexer} ainda não suportado'
    except Exception as exc:
        app.logger.warning('Falha ao calcular renda fixa (%s): %s', indexer, exc)
        return None, 'Não foi possível consultar o histórico do indexador'
    return max(0.01, factor), None


def _fixed_income_position_value(ticker, invested_cost, fallback_value, as_of=None):
    """Recalcula lotes de renda fixa desde cada aplicação, preservando legado sem taxa."""
    cutoff = as_of or datetime.now(TZ).date().isoformat()
    base_date = snapshot_date_for(cutoff)
    if base_date:
        ops = db().execute(
            "SELECT * FROM operacoes WHERE ticker=? AND status='executada' AND data>? AND data<=? ORDER BY data,id",
            (str(ticker).upper(), base_date, cutoff)
        ).fetchall()
        imported = imported_balance(ticker, cutoff)
        base_cost = (float(imported['quantidade']) * float(imported['preco_medio'])) if imported else 0.0
        # Saldos-base importados não possuem necessariamente os dados contratuais.
        lots = [{'principal': base_cost, 'date': base_date, 'details': {}, 'legacy': True}] if base_cost > 0 else []
    else:
        ops = db().execute(
            "SELECT * FROM operacoes WHERE ticker=? AND status='executada' AND data<=? ORDER BY data,id",
            (str(ticker).upper(), cutoff)
        ).fetchall()
        lots = []
    for op in ops:
        quantity = float(op['quantidade'] or 0)
        amount = quantity * float(op['preco'] or 0)
        if op['lado'] == 'compra':
            try:
                details = json.loads(op['detalhes'] or '{}')
            except Exception:
                details = {}
            lots.append({'principal': amount + float(op['custos'] or 0), 'date': op['data'], 'details': details, 'legacy': False})
        else:
            remaining = amount
            for lot in lots:
                if remaining <= 0:
                    break
                reduction = min(lot['principal'], remaining)
                lot['principal'] -= reduction
                remaining -= reduction
    total_cost = sum(max(0.0, lot['principal']) for lot in lots)
    total_value = 0.0
    has_calculated = False
    warnings = []
    for lot in lots:
        principal = max(0.0, lot['principal'])
        if principal <= 0:
            continue
        factor, error = _fixed_income_factor(lot['details'], lot['date'], cutoff)
        if factor is None:
            total_value += principal
            warnings.append(error)
        else:
            total_value += principal * factor
            has_calculated = True
    if not lots:
        return invested_cost, fallback_value, False, 'Sem histórico de aplicação'
    if not has_calculated and warnings:
        return total_cost, fallback_value if fallback_value > 0 else total_cost, False, warnings[0]
    return total_cost, total_value, True, (warnings[0] if warnings else None)


def snapshot_date_for(reference_date=None):
    # Última data-base global válida para a data consultada.
    cutoff = reference_date or datetime.now(TZ).date().isoformat()
    row = db().execute(
        'SELECT MAX(data_base) AS data_base FROM saldos_importados WHERE data_base<=?',
        (cutoff,)
    ).fetchone()
    return row['data_base'] if row and row['data_base'] else None


def imported_balance(ticker, reference_date=None):
    base_date = snapshot_date_for(reference_date)
    if not base_date:
        return None
    row = db().execute(
        'SELECT * FROM saldos_importados WHERE ticker=? AND data_base=?',
        (str(ticker).upper(), base_date)
    ).fetchone()
    return dict(row) if row else None


def posicao(ticker, as_of=None):
    """Calcula posição usando o último saldo-base e apenas operações posteriores.

    A fotografia é global e completa: ativos ausentes nela começam com saldo zero.
    Isso evita somar novamente todo o histórico anterior à importação.
    """
    cutoff = as_of or datetime.now(TZ).date().isoformat()
    base_date = snapshot_date_for(cutoff)
    balance = imported_balance(ticker, cutoff) if base_date else None
    if base_date:
        qtd = float(balance['quantidade']) if balance else 0.0
        custo = qtd * float(balance['preco_medio'] or 0) if balance else 0.0
        ops = db().execute(
            "SELECT * FROM operacoes WHERE ticker=? AND status='executada' AND data>? AND data<=? ORDER BY data,id",
            (str(ticker).upper(), base_date, cutoff)
        ).fetchall()
    else:
        qtd = custo = 0.0
        ops = db().execute(
            "SELECT * FROM operacoes WHERE ticker=? AND status='executada' AND data<=? ORDER BY data,id",
            (str(ticker).upper(), cutoff)
        ).fetchall()
    for op in ops:
        q = float(op['quantidade']); valor = q * float(op['preco'])
        custos = float(op['custos'] or 0) if 'custos' in op.keys() else 0.0
        if op['lado'] == 'compra':
            qtd += q; custo += valor + custos
        elif qtd > 0:
            pm = custo / qtd
            vendido = min(q, qtd)
            qtd -= vendido; custo = max(0.0, custo - vendido * pm)
    return max(qtd, 0), (custo / qtd if qtd > 0 else 0)


def json_error(message, status=400):
    return jsonify(ok=False, erro=message), status


def easter_sunday(year):
    a=year%19; b=year//100; c=year%100; d=b//4; e=b%4; f=(b+8)//25; g=(b-f+1)//3
    h=(19*a+b-d-g+15)%30; i=c//4; k=c%4; l=(32+2*e+2*i-h-k)%7; m=(a+11*h+22*l)//451
    month=(h+l-7*m+114)//31; day=((h+l-7*m+114)%31)+1
    return date(year,month,day)


def b3_holidays(year):
    easter=easter_sunday(year)
    dates={date(year,1,1),date(year,4,21),date(year,5,1),date(year,9,7),date(year,10,12),date(year,11,2),date(year,11,15),date(year,11,20),date(year,12,25),date(year,12,24),date(year,12,31)}
    dates.update({easter-timedelta(days=48),easter-timedelta(days=47),easter-timedelta(days=2),easter+timedelta(days=60)})
    return dates


def session_open(day):
    easter=easter_sunday(day.year)
    return clock_time(13,0) if day==easter-timedelta(days=46) else MARKET_OPEN


def next_b3_session(requested):
    candidate=requested.astimezone(TZ).replace(second=0,microsecond=0)
    while candidate.weekday()>=5 or candidate.date() in b3_holidays(candidate.year):
        candidate=(candidate+timedelta(days=1)).replace(hour=10,minute=0)
    opening=session_open(candidate.date())
    if candidate.time()<opening:
        candidate=candidate.replace(hour=opening.hour,minute=opening.minute)
    elif candidate.time()>=MARKET_CLOSE:
        candidate=(candidate+timedelta(days=1)).replace(hour=10,minute=0)
        while candidate.weekday()>=5 or candidate.date() in b3_holidays(candidate.year):
            candidate=(candidate+timedelta(days=1)).replace(hour=10,minute=0)
    return candidate


def process_due_operations():
    now=datetime.now(TZ).isoformat(timespec='minutes')
    con=db()
    con.execute("UPDATE operacoes SET status='executada', data=substr(data_execucao,1,10) WHERE status='agendada' AND data_execucao<=?",(now,))
    con.commit()


def scheduler_loop():
    # Promove operações agendadas automaticamente quando chega o horário previsto.
    while True:
        try:
            now=datetime.now(TZ).isoformat(timespec='minutes')
            con=sqlite3.connect(DB_PATH,timeout=10)
            con.execute("UPDATE operacoes SET status='executada', data=substr(data_execucao,1,10) WHERE status='agendada' AND data_execucao<=?",(now,))
            con.commit(); con.close()
        except Exception:
            pass
        time.sleep(30)


threading.Thread(target=scheduler_loop,daemon=True,name='b3-operation-scheduler').start()


def valid_operation(data):
    try:
        ticker=str(data.get('ticker','')).strip().upper(); tipo=str(data.get('tipo','acao')).lower(); lado=str(data.get('lado','compra')).lower()
        qtd=float(data.get('quantidade',0)); preco=float(data.get('preco',0)); custos=float(data.get('custos',0) or 0)
        dt=str(data.get('data','')); date.fromisoformat(dt)
        allowed_types=('acao','fii','etf','bdr','internacional','renda_fixa','cripto','stocks','reit','tesouro','fundo','outros')
        if not ticker or len(ticker)>80 or tipo not in allowed_types: raise ValueError()
        if lado not in ('compra','venda') or qtd<=0 or preco<0 or custos<0: raise ValueError()
        if lado=='venda':
            existing_type=db().execute("SELECT tipo FROM operacoes WHERE ticker=? ORDER BY id LIMIT 1",(ticker,)).fetchone()
            if not existing_type or str(existing_type['tipo']).lower()!=tipo:
                return None,'O ativo selecionado não pertence à categoria informada. Escolha o ativo dentro da categoria correta.'
            available,_=posicao(ticker)
            reserved=float(db().execute("SELECT COALESCE(SUM(quantidade),0) FROM operacoes WHERE ticker=? AND lado='venda' AND status='agendada'",(ticker,)).fetchone()[0])
            if qtd>available-reserved+1e-8: return None,'A quantidade vendida é maior que a posição disponível, considerando vendas já agendadas.'
        raw=str(data.get('data_hora') or (dt+'T10:00'))
        requested=datetime.fromisoformat(raw)
        if requested.tzinfo is None: requested=requested.replace(tzinfo=TZ)
        now=datetime.now(TZ); now_minute=now.replace(second=0,microsecond=0)
        # Datas anteriores são lançamentos históricos; não devem ser empurradas para o próximo pregão.
        if requested.date()<now.date():
            execution=requested; status='executada'
        # Renda fixa (CDB, LCI, LCA etc.) não depende do pregão da bolsa:
        # registra imediatamente, sem criar operação agendada.
        elif tipo=='renda_fixa':
            execution=now; status='executada'
        elif requested.date()==now.date() and now.weekday()<5 and now.date() not in b3_holidays(now.year) and MARKET_OPEN<=requested.time()<MARKET_CLOSE and requested<=now_minute:
            execution=requested; status='executada'
        else:
            execution=next_b3_session(requested)
            status='executada' if execution<=now_minute else 'agendada'
        details=data.get('detalhes') or {}
        if isinstance(details,str): details=json.loads(details)
        return (ticker,tipo,lado,qtd,preco,execution.date().isoformat(),custos,status,now.isoformat(timespec='minutes'),execution.isoformat(timespec='minutes'),json.dumps(details,ensure_ascii=False)),None
    except Exception:
        return None,'Confira ativo, tipo, quantidade, preço, custos e data da operação.'


@app.route('/')
def index(): return render_template('index.html')


@app.route('/api/operacoes', methods=['GET','POST'])
def operacoes():
    if request.method == 'GET':
        process_due_operations()
        rows = db().execute('SELECT * FROM operacoes ORDER BY COALESCE(data_execucao,data) DESC,id DESC').fetchall()
        return jsonify(itens=[dict(r) for r in rows])
    process_due_operations()
    payload, error = valid_operation(request.get_json(silent=True) or {})
    if error: return json_error(error)
    db().execute('INSERT INTO operacoes(ticker,tipo,lado,quantidade,preco,data,custos,status,data_registro,data_execucao,detalhes) VALUES(?,?,?,?,?,?,?,?,?,?,?)', payload)
    db().commit(); CACHE.pop(payload[0], None)
    return jsonify(ok=True,status=payload[7],data_execucao=payload[9])


def clear_seed_snapshot_when_empty():
    """Remove a fotografia fixa quando o usuário exclui o último lançamento.

    Proventos pagos/recebidos permanecem como histórico financeiro independente;
    apenas as posições importadas que sustentavam o patrimônio atual são limpas.
    """
    remaining = int(db().execute('SELECT COUNT(*) FROM operacoes').fetchone()[0])
    if remaining == 0:
        db().execute(
            "DELETE FROM saldos_importados WHERE data_base=? AND origem=?",
            ('2026-10-31', 'Posição final informada pelo usuário (captura de 31/10/2026)')
        )
        db().execute(
            "INSERT INTO integracao_estado(chave,valor) VALUES(?,?) "
            "ON CONFLICT(chave) DO UPDATE SET valor=excluded.valor",
            ('snapshot_20261031_lifecycle_v45', 'reset_empty')
        )


@app.route('/api/operacoes/<int:op_id>', methods=['DELETE','PUT'])
def delete_operacao(op_id):
    if request.method == 'DELETE':
        db().execute('DELETE FROM operacoes WHERE id=?', (op_id,))
        clear_seed_snapshot_when_empty()
        db().commit()
        return jsonify(ok=True)
    current=db().execute('SELECT * FROM operacoes WHERE id=?',(op_id,)).fetchone()
    if not current: return json_error('Lançamento não encontrado.',404)
    j=request.get_json(silent=True) or {}
    try:
        ticker=str(j.get('ticker',current['ticker'])).strip().upper()
        tipo=str(j.get('tipo',current['tipo'])).lower()
        lado=str(j.get('lado',current['lado'])).lower()
        qtd=float(j.get('quantidade',current['quantidade']))
        preco=float(j.get('preco',current['preco']))
        custos=float(j.get('custos',current['custos'] or 0))
        dt=str(j.get('data') or current['data'])
        allowed_types=('acao','fii','etf','bdr','internacional','renda_fixa','cripto','stocks','reit','tesouro','fundo','outros')
        date.fromisoformat(dt)
        if not ticker or len(ticker)>80 or tipo not in allowed_types or lado not in ('compra','venda') or qtd<=0 or preco<0 or custos<0: raise ValueError()
        if lado=='venda':
            existing_type=db().execute("SELECT tipo FROM operacoes WHERE ticker=? ORDER BY id LIMIT 1",(ticker,)).fetchone()
            if not existing_type or str(existing_type['tipo']).lower()!=tipo:
                return json_error('O ativo selecionado não pertence à categoria informada. Escolha o ativo dentro da categoria correta.')
            available,_=posicao(ticker)
            if ticker==current['ticker'] and current['lado']=='venda' and current['status']!='agendada':
                available+=float(current['quantidade'] or 0)
            reserved=float(db().execute("SELECT COALESCE(SUM(quantidade),0) FROM operacoes WHERE ticker=? AND lado='venda' AND status='agendada' AND id<>?",(ticker,op_id)).fetchone()[0])
            if qtd>available-reserved+1e-8:
                return json_error('A quantidade vendida é maior que a posição disponível, considerando vendas já agendadas.')
        raw=str(j.get('data_hora') or (dt+'T10:00'))
        requested=datetime.fromisoformat(raw)
        if requested.tzinfo is None: requested=requested.replace(tzinfo=TZ)
        now=datetime.now(TZ); now_minute=now.replace(second=0,microsecond=0)
        if requested.date()<now.date():
            execution=requested; status='executada'
        elif tipo=='renda_fixa':
            execution=now; status='executada'
        elif requested.date()==now.date() and now.weekday()<5 and now.date() not in b3_holidays(now.year) and MARKET_OPEN<=requested.time()<MARKET_CLOSE and requested<=now_minute:
            execution=requested; status='executada'
        else:
            execution=next_b3_session(requested); status='executada' if execution<=now_minute else 'agendada'
        details=j.get('detalhes',current['detalhes'] or '{}')
        if isinstance(details,dict): details=json.dumps(details,ensure_ascii=False)
        else:
            parsed=json.loads(details or '{}'); details=json.dumps(parsed,ensure_ascii=False)
        db().execute('UPDATE operacoes SET ticker=?,tipo=?,lado=?,quantidade=?,preco=?,custos=?,data=?,status=?,data_execucao=?,detalhes=? WHERE id=?',
            (ticker,tipo,lado,qtd,preco,custos,execution.date().isoformat(),status,execution.isoformat(timespec='minutes'),details,op_id))
        db().commit(); CACHE.pop(current['ticker'],None); CACHE.pop(ticker,None)
        return jsonify(ok=True,status=status,data_execucao=execution.isoformat(timespec='minutes'))
    except Exception:
        return json_error('Confira ativo, tipo, operação, quantidade, preço, custos e data do lançamento.')


@app.route('/api/proventos', methods=['GET','POST'])
def proventos():
    if request.method == 'GET':
        rows = db().execute('SELECT * FROM proventos ORDER BY data DESC,id DESC').fetchall()
        return jsonify(itens=[dict(r) for r in rows])
    j = request.get_json(silent=True) or {}
    try:
        ticker = str(j['ticker']).strip().upper(); valor = float(j['valor_total']); dt = str(j['data']); date.fromisoformat(dt)
        if not ticker or valor <= 0: raise ValueError()
    except Exception: return json_error('Confira ticker, valor e data.')
    db().execute('INSERT INTO proventos(ticker,valor_total,data) VALUES(?,?,?)', (ticker,valor,dt)); db().commit()
    return jsonify(ok=True)


@app.route('/api/proventos/sincronizar', methods=['POST'])
def sincronizar_proventos():
    result = sync_brapi_proventos(force=True, quote_items=carteira().json.get('itens', []))
    return jsonify(result)


def _b3_normalize(value):
    raw = unicodedata.normalize('NFKD', str(value or '').strip().lower())
    return ''.join(ch for ch in raw if not unicodedata.combining(ch))


def _b3_number(value):
    if value is None or value == '-':
        return 0.0
    if isinstance(value, (int, float)):
        return float(value)
    raw = str(value).strip().replace('R$', '').replace(' ', '')
    if not raw or raw == '-':
        return 0.0
    if ',' in raw:
        raw = raw.replace('.', '').replace(',', '.')
    return float(raw)


def _b3_date(value):
    if isinstance(value, datetime):
        return value.date().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    raw = str(value or '').strip()
    for fmt in ('%d/%m/%Y', '%Y-%m-%d'):
        try:
            return datetime.strptime(raw, fmt).date().isoformat()
        except ValueError:
            pass
    raise ValueError('Data inválida na planilha B3: ' + raw)


def _b3_asset(product):
    name = str(product or '').strip()
    ticker = name.split(' - ', 1)[0].strip().upper()
    if not ticker:
        return '', 'outros'
    if _b3_normalize(name).startswith(('lca ', 'lci ', 'cdb ', 'rdb ', 'tesouro ')) or ticker.startswith(('LCA', 'LCI', 'CDB', 'RDB')):
        return ticker[:80], 'renda_fixa'
    if re.fullmatch(r'[A-Z]{4}11', ticker):
        return ticker, 'fii' if ('fii' in _b3_normalize(name) or 'imob' in _b3_normalize(name)) else 'etf'
    if re.fullmatch(r'[A-Z]{4}(3[0-9]|[4-9][0-9])', ticker):
        return ticker, 'bdr'
    if re.fullmatch(r'[A-Z]{4}[0-9]{1,2}', ticker):
        return ticker, 'acao'
    return ticker[:80], 'outros'


def _parse_b3_workbook(file_storage):
    if not file_storage or not file_storage.filename.lower().endswith('.xlsx'):
        raise ValueError('Selecione uma planilha Excel da B3 no formato .xlsx.')
    raw = file_storage.read()
    if not raw:
        raise ValueError('O arquivo selecionado está vazio.')
    wb = load_workbook(io.BytesIO(raw), read_only=False, data_only=True)
    ws = wb.active
    rows = ws.iter_rows(values_only=True)
    header = next(rows, None)
    if not header:
        raise ValueError('A planilha não contém cabeçalho.')
    headers = {_b3_normalize(v): i for i, v in enumerate(header) if v is not None}
    required = ['entrada/saida', 'data', 'movimentacao', 'produto', 'quantidade', 'preco unitario', 'valor da operacao']
    missing = [h for h in required if h not in headers]
    if missing:
        raise ValueError('Não reconheci o formato da planilha. Confira se é a planilha de movimentações exportada pela B3.')
    parsed=[]
    for row_number, row in enumerate(rows, start=2):
        if not row or not any(v is not None for v in row):
            continue
        get=lambda key: row[headers[key]] if headers[key] < len(row) else None
        movement=str(get('movimentacao') or '').strip()
        movement_norm=_b3_normalize(movement)
        entry=_b3_normalize(get('entrada/saida'))
        product=str(get('produto') or '').strip()
        ticker, asset_type=_b3_asset(product)
        if not ticker:
            continue
        dt=_b3_date(get('data'))
        qty=_b3_number(get('quantidade'))
        price=_b3_number(get('preco unitario'))
        amount=_b3_number(get('valor da operacao'))
        category=None; record=None
        if movement_norm in ('rendimento','juros sobre capital proprio','dividendo'):
            if amount <= 0:
                continue
            category='provento'
            record={'ticker':ticker,'valor_total':amount,'data':dt,'tipo_evento':movement}
        elif movement_norm in ('transferencia - liquidacao','compra / venda'):
            if qty <= 0 or amount <= 0:
                continue
            side='venda' if entry in ('debito','saida','saída') else 'compra'
            if movement_norm == 'compra / venda' and asset_type == 'renda_fixa':
                side='compra' if entry not in ('debito','saida','saída') else 'venda'
            category='operacao'
            record={'ticker':ticker,'tipo':asset_type,'lado':side,'quantidade':qty,'preco':price if price > 0 else amount/qty,'data':dt,'custos':0.0,'status':'executada','detalhes':{'origem':'Importação B3','movimentacao':movement,'produto':product}}
        else:
            # Eventos sem valor negociado (atualização, transferência entre custódias,
            # direitos de subscrição etc.) não viram compra/venda ou provento.
            continue
        fingerprint=hashlib.sha256(json.dumps([row_number, category, entry, dt, movement_norm, product, qty, price, amount],ensure_ascii=False,separators=(',',':')).encode()).hexdigest()
        parsed.append({'fingerprint':fingerprint,'categoria':category,'registro':record})
    wb.close()
    return parsed


@app.route('/api/importar-b3', methods=['POST'])
def importar_b3():
    try:
        parsed=_parse_b3_workbook(request.files.get('arquivo'))
        mode=request.form.get('modo','preview')
        existing={r['fingerprint'] for r in db().execute('SELECT fingerprint FROM b3_importados').fetchall()}
        new_rows=[r for r in parsed if r['fingerprint'] not in existing]
        if mode != 'importar':
            return jsonify(ok=True,total=len(parsed),novos=len(new_rows),duplicados=len(parsed)-len(new_rows),
                operacoes=sum(1 for r in new_rows if r['categoria']=='operacao'),
                proventos=sum(1 for r in new_rows if r['categoria']=='provento'))
        inserted_ops=inserted_provs=duplicates=0
        con=db()
        for item in parsed:
            if con.execute('SELECT 1 FROM b3_importados WHERE fingerprint=?',(item['fingerprint'],)).fetchone():
                duplicates+=1; continue
            rec=item['registro']
            if item['categoria']=='operacao':
                con.execute("INSERT INTO operacoes(ticker,tipo,lado,quantidade,preco,data,custos,status,data_registro,data_execucao,detalhes) VALUES(?,?,?,?,?,?,?,?,?,?,?)", (rec['ticker'],rec['tipo'],rec['lado'],rec['quantidade'],rec['preco'],rec['data'],0.0,'executada',rec['data'],rec['data']+'T10:00:00-03:00',json.dumps(rec['detalhes'],ensure_ascii=False)))
                inserted_ops+=1
            else:
                con.execute('INSERT INTO proventos(ticker,valor_total,data) VALUES(?,?,?)',(rec['ticker'],rec['valor_total'],rec['data']))
                inserted_provs+=1
            con.execute('INSERT INTO b3_importados(fingerprint,categoria,importado_em) VALUES(?,?,?)',(item['fingerprint'],item['categoria'],datetime.now(TZ).isoformat(timespec='seconds')))
        con.commit()
        return jsonify(ok=True,importadas=inserted_ops+inserted_provs,operacoes=inserted_ops,proventos=inserted_provs,duplicados=duplicates)
    except Exception as exc:
        return json_error(str(exc) if isinstance(exc,ValueError) else 'Não foi possível ler a planilha B3. Confira o arquivo e tente novamente.')


@app.route('/api/metas', methods=['GET','POST'])
def metas():
    if request.method == 'GET':
        return jsonify(itens=[dict(r) for r in db().execute('SELECT * FROM metas ORDER BY id DESC').fetchall()])
    j = request.get_json(silent=True) or {}
    try:
        nome = str(j['nome']).strip(); objetivo = float(j['objetivo']); aporte = float(j.get('aporte',0)); tipo = str(j.get('tipo','patrimonio'))
        categoria = str(j.get('categoria','')); ticker = str(j.get('ticker','')).strip().upper(); variacao = float(j.get('variacao_anual',0)); classes = j.get('classes','[]')
        if not nome or objetivo <= 0 or aporte < 0 or not -100 <= variacao <= 1000: raise ValueError()
        if isinstance(classes, list): classes = json.dumps(classes, ensure_ascii=False)
        else:
            parsed = json.loads(str(classes or '[]'))
            if not isinstance(parsed, list): raise ValueError()
            classes = json.dumps(parsed, ensure_ascii=False)
        if tipo == 'ativos' and not ticker: raise ValueError()
        if tipo == 'proventos' and not json.loads(classes): raise ValueError()
    except Exception: return json_error('Informe os dados da meta corretamente.')
    db().execute('INSERT INTO metas(nome,objetivo,aporte,tipo,categoria,ticker,variacao_anual,classes) VALUES(?,?,?,?,?,?,?,?)',(nome,objetivo,aporte,tipo,categoria,ticker,variacao,classes)); db().commit()
    return jsonify(ok=True)


@app.route('/api/metas/<int:meta_id>', methods=['DELETE'])
def delete_meta(meta_id):
    db().execute('DELETE FROM metas WHERE id=?',(meta_id,)); db().commit(); return jsonify(ok=True)


@app.route('/api/carteira')
def carteira():
    process_due_operations()
    base_date = snapshot_date_for()
    ticker_rows = db().execute('SELECT DISTINCT ticker FROM operacoes').fetchall()
    tickers = {str(row[0]).upper() for row in ticker_rows}
    if base_date:
        tickers.update(str(row[0]).upper() for row in db().execute(
            'SELECT ticker FROM saldos_importados WHERE data_base=?', (base_date,)
        ).fetchall())
    itens=[]; invested=actual=received=0.0
    for ticker in sorted(tickers):
        qty, avg = posicao(ticker)
        if qty <= 1e-8: continue
        imported = imported_balance(ticker)
        op_kind = db().execute('SELECT tipo FROM operacoes WHERE ticker=? ORDER BY id LIMIT 1',(ticker,)).fetchone()
        kind = (imported.get('tipo') if imported else None) or (op_kind['tipo'] if op_kind else 'outros')
        # Renda fixa usa o indexador e a data de cada aplicação, não cotação de bolsa.
        quote = {} if kind == 'renda_fixa' else cotacao(ticker)
        raw_price=quote.get('regularMarketPrice') or quote.get('close') or quote.get('price')
        market_quote_available=raw_price is not None and float(raw_price)>0
        imported_price = float(imported.get('preco_base') or 0) if imported else 0.0
        has_imported_reference = imported_price > 0
        price=float(raw_price) if market_quote_available else (imported_price if has_imported_reference else avg)
        quote_available=market_quote_available or has_imported_reference
        quote_source='Mercado' if market_quote_available else ('Posição importada' if has_imported_reference else 'Sem cotação')
        dividends = float(received_proventos_by_ticker().get(ticker, 0.0))
        divs = (quote.get('dividendsData') or {}).get('cashDividends',[])[:12]
        annual_div = sum(float(x.get('rate') or 0) for x in divs)
        ceiling = annual_div / .06 if annual_div else None
        cost, value = qty*avg, qty*price
        fixed_calc_ok = False
        fixed_calc_warning = None
        if kind == 'renda_fixa':
            cost, value, fixed_calc_ok, fixed_calc_warning = _fixed_income_position_value(ticker, cost, value)
            price = value / qty if qty > 0 else value
            quote_available = fixed_calc_ok
            quote_source = 'Indexador' if fixed_calc_ok else 'Sem indexador'
        invested += cost; actual += value; received += (0.0 if kind == 'renda_fixa' else dividends)
        default_name = imported.get('nome') if imported else ticker
        itens.append({'ticker':ticker,'tipo':kind,'quantidade':round(qty,6),'preco_medio':round(avg,2),'preco_atual':round(price,2) if quote_available else None,'cotacao_disponivel':quote_available,'cotacao_origem':quote_source,'investido':round(cost,2),'valor_atual':round(value,2),'lucro':round(value-cost,2),'lucro_pct':round((value/cost-1)*100,2) if cost else 0,'proventos':0.0 if kind=='renda_fixa' else round(dividends,2),'calculo_indexador':fixed_calc_ok if kind=='renda_fixa' else None,'aviso_calculo':fixed_calc_warning if kind=='renda_fixa' else None,'pl':quote.get('priceEarnings'),'pvp':quote.get('priceToBook') or quote.get('priceToBookRatio') or quote.get('priceToBookValue'),'preco_teto_bazin':round(ceiling,2) if ceiling else None,'abaixo_do_teto':bool(ceiling and price and price<=ceiling),'nome':quote.get('longName') or quote.get('shortName') or default_name or ticker,'logo':quote.get('logourl') or quote.get('logo') or ('/static/lonely-wallet-logo.png' if kind=='renda_fixa' else f'https://icons.brapi.dev/icons/{ticker}.svg'),'variacao_dia':quote.get('regularMarketChangePercent') if quote.get('regularMarketChangePercent') is not None else quote.get('changePercent')})
    allocation={}
    for item in itens: allocation[item['tipo']]=allocation.get(item['tipo'],0)+item['valor_atual']
    return jsonify(itens=itens,resumo={'investido':round(invested,2),'atual':round(actual,2),'lucro':round(actual-invested,2),'lucro_pct':round((actual/invested-1)*100,2) if invested else 0,'proventos':round(received,2),'ativos':len(itens)},alocacao=allocation)


def position_quantity_on_date_details(ticker, reference_date):
    """Retorna a quantidade estimada na data-com e informa a origem do cálculo.

    O saldo-base de 31/10/2026 é a fotografia mais confiável da carteira. Como o
    histórico importado pode não conter todas as operações anteriores, a quantidade
    retroativa é reconstruída revertendo as operações conhecidas. Se a reversão
    resultar em zero/negativo apesar de haver saldo-base, mantém-se uma estimativa
    pelo saldo-base, com aviso explícito, em vez de descartar silenciosamente o evento.
    """
    symbol = str(ticker or '').strip().upper()
    try:
        ref = date.fromisoformat(str(reference_date)[:10])
    except (TypeError, ValueError):
        return 0.0, 'data inválida'

    base_date = snapshot_date_for()
    if base_date:
        base_day = date.fromisoformat(base_date)
        if ref < base_day:
            base_row = db().execute(
                'SELECT quantidade FROM saldos_importados WHERE ticker=? AND data_base=?',
                (symbol, base_date)
            ).fetchone()
            if base_row:
                base_quantity = max(0.0, float(base_row['quantidade'] or 0))
                quantity = base_quantity
                later_ops = db().execute(
                    "SELECT lado,quantidade FROM operacoes WHERE ticker=? AND status='executada' AND data>? AND data<=? ORDER BY data DESC,id DESC",
                    (symbol, ref.isoformat(), base_date)
                ).fetchall()
                for operation in later_ops:
                    amount = float(operation['quantidade'] or 0)
                    if operation['lado'] == 'compra':
                        quantity -= amount
                    else:
                        quantity += amount
                if quantity > 1e-8:
                    return round(quantity, 8), f'estimada pela reversão do saldo-base de {base_date}; confirme o histórico de operações'
                if base_quantity > 1e-8:
                    return round(base_quantity, 8), f'estimada pelo saldo-base de {base_date}; histórico parcial não permite determinar a quantidade exata na data-com'
                return 0.0, 'sem saldo-base; quantidade depende do histórico de operações'

    quantity = posicao(symbol, as_of=ref.isoformat())[0]
    return round(max(0.0, quantity), 8), 'histórico de operações'


def position_quantity_on_date(ticker, reference_date):
    """Quantidade detida na data, respeitando saldo-base e operações posteriores."""
    return position_quantity_on_date_details(ticker, reference_date)[0]


def previous_b3_session(day):
    """Retorna o pregão anterior quando a fonte só informa a data ex."""
    candidate = day - timedelta(days=1)
    while candidate.weekday() >= 5 or candidate in b3_holidays(candidate.year):
        candidate -= timedelta(days=1)
    return candidate


def _api_date(value):
    """Normaliza datas ISO/date-time da brapi sem deslocar o dia por fuso horário."""
    if value in (None, ''):
        return ''
    raw = str(value).strip()
    if len(raw) >= 10 and raw[4:5] == '-' and raw[7:8] == '-':
        candidate = raw[:10]
        try:
            return date.fromisoformat(candidate).isoformat()
        except ValueError:
            pass
    try:
        return datetime.fromisoformat(raw.replace('Z', '+00:00')).date().isoformat()
    except ValueError:
        for fmt in ('%d/%m/%Y', '%Y/%m/%d'):
            try:
                return datetime.strptime(raw[:10], fmt).date().isoformat()
            except ValueError:
                continue
    return ''


def _asset_type_map():
    types = {}
    for row in db().execute('SELECT ticker,tipo FROM operacoes ORDER BY id').fetchall():
        types[str(row['ticker']).upper()] = str(row['tipo'] or 'outros').lower()
    base_date = snapshot_date_for()
    if base_date:
        for row in db().execute('SELECT ticker,tipo FROM saldos_importados WHERE data_base=?', (base_date,)).fetchall():
            types[str(row['ticker']).upper()] = str(row['tipo'] or 'outros').lower()
    return types


def _fetch_brapi_dividend_events(asset_type, symbols, start_date):
    """Busca eventos em dinheiro usando os endpoints v2 dedicados de ações e FIIs."""
    if not symbols:
        return [], []
    headers = {'Authorization': f'Bearer {_brapi_token()}'} if _brapi_token() else {}
    events, errors = [], []
    if asset_type == 'fii':
        url = 'https://brapi.dev/api/v2/fii/dividends'
        response_key = 'dividends'
    else:
        url = 'https://brapi.dev/api/v2/stocks/dividends'
        response_key = 'results'
    for offset in range(0, len(symbols), 20):
        batch = symbols[offset:offset + 20]
        params = {'symbols': ','.join(batch), 'sortBy': 'paymentDate', 'sortOrder': 'asc'}
        if start_date:
            params['startDate'] = start_date
        # Algumas respostas limitam a janela padrão ao passado. Abrir endDate
        # permite receber pagamentos já anunciados para os próximos 12 meses.
        params['endDate'] = (datetime.now(TZ).date() + timedelta(days=365)).isoformat()
        if asset_type != 'fii' and _brapi_token():
            params['includeRaw'] = 'true'
        try:
            response = requests.get(url, params=params, headers=headers, timeout=18)
            if response.status_code in (400, 403) and params.get('includeRaw') == 'true':
                params.pop('includeRaw', None)
                response = requests.get(url, params=params, headers=headers, timeout=18)
            response.raise_for_status()
            payload = response.json()
            if asset_type == 'fii':
                events.extend(payload.get(response_key) or [])
            else:
                for result in payload.get(response_key) or []:
                    symbol = str(result.get('requestedSymbol') or result.get('symbol') or '').upper()
                    data = result.get('data') or {}
                    for event in data.get('cashDividends') or []:
                        events.append({**event, 'symbol': event.get('symbol') or symbol})
        except requests.RequestException as exc:
            code = getattr(getattr(exc, 'response', None), 'status_code', None)
            errors.append(f'{asset_type}: HTTP {code or "falha de conexão"} ao consultar {", ".join(batch)}')
        except (ValueError, TypeError):
            errors.append(f'{asset_type}: resposta inválida para {", ".join(batch)}')
    return events, errors


def sync_brapi_proventos(force=False, quote_items=None):
    """Importa eventos pagos e anunciados, usando a quantidade na data-com. Idempotente."""
    now_ts = time.time()
    types = _asset_type_map()
    signature = tuple(sorted(types.items()))
    if (not force and PROVENTOS_SYNC_CACHE.get('result')
            and PROVENTOS_SYNC_CACHE.get('signature') == signature
            and now_ts - PROVENTOS_SYNC_CACHE['time'] < PROVENTOS_SYNC_TTL):
        return PROVENTOS_SYNC_CACHE['result']

    if not types:
        result = {'ok': True, 'importados': 0, 'ignorados': 0, 'erros': [], 'mensagem': 'Nenhum ativo cadastrado para sincronizar.'}
        PROVENTOS_SYNC_CACHE.update(time=now_ts, result=result, signature=signature)
        return result

    # O intervalo começa no primeiro registro conhecido. Quando só existe saldo-base,
    # não presumimos que a posição já existia antes da fotografia.
    first_dates = [str(row['data'])[:10] for row in db().execute("SELECT data FROM operacoes WHERE status='executada'").fetchall() if row['data']]
    snapshot = snapshot_date_for()
    history_floor = (datetime.now(TZ).date() - timedelta(days=365)).isoformat()
    # Inclui pelo menos 12 meses de eventos, mesmo quando a primeira operação
    # cadastrada é recente ou o histórico foi importado como saldo-base.
    date_candidates = first_dates + ([snapshot] if snapshot else []) + [history_floor]
    start_date = min(date_candidates) if date_candidates else history_floor
    stock_types = {'acao', 'ações', 'bdr', 'etf', 'etfs', 'unit', 'indice', 'stocks', 'stock', 'internacional', 'etf_internacional'}
    stock_symbols = sorted(symbol for symbol, kind in types.items() if kind in stock_types)
    fii_symbols = sorted(symbol for symbol, kind in types.items() if kind in {'fii', 'fiis', 'fundo_imobiliario', 'fundos_imobiliarios'})

    # Sem token, evita enviar lotes com tickers protegidos. O sandbox da brapi documenta
    # apenas MXRF11/HGLG11 para FIIs; as ações são sincronizadas quando o endpoint autorizar.
    if not _brapi_token():
        fii_symbols = [symbol for symbol in fii_symbols if symbol in {'MXRF11', 'HGLG11'}]
        stock_symbols = [symbol for symbol in stock_symbols if symbol in {'PETR4', 'MGLU3', 'VALE3', 'ITUB4'}]

    fetched, errors = [], []
    stock_events, stock_errors = _fetch_brapi_dividend_events('acao', stock_symbols, start_date)
    fii_events, fii_errors = _fetch_brapi_dividend_events('fii', fii_symbols, start_date)
    fetched.extend((event, 'fii') for event in fii_events)
    fetched.extend((event, 'acao') for event in stock_events)
    errors.extend(stock_errors + fii_errors)

    # Fallback compatível com a cotação v1 usada pela versão estável: ela ainda
    # pode trazer eventos em dividendsData.cashDividends quando o endpoint v2
    # não está habilitado/coberto para determinado ticker. A data-com continua
    # obrigatória; não se presume elegibilidade usando exDate ou data atual.
    if quote_items is None:
        try:
            quote_items = carteira().json.get('itens', [])
        except Exception:
            quote_items = []
    # O fallback também consulta tickers que já foram vendidos: eles continuam
    # tendo histórico de proventos, mesmo sem posição atual na carteira.
    quote_symbols = set(types)
    quote_symbols.update(str(item.get('ticker') or '').upper() for item in (quote_items or []))
    for ticker in sorted(symbol for symbol in quote_symbols if symbol):
        kind = types.get(ticker, 'outros')
        if kind not in stock_types and kind not in {'fii', 'fiis', 'fundo_imobiliario', 'fundos_imobiliarios'}:
            continue
        quote = cotacao(ticker)
        for event in ((quote.get('dividendsData') or {}).get('cashDividends') or []):
            fetched.append(({**event, 'symbol': ticker}, 'fii' if kind in {'fii','fiis','fundo_imobiliario','fundos_imobiliarios'} else 'acao'))

    today = datetime.now(TZ).date()
    imported = ignored = 0
    conn = db()
    for event, source_type in fetched:
        ticker = str(event.get('symbol') or event.get('requestedSymbol') or '').strip().upper()
        if not ticker or ticker not in types:
            ignored += 1
            continue
        official_record_date = _api_date(event.get('lastDatePrior'))
        payment_date = _api_date(event.get('paymentDate'))
        ex_date = _api_date(event.get('exDate'))
        approved_date = _api_date(event.get('approvedOn'))
        # lastDatePrior é a data-com oficial. Se a fonte legada não a trouxer,
        # a véspera do exDate é usada apenas como estimativa e fica sinalizada.
        record_date = official_record_date
        estimated_date = False
        if not record_date and ex_date:
            try:
                record_date = previous_b3_session(date.fromisoformat(ex_date)).isoformat()
                estimated_date = True
            except ValueError:
                record_date = ''
        try:
            rate = float(event.get('rawRate') or event.get('rate') or event.get('value') or 0)
        except (TypeError, ValueError):
            rate = 0
        if rate <= 0:
            ignored += 1
            continue
        try:
            if record_date:
                qty, quantity_method = position_quantity_on_date_details(ticker, record_date)
            else:
                current_row = next((item for item in (quote_items or []) if str(item.get('ticker') or '').upper() == ticker), None)
                qty = float((current_row or {}).get('quantidade') or posicao(ticker)[0])
                quantity_method = 'posição atual (data-com ausente na fonte)'
        except Exception:
            qty, quantity_method = 0.0, 'quantidade indisponível'
        if qty <= 1e-8:
            ignored += 1
            continue
        total = round(qty * rate, 2)
        if total <= 0:
            ignored += 1
            continue
        label = str(event.get('label') or ('RENDIMENTO' if source_type == 'fii' else 'PROVENTO')).strip().upper()
        status = 'Pago' if payment_date and date.fromisoformat(payment_date) < today else 'A receber'
        # Data de pagamento pode ser corrigida pela fonte; não faz parte da chave.
        event_anchor = record_date or payment_date or approved_date or 'sem-data'
        event_key = '|'.join((ticker, label, event_anchor, f'{rate:.10f}'))
        remarks_parts = [str(event.get('remarks') or '').strip()]
        if estimated_date:
            remarks_parts.append('Data-com estimada pela véspera do exDate; confira o informe oficial.')
        if quantity_method.startswith('reconstruída'):
            remarks_parts.append('Quantidade reconstruída a partir do saldo-base; depende da completude das operações cadastradas.')
        elif quantity_method.startswith('posição atual'):
            remarks_parts.append('Quantidade estimada pela posição atual, pois a fonte não informou data-com.')
        remarks_text = ' '.join(part for part in remarks_parts if part)
        conn.execute('''
          INSERT INTO proventos_api (event_key,ticker,tipo_ativo,tipo_evento,data_aprovacao,data_com,data_ex,data_pagamento,valor_por_ativo,quantidade,valor_total,status,remarks,sincronizado_em)
          VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)
          ON CONFLICT(event_key) DO UPDATE SET
            tipo_ativo=excluded.tipo_ativo,tipo_evento=excluded.tipo_evento,data_aprovacao=excluded.data_aprovacao,
            data_ex=excluded.data_ex,data_pagamento=excluded.data_pagamento,valor_por_ativo=excluded.valor_por_ativo,quantidade=excluded.quantidade,
            valor_total=excluded.valor_total,status=excluded.status,remarks=excluded.remarks,sincronizado_em=excluded.sincronizado_em
        ''', (event_key,ticker,types[ticker],label,approved_date,record_date,ex_date,payment_date,rate,qty,total,status,remarks_text,datetime.now(TZ).isoformat(timespec='seconds')))
        imported += 1

    conn.execute('INSERT INTO integracao_estado(chave,valor) VALUES(?,?) ON CONFLICT(chave) DO UPDATE SET valor=excluded.valor',
                 ('brapi_proventos_ultima_sincronizacao', datetime.now(TZ).isoformat(timespec='seconds')))
    conn.commit()
    result = {
        'ok': not errors, 'importados': imported, 'ignorados': ignored, 'erros': errors,
        'mensagem': (f'{imported} evento(s) elegível(is) sincronizado(s).' if imported else 'Nenhum evento elegível retornado para os ativos cadastrados. Verifique token, plano e cobertura da brapi.'),
        'ultima_sincronizacao': datetime.now(TZ).isoformat(timespec='minutes')
    }
    PROVENTOS_SYNC_CACHE.update(time=now_ts, result=result, signature=signature)
    return result


def _is_income_event(event_type):
    return 'AMORTIZA' not in str(event_type or '').upper()


def _received_proventos_records():
    manual = [dict(row) for row in db().execute('SELECT * FROM proventos ORDER BY data,id').fetchall()]
    api_rows = [dict(row) for row in db().execute("SELECT * FROM proventos_api WHERE status='Pago' ORDER BY data_pagamento,event_key").fetchall()]
    manual_keys = {(str(row['ticker']).upper(), str(row['data'])[:10], round(float(row['valor_total'] or 0), 2)) for row in manual}
    records = []
    today = datetime.now(TZ).date()
    for row in manual:
        payment_date = _api_date(row.get('data'))
        # Esta função alimenta apenas os recebidos; lançamentos manuais futuros
        # são adicionados no dashboard à lista A receber.
        if not payment_date or date.fromisoformat(payment_date) > today:
            continue
        records.append({'ticker':str(row['ticker']).upper(),'tipo':'Provento manual','tipo_ativo':typesafe_asset_type(row['ticker']),'status':'Pago','data_com':None,'data_pagamento':payment_date,'quantidade':None,'valor_por_ativo':None,'valor_total':float(row['valor_total'] or 0),'origem':'Manual','tipo_evento':'PROVENTO'})
    for row in api_rows:
        key=(str(row['ticker']).upper(),str(row['data_pagamento'])[:10],round(float(row['valor_total'] or 0),2))
        if key in manual_keys:
            continue
        records.append({'ticker':row['ticker'],'tipo':row['tipo_evento'],'tipo_ativo':row['tipo_ativo'],'status':'Pago','data_com':row['data_com'],'data_pagamento':row['data_pagamento'],'quantidade':float(row['quantidade'] or 0),'valor_por_ativo':float(row['valor_por_ativo'] or 0),'valor_total':float(row['valor_total'] or 0),'origem':'brapi','tipo_evento':row['tipo_evento'],'remarks':row.get('remarks','')})
    return records


def typesafe_asset_type(ticker):
    return _asset_type_map().get(str(ticker or '').upper(), 'outros')


def received_proventos_by_ticker():
    totals = {}
    for row in _received_proventos_records():
        if not _is_income_event(row.get('tipo_evento')):
            continue
        ticker = row['ticker']
        totals[ticker] = totals.get(ticker, 0.0) + float(row.get('valor_total') or 0)
    return totals


def _historical_points(raw_points):
    """Normaliza os pontos da brapi e prefere adjustedClose quando a série inteira o possui."""
    parsed = []
    for point in raw_points or []:
        try:
            raw_date = point.get('date')
            if isinstance(raw_date, (int, float)):
                price_date = datetime.fromtimestamp(raw_date, TZ).date()
            else:
                price_date = date.fromisoformat(str(raw_date)[:10])
            close = float(point.get('close') or 0)
            adjusted = point.get('adjustedClose')
            adjusted = float(adjusted) if adjusted not in (None, '', 0, '0') else None
            if close > 0 or adjusted:
                parsed.append({'data': price_date, 'close': close, 'adjusted': adjusted})
        except (TypeError, ValueError, OSError):
            continue
    parsed.sort(key=lambda item: item['data'])
    if not parsed:
        return []

    # Não mistura preços ajustados e não ajustados na mesma curva.
    use_adjusted = all(point['adjusted'] and point['adjusted'] > 0 for point in parsed)
    output = []
    for point in parsed:
        price = point['adjusted'] if use_adjusted else point['close']
        if price and price > 0:
            output.append({'data': point['data'], 'preco': price, 'fechamento': point['close'], 'ajustado': use_adjusted})
    return output


def _parse_historical_payload(payload, response_key='results'):
    """Aceita o envelope v2 de ações, o envelope de FIIs e o endpoint legado v1."""
    output = {}
    rows = payload.get(response_key) or []
    for result in rows:
        symbol = str(result.get('requestedSymbol') or result.get('symbol') or '').strip().upper()
        if not symbol:
            continue
        data = result.get('data') or {}
        raw_points = (result.get('historicalDataPrice') or data.get('historicalDataPrice') or [])
        points = _historical_points(raw_points)
        if points:
            output[symbol] = points
            # Em caso de ticker renomeado, preserva a chave que foi pedida pelo usuário.
            returned = str(result.get('symbol') or '').strip().upper()
            if returned and returned not in output:
                output[returned] = points
    return output


def _request_historical_batch(url, symbols, params, response_key='results', headers=None, timeout=15):
    """Consulta vários símbolos e retorna somente as séries válidas."""
    if not symbols:
        return {}
    try:
        response = requests.get(
            url, params={**params, 'symbols': ','.join(symbols)},
            headers=headers or {}, timeout=timeout
        )
        response.raise_for_status()
        return _parse_historical_payload(response.json(), response_key=response_key)
    except (requests.RequestException, ValueError, TypeError):
        return {}


def _request_legacy_history(symbol, headers):
    """Fallback compatível com o endpoint v1, consultado por ticker para isolar erros."""
    for history_range in ('max', '1y'):
        try:
            response = requests.get(
                f'https://brapi.dev/api/quote/{symbol}',
                params={'range': history_range, 'interval': '1d'},
                headers=headers, timeout=12
            )
            response.raise_for_status()
            payload = response.json()
            result = next(iter(payload.get('results') or []), None)
            if not result:
                continue
            raw_points = result.get('historicalDataPrice') or (result.get('data') or {}).get('historicalDataPrice') or []
            points = _historical_points(raw_points)
            if points:
                return points
        except (requests.RequestException, ValueError, TypeError):
            continue
    return []


def fetch_portfolio_price_history(operations, extra_positions=None):
    """Busca preços históricos por classe e mantém séries parciais quando algum ativo não tem cobertura."""
    asset_types = {}
    first_dates = []
    for operation in operations:
        symbol = str(operation.get('ticker') or '').strip().upper()
        if not symbol:
            continue
        asset_types[symbol] = str(operation.get('tipo') or '').strip().lower()
        try:
            first_dates.append(date.fromisoformat(str(operation.get('data') or '')[:10]))
        except (TypeError, ValueError):
            pass
    for position in extra_positions or []:
        symbol = str(position.get('ticker') or '').strip().upper()
        if symbol:
            asset_types.setdefault(symbol, str(position.get('tipo') or '').strip().lower())
            try:
                first_dates.append(date.fromisoformat(str(position.get('data_base') or '')[:10]))
            except (TypeError, ValueError):
                pass

    symbols = sorted(asset_types)
    if not symbols:
        return {}
    cache_key = tuple(sorted((symbol, asset_types[symbol]) for symbol in symbols))
    now = time.time()
    cached = PORTFOLIO_HISTORY_CACHE.get(cache_key)
    if cached:
        ttl = PORTFOLIO_HISTORY_TTL if cached.get('data') else PORTFOLIO_HISTORY_EMPTY_TTL
        if now - cached['time'] < ttl:
            return cached['data']

    headers = {'Authorization': f'Bearer {_brapi_token()}'} if _brapi_token() else {}
    response_data = {}

    # Ações, BDRs e ETFs negociados em bolsa usam o histórico de ações da API v2.
    stock_types = {'acao', 'ações', 'stock', 'stocks', 'bdr', 'etf', 'etfs', 'etf_internacional', 'internacional', 'unit', 'indice'}
    stock_symbols = [symbol for symbol in symbols if asset_types[symbol] in stock_types]
    if stock_symbols:
        stock_url = 'https://brapi.dev/api/v2/stocks/historical'
        for range_value in ('max', '1y'):
            missing_stock_symbols = [symbol for symbol in stock_symbols if symbol not in response_data]
            for offset in range(0, len(missing_stock_symbols), 20):
                batch = missing_stock_symbols[offset:offset + 20]
                found = _request_historical_batch(
                    stock_url, batch,
                    {'range': range_value, 'interval': '1d', 'sortOrder': 'asc'},
                    headers=headers
                )
                response_data.update(found)
            # A resposta pode ser parcial mesmo com HTTP 200. Consulte individualmente
            # cada símbolo ausente; não deixe um ticker sem cobertura esconder os demais.
            missing_after_batch = [symbol for symbol in stock_symbols if symbol not in response_data]
            for symbol in missing_after_batch:
                found = _request_historical_batch(
                    stock_url, [symbol],
                    {'range': range_value, 'interval': '1d', 'sortOrder': 'asc'},
                    headers=headers
                )
                response_data.update(found)
            if all(symbol in response_data for symbol in stock_symbols):
                break

    # FIIs têm endpoint dedicado. A janela é explícita para cobrir desde a primeira compra.
    fii_types = {'fii', 'fiis', 'fundo_imobiliario', 'fundos_imobiliarios'}
    fii_symbols = [symbol for symbol in symbols if asset_types[symbol] in fii_types]
    if fii_symbols:
        start_date = min(first_dates).isoformat() if first_dates else (datetime.now(TZ).date() - timedelta(days=365)).isoformat()
        fii_url = 'https://brapi.dev/api/v2/fii/historical'
        fii_params = {'startDate': start_date, 'endDate': datetime.now(TZ).date().isoformat(), 'sortOrder': 'asc'}
        for offset in range(0, len(fii_symbols), 20):
            batch = fii_symbols[offset:offset + 20]
            fii_found = _request_historical_batch(
                fii_url, batch, fii_params, response_key='fiis', headers=headers
            )
            response_data.update(fii_found)
        # Uma resposta parcial não deve encerrar a busca dos demais FIIs.
        for symbol in [item for item in fii_symbols if item not in response_data]:
            fii_found = _request_historical_batch(
                fii_url, [symbol], fii_params, response_key='fiis', headers=headers
            )
            response_data.update(fii_found)

    # Classes sem endpoint histórico específico (ex.: renda fixa cadastrada manualmente)
    # não podem bloquear as séries de ativos negociados em bolsa. Para classes não reconhecidas,
    # tenta-se o endpoint legado individualmente.
    fallback_symbols = [
        symbol for symbol in symbols
        if symbol not in response_data and asset_types[symbol] not in {'renda_fixa', 'tesouro', 'tesouro_direto', 'fundos', 'fundos_de_investimento'}
    ]
    for symbol in fallback_symbols:
        points = _request_legacy_history(symbol, headers)
        if points:
            response_data[symbol] = points

    # Respostas vazias ficam em cache por apenas 2 minutos; séries válidas, por 30 minutos.
    PORTFOLIO_HISTORY_CACHE[cache_key] = {'time': now, 'data': response_data}
    return response_data

def build_portfolio_performance(operations, dividends, history=None, imported_positions=None, snapshot_date=None):
    """Calcula a rentabilidade mensal da parcela da carteira com histórico disponível.

    Compras e vendas são tratadas como fluxos externos ponderados pelo tempo (Modified Dietz).
    Quando a fonte fornece adjustedClose, ele já incorpora proventos e eventos societários;
    nesses ativos, os lançamentos manuais de proventos não são somados novamente.
    Ativos sem histórico são informados, mas não eliminam a série dos demais.
    """
    imported_positions = [dict(row) for row in (imported_positions or [])]
    snapshot_date = _api_date(snapshot_date) if snapshot_date else ''
    all_types = {
        str(op.get('ticker') or '').upper(): str(op.get('tipo') or '').strip().lower()
        for op in operations if op.get('ticker')
    }
    all_types.update({
        str(row.get('ticker') or '').upper(): str(row.get('tipo') or '').strip().lower()
        for row in imported_positions if row.get('ticker')
    })
    non_market_types = {'renda_fixa', 'tesouro', 'tesouro_direto', 'fundos', 'fundos_de_investimento'}
    all_tickers = sorted(symbol for symbol, kind in all_types.items() if kind not in non_market_types)
    history = history if history is not None else fetch_portfolio_price_history(operations, imported_positions)
    normalized = {}
    adjusted_tickers = set()
    for ticker, points in (history or {}).items():
        valid = [
            point for point in points
            if isinstance(point.get('data'), date) and float(point.get('preco') or 0) > 0
        ]
        if valid:
            normalized[str(ticker).upper()] = sorted(valid, key=lambda item: item['data'])
            if all(bool(point.get('ajustado')) for point in valid):
                adjusted_tickers.add(str(ticker).upper())

    available_tickers = set(normalized)
    missing_symbols = sorted(set(all_tickers) - available_tickers)
    empty = {
        'series_12m': [], 'series_total': [], 'rentabilidade_12m': None,
        'rentabilidade_total': None, 'meses_disponiveis': 0,
        'primeiro_mes': None, 'historico_completo': False,
        'ativos_sem_historico': missing_symbols,
        'ativos_com_historico': len(available_tickers), 'total_ativos': len(all_tickers),
        'historico_parcial': bool(missing_symbols) or bool(snapshot_date)
    }
    snapshot_map = {str(row.get('ticker') or '').upper(): row for row in imported_positions if row.get('ticker')}

    def snapshot_only_result():
        snapshot_cost = sum(float(row.get('quantidade') or 0) * float(row.get('preco_medio') or 0) for row in imported_positions)
        snapshot_value = sum(float(row.get('quantidade') or 0) * float(row.get('preco_base') or 0) for row in imported_positions)
        snapshot_return = (snapshot_value / snapshot_cost - 1) * 100 if snapshot_cost > 0 else None
        if snapshot_return is None or not snapshot_date:
            return empty
        return {
            **empty, 'series_total': [{'mes': snapshot_date[:7], 'valor': round(snapshot_return, 4)}],
            'rentabilidade_total': round(snapshot_return, 2), 'meses_disponiveis': 0,
            'primeiro_mes': snapshot_date[:7], 'resultado_por_saldo_base': True,
            'historico_parcial': True, 'ativos_com_historico': 0, 'total_ativos': len(all_tickers)
        }

    if not normalized:
        return snapshot_only_result()
    if not operations and not snapshot_map:
        return empty

    def adjusted_operation_values(ticker, trade_date, quantity, price, costs):
        points = normalized.get(ticker) or []
        factor = 1.0
        if ticker in adjusted_tickers:
            reference = next((point for point in reversed(points) if point['data'] <= trade_date), None)
            if reference and reference.get('fechamento') and reference.get('preco'):
                candidate = float(reference['preco']) / float(reference['fechamento'])
                if 0.2 <= candidate <= 5:
                    factor = candidate
        return quantity * price * factor, costs * factor

    executed = []
    for op in operations:
        try:
            op_date = date.fromisoformat(str(op.get('data') or '')[:10])
            ticker = str(op.get('ticker') or '').upper()
            if ticker not in available_tickers:
                continue
            executed.append({
                **op, '_date': op_date, '_ticker': ticker,
                '_quantity': max(0.0, float(op.get('quantidade') or 0)),
                '_price': max(0.0, float(op.get('preco') or 0)),
                '_costs': max(0.0, float(op.get('custos') or 0))
            })
        except (TypeError, ValueError):
            continue
    executed.sort(key=lambda item: (item['_date'], int(item.get('id') or 0)))
    if not executed:
        return snapshot_only_result()
    first_operation = min(item['_date'] for item in executed)
    today = datetime.now(TZ).date()
    month_cursor = date(first_operation.year, first_operation.month, 1)
    month_end = date(today.year, today.month, 1)
    month_keys = []
    while month_cursor <= month_end:
        month_keys.append(month_cursor.strftime('%Y-%m'))
        month_cursor = (month_cursor.replace(day=28) + timedelta(days=4)).replace(day=1)

    base_day = date.fromisoformat(snapshot_date) if snapshot_date else None

    def held_quantities(cutoff):
        """Reconstrói posições em torno da fotografia, sem somar o histórico duas vezes."""
        holdings = {}
        if base_day and snapshot_map:
            holdings = {
                ticker: max(0.0, float(row.get('quantidade') or 0))
                for ticker, row in snapshot_map.items()
            }
            if cutoff < base_day:
                # Volta da fotografia para a data consultada, revertendo operações conhecidas.
                for op in executed:
                    if cutoff < op['_date'] <= base_day:
                        current = holdings.get(op['_ticker'], 0.0)
                        if op.get('lado') == 'compra':
                            current -= op['_quantity']
                        else:
                            current += op['_quantity']
                        holdings[op['_ticker']] = current
            else:
                # Avança a partir da fotografia, aplicando somente operações posteriores.
                for op in executed:
                    if base_day < op['_date'] <= cutoff:
                        current = holdings.get(op['_ticker'], 0.0)
                        if op.get('lado') == 'compra':
                            current += op['_quantity']
                        else:
                            current -= op['_quantity']
                        holdings[op['_ticker']] = current
        else:
            for op in executed:
                if op['_date'] > cutoff:
                    break
                current = holdings.get(op['_ticker'], 0.0)
                current += op['_quantity'] if op.get('lado') == 'compra' else -op['_quantity']
                holdings[op['_ticker']] = current
        return {ticker: max(0.0, qty) for ticker, qty in holdings.items() if qty > 1e-8}

    def portfolio_value(cutoff):
        holdings = held_quantities(cutoff)
        total = 0.0
        priced_positions = 0
        for ticker, qty in holdings.items():
            points = normalized.get(ticker) or []
            previous = next((point for point in reversed(points) if point['data'] <= cutoff), None)
            # Cotação ausente/antiga para um ativo não elimina o histórico dos outros.
            # O retorno passa a representar explicitamente a parcela coberta pela fonte.
            price = float(previous['preco']) if previous and (cutoff - previous['data']).days <= 45 else 0.0
            if price <= 0:
                continue
            total += qty * price
            priced_positions += 1
        if holdings and not priced_positions:
            return None
        return total

    dividend_by_ticker_month = {}
    for item in dividends:
        ticker = str(item.get('ticker') or '').upper()
        # adjustedClose incorpora proventos. Só soma o valor manual para séries sem ajuste.
        if ticker in adjusted_tickers:
            continue
        try:
            key = (ticker, str(item.get('data') or '')[:7])
            if key[1] and len(key[1]) == 7:
                dividend_by_ticker_month[key] = dividend_by_ticker_month.get(key, 0.0) + float(item.get('valor_total') or 0)
        except (TypeError, ValueError):
            continue

    monthly_returns = []
    first_year, first_month = int(month_keys[0][:4]), int(month_keys[0][5:7])
    previous_end = date(first_year, first_month, 1) - timedelta(days=1)
    for key in month_keys:
        year, month = int(key[:4]), int(key[5:7])
        next_month = (date(year, month, 28) + timedelta(days=4)).replace(day=1)
        last_day = next_month - timedelta(days=1)
        end_date = min(last_day, today)
        start_date = previous_end
        start_value = portfolio_value(start_date)
        end_value = portfolio_value(end_date)
        if end_value is None:
            previous_end = end_date
            continue
        if start_value is None:
            if not held_quantities(start_date):
                start_value = 0.0
            else:
                previous_end = end_date
                continue

        period_days = max(1, (end_date - start_date).days)
        signed_flows = 0.0
        weighted_flows = 0.0
        for op in executed:
            if not (start_date < op['_date'] <= end_date):
                continue
            trade_notional, adjusted_costs = adjusted_operation_values(
                op['_ticker'], op['_date'], op['_quantity'], op['_price'], op['_costs']
            )
            flow = (trade_notional + adjusted_costs) if op.get('lado') == 'compra' else -(trade_notional - adjusted_costs)
            weight = max(0.0, min(1.0, (end_date - op['_date']).days / period_days))
            signed_flows += flow
            weighted_flows += flow * weight

        income = sum(
            value for (ticker, month_key), value in dividend_by_ticker_month.items()
            if month_key == key and ticker in available_tickers
        )
        denominator = start_value + weighted_flows
        if denominator > 1e-8:
            month_return = (end_value - start_value - signed_flows + income) / denominator
            if -0.95 < month_return < 5:
                monthly_returns.append({'mes': key, 'retorno': month_return})
        previous_end = end_date

    if not monthly_returns:
        # Exibe apenas o retorno atual da fotografia quando a fonte não fornece
        # candles suficientes. Não cria pontos mensais intermediários artificiais.
        return snapshot_only_result()

    total_factor = 1.0
    series_total = []
    rolling_returns = []
    series_12m = []
    for row in monthly_returns:
        factor = 1.0 + row['retorno']
        total_factor *= factor
        rolling_returns.append(factor)
        if len(rolling_returns) > 12:
            rolling_returns.pop(0)
        rolling_factor = 1.0
        for value in rolling_returns:
            rolling_factor *= value
        series_total.append({'mes': row['mes'], 'valor': round((total_factor - 1.0) * 100, 4)})
        series_12m.append({'mes': row['mes'], 'valor': round((rolling_factor - 1.0) * 100, 4)})

    return {
        **empty,
        'series_12m': series_12m,
        'series_total': series_total,
        'rentabilidade_12m': round((rolling_factor - 1.0) * 100, 2) if len(monthly_returns) >= 12 else None,
        'rentabilidade_total': round((total_factor - 1.0) * 100, 2),
        'meses_disponiveis': len(monthly_returns),
        'primeiro_mes': monthly_returns[0]['mes'],
        'historico_completo': len(monthly_returns) >= 12 and not missing_symbols and not snapshot_date,
        'resultado_por_saldo_base': False,
        'historico_parcial': bool(missing_symbols) or bool(snapshot_date)
    }



def _benchmark_monthly_from_yahoo(symbol, start_date, end_date):
    """Obtém fechamentos mensais do Yahoo Finance; retorna None quando o símbolo não tem cobertura."""
    start = date.fromisoformat(str(start_date)[:10]) - timedelta(days=45)
    end = date.fromisoformat(str(end_date)[:10]) + timedelta(days=2)
    period1 = int(datetime.combine(start, clock_time.min, TZ).timestamp())
    period2 = int(datetime.combine(end, clock_time.min, TZ).timestamp())
    url = f'https://query1.finance.yahoo.com/v8/finance/chart/{requests.utils.quote(symbol, safe="")}'
    response = requests.get(
        url,
        params={'period1': period1, 'period2': period2, 'interval': '1mo', 'events': 'div,splits'},
        headers={'User-Agent': 'Mozilla/5.0 LonelyWallet/2.0'},
        timeout=15
    )
    response.raise_for_status()
    payload = response.json()
    result = next(iter(payload.get('chart', {}).get('result') or []), None)
    if not result:
        return None
    timestamps = result.get('timestamp') or []
    indicators = result.get('indicators') or {}
    quote_rows = (indicators.get('quote') or [{}])[0]
    adjusted_rows = (indicators.get('adjclose') or [{}])[0]
    closes = adjusted_rows.get('adjclose') or quote_rows.get('close') or []
    points = []
    for stamp, close in zip(timestamps, closes):
        try:
            if close is None or float(close) <= 0:
                continue
            month_key = datetime.fromtimestamp(int(stamp), ZoneInfo('UTC')).strftime('%Y-%m')
            points.append((month_key, float(close)))
        except (TypeError, ValueError, OSError):
            continue
    # Yahoo retorna pontos de fechamento mensal. O primeiro ponto é a base 0%.
    by_month = {}
    for month_key, close in points:
        by_month[month_key] = close
    ordered = sorted(by_month.items())
    if len(ordered) < 2:
        return None
    base = ordered[0][1]
    return [{'mes': key, 'valor': round((value / base - 1) * 100, 4)} for key, value in ordered if base > 0]


def _benchmark_monthly_bcb(code, start_date, end_date):
    """Calcula CDI/IPCA acumulados a partir das séries oficiais SGS do Banco Central."""
    if code == 'CDI':
        points = _sgs_series(12, start_date, end_date)
        monthly_factors = {}
        for point_date, daily_pct in points:
            key = point_date.strftime('%Y-%m')
            monthly_factors[key] = monthly_factors.get(key, 1.0) * (1 + float(daily_pct) / 100.0)
        monthly_returns = {key: (factor - 1) * 100 for key, factor in monthly_factors.items()}
    elif code == 'IPCA':
        points = _sgs_series(433, start_date, end_date)
        monthly_returns = {point_date.strftime('%Y-%m'): float(value) for point_date, value in points}
    else:
        return None
    cumulative = 1.0
    output = []
    for key in sorted(monthly_returns):
        cumulative *= 1 + monthly_returns[key] / 100.0
        output.append({'mes': key, 'valor': round((cumulative - 1) * 100, 4)})
    return output if len(output) >= 1 else None


def _benchmark_monthly_hg(symbol, start_date, end_date, token):
    """Histórico mensal HG Brasil. A API documenta BVSP e IFIX no endpoint histórico."""
    response = requests.get(
        'https://api.hgbrasil.com/v2/finance/historical',
        params={'key':token,'symbols':symbol,'start_date':date.fromisoformat(str(start_date)[:10]).isoformat(),
                'end_date':date.fromisoformat(str(end_date)[:10]).isoformat(),'sample_by':'1M'},
        timeout=20
    )
    response.raise_for_status()
    payload = response.json()
    if payload.get('valid_key') is False:
        raise ValueError('Chave HG Brasil inválida.')
    rows = (payload.get('results') or {}).get(symbol.upper()) or (payload.get('results') or {}).get(symbol.lower()) or {}
    by_month = {}
    for timestamp, values in rows.items():
        try:
            month_key = str(timestamp)[:7]
            close = float((values or {}).get('close') or 0)
            if close > 0:
                by_month[month_key] = close
        except (TypeError, ValueError, AttributeError):
            continue
    ordered = sorted(by_month.items())
    if len(ordered) < 2:
        return None
    base = ordered[0][1]
    return [{'mes':key,'valor':round((value/base-1)*100,4)} for key,value in ordered if base>0]


def _benchmark_monthly_brapi(symbol, start_date, end_date, token):
    """Histórico mensal brapi; aceita apenas uma resposta real do endpoint histórico."""
    response = requests.get(
        'https://brapi.dev/api/v2/stocks/historical',
        params={'symbols':symbol,'startDate':date.fromisoformat(str(start_date)[:10]).isoformat(),
                'endDate':date.fromisoformat(str(end_date)[:10]).isoformat(),'interval':'1mo','sortOrder':'asc'},
        headers={'Authorization':f'Bearer {token}'}, timeout=20
    )
    response.raise_for_status()
    found = _parse_historical_payload(response.json())
    points = found.get(symbol.upper()) or []
    by_month = {}
    for point in points:
        price = float(point.get('preco') or 0)
        if price > 0:
            by_month[point['data'].strftime('%Y-%m')] = price
    ordered = sorted(by_month.items())
    if len(ordered) < 2:
        return None
    base = ordered[0][1]
    return [{'mes':key,'valor':round((value/base-1)*100,4)} for key,value in ordered if base>0]


@app.route('/api/benchmarks')
def api_benchmarks():
    """Séries mensais de referência. Nenhuma série é simulada quando a fonte não responde."""
    today = datetime.now(TZ).date()
    try:
        start = date.fromisoformat(request.args.get('start', (today - timedelta(days=365 * 5)).isoformat())[:10])
    except (TypeError, ValueError):
        start = today - timedelta(days=365 * 5)
    start = max(start, date(1990, 1, 1))
    cache_key = start.isoformat()
    cached = BENCHMARK_CACHE.get(cache_key)
    if cached and time.time() - cached['time'] < BENCHMARK_CACHE_TTL:
        return jsonify(cached['data'])

    end = today
    # Alguns índices da B3 possuem símbolos alternativos no Yahoo Finance.
    # Tentamos cada alternativa em sequência, sem fabricar séries quando nenhuma responde.
    index_symbols = {
        'IBOV': ['^BVSP', 'IBOV.SA'],
        'IFIX': ['IFIX.SA', '^IFIX'],
        'SMLL': ['SMLL.SA', '^SMLL'],
        'IDIV': ['IDIV.SA', '^IDIV'],
        'IVVB11': ['IVVB11.SA']
    }
    series = {}
    source_map = {}
    unavailable = []
    # CDI/IPCA são consultados diretamente nas séries oficiais do BCB.
    for code in ('CDI', 'IPCA'):
        try:
            data = _benchmark_monthly_bcb(code, start, end)
            if data:
                series[code] = data
            else:
                unavailable.append(code)
        except (requests.RequestException, ValueError, TypeError):
            unavailable.append(code)

    hg_token = _get_api_token('hgbrasil')
    brapi_token = _brapi_token()
    hg_symbols = {'IBOV':'BVSP','IFIX':'IFIX'}
    for code, symbols in index_symbols.items():
        data = None
        # HG Brasil possui endpoint histórico documentado para BVSP e IFIX.
        if hg_token and code in hg_symbols:
            try:
                data = _benchmark_monthly_hg(hg_symbols[code], start, end, hg_token)
                if data:
                    series[code] = data
                    result_source = 'HG Brasil · histórico mensal'
            except (requests.RequestException, ValueError, TypeError, KeyError):
                data = None
        # O endpoint histórico da brapi pode complementar o Ibovespa quando houver cobertura no plano.
        if not data and brapi_token and code == 'IBOV':
            try:
                data = _benchmark_monthly_brapi('^BVSP', start, end, brapi_token)
                if data:
                    series[code] = data
                    result_source = 'brapi · histórico mensal (^BVSP)'
            except (requests.RequestException, ValueError, TypeError, KeyError):
                data = None
        if not data:
            for symbol in symbols:
                try:
                    data = _benchmark_monthly_from_yahoo(symbol, start, end)
                    if data:
                        series[code] = data
                        result_source = f"Yahoo Finance ({symbol})"
                        break
                except (requests.RequestException, ValueError, TypeError, KeyError):
                    continue
        if data:
            # Preserve the actual provider selected for this series.
            source_map[code] = result_source
        else:
            unavailable.append(code)

    result = {
        'series': series,
        'unavailable': unavailable,
        'source': {'CDI': 'Banco Central do Brasil (SGS 12)', 'IPCA': 'Banco Central do Brasil (SGS 433)', **source_map},
        'start': start.isoformat(),
        'end': end.isoformat()
    }
    BENCHMARK_CACHE[cache_key] = {'time': time.time(), 'data': result}
    return jsonify(result)

@app.route('/api/dashboard')
def dashboard():
    # A sincronização é automática, mas protegida por cache de 1 hora. O botão da
    # página Proventos permite forçar uma atualização quando o usuário desejar.
    portfolio_before_sync = carteira().json
    sync_status = sync_brapi_proventos(force=False, quote_items=portfolio_before_sync.get('itens', []))
    # Recalcula o resumo para que proventos pagos sincronizados agora já apareçam.
    portfolio = carteira().json
    ops = [dict(r) for r in db().execute("SELECT * FROM operacoes WHERE status='executada' ORDER BY data,id").fetchall()]
    scheduled = [dict(r) for r in db().execute("SELECT * FROM operacoes WHERE status='agendada' ORDER BY data_execucao,id").fetchall()]
    received_records = _received_proventos_records()
    pending_rows = [dict(r) for r in db().execute("SELECT * FROM proventos_api WHERE status='A receber' ORDER BY data_pagamento,ticker").fetchall()]
    manual_rows = [dict(r) for r in db().execute('SELECT * FROM proventos ORDER BY data').fetchall()]

    monthly = {}
    for op in ops:
        month = op['data'][:7]
        sign = 1 if op['lado'] == 'compra' else -1
        monthly[month] = monthly.get(month, 0) + sign * (op['quantidade'] * op['preco'] + float(op.get('custos') or 0))

    today = datetime.now(TZ).date()
    month_keys = []
    cursor = date(today.year, today.month, 1)
    for _ in range(11):
        cursor = (cursor.replace(day=1) - timedelta(days=1)).replace(day=1)
    for _ in range(12):
        month_keys.append(cursor.strftime('%Y-%m'))
        cursor = (cursor.replace(day=28) + timedelta(days=4)).replace(day=1)

    received_by_month = {}
    detailed = []
    for item in received_records:
        payment_date = _api_date(item.get('data_pagamento'))
        if not payment_date:
            continue
        record = {**item, 'data_pagamento': payment_date}
        detailed.append(record)
        if _is_income_event(record.get('tipo_evento')):
            month = payment_date[:7]
            received_by_month[month] = received_by_month.get(month, 0.0) + float(record.get('valor_total') or 0)

    # Pagamentos futuros já declarados. Prioriza lastDatePrior; quando a cotação
    # antiga só informa exDate, a data-com aproximada e a quantidade são sinalizadas.
    upcoming = []
    manual_keys = {(str(row['ticker']).upper(), str(row['data'])[:10], round(float(row['valor_total'] or 0), 2)) for row in manual_rows}
    # Lançamentos manuais com data futura representam proventos anunciados,
    # não recebidos. Preserve-os como A receber em vez de os misturar ao histórico pago.
    for row in manual_rows:
        payment_date = _api_date(row.get('data'))
        if payment_date and date.fromisoformat(payment_date) > today:
            upcoming.append({
                'ticker':str(row['ticker']).upper(),'tipo':'Provento manual','tipo_ativo':typesafe_asset_type(row['ticker']),
                'status':'A receber','data_com':None,'data_pagamento':payment_date,'quantidade':None,
                'valor_por_ativo':None,'valor_total':float(row['valor_total'] or 0),'origem':'Manual',
                'tipo_evento':'PROVENTO','remarks':'Data e valor informados manualmente.'
            })
    for row in pending_rows:
        key=(str(row['ticker']).upper(),str(row['data_pagamento'])[:10],round(float(row['valor_total'] or 0),2))
        if key in manual_keys:
            continue
        upcoming.append({
            'ticker':row['ticker'],'tipo':row['tipo_evento'],'tipo_ativo':row['tipo_ativo'],
            'status':'A receber','data_com':row['data_com'],'data_pagamento':row['data_pagamento'],
            'quantidade':float(row['quantidade'] or 0),'valor_por_ativo':float(row['valor_por_ativo'] or 0),
            'valor_total':float(row['valor_total'] or 0),'origem':'brapi','tipo_evento':row['tipo_evento'],
            'remarks':row.get('remarks','')
        })

    # Fallback visual da versão estável: eventos anunciados vindos da cotação v1
    # aparecem mesmo se o módulo v2 de dividendos não estiver habilitado no plano.
    # Esses itens são deduplicados com o histórico sincronizado e não substituem
    # os pagamentos confirmados do banco.
    pending_keys = {
        (str(item.get('ticker') or '').upper(), str(item.get('data_pagamento') or '')[:10],
         str(item.get('tipo_evento') or item.get('tipo') or '').upper(), round(float(item.get('valor_por_ativo') or 0), 8))
        for item in upcoming
    }
    manual_pending_keys = {
        (str(row['ticker']).upper(), str(row['data'])[:10], round(float(row['valor_total'] or 0), 2))
        for row in manual_rows if str(row.get('data') or '')[:10] > today.isoformat()
    }
    for item in portfolio.get('itens', []):
        ticker = str(item.get('ticker') or '').upper()
        kind = str(item.get('tipo') or '').lower()
        if not ticker or kind == 'renda_fixa':
            continue
        quote = cotacao(ticker)
        events = ((quote.get('dividendsData') or {}).get('cashDividends') or [])
        for event in events:
            payment_date = _api_date(event.get('paymentDate') or event.get('payment_date'))
            if not payment_date or date.fromisoformat(payment_date) < today:
                continue
            try:
                rate = float(event.get('rawRate') or event.get('rate') or event.get('value') or 0)
            except (TypeError, ValueError):
                rate = 0.0
            if rate <= 0:
                continue
            official_date = _api_date(event.get('lastDatePrior'))
            ex_date = _api_date(event.get('exDate'))
            estimated = False
            record_date = official_date
            if not record_date and ex_date:
                try:
                    record_date = previous_b3_session(date.fromisoformat(ex_date)).isoformat()
                    estimated = True
                except ValueError:
                    record_date = ''
            try:
                if record_date:
                    quantity, quantity_method = position_quantity_on_date_details(ticker, record_date)
                else:
                    quantity = float(item.get('quantidade') or 0)
                    quantity_method = 'posição atual (data-com ausente na fonte)'
            except Exception:
                quantity, quantity_method = 0.0, 'quantidade indisponível'
            if quantity <= 1e-8:
                continue
            event_type = str(event.get('label') or event.get('type') or ('RENDIMENTO' if kind == 'fii' else 'PROVENTO')).upper()
            dedupe = (ticker, payment_date, event_type, round(rate, 8))
            if dedupe in pending_keys or (ticker, payment_date, round(quantity * rate, 2)) in manual_pending_keys:
                continue
            remarks = str(event.get('remarks') or '')
            if estimated:
                remarks = (remarks + ' Data-com estimada pela véspera do exDate; confira o informe oficial.').strip()
            if quantity_method.startswith('reconstruída'):
                remarks = (remarks + ' Quantidade reconstruída a partir do saldo-base; depende da completude das operações cadastradas.').strip()
            elif quantity_method.startswith('posição atual'):
                remarks = (remarks + ' Quantidade estimada pela posição atual, pois a fonte não informou data-com.').strip()
            upcoming.append({
                'ticker':ticker,'tipo':event_type,'tipo_ativo':kind,'status':'A receber',
                'data_com':record_date or None,'data_pagamento':payment_date,
                'quantidade':round(quantity,8),'valor_por_ativo':round(rate,8),
                'valor_total':round(quantity*rate,2),'origem':'Cotação v1','tipo_evento':event_type,
                'remarks':remarks
            })
            pending_keys.add(dedupe)

    monthly_values = [{'mes':m,'recebido':round(received_by_month.get(m,0),2)} for m in month_keys]
    total_12m = round(sum(x['recebido'] for x in monthly_values), 2)
    portfolio_total = round(sum(float(x.get('valor_atual') or 0) for x in portfolio.get('itens', [])), 2)
    type_totals = {}
    for event in detailed:
        if _is_income_event(event.get('tipo_evento')):
            type_totals[event['ticker']] = type_totals.get(event['ticker'], 0.0) + float(event.get('valor_total') or 0)

    base_date = snapshot_date_for()
    imported_rows = [dict(row) for row in db().execute(
        'SELECT ticker,tipo,quantidade,preco_medio,preco_base,data_base,nome,origem FROM saldos_importados WHERE data_base=? ORDER BY tipo,nome,ticker',
        (base_date,)
    ).fetchall()] if base_date else []
    # Modified Dietz recebe pagamentos efetivos; adjustedClose evita contar o
    # mesmo provento duas vezes. A posição-base também informa a cobertura atual.
    performance_dividends = [
        {'ticker':item['ticker'],'data':item['data_pagamento'],'valor_total':item['valor_total'],'tipo_evento':item.get('tipo_evento')}
        for item in detailed if _is_income_event(item.get('tipo_evento'))
    ]
    performance_history = fetch_portfolio_price_history(ops, imported_rows)
    performance = build_portfolio_performance(ops, performance_dividends, history=performance_history, imported_positions=imported_rows, snapshot_date=base_date)
    # Séries por classe permitem que o filtro da página Rentabilidade altere
    # os indicadores e o gráfico sem misturar classes diferentes.
    return_types = sorted({str(row.get('tipo') or '').strip().lower() for row in [*ops, *imported_rows] if row.get('tipo')})
    performance_by_type = {}
    for asset_type in return_types:
        type_ops = [row for row in ops if str(row.get('tipo') or '').strip().lower() == asset_type]
        type_positions = [row for row in imported_rows if str(row.get('tipo') or '').strip().lower() == asset_type]
        type_tickers = {str(row.get('ticker') or '').upper() for row in [*type_ops, *type_positions]}
        type_dividends = [row for row in performance_dividends if str(row.get('ticker') or '').upper() in type_tickers]
        performance_by_type[asset_type] = build_portfolio_performance(
            type_ops, type_dividends, history=performance_history,
            imported_positions=type_positions, snapshot_date=base_date
        )
    return jsonify(**portfolio, operacoes=ops, agendadas=scheduled, proventos=manual_rows,
        saldos_importados=imported_rows, data_base_snapshot=base_date,
        aportes_mensais=monthly, proventos_mensais=received_by_month,
        metas=[dict(r) for r in db().execute('SELECT * FROM metas').fetchall()],
        rentabilidade_historica=performance, rentabilidade_por_tipo=performance_by_type,
        proventos_dashboard={
            'mensal':monthly_values,'total_12m':total_12m,'media_mensal':round(total_12m/12,2),
            'total_carteira':portfolio_total,'recebidos':sorted(detailed,key=lambda x:x['data_pagamento'],reverse=True),
            'a_receber':sorted(upcoming,key=lambda x:x['data_pagamento']),
            'distribuicao':type_totals,'sincronizacao':sync_status
        })


@app.route('/api/ativos/busca')
def busca_ativos():
    termo = str(request.args.get('q', '')).strip()
    tipo = str(request.args.get('tipo', 'acao')).lower()
    if len(termo) < 2:
        return jsonify(itens=[])

    # O endpoint de listagem da brapi permite filtrar por ticker/nome e subtipo.
    params = {'search': termo, 'limit': 10, 'sortBy': 'name', 'sortOrder': 'asc'}
    if tipo == 'acao':
        params['type'] = 'stock'
    elif tipo == 'fii':
        params.update({'type': 'fund', 'subType': 'fii'})
    elif tipo == 'etf':
        params.update({'type': 'fund', 'subType': 'etf'})
    elif tipo == 'bdr':
        params['type'] = 'bdr'
    elif tipo == 'stocks':
        params['type'] = 'stock'
    elif tipo in ('internacional', 'cripto', 'renda_fixa', 'reit', 'tesouro', 'fundo', 'outros'):
        return jsonify(itens=[], mensagem='Busca automática ainda não disponível para esta classe. Digite o ticker manualmente.')

    headers = {'Authorization': f'Bearer {_brapi_token()}'} if _brapi_token() else {}
    try:
        response = requests.get('https://brapi.dev/api/quote/list',
                                params=params, headers=headers, timeout=8)
        response.raise_for_status()
        payload = response.json()
        itens = []
        for item in payload.get('stocks', []):
            ticker = str(item.get('stock') or item.get('symbol') or '').upper()
            if not ticker:
                continue
            itens.append({
                'ticker': ticker,
                'nome': item.get('name') or ticker,
                'preco': item.get('close') or item.get('regularMarketPrice'),
                'tipo': tipo
            })
        return jsonify(itens=itens)
    except requests.RequestException:
        return jsonify(itens=[], mensagem='Não foi possível consultar a lista de ativos agora.'), 502


@app.route('/api/distribuicao', methods=['GET', 'PUT'])
def distribuicao():
    if request.method == 'GET':
        rows = db().execute('SELECT id,nome,percentual,ordem FROM distribuicao_alvo ORDER BY ordem,id').fetchall()
        return jsonify(itens=[dict(r) for r in rows])
    payload = request.get_json(silent=True) or {}
    itens = payload.get('itens', [])
    if not isinstance(itens, list) or not itens:
        return json_error('Adicione pelo menos uma classe de ativo.')
    cleaned = []
    names = set()
    total = 0.0
    try:
        for item in itens:
            nome = str(item.get('nome', '')).strip()
            percentual = float(item.get('percentual', 0))
            key = nome.casefold()
            if not nome or len(nome) > 50 or key in names or percentual < 0 or percentual > 100:
                raise ValueError()
            names.add(key)
            total += percentual
            cleaned.append((nome, percentual))
        if abs(total - 100.0) > 0.001:
            return json_error('A soma dos percentuais precisa ser exatamente 100%.')
    except (TypeError, ValueError):
        return json_error('Confira os nomes e percentuais informados.')
    con = db()
    con.execute('DELETE FROM distribuicao_alvo')
    con.executemany('INSERT INTO distribuicao_alvo(nome,percentual,ordem) VALUES(?,?,?)',
                    [(nome, percentual, idx) for idx, (nome, percentual) in enumerate(cleaned, 1)])
    con.commit()
    rows = con.execute('SELECT id,nome,percentual,ordem FROM distribuicao_alvo ORDER BY ordem,id').fetchall()
    return jsonify(ok=True, itens=[dict(r) for r in rows])


def _tax_year():
    try:
        year = int(request.args.get('ano', datetime.now(TZ).year))
        if year < 2000 or year > 2100:
            raise ValueError()
        return year
    except (TypeError, ValueError):
        raise ValueError('Informe um ano-base válido.')


def build_irpf_summary(year):
    """Organiza posições e vendas a partir do histórico cadastrado; não calcula imposto."""
    year_end = date(year, 12, 31).isoformat()
    ops = db().execute(
        "SELECT * FROM operacoes WHERE status='executada' AND data<=? ORDER BY data,id",
        (year_end,)
    ).fetchall()
    holdings = {}
    sales = {}
    for op in ops:
        ticker = str(op['ticker']).upper()
        kind = str(op['tipo'] or 'outros')
        qty = max(0.0, float(op['quantidade'] or 0))
        price = max(0.0, float(op['preco'] or 0))
        costs = max(0.0, float(op['custos'] or 0))
        item = holdings.setdefault(ticker, {
            'ticker': ticker, 'tipo': kind, 'quantidade': 0.0, 'custo_total': 0.0,
            'preco_medio': 0.0
        })
        if op['lado'] == 'compra':
            item['quantidade'] += qty
            item['custo_total'] += qty * price + costs
        else:
            available = item['quantidade']
            sold = min(qty, available)
            if sold > 0:
                average = item['custo_total'] / available if available > 0 else 0.0
                basis = average * sold
                proceeds = max(0.0, sold * price - costs)
                profit = proceeds - basis
                month = str(op['data'])[:7]
                group = 'fiis' if kind in ('fii', 'reit') else 'comuns'
                bucket = sales.setdefault((group, month), {
                    'grupo': group, 'mes': month, 'vendas': 0.0, 'custo': 0.0,
                    'resultado': 0.0, 'operacoes': 0
                })
                bucket['vendas'] += proceeds
                bucket['custo'] += basis
                bucket['resultado'] += profit
                bucket['operacoes'] += 1
                item['quantidade'] -= sold
                item['custo_total'] = max(0.0, item['custo_total'] - basis)
        item['preco_medio'] = item['custo_total'] / item['quantidade'] if item['quantidade'] > 1e-8 else 0.0

    positions = []
    snapshot_for_year = snapshot_date_for(year_end)
    if snapshot_for_year:
        # O saldo-base substitui as posições acumuladas antes da captura;
        # operações posteriores até 31/12 continuam sendo aplicadas por posicao().
        snapshot_tickers = {str(row[0]).upper() for row in db().execute(
            'SELECT ticker FROM saldos_importados WHERE data_base=?', (snapshot_for_year,)
        ).fetchall()}
        post_snapshot_tickers = {str(row[0]).upper() for row in db().execute(
            "SELECT DISTINCT ticker FROM operacoes WHERE status='executada' AND data>? AND data<=?",
            (snapshot_for_year, year_end)
        ).fetchall()}
        for ticker in sorted(snapshot_tickers | post_snapshot_tickers):
            qty, average = posicao(ticker, as_of=year_end)
            if qty <= 1e-8:
                continue
            imported = imported_balance(ticker, year_end)
            first = db().execute('SELECT tipo FROM operacoes WHERE ticker=? ORDER BY id LIMIT 1',(ticker,)).fetchone()
            kind = (imported.get('tipo') if imported else None) or (first['tipo'] if first else 'outros')
            positions.append({'ticker':ticker,'tipo':kind,'quantidade':round(qty,8),'preco_medio':round(average,4),'custo_total':round(qty*average,2)})
    else:
        for item in holdings.values():
            if item['quantidade'] <= 1e-8:
                continue
            positions.append({
                'ticker': item['ticker'], 'tipo': item['tipo'],
                'quantidade': round(item['quantidade'], 8),
                'preco_medio': round(item['preco_medio'], 4),
                'custo_total': round(item['custo_total'], 2)
            })
    positions.sort(key=lambda x: (x['tipo'], x['ticker']))

    incomes = [dict(row) for row in db().execute(
        "SELECT * FROM irpf_lancamentos WHERE substr(data,1,4)=? ORDER BY data DESC,id DESC",
        (str(year),)
    ).fetchall()]
    exempt = sum(float(x['valor']) for x in incomes if x['grupo'] == 'isento')
    exclusive = sum(float(x['valor']) for x in incomes if x['grupo'] == 'exclusiva')
    monthly_sales = [dict(v, vendas=round(v['vendas'], 2), custo=round(v['custo'], 2), resultado=round(v['resultado'], 2))
                     for _, v in sorted(sales.items(), key=lambda pair: pair[0][1])]
    return {
        'ano': year,
        'posicoes': positions,
        'rendimentos': incomes,
        'operacoes': monthly_sales,
        'resumo': {
            'bens': round(sum(x['custo_total'] for x in positions), 2),
            'isentos': round(exempt, 2),
            'exclusivos': round(exclusive, 2),
            'resultado_vendas': round(sum(x['resultado'] for x in monthly_sales), 2),
        }
    }


@app.route('/api/irpf/resumo')
def irpf_resumo():
    try:
        return jsonify(build_irpf_summary(_tax_year()))
    except ValueError as exc:
        return json_error(str(exc))


@app.route('/api/irpf/lancamentos', methods=['GET', 'POST'])
def irpf_lancamentos():
    if request.method == 'GET':
        try:
            year = _tax_year()
        except ValueError as exc:
            return json_error(str(exc))
        rows = db().execute(
            "SELECT * FROM irpf_lancamentos WHERE substr(data,1,4)=? ORDER BY data DESC,id DESC",
            (str(year),)
        ).fetchall()
        return jsonify(itens=[dict(row) for row in rows])
    payload = request.get_json(silent=True) or {}
    try:
        grupo = str(payload.get('grupo', '')).strip().lower()
        natureza = str(payload.get('natureza', '')).strip()
        fonte = str(payload.get('fonte_pagadora', '')).strip()
        documento = str(payload.get('documento', '')).strip()
        valor = float(payload.get('valor', 0))
        data_registro = str(payload.get('data', ''))
        observacoes = str(payload.get('observacoes', '')).strip()
        date.fromisoformat(data_registro)
        if grupo not in ('isento', 'exclusiva') or not natureza or not fonte or valor <= 0:
            raise ValueError()
        if len(natureza) > 100 or len(fonte) > 160 or len(documento) > 40 or len(observacoes) > 1000:
            raise ValueError()
    except (TypeError, ValueError):
        return json_error('Confira o grupo, natureza, fonte pagadora, valor e data.')
    cur = db().execute(
        'INSERT INTO irpf_lancamentos(grupo,natureza,fonte_pagadora,documento,valor,data,observacoes) VALUES(?,?,?,?,?,?,?)',
        (grupo, natureza, fonte, documento, valor, data_registro, observacoes)
    )
    db().commit()
    return jsonify(ok=True, id=cur.lastrowid)


@app.route('/api/irpf/lancamentos/<int:item_id>', methods=['PUT', 'DELETE'])
def irpf_lancamento_item(item_id):
    current = db().execute('SELECT * FROM irpf_lancamentos WHERE id=?', (item_id,)).fetchone()
    if not current:
        return json_error('Rendimento não encontrado.', 404)
    if request.method == 'DELETE':
        db().execute('DELETE FROM irpf_lancamentos WHERE id=?', (item_id,))
        db().commit()
        return jsonify(ok=True)
    payload = request.get_json(silent=True) or {}
    try:
        grupo = str(payload.get('grupo', current['grupo'])).strip().lower()
        natureza = str(payload.get('natureza', current['natureza'])).strip()
        fonte = str(payload.get('fonte_pagadora', current['fonte_pagadora'])).strip()
        documento = str(payload.get('documento', current['documento'] or '')).strip()
        valor = float(payload.get('valor', current['valor']))
        data_registro = str(payload.get('data', current['data']))
        observacoes = str(payload.get('observacoes', current['observacoes'] or '')).strip()
        date.fromisoformat(data_registro)
        if grupo not in ('isento', 'exclusiva') or not natureza or not fonte or valor <= 0:
            raise ValueError()
        if len(natureza) > 100 or len(fonte) > 160 or len(documento) > 40 or len(observacoes) > 1000:
            raise ValueError()
    except (TypeError, ValueError):
        return json_error('Confira os dados do rendimento.')
    db().execute(
        'UPDATE irpf_lancamentos SET grupo=?,natureza=?,fonte_pagadora=?,documento=?,valor=?,data=?,observacoes=? WHERE id=?',
        (grupo, natureza, fonte, documento, valor, data_registro, observacoes, item_id)
    )
    db().commit()
    return jsonify(ok=True)


@app.route('/api/darfs', methods=['GET', 'POST'])
def darfs():
    if request.method == 'GET':
        year = str(request.args.get('ano', datetime.now(TZ).year))
        if not year.isdigit() or not 2000 <= int(year) <= 2100:
            return json_error('Informe um ano válido.')
        rows = db().execute(
            "SELECT * FROM darfs WHERE substr(competencia,1,4)=? ORDER BY competencia DESC,vencimento DESC,id DESC",
            (year,)
        ).fetchall()
        return jsonify(itens=[dict(row) for row in rows])
    payload = request.get_json(silent=True) or {}
    try:
        competencia = str(payload.get('competencia', '')).strip()
        if len(competencia) != 7 or competencia[4] != '-':
            raise ValueError()
        date.fromisoformat(competencia + '-01')
        codigo = str(payload.get('codigo', '')).strip()
        valor = float(payload.get('valor', 0))
        vencimento = str(payload.get('vencimento', '')).strip()
        pago_em = str(payload.get('pago_em', '')).strip()
        status = str(payload.get('status', 'pendente')).strip().lower()
        observacoes = str(payload.get('observacoes', '')).strip()
        date.fromisoformat(vencimento)
        if pago_em:
            date.fromisoformat(pago_em)
        if not codigo or len(codigo) > 20 or valor <= 0 or status not in ('pendente', 'pago'):
            raise ValueError()
        if status == 'pago' and not pago_em:
            raise ValueError()
        if len(observacoes) > 1000:
            raise ValueError()
    except (TypeError, ValueError):
        return json_error('Confira competência, código, valor, vencimento e situação. Para DARF pago, informe a data do pagamento.')
    cur = db().execute(
        'INSERT INTO darfs(competencia,codigo,valor,vencimento,pago_em,status,observacoes) VALUES(?,?,?,?,?,?,?)',
        (competencia, codigo, valor, vencimento, pago_em, status, observacoes)
    )
    db().commit()
    return jsonify(ok=True, id=cur.lastrowid)


@app.route('/api/darfs/<int:darf_id>', methods=['PUT', 'DELETE'])
def darf_item(darf_id):
    current = db().execute('SELECT * FROM darfs WHERE id=?', (darf_id,)).fetchone()
    if not current:
        return json_error('DARF não encontrado.', 404)
    if request.method == 'DELETE':
        db().execute('DELETE FROM darfs WHERE id=?', (darf_id,))
        db().commit()
        return jsonify(ok=True)
    payload = request.get_json(silent=True) or {}
    merged = {key: payload.get(key, current[key]) for key in ('competencia', 'codigo', 'valor', 'vencimento', 'pago_em', 'status', 'observacoes')}
    try:
        competencia = str(merged['competencia']).strip()
        if len(competencia) != 7 or competencia[4] != '-':
            raise ValueError()
        date.fromisoformat(competencia + '-01')
        codigo = str(merged['codigo']).strip()
        valor = float(merged['valor'])
        vencimento = str(merged['vencimento']).strip()
        pago_em = str(merged['pago_em'] or '').strip()
        status = str(merged['status']).strip().lower()
        observacoes = str(merged['observacoes'] or '').strip()
        date.fromisoformat(vencimento)
        if pago_em:
            date.fromisoformat(pago_em)
        if not codigo or len(codigo) > 20 or valor <= 0 or status not in ('pendente', 'pago'):
            raise ValueError()
        if status == 'pago' and not pago_em:
            raise ValueError()
        if len(observacoes) > 1000:
            raise ValueError()
    except (TypeError, ValueError):
        return json_error('Confira os dados do DARF. Para DARF pago, informe a data do pagamento.')
    db().execute(
        'UPDATE darfs SET competencia=?,codigo=?,valor=?,vencimento=?,pago_em=?,status=?,observacoes=? WHERE id=?',
        (competencia, codigo, valor, vencimento, pago_em, status, observacoes, darf_id)
    )
    db().commit()
    return jsonify(ok=True)


@app.route('/api/ativo/<ticker>')
def ativo(ticker): return jsonify(cotacao(ticker.upper()))


if __name__ == '__main__': app.run(host='0.0.0.0',port=8080)
