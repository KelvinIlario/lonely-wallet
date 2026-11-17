FROM python:3.12-slim
WORKDIR /srv
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app ./app
ENV DB_PATH=/data/carteira.db PYTHONUNBUFFERED=1
EXPOSE 8080
# One boot identifier per container start, shared by all Gunicorn workers.
CMD ["sh", "-c", "export LONELY_WALLET_BOOT_ID=$(python -c 'import secrets; print(secrets.token_urlsafe(24))'); exec gunicorn -b 0.0.0.0:8080 -w 1 --threads 4 app.main:app"]
