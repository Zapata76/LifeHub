"""Read-only online validation contract and recovery after an ambiguous activation."""
import json
import unittest
from unittest.mock import patch

from test_update import update, UpdateTests, NEW, OLD


class HealthTests(unittest.TestCase):
    def response(self, path):
        headers = {'X-LifeHub-Release': NEW}
        if path == '':
            return 200, headers, b'<lh-root></lh-root>'
        if path == 'api/deployment-health':
            return 200, headers, json.dumps({'status': 'ok', 'database': 'reachable', 'schema': 'ready'}).encode()
        if path == 'api/health':
            return 200, headers, b'{"status":"ok"}'
        return 403, {}, b''

    def test_verifies_schema_and_real_api_bootstrap(self):
        with patch.object(update, 'http', side_effect=self.response) as http:
            update.verify_live(NEW)
        requested = [call.args[0] for call in http.call_args_list]
        self.assertIn('api/health', requested)
        self.assertIn('api/deployment-health', requested)

    def test_missing_schema_or_wrong_release_cannot_pass(self):
        for status, body in [(503, b'{}'), (200, b'{"status":"ok","database":"reachable"}'),
                             (200, b'[]'), (200, b'<html>not JSON</html>')]:
            def response(path):
                if path == 'api/deployment-health':
                    return status, {'X-LifeHub-Release': NEW}, body
                return self.response(path)
            with patch.object(update, 'http', side_effect=response):
                with self.assertRaises(update.UpdateError):
                    update.verify_live(NEW)


class ActivationTests(UpdateTests):
    # Inherits the in-memory deployment fixture; only additional methods below
    # are loaded by load_tests, avoiding duplicate inherited test execution.
    def test_lost_activation_ack_restores_old_entry(self):
        old = self.remote.files['index.php']
        original = self.remote.put
        failed = False

        def put(path, content):
            nonlocal failed
            original(path, content)
            if path == 'index.php' and not failed:
                failed = True
                raise EOFError('RNTO completed but response was lost')

        with patch.object(self.remote, 'put', side_effect=put), patch.object(update, 'verify_live'):
            with self.assertRaises(EOFError):
                self.publish()
        self.assertEqual(self.remote.files['index.php'], old)
        self.assertNotIn('.lh-update-lock', self.remote.directories)


def load_tests(loader, tests, pattern):
    return unittest.TestSuite([loader.loadTestsFromTestCase(HealthTests),
                               ActivationTests('test_lost_activation_ack_restores_old_entry')])
