"""Real PHP file-session regression: parallel requests must not wait for protected work or streaming."""
import json
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
PHP = Path('C:/tools/php859/php.exe')

CODE = r'''
require $argv[1];
ini_set('session.save_handler', 'files');
session_save_path($argv[2]);
session_id('isolated-concurrency-test');
$mode = $argv[3];
$settings = LifeHub\Shared\Config\Settings::fromArray([
    'dbName' => 'unused', 'dbUser' => 'unused', 'storagePath' => $argv[2]
]);
$handler = new class ($mode) implements Psr\Http\Server\RequestHandlerInterface {
    public function __construct(private string $mode) {}
    public function handle(Psr\Http\Message\ServerRequestInterface $request): Psr\Http\Message\ResponseInterface {
        if ($this->mode === 'logout') { $_SESSION = []; }
        if ($this->mode === 'controller') {
            echo json_encode(['sessionActive' => session_status() === PHP_SESSION_ACTIVE]) . PHP_EOL;
            flush();
            usleep(2500000);
        }
        return new Slim\Psr7\Response();
    }
};
$protected = new class ($handler) implements Psr\Http\Server\RequestHandlerInterface {
    public function __construct(private Psr\Http\Server\RequestHandlerInterface $next) {}
    public function handle(Psr\Http\Message\ServerRequestInterface $request): Psr\Http\Message\ResponseInterface {
        // Represents the authenticated user's last session write before the protected route.
        $_SESSION['user'] = ['id' => 7];
        return (new LifeHub\Shared\Http\ReleaseSessionMiddleware())($request, $this->next);
    }
};
$request = (new Slim\Psr7\Factory\ServerRequestFactory())->createServerRequest('GET', 'https://example.test/api/test');
$start = hrtime(true);
(new LifeHub\Shared\Http\SessionMiddleware($settings))($request, $mode === 'controller' ? $protected : $handler);
if ($mode === 'download') {
    echo json_encode(['sessionActive' => session_status() === PHP_SESSION_ACTIVE]) . PHP_EOL;
    flush();
    usleep(2500000); // Response emitter is still busy sending the body.
} elseif ($mode === 'fast' || $mode === 'logout') {
    echo json_encode(['elapsedMs' => (hrtime(true) - $start) / 1000000,
        'hasUser' => isset($_SESSION['user']),
        'sessionActive' => session_status() === PHP_SESSION_ACTIVE]) . PHP_EOL;
}
'''


@unittest.skipUnless(PHP.is_file(), 'PHP 8.5 required')
class SessionConcurrencyTests(unittest.TestCase):
    def test_other_requests_do_not_wait_for_controller_or_response_body(self):
        for mode in ('controller', 'download'):
            with self.subTest(mode=mode), tempfile.TemporaryDirectory(prefix='lifehub-session-test-') as folder:
                args = [str(PHP), '-r', CODE, str(ROOT / 'api/vendor/autoload.php'), folder]
                slow = subprocess.Popen(args + [mode], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
                try:
                    ready = slow.stdout.readline()
                    self.assertTrue(ready, 'PHP worker did not signal readiness')
                    self.assertFalse(json.loads(ready)['sessionActive'])
                    fast = subprocess.run(args + ['fast'], capture_output=True, text=True, timeout=8)
                    self.assertEqual(fast.returncode, 0, fast.stderr)
                    self.assertFalse(json.loads(fast.stdout)['sessionActive'])
                    self.assertIsNone(slow.poll(), 'Fast request waited for the slow request to finish')
                    logout = subprocess.run(args + ['logout'], capture_output=True, text=True, timeout=8)
                    self.assertEqual(logout.returncode, 0, logout.stderr)
                    self.assertFalse(json.loads(logout.stdout)['hasUser'])
                    _, errors = slow.communicate(timeout=8)
                    self.assertEqual(slow.returncode, 0, errors)
                    after = subprocess.run(args + ['fast'], capture_output=True, text=True, timeout=8)
                    self.assertEqual(after.returncode, 0, after.stderr)
                    self.assertFalse(json.loads(after.stdout)['hasUser'], 'Slow request resurrected a logged-out user')
                finally:
                    if slow.poll() is None:
                        slow.kill()
                        slow.communicate()


if __name__ == '__main__':
    unittest.main()
