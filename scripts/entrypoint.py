#!/usr/local/bin/python
"""Prepare the persistent data volume once, then drop privileges."""
import os
import pwd
import grp
import sys
import tempfile
from pathlib import Path

DATA = Path(os.environ.get('DATA_DIR', '/data'))
USER = 'app'
GROUP = 'app'
MARKER = DATA / '.lonely-wallet-permissions-v1'


def migrate_permissions(root, uid, gid):
    """Set ownership recursively and fail rather than marking a partial migration."""
    root = Path(root)
    if not root.exists():
        root.mkdir(parents=True, exist_ok=True)

    for current, dirs, files in os.walk(root):
        paths = [Path(current)] + [Path(current) / name for name in dirs + files]
        for path in paths:
            try:
                os.chown(path, uid, gid, follow_symlinks=False)
            except FileNotFoundError:
                # A transient file may disappear while walking a live data folder.
                continue
            except PermissionError as exc:
                raise RuntimeError(f'Não foi possível ajustar as permissões de {path}: {exc}') from exc


def _write_marker(uid, gid):
    """Write the migration marker atomically, leaving no partial file on failure."""
    DATA.mkdir(parents=True, exist_ok=True)
    fd, temporary_name = tempfile.mkstemp(
        prefix=MARKER.name + '.', suffix='.tmp', dir=DATA
    )
    temporary = Path(temporary_name)
    try:
        with os.fdopen(fd, 'w', encoding='utf-8') as handle:
            handle.write('permissions-v1\n')
            handle.flush()
            os.fsync(handle.fileno())
        os.chown(temporary, uid, gid, follow_symlinks=False)
        os.replace(temporary, MARKER)
        directory_fd = os.open(DATA, os.O_RDONLY)
        try:
            os.fsync(directory_fd)
        finally:
            os.close(directory_fd)
    except Exception:
        try:
            temporary.unlink()
        except FileNotFoundError:
            pass
        raise


def main():
    if os.geteuid() == 0:
        DATA.mkdir(parents=True, exist_ok=True)
        uid = pwd.getpwnam(USER).pw_uid
        gid = grp.getgrnam(GROUP).gr_gid
        # Migrate once. A failure aborts startup, so it can be retried safely.
        if not MARKER.exists():
            migrate_permissions(DATA, uid, gid)
            _write_marker(uid, gid)
        os.setgroups([])
        os.setgid(gid)
        os.setuid(uid)
    os.execvp(sys.argv[1], sys.argv[1:])


if __name__ == '__main__':
    main()
