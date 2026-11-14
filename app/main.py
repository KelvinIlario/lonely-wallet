import os, io, re, sqlite3
from datetime import date, datetime, timedelta
from collections import defaultdict
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
    tipo: str = "acao"
    mercado: str = "BR"
    data: str
    qtd: float
    preco: float

def tipo_label(t):
    t=(t or "").lower()
    if "fii" in t: return "FII"
    if "fix" in t or "tesouro" in t or "cdb" in t or "lci" in t or "lca" in t: return "Renda fixa"
    if "etf" in t: return "ETF"
    if "crip" in t: return "Cripto"
    return "Ações"

def portfolio():
    c=db.conn()
    assets=c.execute("SELECT * FROM ativos ORDER BY ticker").fetchall()
    result=[]
    today=date.today().isoformat()
    for a in assets:
        ops=c.execute("SELECT * FROM operacoes WHERE ticker=? ORDER BY data,id",(a["ticker"],)).fetchall()
        qty=cost=0.0
        for o in ops:
            q=float(o["qtd"] or 0); p=float(o["preco"] or 0)
            if q>0:
                qty += q; cost += q*p
            elif qty>0:
                avg=cost/qty
                sold=min(abs(q),qty)
                qty-=sold; cost-=avg*sold
        if qty<=1e-9: continue
        avg=cost/qty if qty else 0
        try: current=float(quotes.preco_atual(a["ticker"],a["mercado"]))
        except Exception: current=avg
        dividends=c.execute("SELECT * FROM proventos WHERE ticker=? ORDER BY data",(a["ticker"],)).fetchall()
        paid=due=0.0
        # Estimativa com posição atual; não representa quantidade histórica na data-com.
        for d in dividends:
            value=float(d["valor_por_cota"] or 0)*qty
            if d["data"]<=today: paid+=value
            else: due+=value
        result.append({"ticker":a["ticker"],"tipo":a["tipo"],"classe":tipo_label(a["tipo"]),
          "mercado":a["mercado"],"qtd":qty,"preco_medio":avg,"preco_atual":current,
          "investido":cost,"valor_atual":current*qty,"lucro":current*qty-cost,
          "lucro_pct":((current/avg)-1)*100 if avg else 0,
          "proventos_recebidos":paid,"proventos_a_receber":due,
          "primeira_operacao":ops[0]["data"] if ops else None})
    c.close()
    return result

@app.get("/api/carteira")
def carteira():
    assets=portfolio()
    invested=sum(x["investido"] for x in assets); current=sum(x["valor_atual"] for x in assets)
    profit=current-invested; divs=sum(x["proventos_recebidos"] for x in assets)
    return {"ativos":assets,"totais":{"investido":invested,"atual":current,"lucro":profit,
      "lucro_pct":profit/invested*100 if invested else 0,"proventos":divs,
      "rentabilidade":profit/invested*100 if invested else 0}}

@app.get("/api/operacoes")
def list_operacoes():
    c=db.conn()
    rows=[dict(r) for r in c.execute("SELECT o.*,a.tipo,a.mercado FROM operacoes o LEFT JOIN ativos a ON a.ticker=o.ticker ORDER BY o.data DESC,o.id DESC")]
    c.close(); return rows

@app.post("/api/operacoes")
def add_operacao(op: Operacao):
    ticker=op.ticker.upper().strip()
    if not ticker or op.qtd==0 or op.preco<0: raise HTTPException(400,"Confira ticker, quantidade e preço.")
    c=db.conn()
    c.execute("INSERT OR IGNORE INTO ativos(ticker,tipo,mercado) VALUES(?,?,?)",(ticker,op.tipo,op.mercado))
    c.execute("INSERT INTO operacoes(ticker,data,qtd,preco) VALUES(?,?,?,?)",(ticker,op.data,op.qtd,op.preco))
    c.commit(); c.close()
    return {"ok":True}

@app.delete("/api/operacoes/{op_id}")
def del_operacao(op_id:int):
    c=db.conn(); cur=c.execute("DELETE FROM operacoes WHERE id=?",(op_id,)); c.commit(); c.close()
    if not cur.rowcount: raise HTTPException(404,"Lançamento não encontrado.")
    return {"ok":True}

@app.get("/api/proventos")
def list_proventos():
    c=db.conn()
    rows=[dict(r) for r in c.execute("""SELECT p.*,a.tipo FROM proventos p LEFT JOIN ativos a ON a.ticker=p.ticker ORDER BY p.data DESC""")]
    c.close()
    # Calcula estimativa usando posição atual, identificada como estimativa na interface.
    positions={a["ticker"]:a["qtd"] for a in portfolio()}
    for r in rows:
        r["estimado"]=float(r["valor_por_cota"] or 0)*positions.get(r["ticker"],0)
        r["status"]="Pago" if r["data"]<=date.today().isoformat() else "A receber"
        r["classe"]=tipo_label(r.get("tipo"))
    return rows

@app.post("/api/atualizar-proventos")
def atualizar_todos():
    c=db.conn(); assets=c.execute("SELECT * FROM ativos").fetchall(); c.close()
    updated=0; errors=[]
    for a in assets:
        try:
            for d,v,t in quotes.proventos(a["ticker"],a["mercado"]):
                c=db.conn(); c.execute("INSERT OR IGNORE INTO proventos(ticker,data,valor_por_cota,tipo) VALUES(?,?,?,?)",(a["ticker"],d,v,t)); c.commit(); c.close(); updated+=1
        except Exception as e: errors.append(a["ticker"])
    return {"ok":True,"atualizados":updated,"falhas":errors}

@app.post("/api/importar")
async def importar(arquivo:UploadFile=File(...)):
    name=(arquivo.filename or "").lower()
    if not name.endswith(".xlsx"): raise HTTPException(400,"Envie uma planilha .xlsx.")
    try:
        wb=load_workbook(io.BytesIO(await arquivo.read()),data_only=True)
    except Exception: raise HTTPException(400,"Não consegui abrir o arquivo Excel.")
    found=[]
    for ws in wb.worksheets:
        rows=ws.iter_rows(values_only=True)
        first=next(rows,None)
        if not first: continue
        headers=[str(x or "").strip().lower() for x in first]
        def find(*terms):
            for i,h in enumerate(headers):
                if any(term in h for term in terms): return i
            return None
        # Cabeçalhos comuns nos relatórios de negociação da B3.
        ix_date=find("data do negócio","data negócio","data","data pregão")
        ix_type=find("tipo de movimentação","tipo de movimentacao","compra/venda","natureza")
        ix_ticker=find("código de negociação","codigo de negociacao","código","codigo","ticker","produto")
        ix_qty=find("quantidade","qtde")
        ix_price=find("preço","preco","valor unitário","valor unitario")
        if None in (ix_date,ix_type,ix_ticker,ix_qty,ix_price): continue
        for row in rows:
            try:
                ticker=str(row[ix_ticker] or "").strip().upper().split()[0]
                if not ticker: continue
                q=float(row[ix_qty] or 0)
                if q<=0: continue
                typ=str(row[ix_type] or "").lower()
                if "venda" in typ or "saída" in typ or "saida" in typ: q=-q
                rawdate=row[ix_date]
                d=rawdate.strftime("%Y-%m-%d") if hasattr(rawdate,"strftime") else str(rawdate)[:10]
                if "/" in d: d="-".join(reversed(d.split("/")))
                price=float(row[ix_price] or 0)
                found.append((ticker,d,q,price))
            except Exception: continue
        if found: break
    if not found:
        raise HTTPException(400,"Não encontrei operações nessa planilha. Use o extrato de negociação da B3 com data, tipo de movimentação, código, quantidade e preço. O arquivo enviado precisa conter linhas de operações.")
    c=db.conn(); inserted=0
    for ticker,d,q,price in found:
        tipo="fii" if ticker.endswith("11") else "acao"
        c.execute("INSERT OR IGNORE INTO ativos(ticker,tipo,mercado) VALUES(?,?,?)",(ticker,tipo,"BR"))
        # Evita duplicar importações idênticas.
        exists=c.execute("SELECT 1 FROM operacoes WHERE ticker=? AND data=? AND qtd=? AND preco=? LIMIT 1",(ticker,d,q,price)).fetchone()
        if not exists:
            c.execute("INSERT INTO operacoes(ticker,data,qtd,preco) VALUES(?,?,?,?)",(ticker,d,q,price)); inserted+=1
    c.commit(); c.close()
    return {"importadas":inserted,"linhas_lidas":len(found)}

@app.get("/api/series")
def series(periodo:str="12m",classe:str="todos"):
    # Série de capital líquido aplicado, não valor de mercado histórico.
    c=db.conn()
    rows=c.execute("""SELECT o.data,o.qtd,o.preco,a.tipo FROM operacoes o LEFT JOIN ativos a ON a.ticker=o.ticker ORDER BY o.data""").fetchall()
    c.close()
    now=date.today()
    days={"30d":30,"12m":365,"2a":730,"5a":1825,"10a":3650}
    cutoff=now-timedelta(days=days.get(periodo,365)) if periodo!="inicio" else date.min
    monthly=defaultdict(float)
    for r in rows:
        try: dt=date.fromisoformat(r["data"][:10])
        except: continue
        if dt<cutoff: continue
        if classe!="todos" and tipo_label(r["tipo"]).lower()!=classe.lower(): continue
        monthly[dt.strftime("%Y-%m")]+=float(r["qtd"])*float(r["preco"])
    keys=sorted(monthly)
    acc=0; out=[]
    for k in keys:
        acc+=monthly[k]
        out.append({"periodo":k,"aportes":monthly[k],"capital_liquido":acc})
    return {"pontos":out,"observacao":"Série de capital líquido aplicado; não é cotação histórica nem valor de mercado passado."}

@app.get("/api/health")
def health(): return {"ok":True}

STATIC=os.path.join(os.path.dirname(__file__),"static")
@app.get("/")
def index(): return FileResponse(os.path.join(STATIC,"index.html"))
app.mount("/",StaticFiles(directory=STATIC),name="static")
