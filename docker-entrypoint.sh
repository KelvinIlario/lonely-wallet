#!/bin/sh
set -eu

# Corrige a propriedade do bind mount existente antes de abandonar root.
mkdir -p /data
chown -R app:app /data
chmod 700 /data

export LONELY_WALLET_BOOT_ID="$(python -c 'import secrets; print(secrets.token_urlsafe(24))')"
exec gosu app:app "$@"
