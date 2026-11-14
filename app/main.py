import os, io, hashlib, json
from datetime import date, datetime
from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from openpyxl import load_workbook

from . import db, quotes

app = FastAPI(title="Lonely Wallet")
db.init()


class Operacao(BaseModel):
    ticker: str
    tipo: str
    mercado: str
    data: str
    qtd: float
    preco: float


def atualizar_proventos(ticker, mercado):
    c = db.conn()
    try:
        for data, valor, tipo in quotes.proventos(ticker, mercado):
            c.execute(
                "INSERT OR IGNORE INTO proventos(ticker,data,valor_por_cota,tipo) VALUES(?,?,?,?)",
                (ticker, data, valor, tipo),
            )
        c.commit()
    except Exception as e:
        print("erro proventos", ticker, e)
    finally:
        c.close()


@app.post("/api/operacoes")
def add_operacao(op: Operacao):
    t = op.ticker.upper().strip()
    c = db.conn()
    c.execute(
        "INSERT OR IGNORE INTO ativos(ticker,tipo,mercado) VALUES(?,?,?)",
        (t, op.tipo, op.mercado),
    )
    c.execute(
        "INSERT INTO operacoes(ticker,data,qtd,preco) VALUES(?,?,?,?)",
        (t, op.data, op.qtd, op.preco),
    )
    c.commit()
    c.close()
    atualizar_proventos(t, op.mercado)
    return {"ok": True}


@app.get("/api/operacoes")
def list_operacoes():
    c = db.conn()
    rows = [dict(r) for r in c.execute("SELECT * FROM operacoes ORDER BY data DESC")]
    c.close()
    return rows


@app.delete("/api/operacoes/{op_id}")
def del_operacao(op_id: int):
    c = db.conn()
    c.execute("DELETE FROM operacoes WHERE id=?", (op_id,))
    c.commit()
    c.close()
    return {"ok": True}


@app.get("/api/carteira")
def carteira():
    c = db.conn()
    ativos = c.execute("SELECT * FROM ativos").fetchall()
    saida = []
    total_investido = total_atual = total_proventos = 0.0
    for a in ativos:
        ops = c.execute(
            "SELECT * FROM operacoes WHERE ticker=? ORDER BY data", (a["ticker"],)
        ).fetchall()
        qtd = custo = 0.0
        menor_preco = None
        for o in ops:
            if o["qtd"] > 0:
                qtd += o["qtd"]
                custo += o["qtd"] * o["preco"]
                if menor_preco is None or o["preco"] < menor_preco:
                    menor_preco = o["preco"]
            else:
                pm = custo / qtd if qtd else 0
                qtd += o["qtd"]
                custo += o["qtd"] * pm
        if qtd <= 0:
            continue
        preco_medio = custo / qtd
        try:
            atual = quotes.preco_atual(a["ticker"], a["mercado"])
        except Exception:
            atual = preco_medio
        provs = c.execute(
            "SELECT * FROM proventos WHERE ticker=? ORDER BY data DESC", (a["ticker"],)
        ).fetchall()
        hoje = date.today().isoformat()
        primeira_compra = ops[0]["data"]
        recebidos = a_receber = 0.0
        for p in provs:
            if p["data"] < primeira_compra:
                continue
            valor = p["valor_por_cota"] * qtd
            if p["data"] <= hoje:
                recebidos += valor
            else:
                a_receber += valor
        saida.append({
            "ticker": a["ticker"], "tipo": a["tipo"], "mercado": a["mercado"],
            "qtd": qtd, "preco_medio": preco_medio, "menor_preco": menor_preco,
            "preco_atual": atual, "investido": custo, "valor_atual": atual * qtd,
            "lucro": atual * qtd - custo,
            "lucro_pct": (atual / preco_medio - 1) * 100 if preco_medio else 0,
            "proventos_recebidos": recebidos, "proventos_a_receber": a_receber,
        })
        total_investido += custo
        total_atual += atual * qtd
        total_proventos += recebidos
    c.close()
    return {
        "ativos": saida,
        "totais": {
            "investido": total_investido, "atual": total_atual,
            "lucro": total_atual - total_investido,
            "proventos": total_proventos,
        },
    }



def _normalizar_texto(v):
    import unicodedata
    return "".join(ch for ch in unicodedata.normalize("NFKD", str(v or "")).lower() if not unicodedata.combining(ch))


def _ler_planilha_b3(conteudo):
    wb = load_workbook(io.BytesIO(conteudo), data_only=True)
    ws = wb.active
    linhas = list(ws.iter_rows(values_only=True))
    if not linhas:
        raise HTTPException(400, "A planilha está vazia.")
    cab = [_normalizar_texto(c).strip() for c in linhas[0]]

    def achar(*termos):
        for i, nome in enumerate(cab):
            if any(t in nome for t in termos):
                return i
        return None

    idx = {
        "entrada": achar("entrada/saida", "entrada saida"),
        "data": achar("data"),
        "movimentacao": achar("movimentacao"),
        "produto": achar("produto", "codigo"),
        "instituicao": achar("instituicao"),
        "quantidade": achar("quantidade"),
        "preco": achar("preco unitario", "preco"),
        "valor": achar("valor da operacao", "valor"),
    }
    # Também mantém compatibilidade com o formato antigo de negociação da B3.
    antigo = all(x is not None for x in (achar("data"), achar("tipo de movimenta", "compra/venda"), achar("codigo", "produto"), achar("quantidade"), achar("preco")))
    novo = all(idx[k] is not None for k in ("entrada", "data", "movimentacao", "produto", "quantidade"))
    if not novo and not antigo:
        raise HTTPException(400, "Formato não reconhecido. Envie o Excel de movimentações da B3.")
    resultado = []
    for numero, row in enumerate(linhas[1:], start=2):
        if not row or not any(v is not None for v in row):
            continue
        if novo:
            def val(k, default=None):
                i = idx[k]
                return row[i] if i is not None and i < len(row) else default
            entrada, data_v, mov, produto = val("entrada"), val("data"), val("movimentacao"), val("produto")
            instituicao, qtd, preco, valor = val("instituicao"), val("quantidade", 0), val("preco"), val("valor")
        else:
            # Exportação antiga: registra como movimentação identificada, sem presumir preço/mercado ausentes.
            def col(*termos):
                for i, h in enumerate(cab):
                    if any(t in h for t in termos): return i
                return None
            entrada, data_v = "", row[col("data")]
            mov = row[col("tipo de movimenta", "compra/venda")]
            produto = row[col("codigo", "produto")]
            instituicao, qtd, preco, valor = "", row[col("quantidade")], row[col("preco")], None
        if not produto:
            continue
        if hasattr(data_v, "strftime"):
            data_iso = data_v.strftime("%Y-%m-%d")
        else:
            s = str(data_v or "").strip()
            try:
                data_iso = date.fromisoformat(s[:10]).isoformat()
            except Exception:
                try: data_iso = datetime.strptime(s, "%d/%m/%Y").date().isoformat()
                except Exception: data_iso = s
        produto_s = str(produto).strip()
        ticker = produto_s.split(" ")[0].upper()
        mov_s = str(mov or "").strip()
        norm_mov = _normalizar_texto(mov_s)
        def numero_pt(v):
            if v in (None, "", "-"): return None
            if isinstance(v, (int,float)): return float(v)
            return float(str(v).replace(".", "").replace(",", ".")) if "," in str(v) else float(v)
        try: qtd_n = numero_pt(qtd)
        except Exception: qtd_n = None
        try: preco_n = numero_pt(preco)
        except Exception: preco_n = None
        try: valor_n = numero_pt(valor)
        except Exception: valor_n = None
        categoria = "revisar"
        if "rendimento" in norm_mov or "dividendo" in norm_mov or "juros sobre capital" in norm_mov or norm_mov == "jcp":
            categoria = "provento"
        elif "compra" in norm_mov or "venda" in norm_mov:
            categoria = "operacao_explicita"
        elif "subscricao" in norm_mov:
            categoria = "subscricao"
        elif "transferencia" in norm_mov:
            categoria = "transferencia_revisar"
        elif "atualizacao" in norm_mov:
            categoria = "atualizacao"
        raw = {
            "linha": numero, "entrada_saida": str(entrada or ""), "data": data_iso,
            "movimentacao": mov_s, "produto": produto_s, "ticker": ticker,
            "instituicao": str(instituicao or ""), "quantidade": qtd_n,
            "preco_unitario": preco_n, "valor_operacao": valor_n,
            "categoria": categoria,
        }
        raw["hash"] = hashlib.sha256(json.dumps(raw, ensure_ascii=False, sort_keys=True).encode()).hexdigest()
        resultado.append(raw)
    return resultado


@app.post("/api/importar/preview")
async def preview_importacao(arquivo: UploadFile = File(...)):
    conteudo = await arquivo.read()
    linhas = _ler_planilha_b3(conteudo)
    c = db.conn()
    existentes = {r["hash"] for r in c.execute("SELECT hash FROM importacoes_b3")}
    c.close()
    novos = [r for r in linhas if r["hash"] not in existentes]
    resumo = {}
    for r in novos:
        resumo[r["categoria"]] = resumo.get(r["categoria"], 0) + 1
    return {"total_linhas": len(linhas), "novas": len(novos), "duplicadas": len(linhas)-len(novos),
            "resumo": resumo, "amostra": novos[:8], "arquivo": arquivo.filename}


@app.post("/api/importar")
async def importar(arquivo: UploadFile = File(...)):
    """Importa e preserva todos os eventos do extrato B3, sem converter eventos ambíguos em compra/venda."""
    linhas = _ler_planilha_b3(await arquivo.read())
    c = db.conn()
    c.execute("""CREATE TABLE IF NOT EXISTS importacoes_b3 (
        id INTEGER PRIMARY KEY AUTOINCREMENT, hash TEXT UNIQUE NOT NULL,
        linha INTEGER, entrada_saida TEXT, data TEXT, movimentacao TEXT,
        produto TEXT, ticker TEXT, instituicao TEXT, quantidade REAL,
        preco_unitario REAL, valor_operacao REAL, categoria TEXT,
        importado_em TEXT DEFAULT CURRENT_TIMESTAMP
    )""")
    novos = 0
    proventos = 0
    for r in linhas:
        cur = c.execute("""INSERT OR IGNORE INTO importacoes_b3
            (hash,linha,entrada_saida,data,movimentacao,produto,ticker,instituicao,quantidade,preco_unitario,valor_operacao,categoria)
            VALUES(?,?,?,?,?,?,?,?,?,?,?,?)""",
            (r["hash"],r["linha"],r["entrada_saida"],r["data"],r["movimentacao"],r["produto"],r["ticker"],
             r["instituicao"],r["quantidade"],r["preco_unitario"],r["valor_operacao"],r["categoria"]))
        if cur.rowcount == 0:
            continue
        novos += 1
        if r["categoria"] == "provento" and r["preco_unitario"] is not None and r["ticker"]:
            tipo = r["movimentacao"]
            c.execute("INSERT OR IGNORE INTO ativos(ticker,tipo,mercado) VALUES(?,?,?)",
                      (r["ticker"], "fii" if r["ticker"].endswith("11") else "acao", "BR"))
            c.execute("INSERT OR IGNORE INTO proventos(ticker,data,valor_por_cota,tipo) VALUES(?,?,?,?)",
                      (r["ticker"],r["data"],r["preco_unitario"],tipo))
            proventos += 1
    c.commit()
    resumo = {r["categoria"]: c.execute("SELECT COUNT(*) FROM importacoes_b3 WHERE hash=?", (r["hash"],)).fetchone()[0] for r in []}
    c.close()
    return {"importadas": novos, "proventos_registrados": proventos,
            "mensagem": "Eventos importados para o histórico. Transferências e eventos ambíguos foram preservados para conferência, sem alterar automaticamente a quantidade de ativos."}


@app.get("/api/importacoes-b3")
def listar_importacoes_b3():
    c = db.conn()
    rows = [dict(r) for r in c.execute("SELECT * FROM importacoes_b3 ORDER BY data DESC, id DESC LIMIT 500")]
    c.close()
    return rows

@app.post("/api/atualizar-proventos")
def atualizar_todos():
    c = db.conn()
    ativos = c.execute("SELECT * FROM ativos").fetchall()
    c.close()
    for a in ativos:
        atualizar_proventos(a["ticker"], a["mercado"])
    return {"ok": True}


STATIC = os.path.join(os.path.dirname(__file__), "static")


@app.get("/")
def index():
    return FileResponse(os.path.join(STATIC, "index.html"))


app.mount("/", StaticFiles(directory=STATIC), name="static")
