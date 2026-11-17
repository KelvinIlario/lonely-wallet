#!/usr/bin/env python3
"""Create a consistent SQLite backup of Lonely Wallet databases and key files."""
import argparse
import os
import shutil
import sqlite3
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
    args = parser.parse_args()
    data_dir = Path(os.environ.get('DATA_DIR', '/data'))
    stamp = datetime.now().strftime('%Y%m%d-%H%M%S')
    destination = Path(args.destination) / f'lonely-wallet-{stamp}'
    destination.mkdir(parents=True, exist_ok=False)

    for name in ('ativos.db', 'carteira.db', 'tokens.db'):
        backup_database(data_dir / name, destination / name)
    for name in ('.api-credentials.key', '.lonely-wallet-session.key'):
        source = data_dir / name
        if source.exists():
            shutil.copy2(source, destination / name)
            os.chmod(destination / name, 0o600)

    if not any(destination.iterdir()):
        destination.rmdir()
        raise RuntimeError('Nenhum arquivo de dados encontrado para backup.')
    print(f'Backup concluído: {destination}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
