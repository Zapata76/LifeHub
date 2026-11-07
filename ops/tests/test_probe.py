"""Exercise the actual API entry point on localhost without application DB access."""
import hashlib
import contextlib
import io
import json
from pathlib import Path
import socket
import subprocess
import tempfile
import time
import unittest
from unittest.mock import patch
import sys
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parents[2]
PHP = Path('C:/tools/php859/php.exe')
TOKEN = 'a' * 64  # Disposable test credential, never production.
sys.path.insert(0, str(ROOT / 'ops'))
import probe


class ProbeClientTests(unittest.TestCase):
    def test_initialization_prints_only_hash_and_never_overwrites_token(self):
        with tempfile.TemporaryDirectory(prefix='lifehub-probe-client-') as temp:
            path = Path(temp) / 'private-token'
            output = io.StringIO()
            with patch.object(probe, 'TOKEN_FILE', path), patch.object(sys, 'argv', ['probe.py', '--init']):
                with contextlib.redirect_stdout(output):
                    probe.main()
                token = path.read_text().strip()
                self.assertEqual(len(token), 64)
                self.assertNotIn(token, output.getvalue())
                self.assertEqual(json.loads(output.getvalue())['diagnosticProbeTokenHash'],
                                 hashlib.sha256(token.encode()).hexdigest())
                with contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit):
                    probe.main()
                self.assertEqual(token, path.read_text().strip())

    def test_client_does_not_follow_redirects_with_token(self):
        handler = probe.NoRedirect()
        request = urllib.request.Request(probe.URL, headers={'X-LifeHub-Probe-Token': TOKEN})
        self.assertIsNone(handler.redirect_request(request, None, 302, '', {}, 'https://example.test/'))

    def test_polling_interval_cannot_be_shorter_than_one_minute(self):
        with patch.object(sys, 'argv', ['probe.py', '--interval', '1']):
            with contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit):
                probe.main()


@unittest.skipUnless(PHP.is_file(), 'PHP 8.5 required')
class ProbeEntrypointTests(unittest.TestCase):
    def test_no_session_and_no_database_before_authorization(self):
        with tempfile.TemporaryDirectory(prefix='lifehub-probe-') as temp:
            directory = Path(temp)
            storage = directory / 'storage'
            storage.mkdir()
            config = directory / 'config.php'
            config.write_text("<?php return ['dbHost'=>'127.0.0.1','dbPort'=>'1','dbName'=>'unused',"
                              "'dbUser'=>'unused','storagePath'=>__DIR__.'/storage',"
                              "'diagnosticProbeTokenHash'=>'" + hashlib.sha256(TOKEN.encode()).hexdigest() + "',"
                              "'diagnosticProbeHouseholdId'=>'7'];", encoding='utf-8')
            router = directory / 'router.php'
            entry = str(ROOT / 'api/public/index.php').replace('\\', '/').replace("'", "\\'")
            router.write_text("<?php $_SERVER['HTTPS']='on'; "
                              "define('LIFEHUB_CONFIG_FILE', __DIR__.'/config.php'); "
                              "define('LIFEHUB_REQUEST_STARTED_NS', hrtime(true)-5000000); "
                              "require '" + entry + "';", encoding='utf-8')
            with socket.socket() as sock:
                sock.bind(('127.0.0.1', 0))
                port = sock.getsockname()[1]
            process = subprocess.Popen([str(PHP), '-S', f'127.0.0.1:{port}', str(router)],
                                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            try:
                for _ in range(100):
                    try:
                        with socket.create_connection(('127.0.0.1', port), timeout=.1):
                            break
                    except OSError:
                        time.sleep(.05)
                url = f'http://127.0.0.1:{port}/api/v1/diagnostics/probe'
                for headers, expected in (({}, 401), ({'X-LifeHub-Probe-Token': TOKEN}, 503),
                                          ({'X-LifeHub-Probe-Token': TOKEN}, 429)):
                    with self.assertRaises(urllib.error.HTTPError) as caught:
                        urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=5)
                    with caught.exception as response:
                        self.assertEqual(response.code, expected)
                        self.assertIsNone(response.headers.get('Set-Cookie'))
                        payload = json.loads(response.read())
                        self.assertNotIn('unused', json.dumps(payload))
                        if expected != 401:
                            self.assertIn('early_php;dur=', response.headers['Server-Timing'])
                            self.assertIn('php_total;dur=', response.headers['Server-Timing'])
                        else:
                            self.assertFalse((storage / 'diagnostic-probe.lock').exists())
            finally:
                process.terminate()
                process.wait(timeout=5)


if __name__ == '__main__':
    unittest.main()
