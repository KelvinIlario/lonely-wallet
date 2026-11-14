import os, sqlite3

DATA_DIR = os.environ.get("DATA_DIR", "/data")
os.makedirs(DATA_DIR, exist_ok=True)
DB_PATH = os.path.join(DATA_DIR, "carteira.db")


def conn():
    c = sqlite3.connect(DB_PATH)
    c.row_factory = sqlite3.Row
    return c


def init():
    c = conn()
    c.executescript("""
    CREATE TABLE IF NOT EXISTS ativos (
        ticker TEXT PRIMARY KEY,
        tipo TEXT NOT NULL,
        mercado TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS operacoes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ticker TEXT NOT NULL,
        data TEXT NOT NULL,
        qtd REAL NOT NULL,
        preco REAL NOT NULL
    );
    CREATE TABLE IF NOT EXISTS proventos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ticker TEXT NOT NULL,
        data TEXT NOT NULL,
        valor_por_cota REAL NOT NULL,
        tipo TEXT,
        UNIQUE(ticker, data, valor_por_cota)
    );
    CREATE TABLE IF NOT EXISTS movimentos_b3 (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        hash TEXT NOT NULL UNIQUE,
        entrada_saida TEXT,
        data TEXT,
        movimentacao TEXT,
        produto TEXT,
        ticker TEXT,
        instituicao TEXT,
        quantidade REAL,
        preco_unitario REAL,
        valor_operacao REAL,
        importado_em TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS metas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT NOT NULL,
        valor_alvo REAL NOT NULL DEFAULT 0,
        valor_atual REAL NOT NULL DEFAULT 0,
        prazo TEXT,
        observacao TEXT
    );
    """)
    c.commit()
    c.close()
