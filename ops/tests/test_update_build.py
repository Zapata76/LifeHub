"""Build allowlists and PWA coherence without downloading dependencies."""
import hashlib
import json
from pathlib import Path
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'ops'))
import update_build
import update


class BuildTests(unittest.TestCase):
    def test_contract_includes_completion_and_every_table(self):
        contract = update_build.schema_contract((ROOT / 'database/lifehub.sql').read_text())
        self.assertIn('completed_at', contract['lh_tasks'])
        self.assertIn('lh_users', contract)
        self.assertGreater(len(contract), 20)

    def test_unrecognized_sql_structure_fails_closed(self):
        for sql in ('', 'CREATE TABLE unexpected (id int);'):
            with self.assertRaises(ValueError):
                update_build.schema_contract(sql)

    def test_allowlist_rejects_config_and_unexpected_backend_files(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / 'index.php').write_text('<?php')
            (root / 'secret.env').write_text('synthetic')
            with self.assertRaisesRegex(ValueError, 'UNEXPECTED_BACKEND_FILE'):
                update_build.collect_files([(root, 'backend/public')])

    def test_cli_and_public_routing_allowlist(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / 'lifehub').write_text('<?php')
            self.assertIn('backend/bin/lifehub', update_build.collect_files([(root, 'backend/bin')]))
            (root / 'unrecognized').write_text('not PHP')
            with self.assertRaises(ValueError):
                update_build.collect_files([(root, 'backend/bin')])

    def test_pwa_manifest_matches_exact_bytes(self):
        css = b'body {color: blue}\n'
        manifest = {'index': '/umbertini/index.html', 'hashTable': {
            '/umbertini/styles/tail.css': hashlib.sha1(css).hexdigest()}}
        files = {'frontend/ngsw.json': json.dumps(manifest).encode(), 'frontend/styles/tail.css': css}
        update_build.check_pwa(files)
        files['frontend/styles/tail.css'] += b'\n'
        with self.assertRaisesRegex(ValueError, 'PWA_MANIFEST_MISMATCH'):
            update_build.check_pwa(files)

    def test_library_hash_protocol_vector(self):
        _, package = update.library_package({'backend/vendor/autoload.php': b'<?php return null;\n'})
        self.assertEqual(package['id'], 'e254ec60dd7c667347b3513db40b3089e0150e20009ec4f058f46008c0f3a614')

    def test_ambiguous_remote_paths_rejected(self):
        for path in ('a//b', 'a/', './a', 'a/./b'):
            with self.assertRaises(update.UpdateError):
                update.safe_relative(path)


if __name__ == '__main__':
    unittest.main()
