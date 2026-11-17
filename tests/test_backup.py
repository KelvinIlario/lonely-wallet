import importlib.util
import json
import sqlite3
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / 'scripts' / 'backup.py'
SPEC = importlib.util.spec_from_file_location('wallet_backup', SCRIPT)
backup = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(backup)


class BackupTests(unittest.TestCase):
    def setUp(self):
        self.root = Path(tempfile.mkdtemp(prefix='lw-backup-test-'))
        self.data = self.root / 'data'
        self.dest = self.root / 'backups'
        self.data.mkdir()

    def _database(self):
        con = sqlite3.connect(self.data / 'ativos.db')
        con.execute('CREATE TABLE sample(value TEXT)')
        con.execute("INSERT INTO sample VALUES('ok')")
        con.commit()
        con.close()

    def test_backup_is_complete_and_restricted(self):
        self._database()
        (self.data / 'quotes_last_valid.json').write_text('{"PETR4": {"price": 10}}', encoding='utf-8')
        result = backup.create_backup(self.data, self.dest)
        self.assertTrue((result / 'ativos.db').exists())
        self.assertTrue((result / 'quotes_last_valid.json').exists())
        self.assertTrue((result / 'backup-manifest.json').exists())
        self.assertEqual(result.stat().st_mode & 0o777, 0o700)
        self.assertEqual((result / 'ativos.db').stat().st_mode & 0o777, 0o600)
        manifest = json.loads((result / 'backup-manifest.json').read_text())
        self.assertIn('ativos.db', manifest['files'])

    def test_failure_removes_partial_directory(self):
        (self.data / 'quotes_last_valid.json').write_text('{invalid', encoding='utf-8')
        with self.assertRaises(json.JSONDecodeError):
            backup.create_backup(self.data, self.dest)
        self.assertEqual(list(self.dest.iterdir()), [])

    def test_backup_includes_keys_only_when_requested(self):
        self._database()
        (self.data / '.api-credentials.key').write_bytes(b'secret')
        ordinary = backup.create_backup(self.data, self.dest)
        self.assertFalse((ordinary / 'secrets').exists())
        protected = backup.create_backup(self.data, self.dest, include_keys=True)
        key = protected / 'secrets' / '.api-credentials.key'
        self.assertEqual(key.read_bytes(), b'secret')
        self.assertEqual(key.stat().st_mode & 0o777, 0o600)


if __name__ == '__main__':
    unittest.main()
