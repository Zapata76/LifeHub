"""Exercise the generated front controller with real PHP; only localhost is used."""
import json
from pathlib import Path
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import unittest
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'ops'))
import update

NEW = '20260927T010000Z-aaaaaaaaaaaa'
OLD = '20260927T000000Z-bbbbbbbbbbbb'


@unittest.skipUnless(update.PHP.is_file(), 'PHP 8.5 required')
class HostingTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory(prefix='lifehub-hosting-')
        cls.addClassCleanup(cls.temp.cleanup)
        root = Path(cls.temp.name)
        cls.public = root / 'public'
        cls.app = cls.public / 'umbertini'
        for release in (NEW, OLD):
            build = cls.app / '.lh-releases' / release
            (build / 'frontend/styles').mkdir(parents=True)
            (build / 'backend/public').mkdir(parents=True)
            (build / 'frontend/index.html').write_text('<lh-root>fixture</lh-root>')
            (build / 'frontend/ngsw.json').write_text('{"configVersion":1}')
            (build / 'frontend/ngsw-worker.js').write_text('// worker')
            (build / 'frontend/styles/tail.css').write_text('body{color:blue}')
            (build / 'frontend/manifest.webmanifest').write_text('{}')
            (build / 'frontend' / ('main-' + release + '.js')).write_text('// fixture')
            shutil.copyfile(ROOT / 'api/src/Shared/Config/Settings.php', build / 'backend/Settings.php')
            (build / 'backend/public/index.php').write_text(
                "<?php require dirname(__DIR__).'/Settings.php'; "
                "$s=LifeHub\\Shared\\Config\\Settings::fromFile(); "
                "header('Content-Type: application/json'); "
                "echo json_encode(['basePath'=>$s->get('basePath'),'sessionName'=>$s->get('sessionName')]);")
        cls.private = cls.app / '.lh-private'
        (cls.private / 'storage').mkdir(parents=True)
        (cls.private / '.htaccess').write_text('Require all denied\n')
        (cls.private / 'config.php').write_text(
            "<?php return ['environment'=>'production','basePath'=>'/umbertini',"
            "'dbName'=>'synthetic','dbUser'=>'synthetic','sessionName'=>'retained',"
            "'storagePath'=>__DIR__.'/storage'];")
        (cls.app / 'hosting.php').write_bytes((ROOT / 'deploy/updater/hosting.php.example').read_bytes())
        (cls.app / 'index.php').write_bytes(update.frontend(NEW, OLD))
        router = root / 'router.php'
        # This trusted-server override exists ONLY in the disposable test harness.
        router.write_text("<?php $_SERVER['HTTPS']=$_SERVER['HTTP_X_TEST_HTTPS']??'on'; "
                          "require __DIR__.'/public/umbertini/index.php';")
        with socket.socket() as sock:
            sock.bind(('127.0.0.1', 0))
            port = sock.getsockname()[1]
        cls.base = f'http://127.0.0.1:{port}/umbertini/'
        cls.process = subprocess.Popen([str(update.PHP), '-d', 'opcache.enable_cli=0',
                                        '-S', f'127.0.0.1:{port}', '-t', str(cls.public), str(router)],
                                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        cls.addClassCleanup(cls.stop)
        for _ in range(50):
            try:
                urllib.request.urlopen(cls.base, timeout=1).close()
                break
            except urllib.error.URLError:
                time.sleep(.1)
        else:
            raise RuntimeError('Local PHP fixture failed to start')

    @classmethod
    def stop(cls):
        cls.process.terminate()
        cls.process.wait(timeout=5)

    def get(self, path, headers=None):
        try:
            with urllib.request.urlopen(urllib.request.Request(self.base + path, headers=headers or {}), timeout=5) as response:
                return response.status, response.headers, response.read()
        except urllib.error.HTTPError as error:
            return error.code, error.headers, error.read()

    def test_all_spa_routes(self):
        for route in ('', 'tasks', 'shopping', 'recipes', 'meals', 'inventory', 'notes',
                      'documents', 'calendars', 'goals', 'admin', 'about', 'login', 'index.html'):
            with self.subTest(route=route):
                status, headers, body = self.get(route)
                self.assertEqual(status, 200)
                self.assertEqual(headers['X-LifeHub-Release'], NEW)
                self.assertIn(b'<lh-root', body)

    def test_pwa_and_css_bytes_no_cache(self):
        for path, mime in [('ngsw.json', 'application/json'), ('ngsw-worker.js', 'text/javascript'),
                           ('styles/tail.css', 'text/css'), ('manifest.webmanifest', 'application/manifest+json')]:
            status, headers, body = self.get(path)
            self.assertEqual(status, 200)
            self.assertEqual(headers['Content-Type'].split(';')[0], mime)
            self.assertEqual(headers['Cache-Control'], 'no-store')
            expected = self.app / '.lh-releases' / NEW / 'frontend' / path
            self.assertEqual(body, expected.read_bytes())

    def test_previous_hashed_chunk_remains_available(self):
        self.assertEqual(self.get('main-' + OLD + '.js')[0], 200)
        self.assertEqual(self.get('main-missing.js')[0], 404)
        self.assertEqual(self.get('other.json')[0], 404)

    def test_private_and_traversal_rejected(self):
        for path in ('hosting.php', '.lh-private/config.php', '.lh-private/storage/push-vapid.php',
                     '.lh-releases/' + NEW + '/backend/Settings.php', '%2e%2e/private', 'a%5Cb', 'a%00b'):
            self.assertEqual(self.get(path)[0], 403, path)

    def test_api_uses_protected_config_and_preserves_session_name(self):
        status, headers, body = self.get('api/v1/app-config')
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(body), {'basePath': '/umbertini', 'sessionName': 'retained'})
        self.assertEqual(headers['X-Frame-Options'], 'SAMEORIGIN')

    def test_unsafe_private_configuration_is_rejected_without_details(self):
        guard = self.private / '.htaccess'
        original = guard.read_bytes()
        try:
            guard.write_text('Require all granted')
            status, _, body = self.get('api/health')
            self.assertEqual(status, 503)
            self.assertNotIn(str(self.private).encode(), body)
            self.assertNotIn(b'synthetic', body)
        finally:
            guard.write_bytes(original)

    def test_plain_http_rejected(self):
        self.assertEqual(self.get('', {'X-Test-HTTPS': 'off'})[0], 403)


if __name__ == '__main__':
    unittest.main()
