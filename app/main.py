import os, io, re, hashlib, unicodedata
from datetime import date, datetime
from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
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

def norm(v):
    s = unicodedata.normalize("NFKD", str(v or "")).encode("ascii","ignore").decode().lower()
    return re.sub(r"\s+", " ", s).strip()

def number(v):
    if v is None or v == "-": return 0.0
    if isinstance(v, (int,float)): return float(v)
    s = str(v).strip().replace("R$","").replace(" ","")
    if "," in s: s = s.replace(".","").replace(",",".")
    try: return float(s)
    except ValueError: return 0.0

def date_iso(v):
    if hasattr(v,"strftime"): return v.strftime("%Y-%m-%d")
    s=str(v or "").strip()
    for fmt in ("%d/%m/%Y","%Y-%m-%d","%d-%m-%Y"):
        try: return datetime.strptime(s[:10],fmt).strftime("%Y-%m-%d")
        except ValueError: pass
    raise ValueError(f"Data inválida: {s}")

def ticker_from_product(v):
    s=str(v or "").strip()
    # Ticker é o primeiro bloco antes do hífen; exclui produtos sem ticker de bolsa.
    t=s.split(" - ")[0].strip().upper()
    return t if re.fullmatch(r"[A-Z]{4}\d{1,2}",t) else None

def make_key(values):
    raw="|".join(str(x or "").strip() for x in values)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()

def atualizar_proventos(ticker, mercado):
    c=db.conn()
    try:
        for data, valor, tipo in quotes.proventos(ticker, mercado):
            c.execute("""INSERT OR IGNORE INTO proventos
                (ticker,data,valor_por_cota,tipo,origem)
                VALUES(?,?,?,?,?)""",(ticker,data,valor,tipo,"cotacao"))
        c.commit()
    except Exception as e: print("erro proventos",ticker,e)
    finally: c.close()

@app.post("/api/operacoes")
def add_operacao(op: Operacao):
    t=op.ticker.upper().strip()
    if not re.fullmatch(r"[A-Z0-9]{4,12}",t): raise HTTPException(400,"Ticker inválido.")
    if op.qtd == 0 or op.preco < 0: raise HTTPException(400,"Quantidade e preço precisam ser válidos.")
    tipo_op="venda" if op.qtd < 0 else "compra"
    c=db.conn()
    c.execute("INSERT OR IGNORE INTO ativos(ticker,tipo,mercado) VALUES(?,?,?)",(t,op.tipo,op.mercado))
    c.execute("""INSERT INTO operacoes(ticker,data,qtd,preco,tipo_operacao,origem)
                 VALUES(?,?,?,?,?,?)""",(t,op.data,op.qtd,op.preco,tipo_op,"manual"))
    c.execute("""INSERT INTO movimentacoes(data,ticker,tipo,descricao,quantidade,preco_unitario,valor_total,origem)
                 VALUES(?,?,?,?,?,?,?,?)""",(op.data,t,tipo_op.capitalize(),f"Operação manual: {tipo_op}",op.qtd,op.preco,abs(op.qtd*op.preco),"manual"))
    c.commit(); c.close()
    atualizar_proventos(t,op.mercado)
    return {"ok":True}

@app.get("/api/carteira")
def carteira():
    c=db.conn()
    ativos=c.execute("SELECT * FROM ativos ORDER BY ticker").fetchall()
    saida=[]; ti=ta=tp=0.0
    for a in ativos:
        ops=c.execute("SELECT * FROM operacoes WHERE ticker=? ORDER BY data,id",(a["ticker"],)).fetchall()
        qtd=custo=0.0; menor=None
        for o in ops:
            q=float(o["qtd"]); p=float(o["preco"] or 0)
            kind=(o["tipo_operacao"] or "").lower()
            if kind in ("ajuste","bonificacao","desdobramento") or (p==0 and q>0):
                qtd += q
                continue
            if q>0:
                qtd+=q; custo+=q*p
                if menor is None or p<menor: menor=p
            elif q<0:
                pm=custo/qtd if qtd>0 else 0
                vend=min(abs(q),qtd)
                qtd-=vend; custo=max(0,custo-vend*pm)
        if qtd<=1e-9: continue
        pm=custo/qtd if qtd else 0
        try: atual=quotes.preco_atual(a["ticker"],a["mercado"])
        except Exception: atual=pm
        provs=c.execute("SELECT * FROM proventos WHERE ticker=? ORDER BY data",(a["ticker"],)).fetchall()
        recebidos=sum(float(p["valor_total"] or 0) for p in provs if p["valor_total"] and p["data"]<=date.today().isoformat())
        if not recebidos:
            recebidos=sum(float(p["valor_por_cota"] or 0)*qtd for p in provs if p["data"]<=date.today().isoformat())
        item={"ticker":a["ticker"],"tipo":a["tipo"],"mercado":a["mercado"],"qtd":qtd,
              "preco_medio":pm,"menor_preco":menor or 0,"preco_atual":atual,
              "investido":custo,"valor_atual":atual*qtd,"lucro":atual*qtd-custo,
              "lucro_pct":(atual/pm-1)*100 if pm else 0,"proventos_recebidos":recebidos}
        saida.append(item); ti+=custo; ta+=atual*qtd; tp+=recebidos
    c.close()
    return {"ativos":saida,"totais":{"investido":ti,"atual":ta,"lucro":ta-ti,"proventos":tp}}

@app.get("/api/movimentacoes")
def list_movimentacoes():
    c=db.conn()
    rows=[dict(r) for r in c.execute("SELECT * FROM movimentacoes ORDER BY data DESC,id DESC LIMIT 2000")]
    # Inclui operações antigas criadas antes da migração.
    c.close()
    return rows

@app.get("/api/proventos")
def list_proventos():
    c=db.conn()
    rows=[dict(r) for r in c.execute("SELECT * FROM proventos ORDER BY data DESC,id DESC")]
    c.close(); return rows

@app.get("/api/resumo")
def resumo():
    c=db.conn()
    ops=c.execute("SELECT COUNT(*) n FROM movimentacoes").fetchone()["n"]
    prov=c.execute("SELECT COUNT(*) n, COALESCE(SUM(valor_total),0) total FROM proventos").fetchone()
    c.close()
    return {"movimentacoes":ops,"proventos":prov["n"],"total_proventos":prov["total"]}

@app.post("/api/importar")
async def importar(arquivo: UploadFile=File(...)):
    if not arquivo.filename.lower().endswith(".xlsx"):
        raise HTTPException(400,"Envie um arquivo .xlsx exportado da B3.")
    try:
        wb=load_workbook(io.BytesIO(await arquivo.read()),data_only=True)
        ws=wb["Movimentação"] if "Movimentação" in wb.sheetnames else wb.active
        rows=list(ws.iter_rows(values_only=True))
        if not rows: raise ValueError("Planilha vazia.")
        headers=[norm(x) for x in rows[0]]
        def idx(*names):
            for i,h in enumerate(headers):
                if any(norm(n) == h or norm(n) in h for n in names): return i
            return None
        ix={k:idx(*v) for k,v in {
            "entrada":("Entrada/Saída","Entrada Saida"),
            "data":("Data",),"mov":("Movimentação","Movimentacao"),
            "produto":("Produto",),"qtd":("Quantidade",),
            "preco":("Preço unitário","Preco unitario"),
            "valor":("Valor da Operação","Valor da Operacao")
        }.items()}
        if any(v is None for v in ix.values()):
            raise ValueError("Cabeçalhos não reconhecidos. Esperados: Entrada/Saída, Data, Movimentação, Produto, Quantidade, Preço unitário e Valor da Operação.")
    except Exception as e: raise HTTPException(400,str(e))

    stats={"linhas_lidas":0,"operacoes":0,"proventos":0,"ajustes":0,"transferencias":0,"ignoradas":0,"duplicadas":0}
    c=db.conn()
    try:
        for row in rows[1:]:
            if not row or not row[ix["produto"]]: continue
            stats["linhas_lidas"]+=1
            entrada=str(row[ix["entrada"]] or "").strip().lower()
            mov=str(row[ix["mov"]] or "").strip()
            ticker=ticker_from_product(row[ix["produto"]])
            try: data=date_iso(row[ix["data"]])
            except ValueError: stats["ignoradas"]+=1; continue
            qtd=number(row[ix["qtd"]]); preco=number(row[ix["preco"]]); total=number(row[ix["valor"]])
            chave=make_key([data,entrada,mov,row[ix["produto"]],qtd,preco,total])
            if c.execute("SELECT 1 FROM movimentacoes WHERE chave=?",(chave,)).fetchone():
                stats["duplicadas"]+=1; continue
            lower=norm(mov)
            tipo="Evento"; descricao=mov; impacto=0
            if ticker:
                classe="fii" if ticker.endswith("11") else ("acao" if re.search(r"\d",ticker) else "outro")
                c.execute("INSERT OR IGNORE INTO ativos(ticker,tipo,mercado) VALUES(?,?,?)",(ticker,classe,"BR"))
            if any(x in lower for x in ("rendimento","juros sobre capital","dividendo")):
                tipo="Provento"
                if ticker:
                    c.execute("""INSERT OR IGNORE INTO proventos
                      (ticker,data,valor_por_cota,tipo,valor_total,quantidade,origem,chave_importacao)
                      VALUES(?,?,?,?,?,?,?,?)""",(ticker,data,preco,mov,total,qtd,"B3",chave))
                    if c.execute("SELECT changes()").fetchone()[0]: stats["proventos"]+=1
                else: stats["ignoradas"]+=1
            elif "atualizacao" in lower and ticker:
                tipo="Ajuste"; impacto=qtd if entrada=="credito" else -qtd
                c.execute("""INSERT INTO operacoes(ticker,data,qtd,preco,tipo_operacao,descricao,origem,chave_importacao)
                             VALUES(?,?,?,?,?,?,?,?)""",(ticker,data,impacto,0,"ajuste",mov,"B3",chave))
                stats["ajustes"]+=1
            elif "transferencia - liquidacao" in lower and ticker and qtd:
                tipo="Compra" if entrada=="credito" else "Venda"
                impacto=abs(qtd) if entrada=="credito" else -abs(qtd)
                c.execute("INSERT OR IGNORE INTO operacoes(ticker,data,qtd,preco,tipo_operacao,descricao,origem,chave_importacao) VALUES(?,?,?,?,?,?,?,?)",
                          (ticker,data,impacto,preco,tipo.lower(),mov,"B3",chave))
                if c.execute("SELECT changes()").fetchone()[0]:
                    stats["operacoes"]+=1
                else: stats["duplicadas"]+=1
            elif "transferencia" in lower:
                tipo="Transferência"; stats["transferencias"]+=1
            elif "direito de subscricao" in lower or "direitos de subscricao" in lower:
                tipo="Direito de subscrição"
            elif "compra / venda" in lower:
                tipo="Renda fixa / compra e venda"
            else:
                stats["ignoradas"]+=1
            c.execute("""INSERT OR IGNORE INTO movimentacoes
                (data,ticker,tipo,descricao,quantidade,preco_unitario,valor_total,origem,chave)
                VALUES(?,?,?,?,?,?,?,?,?)""",(data,ticker,tipo,descricao,qtd,preco,total,"B3",chave))
        c.commit()
    except Exception as e:
        c.rollback(); raise HTTPException(500,f"Falha na importação; nenhuma alteração desta tentativa foi confirmada: {e}")
    finally: c.close()
    return stats

@app.post("/api/atualizar-proventos")
def atualizar_todos():
    c=db.conn(); ativos=c.execute("SELECT * FROM ativos").fetchall(); c.close()
    for a in ativos: atualizar_proventos(a["ticker"],a["mercado"])
    return {"ok":True}

STATIC=os.path.join(os.path.dirname(__file__),"static")
@app.get("/")
def index(): return FileResponse(os.path.join(STATIC,"index.html"))
app.mount("/",StaticFiles(directory=STATIC),name="static")
