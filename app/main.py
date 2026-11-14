import os, io, hashlib
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
    tipo: str
    mercado: str
    data: str
    qtd: float
    preco: float

def _tipo_norm(value):
    s = (value or "").lower()
    if "fii" in s or "imobili" in s: return "fii"
    if "renda fixa" in s or "tesouro" in s or "cdb" in s or "lci" in s or "lca" in s: return "renda_fixa"
    if "etf" in s: return "etf"
    if "cripto" in s: return "cripto"
    return "acao"

def _ativos(c, filtro="todos"):
    rows = c.execute("SELECT * FROM ativos ORDER BY ticker").fetchall()
    return [a for a in rows if filtro in ("todos", "all", "", None) or _tipo_norm(a["tipo"]) == filtro]

def _carteira(c, filtro="todos"):
    saida=[]
    hoje=date.today().isoformat()
    for a in _ativos(c, filtro):
        ops=c.execute("SELECT * FROM operacoes WHERE ticker=? ORDER BY data,id",(a["ticker"],)).fetchall()
        qtd=custo=0.0
        for o in ops:
            q=float(o["qtd"] or 0); p=float(o["preco"] or 0)
            if q>0:
                qtd += q; custo += q*p
            elif q<0 and qtd>0:
                pm=custo/qtd
                venda=min(abs(q),qtd)
                qtd-=venda; custo-=venda*pm
        if qtd <= 1e-9: continue
        pm=custo/qtd if qtd else 0
        try: atual=float(quotes.preco_atual(a["ticker"],a["mercado"]))
        except Exception: atual=pm
        provs=c.execute("SELECT * FROM proventos WHERE ticker=? ORDER BY data",(a["ticker"],)).fetchall()
        recebidos=0.0
        for p in provs:
            if p["data"] <= hoje:
                recebidos += float(p["valor_por_cota"] or 0)*qtd
        valor=atual*qtd
        tipo=_tipo_norm(a["tipo"])
        saida.append({"ticker":a["ticker"],"tipo":tipo,"mercado":a["mercado"],"qtd":qtd,
          "preco_medio":pm,"preco_atual":atual,"investido":custo,"valor_atual":valor,
          "lucro":valor-custo,"lucro_pct":((valor/custo)-1)*100 if custo else 0,
          "proventos_recebidos":recebidos})
    return saida

@app.get("/api/health")
def health():
    return {"ok":True,"database":os.path.join(db.DATA_DIR,"carteira.db")}

@app.get("/api/carteira")
def carteira(tipo: str="todos"):
    c=db.conn()
    try:
        ativos=_carteira(c,tipo)
        totals={"investido":sum(a["investido"] for a in ativos),
          "atual":sum(a["valor_atual"] for a in ativos),
          "lucro":sum(a["lucro"] for a in ativos),
          "proventos":sum(a["proventos_recebidos"] for a in ativos)}
        totals["rentabilidade"]=(totals["lucro"]/totals["investido"]*100) if totals["investido"] else 0
        return {"ativos":ativos,"totais":totals}
    finally: c.close()

@app.get("/api/proventos")
def listar_proventos(tipo: str="todos", meses: int=12):
    c=db.conn()
    try:
        ativos={a["ticker"] for a in _ativos(c,tipo)}
        limite=(date.today()-timedelta(days=meses*31)).isoformat()
        rows=c.execute("SELECT * FROM proventos WHERE data>=? ORDER BY data DESC",(limite,)).fetchall()
        return [dict(r) for r in rows if r["ticker"] in ativos]
    finally: c.close()

@app.get("/api/operacoes")
def list_operacoes():
    c=db.conn()
    try: return [dict(r) for r in c.execute("SELECT * FROM operacoes ORDER BY data DESC,id DESC")]
    finally: c.close()

@app.post("/api/operacoes")
def add_operacao(op: Operacao):
    t=op.ticker.upper().strip()
    c=db.conn()
    try:
        c.execute("INSERT OR IGNORE INTO ativos(ticker,tipo,mercado) VALUES(?,?,?)",(t,_tipo_norm(op.tipo),op.mercado))
        c.execute("INSERT INTO operacoes(ticker,data,qtd,preco) VALUES(?,?,?,?)",(t,op.data,op.qtd,op.preco))
        c.commit()
    finally: c.close()
    return {"ok":True}

@app.delete("/api/operacoes/{op_id}")
def del_operacao(op_id:int):
    c=db.conn()
    try:
        c.execute("DELETE FROM operacoes WHERE id=?",(op_id,)); c.commit()
        return {"ok":True}
    finally: c.close()

@app.get("/api/historico")
def historico(periodo:str="12m", tipo:str="todos"):
    """Histórico de aportes líquidos. Não representa patrimônio de mercado histórico."""
    c=db.conn()
    try:
        ativos=_ativos(c,tipo)
        tickers={a["ticker"] for a in ativos}
        rows=c.execute("SELECT ticker,data,qtd,preco FROM operacoes ORDER BY data").fetchall()
        eventos=[]
        for r in rows:
            if r["ticker"] not in tickers: continue
            try: dt=date.fromisoformat(r["data"][:10])
            except Exception: continue
            eventos.append((dt,float(r["qtd"] or 0)*float(r["preco"] or 0)))
        hoje=date.today()
        if periodo=="30d": inicio=hoje-timedelta(days=30)
        elif periodo=="2a": inicio=hoje-timedelta(days=365*2)
        elif periodo=="5a": inicio=hoje-timedelta(days=365*5)
        elif periodo=="10a": inicio=hoje-timedelta(days=365*10)
        elif periodo=="inicio": inicio=min([e[0] for e in eventos],default=hoje)
        else: inicio=hoje-timedelta(days=365)
        acumulado=sum(v for d,v in eventos if d<inicio)
        por_mes=defaultdict(float)
        cursor=date(inicio.year,inicio.month,1)
        while cursor<=hoje:
            por_mes[cursor.strftime("%Y-%m")]+=0
            cursor=(date(cursor.year+1,1,1) if cursor.month==12 else date(cursor.year,cursor.month+1,1))
        for d,v in eventos:
            if d>=inicio:
                por_mes[d.strftime("%Y-%m")]+=v
        dados=[]
        for mes in sorted(por_mes):
            acumulado+=por_mes[mes]
            dados.append({"mes":mes,"valor":round(acumulado,2)})
        if not dados: dados=[{"mes":hoje.strftime("%Y-%m"),"valor":0}]
        return {"periodo":periodo,"tipo":tipo,"base":"aportes_liquidos","aviso":"Série de capital aplicado; histórico de cotação não está armazenado, portanto não é patrimônio de mercado histórico.","dados":dados}
    finally: c.close()

@app.post("/api/atualizar-proventos")
def atualizar_todos():
    c=db.conn()
    try: ativos=c.execute("SELECT * FROM ativos").fetchall()
    finally: c.close()
    for a in ativos:
        try:
            for data,valor,tipo in quotes.proventos(a["ticker"],a["mercado"]):
                c2=db.conn()
                try:
                    c2.execute("INSERT OR IGNORE INTO proventos(ticker,data,valor_por_cota,tipo) VALUES(?,?,?,?)",(a["ticker"],data,valor,tipo)); c2.commit()
                finally: c2.close()
        except Exception as e: print("erro proventos",a["ticker"],e)
    return {"ok":True}

@app.post("/api/importar")
async def importar(arquivo:UploadFile=File(...)):
    wb=load_workbook(io.BytesIO(await arquivo.read()),data_only=True)
    ws=wb.active
    cab=[str(c.value or "").strip().lower() for c in next(ws.iter_rows(min_row=1,max_row=1))]
    def col(*nomes):
        for i,h in enumerate(cab):
            if any(n in h for n in nomes): return i
        return None
    i_data=col("data"); i_tipo=col("tipo de movimenta","compra/venda")
    i_cod=col("código","codigo","produto"); i_qtd=col("quantidade"); i_preco=col("preço","preco")
    if None in (i_data,i_tipo,i_cod,i_qtd,i_preco):
        raise HTTPException(400,"Não reconheci as colunas da planilha.")
    novos=0
    c=db.conn()
    try:
        for row in ws.iter_rows(min_row=2,values_only=True):
            if not row[i_cod]: continue
            ticker=str(row[i_cod]).split(" ")[0].upper().strip()
            qtd=float(row[i_qtd] or 0)
            if "venda" in str(row[i_tipo]).lower(): qtd=-abs(qtd)
            d=row[i_data]
            data=d.strftime("%Y-%m-%d") if hasattr(d,"strftime") else str(d)[:10]
            tipo="fii" if ticker.endswith("11") else "acao"
            c.execute("INSERT OR IGNORE INTO ativos(ticker,tipo,mercado) VALUES(?,?,?)",(ticker,tipo,"BR"))
            c.execute("INSERT INTO operacoes(ticker,data,qtd,preco) VALUES(?,?,?,?)",(ticker,data,qtd,float(row[i_preco] or 0)))
            novos+=1
        c.commit()
    finally: c.close()
    return {"importadas":novos}

STATIC=os.path.join(os.path.dirname(__file__),"static")
@app.get("/")
def index(): return FileResponse(os.path.join(STATIC,"index.html"))
app.mount("/",StaticFiles(directory=STATIC),name="static")
