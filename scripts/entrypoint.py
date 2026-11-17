#!/usr/local/bin/python
"""Prepare the persistent data volume once, then drop privileges."""
import os
import pwd
import grp
import sys
from pathlib import Path

DATA = Path(os.environ.get("DATA_DIR", "/data"))
USER = "app"
GROUP = "app"
MARKER = DATA / ".lonely-wallet-permissions-v1"


def _raise_walk_error(error):
    raise error


def migrate_permissions(data_dir: Path, uid: int, gid: int) -> None:
    failures = []
    for root, dirs, files in os.walk(data_dir, topdown=True, followlinks=False,
                                     onerror=_raise_walk_error):
        for path in [Path(root)] + [Path(root) / name for name in dirs + files]:
            try:
                os.chown(path, uid, gid, follow_symlinks=False)
            except FileNotFoundError:
                continue
            except OSError as exc:
                failures.append(f"{path}: {exc}")
                if len(failures) >= 20:
                    break
        if failures:
            break
    if failures:
        raise RuntimeError(
            "Migração de permissões de /data incompleta. A aplicação não será iniciada. "
            "Verifique as permissões e a montagem do volume. Erros: " + "; ".join(failures)
        )


def main():
    if os.geteuid() == 0:
        DATA.mkdir(parents=True, exist_ok=True)
        uid = pwd.getpwnam(USER).pw_uid
        gid = grp.getgrnam(GROUP).gr_gid
        if not MARKER.exists():
            temp_marker = DATA / (MARKER.name + ".tmp")
            try:
                temp_marker.unlink(missing_ok=True)
                migrate_permissions(DATA, uid, gid)
                fd = os.open(temp_marker, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
                with os.fdopen(fd, "w", encoding="utf-8") as handle:
                    handle.write("1\n")
                    handle.flush()
                    os.fsync(handle.fileno())
                os.chown(temp_marker, uid, gid)
                os.replace(temp_marker, MARKER)
                os.chown(MARKER, uid, gid)
            except Exception:
                temp_marker.unlink(missing_ok=True)
                raise
        os.setgroups([])
        os.setgid(gid)
        os.setuid(uid)
    os.execvp(sys.argv[1], sys.argv[1:])


if __name__ == "__main__":
    main()
