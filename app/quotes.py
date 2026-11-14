import os, requests
import yfinance as yf

BRAPI_TOKEN = os.environ.get("BRAPI_TOKEN", "")


def preco_atual(ticker, mercado):
    if mercado == "BR":
        r = requests.get(
            f"https://brapi.dev/api/quote/{ticker}",
            params={"token": BRAPI_TOKEN},
            timeout=15,
        )
        r.raise_for_status()
        dados = r.json()["results"][0]
        return float(dados["regularMarketPrice"])
    info = yf.Ticker(ticker).fast_info
    return float(info["last_price"])


def proventos(ticker, mercado):
    """Retorna lista de (data, valor_por_cota, tipo)."""
    saida = []
    if mercado == "BR":
        r = requests.get(
            f"https://brapi.dev/api/quote/{ticker}",
            params={"token": BRAPI_TOKEN, "dividends": "true"},
            timeout=20,
        )
        r.raise_for_status()
        res = r.json()["results"][0]
        divs = (res.get("dividendsData") or {}).get("cashDividends") or []
        for d in divs:
            data = (d.get("paymentDate") or d.get("approvedOn") or "")[:10]
            if data:
                saida.append((data, float(d["rate"]), d.get("label", "")))
        return saida
    serie = yf.Ticker(ticker).dividends
    for ts, valor in serie.items():
        saida.append((ts.strftime("%Y-%m-%d"), float(valor), "Dividendo"))
    return saida
