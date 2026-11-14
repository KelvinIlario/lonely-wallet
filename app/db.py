import os, sqlite3
DATA_DIR = os.environ.get("DATA_DIR", "/data")
os.makedirs(DATA_DIR, exist_ok=True)
DB_PATH = os.path.join(DATA_DIR, "carteira.db")

def conn():
    c = sqlite3.connect(DB_PATH)
    c.row_factory = sqlite3.Row
    c.execute("PRAGMA foreign_keys=ON")
    return c

def _columns(c, table):
    return {r["name"] for r in c.execute(f"PRAGMA table_info({table})")}

def init():
    c = conn()
    c.executescript("""
    CREATE TABLE IF NOT EXISTS ativos (
        ticker TEXT PRIMARY KEY, tipo TEXT NOT NULL, mercado TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS operacoes (
        id INTEGER PRIMARY KEY AUTOINCREMENT, ticker TEXT NOT NULL,
        data TEXT NOT NULL, qtd REAL NOT NULL, preco REAL NOT NULL
    );
    CREATE TABLE IF NOT EXISTS proventos (
        id INTEGER PRIMARY KEY AUTOINCREMENT, ticker TEXT NOT NULL,
        data TEXT NOT NULL, valor_por_cota REAL NOT NULL, tipo TEXT,
        UNIQUE(ticker, data, valor_por_cota)
    );
    CREATE TABLE IF NOT EXISTS movimentacoes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        data TEXT NOT NULL, ticker TEXT, tipo TEXT NOT NULL,
        descricao TEXT NOT NULL, quantidade REAL DEFAULT 0,
        preco_unitario REAL DEFAULT 0, valor_total REAL DEFAULT 0,
        origem TEXT DEFAULT 'manual', chave TEXT UNIQUE
    );
    """)
    # Migração aditiva: preserva integralmente as tabelas existentes.
    opcols = _columns(c, "operacoes")
    for name, decl in {
        "tipo_operacao": "TEXT DEFAULT 'compra'",
        "descricao": "TEXT DEFAULT ''",
        "origem": "TEXT DEFAULT 'manual'",
        "chave_importacao": "TEXT"
    }.items():
        if name not in opcols: c.execute(f"ALTER TABLE operacoes ADD COLUMN {name} {decl}")
    pcols = _columns(c, "proventos")
    for name, decl in {
        "valor_total": "REAL DEFAULT 0",
        "quantidade": "REAL DEFAULT 0",
        "origem": "TEXT DEFAULT 'manual'",
        "chave_importacao": "TEXT"
    }.items():
        if name not in pcols: c.execute(f"ALTER TABLE proventos ADD COLUMN {name} {decl}")
    c.execute("CREATE UNIQUE INDEX IF NOT EXISTS ux_operacoes_import ON operacoes(chave_importacao) WHERE chave_importacao IS NOT NULL")
    c.execute("CREATE UNIQUE INDEX IF NOT EXISTS ux_proventos_import ON proventos(chave_importacao) WHERE chave_importacao IS NOT NULL")
    c.commit(); c.close()
