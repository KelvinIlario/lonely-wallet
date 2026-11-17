#!/usr/local/bin/python
"""Prepare the persistent data volume once, then drop privileges."""
import grp
import os
import pwd
import sys
from pathlib import Path

DATA = Path(os.environ.get('DATA_DIR', '/data'))
USER = 'app'
GROUP = 'app'
MARKER = DATA / '.lonely-wallet-permissions-v1'


def migrate_permissions(root, uid, gid):
    """Entrega o diretório de dados ao usuário da aplicação.

    Qualquer falha de chown aborta com RuntimeError: seguir em frente deixaria
    bancos pertencentes ao root, que o processo sem privilégios não consegue gravar.
    """
    root = Path(root)
    targets = [root]
    for current, dirs, files in os.walk(root):
        base = Path(current)
        targets.extend(base / name for name in dirs + files)
    for path in targets:
        try:
            os.chown(path, uid, gid, follow_symlinks=False)
        except FileNotFoundError:
            continue  # arquivo temporário removido durante a varredura
        except OSError as exc:
            raise RuntimeError(f'Não foi possível ajustar permissões de {path}: {exc}') from exc


def _write_marker(uid, gid):
    """Grava o marcador de forma atômica; nunca deixa marcador (nem .tmp) após falha."""
    tmp = MARKER.with_name(MARKER.name + '.tmp')
    try:
        tmp.touch(mode=0o600, exist_ok=True)
        os.chown(tmp, uid, gid)
        os.replace(tmp, MARKER)
    except Exception:
        for leftover in (tmp, MARKER):
            try:
                leftover.unlink()
            except FileNotFoundError:
                pass
        raise


def main():
    if os.geteuid() == 0:
        DATA.mkdir(parents=True, exist_ok=True)
        uid = pwd.getpwnam(USER).pw_uid
        gid = grp.getgrnam(GROUP).gr_gid
        # Instalações existentes são migradas uma única vez; o marcador só existe
        # depois que TODA a migração terminou com sucesso.
        if not MARKER.exists():
            migrate_permissions(DATA, uid, gid)
            _write_marker(uid, gid)
        os.setgroups([])
        os.setgid(gid)
        os.setuid(uid)
    os.execvp(sys.argv[1], sys.argv[1:])


if __name__ == '__main__':
    main()
