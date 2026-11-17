#!/usr/bin/env python3
"""Create consistent SQLite backups; encryption keys are excluded by default."""
import argparse
import os
import sqlite3
import shutil
from datetime import datetime
from pathlib import Path


def backup_database(source: Path, target: Path) -> None:
    if not source.exists():
        return
    target.parent.mkdir(parents=True, exist_ok=True)
    src = sqlite3.connect(f'file:{source}?mode=ro', uri=True, timeout=30)
    dst = sqlite3.connect(target, timeout=30)
    try:
        src.backup(dst, pages=256, sleep=0.05)
        result = dst.execute('PRAGMA integrity_check').fetchone()[0]
        if result != 'ok':
            raise RuntimeError(f'Integridade inválida em {source.name}: {result}')
    finally:
        dst.close()
        src.close()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--destination', default='/backup', help='Diretório de destino')
    parser.add_argument('--include-keys', action='store_true', help='Inclui chaves de criptografia/sessão; guarde o backup em local criptografado e separado')
    args = parser.parse_args()
    data_dir = Path(os.environ.get('DATA_DIR', '/data'))
    stamp = datetime.now().strftime('%Y%m%d-%H%M%S')
    destination = Path(args.destination) / f'lonely-wallet-{stamp}'
    destination.mkdir(parents=True, exist_ok=False, mode=0o700)
    for name in ('ativos.db', 'carteira.db', 'tokens.db'):
        backup_database(data_dir / name, destination / name)
    # O cache não é banco SQLite: copie-o preservando o arquivo e valide o JSON.
    quote_cache = data_dir / 'quotes_last_valid.json'
    if quote_cache.exists():
        import json
        with quote_cache.open('r', encoding='utf-8') as handle:
            payload = json.load(handle)
        if not isinstance(payload, dict):
            raise RuntimeError('Cache de cotações inválido: esperado um objeto JSON.')
        target = destination / 'quotes_last_valid.json'
        shutil.copy2(quote_cache, target)
        os.chmod(target, 0o600)
    if args.include_keys:
        secret_dir = destination / 'secrets'
        secret_dir.mkdir(mode=0o700)
        for name in ('.api-credentials.key', '.lonely-wallet-session.key'):
            source = data_dir / name
            if source.exists():
                target = secret_dir / name
                target.write_bytes(source.read_bytes())
                os.chmod(target, 0o600)
    if not any(destination.iterdir()):
        destination.rmdir()
        raise RuntimeError('Nenhum arquivo de dados encontrado para backup.')
    print(f'Backup concluído: {destination}')
    if not args.include_keys:
        print('Atenção: chaves não incluídas. Credenciais criptografadas exigem a chave original para restauração.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
