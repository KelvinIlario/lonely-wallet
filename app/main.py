import os, io, hashlib, json
from datetime import date
from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from openpyxl import load_workbook

from . import db, quotes

app = FastAPI(title="Lonely Wallet", version="1.7.0")
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


@app.post("/api/importar")
async def importar(arquivo: UploadFile = File(...)):
    """Importa e preserva todos os registros do extrato B3; compra/venda alimenta posições."""
    raw = await arquivo.read()
    try:
        wb = load_workbook(io.BytesIO(raw), data_only=True)
    except Exception:
        raise HTTPException(400, "Não foi possível abrir o Excel. Envie um arquivo .xlsx válido.")
    ws = wb["Movimentação"] if "Movimentação" in wb.sheetnames else wb.active
    headers = [str(c.value or "").strip().casefold() for c in next(ws.iter_rows(min_row=1, max_row=1))]
    aliases = {
        "entrada": ("entrada/saída", "entrada/saida"),
        "data": ("data",),
        "mov": ("movimentação", "movimentacao"),
        "produto": ("produto",),
        "instituicao": ("instituição", "instituicao"),
        "qtd": ("quantidade",),
        "preco": ("preço unitário", "preco unitario"),
        "valor": ("valor da operação", "valor da operacao"),
    }
    idx = {k: next((i for i,h in enumerate(headers) if any(a in h for a in names)), None) for k,names in aliases.items()}
    if any(v is None for v in idx.values()):
        raise HTTPException(400, "Planilha não reconhecida. Esperava as 8 colunas do extrato de Movimentação da B3.")
    c = db.conn()
    importadas = duplicadas = operacoes = 0
    for row in ws.iter_rows(min_row=2, values_only=True):
        vals = [row[idx[k]] if idx[k] < len(row) else None for k in aliases]
        entrada, dt, mov, produto, instituicao, qtd, preco, valor = vals
        if not any(v is not None for v in vals): continue
        def num(v):
            try: return float(v or 0)
            except (TypeError, ValueError): return 0.0
        if hasattr(dt, "strftime"): data = dt.strftime("%Y-%m-%d")
        else:
            s = str(dt or "").strip()
            try: data = __import__("datetime").datetime.strptime(s[:10], "%d/%m/%Y").strftime("%Y-%m-%d")
            except Exception: data = s[:10]
        produto_s = str(produto or "").strip()
        ticker = produto_s.split(" - ")[0].strip().upper() if produto_s else ""
        qtd_n, preco_n, valor_n = num(qtd), num(preco), num(valor)
        canonical = json.dumps([str(entrada or ""),data,str(mov or ""),produto_s,str(instituicao or ""),qtd_n,preco_n,valor_n], ensure_ascii=False)
        digest = hashlib.sha256(canonical.encode()).hexdigest()
        cur = c.execute("""INSERT OR IGNORE INTO movimentos_b3
          (hash,entrada_saida,data,movimentacao,produto,ticker,instituicao,quantidade,preco_unitario,valor_operacao)
          VALUES(?,?,?,?,?,?,?,?,?,?)""",
          (digest,str(entrada or ""),data,str(mov or ""),produto_s,ticker,str(instituicao or ""),qtd_n,preco_n,valor_n))
        if cur.rowcount == 0:
            duplicadas += 1
            continue
        importadas += 1
        # Somente registros explicitamente identificados como compra/venda alteram posição.
        if "compra / venda" in str(mov or "").casefold() and ticker and qtd_n:
            signed = -abs(qtd_n) if str(entrada or "").casefold() in ("debito","débito","saida","saída") else abs(qtd_n)
            tipo = "fii" if ticker.endswith("11") else "acao"
            c.execute("INSERT OR IGNORE INTO ativos(ticker,tipo,mercado) VALUES(?,?,?)",(ticker,tipo,"BR"))
            c.execute("INSERT INTO operacoes(ticker,data,qtd,preco) VALUES(?,?,?,?)",(ticker,data,signed,preco_n))
            operacoes += 1
    c.commit()
    c.close()
    return {"importadas": importadas, "duplicadas": duplicadas, "operacoes_criadas": operacoes,
            "mensagem": "Todos os tipos de movimentação foram preservados no histórico B3."}


@app.get("/api/movimentos-b3")
def listar_movimentos_b3():
    c = db.conn()
    rows = [dict(r) for r in c.execute("SELECT * FROM movimentos_b3 ORDER BY data DESC, id DESC")]
    c.close()
    return rows


@app.get("/api/metas")
def listar_metas():
    c = db.conn()
    rows = [dict(r) for r in c.execute("SELECT * FROM metas ORDER BY id DESC")]
    c.close()
    return rows


class Meta(BaseModel):
    nome: str
    valor_alvo: float
    valor_atual: float = 0
    prazo: str = ""
    observacao: str = ""


@app.post("/api/metas")
def criar_meta(meta: Meta):
    c = db.conn()
    cur = c.execute("INSERT INTO metas(nome,valor_alvo,valor_atual,prazo,observacao) VALUES(?,?,?,?,?)",
                    (meta.nome,meta.valor_alvo,meta.valor_atual,meta.prazo,meta.observacao))
    c.commit()
    result = {"id":cur.lastrowid, **meta.model_dump()}
    c.close()
    return result


@app.delete("/api/metas/{meta_id}")
def excluir_meta(meta_id: int):
    c = db.conn()
    c.execute("DELETE FROM metas WHERE id=?", (meta_id,))
    c.commit()
    c.close()
    return {"ok": True}


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
