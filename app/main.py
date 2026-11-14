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
    """Importa operações de uma planilha .xlsx exportada da B3."""
    nome = (arquivo.filename or "").lower()
    if not nome.endswith(".xlsx"):
        raise HTTPException(400, "Envie uma planilha Excel no formato .xlsx.")
    try:
        wb = load_workbook(io.BytesIO(await arquivo.read()), data_only=True, read_only=True)
        ws = wb.active
        linhas = ws.iter_rows(values_only=True)
        cabecalho = next(linhas, None)
        if not cabecalho:
            raise HTTPException(400, "A planilha está vazia.")
        cab = [str(v or "").strip().lower() for v in cabecalho]

        def localizar(*termos):
            for i, titulo in enumerate(cab):
                if any(t in titulo for t in termos):
                    return i
            return None

        i_data = localizar("data")
        i_mov = localizar("entrada/saída", "entrada/saida", "tipo de movimenta",
                          "compra/venda", "movimentação", "movimentacao", "tipo")
        i_prod = localizar("produto", "código de negociação", "codigo de negociacao",
                           "código", "codigo", "ativo", "ticker")
        i_qtd = localizar("quantidade")
        i_preco = localizar("preço unitário", "preco unitario", "preço", "preco")
        if None in (i_data, i_mov, i_prod, i_qtd, i_preco):
            raise HTTPException(400, "Não reconheci as colunas. Confira se o arquivo é o extrato de negociações da B3.")

        def numero(valor):
            if valor is None or valor == "":
                return 0.0
            if isinstance(valor, (int, float)):
                return float(valor)
            txt = str(valor).strip().replace("R$", "").replace(" ", "")
            if "," in txt:
                txt = txt.replace(".", "").replace(",", ".")
            return float(txt)

        def data_iso(valor):
            if hasattr(valor, "strftime"):
                return valor.strftime("%Y-%m-%d")
            from datetime import datetime
            txt = str(valor).strip()
            for fmt in ("%d/%m/%Y", "%Y-%m-%d", "%d-%m-%Y"):
                try:
                    return datetime.strptime(txt[:10], fmt).strftime("%Y-%m-%d")
                except ValueError:
                    pass
            raise ValueError("data inválida")

        c = db.conn()
        novos = duplicados = ignorados = 0
        try:
            for row in linhas:
                if not row or len(row) <= max(i_data, i_mov, i_prod, i_qtd, i_preco):
                    ignorados += 1
                    continue
                produto = str(row[i_prod] or "").strip()
                if not produto:
                    continue
                ticker = produto.split()[0].upper().strip()
                movimento = str(row[i_mov] or "").strip().lower()
                qtd = abs(numero(row[i_qtd]))
                preco = numero(row[i_preco])
                if not ticker or qtd <= 0 or preco < 0:
                    ignorados += 1
                    continue
                if any(p in movimento for p in ("venda", "saída", "saida")):
                    qtd = -qtd
                elif not any(p in movimento for p in ("compra", "entrada")):
                    ignorados += 1
                    continue
                data = data_iso(row[i_data])
                tipo = "fii" if ticker.endswith("11") else "acao"
                existente = c.execute(
                    """SELECT 1 FROM operacoes WHERE ticker=? AND data=?
                       AND ABS(qtd-?)<0.0000001 AND ABS(preco-?)<0.0000001 LIMIT 1""",
                    (ticker, data, qtd, preco)
                ).fetchone()
                if existente:
                    duplicados += 1
                    continue
                c.execute("INSERT OR IGNORE INTO ativos(ticker,tipo,mercado) VALUES(?,?,?)",
                          (ticker, tipo, "BR"))
                c.execute("INSERT INTO operacoes(ticker,data,qtd,preco) VALUES(?,?,?,?)",
                          (ticker, data, qtd, preco))
                novos += 1
            c.commit()
        finally:
            c.close()
        return {"importadas": novos, "duplicadas": duplicados, "ignoradas": ignorados}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(400, f"Não foi possível ler a planilha: {e}")


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
