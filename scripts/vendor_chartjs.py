#!/usr/bin/env python3
"""Baixa o Chart.js fixo para app/static e imprime o hash SRI (executar fora do container, com internet).

Uso: python scripts/vendor_chartjs.py
Depois reconstrua a imagem: docker compose up -d --build
"""
import base64
import hashlib
import urllib.request
from pathlib import Path

URL = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js'
TARGET = Path(__file__).resolve().parents[1] / 'app' / 'static' / 'chart.umd.min.js'

data = urllib.request.urlopen(URL, timeout=30).read()
if b'Chart' not in data[:4000]:
    raise SystemExit('Arquivo baixado não parece ser o Chart.js; abortando.')
TARGET.write_bytes(data)
print('Salvo em', TARGET)
print('sha384-' + base64.b64encode(hashlib.sha384(data).digest()).decode())
