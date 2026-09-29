"""Private directory setup boundaries. No actual server or DB credentials."""
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'ops'))
import setup_hosting
import update
from test_update import FakeRemote


class SetupTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        root=Path(self.temp.name)
        (root/'.local').mkdir()
        # No local config.php exists: setup must not depend on or upload it.
        (root/'.local/deploy.json').write_text(json.dumps({'filezilla_sites':'test-only','tls_host':'test.invalid'}))
        self.remote=FakeRemote()
        self.remote.close=lambda:None
        del self.remote.files['index.php']
        del self.remote.files['hosting.php']
        for mock in (patch.object(update,'ROOT',root),patch.object(update,'Remote',return_value=self.remote),
                     patch.object(update,'http',return_value=(403,{},b'')),patch.object(update,'report')):
            mock.start()
            self.addCleanup(mock.stop)

    def test_sets_up_without_local_db_config(self):
        setup_hosting.setup()
        self.assertIn('hosting.php',self.remote.files)
        self.assertIn('.lh-private/.htaccess',self.remote.files)
        self.assertNotIn('.lh-private/config.php',self.remote.files)
        self.assertNotIn('.lh-update-lock',self.remote.directories)

    def test_denied_probe_required(self):
        with patch.object(update,'http',return_value=(200,{},b'')):
            with self.assertRaisesRegex(update.UpdateError,'NOT_PROTECTED'): setup_hosting.setup()
        self.assertNotIn('hosting.php',self.remote.files)

    def test_existing_config_never_read_or_written(self):
        self.remote.files['.lh-private/config.php']=b'existing private content'
        original=self.remote.read
        def read(path,limit=999999):
            self.assertNotEqual(path,'.lh-private/config.php')
            return original(path,limit)
        self.remote.read=read
        setup_hosting.setup()
        self.assertNotIn('.lh-private/config.php',self.remote.writes)
        self.assertEqual(self.remote.files['.lh-private/config.php'],b'existing private content')

    def test_does_not_modify_live_app(self):
        self.remote.files['index.php']=b'live application'
        with self.assertRaisesRegex(update.UpdateError,'INITIAL_SETUP_ONLY'): setup_hosting.setup()
        self.assertEqual(self.remote.writes,[])

    def test_foreign_rules_not_overwritten(self):
        self.remote.files['.htaccess']=b'custom rules'
        with self.assertRaisesRegex(update.UpdateError,'NOT_OVERWRITTEN'): setup_hosting.setup()
        self.assertEqual(self.remote.writes,[])

    def test_repeated_setup_preserves_pointer_and_protection(self):
        setup_hosting.setup()
        self.remote.writes=[]
        setup_hosting.setup()
        self.assertNotIn('hosting.php',self.remote.writes)
        self.assertNotIn('.lh-private/.htaccess',self.remote.writes)


if __name__=='__main__': unittest.main(verbosity=2)
