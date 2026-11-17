#!/usr/local/bin/python
"""Migrate /data ownership once, then drop privileges before starting the app."""
import grp
import os
import pwd
import sys
from pathlib import Path

DATA = Path(os.environ.get("DATA_DIR", "/data"))
USER = "app"
GROUP = "app"
MARKER = DATA / ".lonely-wallet-permissions-v1"


def _walk_error(error):
    raise error


def migrate_permissions(data_dir: Path, uid: int, gid: int) -> None:
    """Change ownership of every entry; never hide permission or traversal errors."""
    failures = []
    for root, dirs, files in os.walk(
        data_dir, topdown=True, followlinks=False, onerror=_walk_error
    ):
        entries = [Path(root)] + [Path(root) / name for name in dirs + files]
        for path in entries:
            try:
                os.chown(path, uid, gid, follow_symlinks=False)
            except FileNotFoundError:
                # A transient file removed during traversal no longer needs ownership.
                continue
            except OSError as exc:
                failures.append(f"{path}: {exc}")
                if len(failures) >= 20:
                    break
        if failures:
            break
    if failures:
        raise RuntimeError(
            "Migração de permissões de /data incompleta. "
            "A aplicação não será iniciada e o marcador não será criado. "
            "Verifique a montagem e as permissões do volume. "
            + "; ".join(failures)
        )


def _write_marker(uid: int, gid: int) -> None:
    temp = DATA / (MARKER.name + ".tmp")
    try:
        temp.unlink(missing_ok=True)
        fd = os.open(temp, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            handle.write("1\\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.chown(temp, uid, gid, follow_symlinks=False)
        os.replace(temp, MARKER)
        dir_fd = os.open(DATA, os.O_RDONLY)
        try:
            os.fsync(dir_fd)
        finally:
            os.close(dir_fd)
    except Exception:
        temp.unlink(missing_ok=True)
        MARKER.unlink(missing_ok=True)
        raise


def main():
    if len(sys.argv) < 2:
        raise SystemExit("Comando de inicialização não informado.")
    if os.geteuid() == 0:
        DATA.mkdir(parents=True, exist_ok=True)
        uid = pwd.getpwnam(USER).pw_uid
        gid = grp.getgrnam(GROUP).gr_gid
        if not MARKER.exists():
            migrate_permissions(DATA, uid, gid)
            _write_marker(uid, gid)
        os.setgroups([])
        os.setgid(gid)
        os.setuid(uid)
    os.execvp(sys.argv[1], sys.argv[1:])


if __name__ == "__main__":
    main()
