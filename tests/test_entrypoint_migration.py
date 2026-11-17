import importlib.util
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "entrypoint.py"
spec = importlib.util.spec_from_file_location("wallet_entrypoint", SCRIPT)
entrypoint = importlib.util.module_from_spec(spec)
spec.loader.exec_module(entrypoint)


class PermissionMigrationTests(unittest.TestCase):
    def test_migration_visits_files_and_directories(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "nested").mkdir()
            (root / "nested" / "db.sqlite").write_text("test")
            visited = []
            with patch.object(entrypoint.os, "chown", side_effect=lambda path, uid, gid, **kw: visited.append(Path(path))):
                entrypoint.migrate_permissions(root, 10001, 10001)
            self.assertIn(root, visited)
            self.assertIn(root / "nested", visited)
            self.assertIn(root / "nested" / "db.sqlite", visited)

    def test_migration_raises_on_permission_error(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "db.sqlite").write_text("test")
            with patch.object(entrypoint.os, "chown", side_effect=PermissionError("denied")):
                with self.assertRaises(RuntimeError):
                    entrypoint.migrate_permissions(root, 10001, 10001)


if __name__ == "__main__":
    unittest.main()
