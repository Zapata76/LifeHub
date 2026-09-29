"""Optional smoke test of the real Composer package produced by -PrepareOnly."""
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'ops'))
import update


class PreparedRuntimeTests(unittest.TestCase):
    def test_shared_composer_bridge_loads_app_slim_and_push_without_network(self):
        packages = sorted((ROOT / '.local/releases').glob('*/manifest.json'))
        if not packages or not update.PHP.is_file():
            self.skipTest('Run update.ps1 -PrepareOnly first')
        package = packages[-1].parent
        with tempfile.TemporaryDirectory(prefix='lifehub-autoload-') as temp:
            root = Path(temp)
            release = root / '.lh-releases/test-release/backend'
            library = root / '.lh-releases/_libraries' / ('a' * 64)
            shutil.copytree(package / 'backend/vendor', library / 'vendor')
            shutil.copytree(package / 'backend/src', release / 'src')
            (release / 'vendor').mkdir()
            bridge = release / 'vendor/autoload.php'
            bridge.write_bytes(update.library_bridge('a' * 64))
            code = r'''
                require $argv[1];
                $settings = new ReflectionClass(LifeHub\Shared\Config\Settings::class);
                $slim = Slim\Factory\AppFactory::create();
                $push = new Minishlink\WebPush\WebPush();
                echo json_encode(['settings' => $settings->getFileName(),
                    'slim' => get_class($slim), 'push' => get_class($push)]);
            '''
            result = subprocess.run([str(update.PHP), '-r', code, str(bridge)],
                                    capture_output=True, text=True, timeout=20)
            self.assertEqual(result.returncode, 0, result.stderr)
            loaded = json.loads(result.stdout)
            self.assertEqual(Path(loaded['settings']), release / 'src/Shared/Config/Settings.php')
            self.assertEqual(loaded['slim'], 'Slim\\App')
            self.assertEqual(loaded['push'], 'Minishlink\\WebPush\\WebPush')


if __name__ == '__main__':
    unittest.main()
