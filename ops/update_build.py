"""Isolated Life Hub build: no hosting access, credentials or database writes."""
import datetime
import hashlib
import json
import os
import re
import secrets
import shutil
import tempfile
from pathlib import Path


class BuildError(ValueError):
    """Only fixed, non-sensitive validation codes may be reported by the CLI."""


def schema_contract(sql):
    """Extract identifiers, never execute or ship the installation SQL."""
    tables = {}
    for name, body in re.findall(r'CREATE TABLE IF NOT EXISTS `([a-z0-9_]+)` \((.*?)\) ENGINE=', sql, re.S):
        columns = re.findall(r'^\s*`([a-z0-9_]+)`\s+', body, re.M)
        if not columns or name in tables:
            raise BuildError('SCHEMA_CONTRACT_INVALID')
        tables[name] = columns
    if not tables or len(tables) != len(re.findall(r'CREATE TABLE', sql)):
        raise BuildError('SCHEMA_CONTRACT_INVALID')
    return tables


def collect_files(source_roots):
    files = {}
    for directory, prefix in source_roots:
        if not directory.is_dir() or directory.is_symlink() or directory.resolve() != directory.absolute():
            raise BuildError('SOURCE_DIRECTORY_INVALID')
        for file in sorted(directory.rglob('*')):
            if file.is_symlink() or file.resolve() != file.absolute():
                raise BuildError('SYMLINK_IN_PACKAGE')
            if not file.is_file():
                continue
            relative = file.relative_to(directory)
            suffix = file.suffix
            if prefix == 'backend/vendor':
                if any(part in {'.github', '.gitignore', '.hhconfig', '.php-cs-fixer.php',
                                '.php-cs-fixer.dist.php'} for part in relative.parts):
                    continue
                if any(part.startswith('.') for part in relative.parts) or suffix not in {
                        '.php', '.json', '.md', '', '.dist', '.yml', '.xml', '.hhi'}:
                    raise BuildError('UNEXPECTED_VENDOR_FILE')
            elif prefix.startswith('backend'):
                if prefix == 'backend/public' and relative.as_posix() == '.htaccess':
                    continue
                if suffix != '.php' and not (prefix == 'backend/bin' and relative.as_posix() == 'lifehub'):
                    raise BuildError('UNEXPECTED_BACKEND_FILE')
            elif suffix not in {'.html', '.js', '.css', '.svg', '.png', '.ico', '.webmanifest', '.woff2'} and relative.as_posix() != 'ngsw.json':
                raise BuildError('UNEXPECTED_FRONTEND_FILE')
            files[prefix + '/' + relative.as_posix()] = file.read_bytes()
    return files


def check_pwa(files):
    try:
        manifest = json.loads(files['frontend/ngsw.json'])
        if manifest['index'] != '/umbertini/index.html' or not manifest['hashTable']:
            raise ValueError()
        for url, expected in manifest['hashTable'].items():
            if not url.startswith('/umbertini/'):
                raise ValueError()
            path = url.removeprefix('/umbertini/')
            if hashlib.sha1(files['frontend/' + path]).hexdigest() != expected:
                raise ValueError()
    except (ValueError, KeyError, TypeError):
        raise BuildError('PWA_MANIFEST_MISMATCH') from None


def prepare_release(updater):
    root, php, command = updater.ROOT, updater.PHP, updater.command
    npm = shutil.which('npm.cmd') or shutil.which('npm')
    if not npm or not php.is_file():
        raise updater.UpdateError('NODE_OR_PHP_UNAVAILABLE')
    composer = updater.composer_path()
    if not composer.is_file() or not (root / 'api/composer.lock').is_file():
        raise updater.UpdateError('COMPOSER_OR_LOCK_UNAVAILABLE_SET_LIFEHUB_COMPOSER_PHAR')
    root_package = json.loads((root / 'api/composer.json').read_text(encoding='utf-8'))
    if root_package.get('autoload') != {'psr-4': {'LifeHub\\': 'src/'}}:
        raise updater.UpdateError('ROOT_AUTOLOAD_CHANGED_REVIEW_SHARED_LIBRARY_BRIDGE')
    command([php, '-r', "if (version_compare(PHP_VERSION, '8.5.6', '<')) { exit(1); }"])
    command([npm, 'ci', '--no-audit', '--no-fund'], root / 'web')
    command(['node', 'node_modules/typescript/bin/tsc', '--noEmit', '-p', 'tsconfig.app.json'], root / 'web')
    command([npm, 'run', 'build', '--', '--base-href=/umbertini/'], root / 'web',
            env={**os.environ, 'NG_BUILD_MAX_WORKERS': os.environ.get('NG_BUILD_MAX_WORKERS', '1')})
    # Fresh Composer project: api/vendor retains development dependencies and no
    # optimized root classmap can point outside the active release.
    scratch = root / '.local/builds'
    scratch.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='composer-', dir=scratch) as staging:
        backend = Path(staging)
        for name in ('composer.json', 'composer.lock'):
            shutil.copyfile(root / 'api' / name, backend / name)
        command([php, composer, 'install', '--no-dev', '--no-interaction', '--no-scripts',
                 '--no-plugins', '--prefer-dist'], backend,
                env={**os.environ, 'COMPOSER_ROOT_VERSION': '0.0.0'})
        files = collect_files([
            (root / 'api/src', 'backend/src'), (root / 'api/public', 'backend/public'),
            (root / 'api/bin', 'backend/bin'), (backend / 'vendor', 'backend/vendor'),
            (root / 'web/dist/lifehub/browser', 'frontend')])
    files['backend/schema-contract.json'] = updater.encoded(schema_contract(
        (root / 'database/lifehub.sql').read_text(encoding='utf-8')))
    files['backend/deployment-health.php'] = (root / 'deploy/updater/deployment-health.php').read_bytes()
    if 'frontend/index.html' not in files or 'backend/public/index.php' not in files:
        raise updater.UpdateError('PACKAGE_INCOMPLETE')
    check_pwa(files)
    for path in [*sorted((root / 'api/src').rglob('*.php')), root / 'api/bin/lifehub',
                 root / 'api/public/index.php', *sorted((root / 'deploy/updater').glob('*.php'))]:
        command([php, '-l', path])
    release = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ-') + secrets.token_hex(6)
    directory = root / '.local/releases' / release
    directory.mkdir(parents=True, exist_ok=False)
    for path, content in files.items():
        destination = directory / path
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(content)
    manifest = {'release': release, 'files': updater.file_records(files)}
    (directory / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
    libraries, package = updater.library_package(files)
    updater.report('prepared', release=release, files=len(files), applicationFiles=len(files)-len(libraries)+1,
                   libraryFiles=len(libraries), libraryPackage=package['id'], directory=str(directory),
                   databaseChanged=False)
    return release, files, manifest
