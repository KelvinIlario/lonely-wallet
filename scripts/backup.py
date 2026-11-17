#!/usr/bin/env python3
"""Create an atomic, consistent Lonely Wallet backup."""
import argparse
import json
import os
import shutil
import sqlite3
import tempfile
from datetime import datetime
from pathlib import Path

DATABASES = ('ativos.db', 'carteira.db', 'tokens.db')
KEYS = ('.api-credentials.key', '.lonely-wallet-session.key')


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
    os.chmod(target, 0o600)


def create_backup(data_dir: Path, destination_root: Path, include_keys: bool = False) -> Path:
    destination_root.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime('%Y%m%d-%H%M%S-%f')
    final_dir = destination_root / f'lonely-wallet-{stamp}'
    temp_dir = Path(tempfile.mkdtemp(prefix='.lonely-wallet-backup-', dir=destination_root))
    os.chmod(temp_dir, 0o700)
    try:
        copied = []
        for name in DATABASES:
            source = data_dir / name
            if source.exists():
                backup_database(source, temp_dir / name)
                copied.append(name)

        quote_cache = data_dir / 'quotes_last_valid.json'
        if quote_cache.exists():
            with quote_cache.open('r', encoding='utf-8') as handle:
                payload = json.load(handle)
            if not isinstance(payload, dict):
                raise RuntimeError('Cache de cotações inválido: esperado um objeto JSON.')
            target = temp_dir / quote_cache.name
            shutil.copy2(quote_cache, target)
            os.chmod(target, 0o600)
            copied.append(quote_cache.name)

        if include_keys:
            secret_dir = temp_dir / 'secrets'
            secret_dir.mkdir(mode=0o700)
            for name in KEYS:
                source = data_dir / name
                if source.exists():
                    target = secret_dir / name
                    shutil.copyfile(source, target)
                    os.chmod(target, 0o600)
                    copied.append(f'secrets/{name}')
            if not any(secret_dir.iterdir()):
                secret_dir.rmdir()

        if not copied:
            raise RuntimeError('Nenhum arquivo de dados encontrado para backup.')

        manifest = {
            'application': 'Lonely Wallet',
            'created_at': datetime.now().astimezone().isoformat(),
            'files': copied,
            'includes_keys': bool(include_keys),
        }
        manifest_path = temp_dir / 'backup-manifest.json'
        manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        os.chmod(manifest_path, 0o600)
        os.replace(temp_dir, final_dir)
        os.chmod(final_dir, 0o700)
        return final_dir
    except Exception:
        shutil.rmtree(temp_dir, ignore_errors=True)
        raise


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--destination', default='/backup', help='Diretório de destino')
    parser.add_argument('--include-keys', action='store_true', help='Inclui chaves de criptografia/sessão; guarde o backup em local criptografado e restrito')
    args = parser.parse_args()
    data_dir = Path(os.environ.get('DATA_DIR', '/data'))
    try:
        destination = create_backup(data_dir, Path(args.destination), args.include_keys)
    except Exception as exc:
        parser.exit(1, f'Erro ao criar backup. Nenhum backup parcial foi mantido: {exc}\n')
    print(f'Backup concluído: {destination}')
    if not args.include_keys:
        print('Atenção: chaves não incluídas. Credenciais criptografadas exigem a chave original para restauração.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
