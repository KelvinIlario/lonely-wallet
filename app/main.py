import os, io
from datetime import date
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


@app.post("/api/importar")
async def importar(arquivo: UploadFile = File(...)):
    """Importa planilha .xlsx de negociacao da B3 (Portal do Investidor)."""
    wb = load_workbook(io.BytesIO(await arquivo.read()), data_only=True)
    ws = wb.active
    cab = [str(c.value or "").strip().lower() for c in next(ws.iter_rows(min_row=1, max_row=1))]

    def col(*nomes):
        for i, h in enumerate(cab):
            if any(n in h for n in nomes):
                return i
        return None

    i_data = col("data")
    i_tipo = col("tipo de movimenta", "compra/venda")
    i_cod = col("código", "codigo", "produto")
    i_qtd = col("quantidade")
    i_preco = col("preço", "preco")
    if None in (i_data, i_tipo, i_cod, i_qtd, i_preco):
        raise HTTPException(400, "Não reconheci as colunas da planilha.")
    novos = 0
    c = db.conn()
    for row in ws.iter_rows(min_row=2, values_only=True):
        if not row[i_cod]:
            continue
        ticker = str(row[i_cod]).split(" ")[0].upper().strip()
        qtd = float(row[i_qtd] or 0)
        if "venda" in str(row[i_tipo]).lower():
            qtd = -abs(qtd)
        d = row[i_data]
        data = d.strftime("%Y-%m-%d") if hasattr(d, "strftime") else "-".join(str(d)[:10].split("/")[::-1])
        tipo = "fii" if ticker.endswith("11") else "acao"
        c.execute("INSERT OR IGNORE INTO ativos(ticker,tipo,mercado) VALUES(?,?,?)", (ticker, tipo, "BR"))
        c.execute(
            "INSERT INTO operacoes(ticker,data,qtd,preco) VALUES(?,?,?,?)",
            (ticker, data, qtd, float(row[i_preco] or 0)),
        )
        novos += 1
    c.commit()
    c.close()
    return {"importadas": novos}


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
