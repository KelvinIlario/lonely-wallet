FROM python:3.12-slim
WORKDIR /srv
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 DB_PATH=/data/carteira.db
COPY requirements.txt .
RUN pip install --no-cache-dir --disable-pip-version-check -r requirements.txt
COPY app ./app
COPY scripts ./scripts
COPY VERSION README.md ./
RUN mkdir -p /data/backups
EXPOSE 8080
# A imagem preserva compatibilidade com volumes ZimaOS já existentes.
# Para rodar como não-root, ajuste previamente a propriedade do bind mount /data no host.
CMD ["sh", "-c", "export LONELY_WALLET_BOOT_ID=$(python -c 'import secrets; print(secrets.token_urlsafe(24))'); exec gunicorn -b 0.0.0.0:8080 -w 1 --threads 4 app.main:app"]
