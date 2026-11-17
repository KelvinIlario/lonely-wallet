FROM python:3.12-slim
WORKDIR /srv
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 DB_PATH=/data/carteira.db
RUN apt-get update \
    && apt-get install -y --no-install-recommends gosu \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system --gid 10001 app \
    && useradd --system --uid 10001 --gid app --home-dir /nonexistent --shell /usr/sbin/nologin app
COPY requirements.txt .
RUN pip install --no-cache-dir --disable-pip-version-check -r requirements.txt
COPY app ./app
COPY scripts ./scripts
COPY VERSION README.md ./
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod 755 /srv/docker-entrypoint.sh /srv/scripts/backup.py \
    && mkdir -p /data/backups \
    && chown -R app:app /srv /data
EXPOSE 8080
ENTRYPOINT ["/srv/docker-entrypoint.sh"]
CMD ["gunicorn", "-b", "0.0.0.0:8080", "-w", "1", "--threads", "4", "app.main:app"]
