"""Build and publish Life Hub from this PC. Never changes the database or private config."""
import argparse
import base64
import ftplib
import hashlib
import io
import json
import os
from pathlib import Path, PurePosixPath
import re
import secrets
import shutil
import ssl
import subprocess
import sys
import time
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT
TARGET = '/www.emilianomaugeri.it/umbertini'
BASE_URL = 'https://www.emilianomaugeri.it/umbertini/'
PROFILE_HOST = 'ftp.emilianomaugeri.it'
RELEASE_PATTERN = r'[0-9]{8}T[0-9]{6}Z-[0-9a-f]{12}'
PHP = Path('C:/tools/php859/php.exe')
LIBRARIES = '.lh-releases/_libraries'


class UpdateError(Exception):
    pass


def report(stage, **values):
    print(json.dumps({'stage': stage, **values}), flush=True)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def encoded(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':')).encode('utf-8')


def file_records(files):
    return {path: {'bytes': len(content), 'sha256': sha(content)} for path, content in sorted(files.items())}


def library_package(files):
    libraries = {path.removeprefix('backend/'): content for path, content in files.items() if path.startswith('backend/vendor/')}
    if not libraries:
        return {}, None
    if 'vendor/autoload.php' not in libraries:
        raise UpdateError('LIBRARY_AUTOLOAD_MISSING')
    records = file_records(libraries)
    return libraries, {'format': 1, 'id': sha(encoded(records)), 'files': records}


def library_bridge(package_id):
    if not re.fullmatch('[a-f0-9]{64}', package_id):
        raise UpdateError('INVALID_LIBRARY_ID')
    # Composer's project namespace belongs to this release, not to the shared package.
    return ("<?php\ndeclare(strict_types=1);\n"
            "$loader = require dirname(__DIR__, 3) . '/_libraries/" + package_id + "/vendor/autoload.php';\n"
            "$loader->setPsr4('LifeHub\\\\', dirname(__DIR__) . '/src');\n"
            "return $loader;\n").encode('utf-8')


def safe_relative(path):
    if not isinstance(path, str) or not path or '\\' in path or any(ord(c) < 32 for c in path):
        raise UpdateError('INVALID_PACKAGE_PATH')
    parts = path.split('/')
    if path.startswith('/') or any(part in {'', '.', '..'} for part in parts) or ':' in path:
        raise UpdateError('INVALID_PACKAGE_PATH')
    return path


def command(arguments, cwd=ROOT, env=None):
    result = subprocess.run([str(arg) for arg in arguments], cwd=cwd, env=env)
    if result.returncode:
        raise UpdateError('LOCAL_CHECK_FAILED')


def composer_path():
    explicit = os.environ.get('LIFEHUB_COMPOSER_PHAR')
    if explicit:
        return Path(explicit)
    local = ROOT / '.local/tools/composer.phar'
    if local.is_file():
        return local
    bundled = PHP.with_name('composer.phar')
    if bundled.is_file():
        return bundled
    executable = shutil.which('composer.bat') or shutil.which('composer')
    return Path(executable).with_name('composer.phar') if executable else Path('composer.phar')


def prepare():
    from update_build import BuildError, prepare_release
    try:
        return prepare_release(sys.modules[__name__])
    except BuildError as error:
        raise UpdateError(str(error)) from None


def connection_options(tls_override=None):
    config_path = ROOT / '.local/deploy.json'
    config = json.loads(config_path.read_text(encoding='utf-8-sig')) if config_path.is_file() else {}
    if not isinstance(config, dict) or set(config) - {'filezilla_sites', 'tls_host'}:
        raise UpdateError('DEPLOY_CONFIG_INVALID')
    tls_host = tls_override or config.get('tls_host', PROFILE_HOST)
    if not isinstance(tls_host, str) or not re.fullmatch(r'[A-Za-z0-9.-]+', tls_host):
        raise UpdateError('TLS_HOST_INVALID')
    sites = config.get('filezilla_sites', str(Path(os.environ.get('APPDATA', '')) / 'FileZilla/sitemanager.xml'))
    if not isinstance(sites, str) or not sites:
        raise UpdateError('FILEZILLA_PATH_INVALID')
    return Path(sites), tls_host


def profile(path):
    sites = [site for site in ET.parse(path).iter('Server')
             if site.findtext('Name') == 'em' and site.findtext('Host') == PROFILE_HOST]
    if len(sites) != 1:
        raise UpdateError('FILEZILLA_PROFILE_NOT_UNIQUE')
    site = sites[0]
    # FileZilla: 0 = FTP (negotiated TLS), 4 = explicit FTP over TLS.
    if site.findtext('Protocol') not in {'0', '4'} or site.findtext('Logontype') != '1':
        raise UpdateError('FILEZILLA_PROFILE_TYPE_UNSUPPORTED')
    password = site.find('Pass')
    if password is None or password.get('encoding') != 'base64':
        raise UpdateError('FILEZILLA_PASSWORD_STORAGE_UNSUPPORTED')
    return site.findtext('User'), base64.b64decode(password.text, validate=True).decode('utf-8'), int(site.findtext('Port', '21'))


class Remote:
    def __init__(self, profile_path, tls_host):
        self.profile_path, self.tls_host = profile_path, tls_host
        self.directories = set()
        self.operation = 'connect'
        self.connect()

    def connect(self):
        user, password, port = profile(self.profile_path)
        self.ftp = ftplib.FTP_TLS(context=ssl.create_default_context(), timeout=20)
        try:
            self.ftp.connect(self.tls_host, port)
            self.ftp.auth()  # Mandatory verified TLS BEFORE sending any credentials.
            self.ftp.login(user, password)
            self.ftp.prot_p()  # Encrypt file contents too; never fall back to plain FTP.
        except BaseException:
            self.close()
            raise

    def close(self):
        try:
            self.ftp.close()
        except Exception as error:
            # Closing a broken transport must not hide a TLS/transfer error.
            report('cleanup', code='CONNECTION_CLOSE_FAILED', errorType=type(error).__name__)

    def reconnect(self):
        self.close()
        self.connect()
        self.target()

    def retry(self, operation, work):
        self.operation = operation
        for attempt in range(3):
            try:
                if attempt:
                    self.reconnect()
                if getattr(self.ftp, 'sock', None) is None:
                    # ftplib otherwise dereferences None and raises AttributeError.
                    raise ConnectionError('FTPS_CONTROL_CONNECTION_CLOSED')
                return work()
            except ssl.SSLCertVerificationError:
                raise
            except (EOFError, ConnectionError, TimeoutError, ssl.SSLError, ftplib.error_temp) as error:
                if attempt == 2:
                    raise
                report('transfer_retry', operation=operation, attempt=attempt + 1, errorType=type(error).__name__)
                time.sleep(attempt + 1)

    def target(self, create=False):
        try:
            self.ftp.cwd(TARGET)
        except ftplib.error_perm:
            if not create:
                raise UpdateError('REMOTE_TARGET_MISSING') from None
            self.ftp.cwd('/www.emilianomaugeri.it')
            self.ftp.mkd('umbertini')
            self.ftp.cwd(TARGET)
        if self.ftp.pwd().rstrip('/') != TARGET:
            raise UpdateError('REMOTE_TARGET_MISMATCH')

    def mkdir(self, path):
        safe_relative(path)
        return self.retry('mkdir:' + path, lambda: self._mkdir(path))

    def _mkdir(self, path):
        for i in range(1, len(PurePosixPath(path).parts) + 1):
            current = '/'.join(PurePosixPath(path).parts[:i])
            if current in self.directories:
                continue
            try:
                self.ftp.mkd(current)
            except ftplib.error_perm:
                self.ftp.cwd(TARGET + '/' + current)
                self.ftp.cwd(TARGET)
            self.directories.add(current)

    def exists(self, path):
        safe_relative(path)
        parent, name = str(PurePosixPath(path).parent), PurePosixPath(path).name
        return self.retry('list:' + parent, lambda: any(item == name for item, facts in self.ftp.mlsd(parent)))

    def files_under(self, path):
        safe_relative(path)
        def scan():
            pending = [path]; files = set()
            while pending:
                folder = pending.pop()
                for name, facts in self.ftp.mlsd(folder):
                    kind = facts.get('type')
                    if kind in {'cdir', 'pdir'}:
                        continue
                    safe_relative(name)
                    if '/' in name:
                        raise UpdateError('INVALID_REMOTE_LIBRARY_PATH')
                    item = folder + '/' + name
                    if kind == 'dir':
                        pending.append(item)
                    elif kind == 'file':
                        files.add(item[len(path) + 1:])
                    else:
                        raise UpdateError('UNSUPPORTED_REMOTE_LIBRARY_ENTRY')
            return files
        return self.retry('inventory:' + path, scan)

    def read(self, path, limit=10 * 1024 * 1024):
        safe_relative(path)
        return self.retry('read:' + path, lambda: self._read(path, limit))

    def _read(self, path, limit):
        result = bytearray()
        def receive(chunk):
            result.extend(chunk)
            if len(result) > limit:
                raise UpdateError('REMOTE_FILE_TOO_LARGE')
        self.ftp.retrbinary('RETR ' + path, receive)
        return bytes(result)

    def put(self, path, content):
        safe_relative(path)
        return self.retry('put:' + path, lambda: self._put(path, content))

    def _put(self, path, content):
        # A same-directory RNFR/RNTO replaces one complete file; no partial live PHP.
        temporary = str(PurePosixPath(path).parent / ('.lh-upload-' + secrets.token_hex(8)))
        try:
            self.ftp.storbinary('STOR ' + temporary, io.BytesIO(content))
            if sha(self._read(temporary, len(content) + 1)) != sha(content):
                raise UpdateError('REMOTE_CHECKSUM_MISMATCH')
            self.ftp.rename(temporary, path)
        except BaseException:
            # Only the exact temporary name owned by this operation can be removed.
            try:
                self.ftp.delete(temporary)
            except Exception:
                # ftplib may raise AttributeError on an already closed socket.
                # Preserve the original failure so retry can reconnect securely.
                pass
            raise

    def delete(self, path):
        self.ftp.delete(safe_relative(path))


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def http(relative):
    url = BASE_URL + relative + ('&' if '?' in relative else '?') + 'lh_check=' + secrets.token_hex(6)
    request = urllib.request.Request(url, headers={'Cache-Control': 'no-cache'})
    try:
        with urllib.request.build_opener(NoRedirect()).open(request, timeout=15) as response:
            return response.status, response.headers, response.read(2 * 1024 * 1024)
    except urllib.error.HTTPError as error:
        return error.code, error.headers, error.read(4096)


def active_release(content):
    if b'// LH-DEPLOY-V1\n' not in content:
        raise UpdateError('UNMANAGED_REMOTE_INDEX')
    match = re.search(rb"\$release = '([0-9]{8}T[0-9]{6}Z-[0-9a-f]{12})';", content)
    if not match:
        raise UpdateError('INVALID_REMOTE_RELEASE')
    return match.group(1).decode('ascii')


def frontend(release, previous=''):
    if not re.fullmatch(RELEASE_PATTERN, release) or (previous and not re.fullmatch(RELEASE_PATTERN, previous)):
        raise UpdateError('INVALID_RELEASE_ID')
    return (WEB / 'deploy/updater/front.php').read_bytes().replace(b'@@RELEASE@@', release.encode()).replace(b'@@PREVIOUS@@', previous.encode())


def verify_live(release):
    # Allow normal PHP OPcache revalidation latency after the entry-point rename.
    for attempt in range(4):
        status, headers, body = http('')
        if status == 200 and headers.get('X-LifeHub-Release') == release and b'<lh-root' in body:
            break
        if attempt == 3:
            raise UpdateError('LIVE_RELEASE_CHECK_FAILED')
        time.sleep(2)
    status, headers, body = http('api/deployment-health')
    try:
        health = json.loads(body)
    except ValueError:
        raise UpdateError('LIVE_API_INVALID_RESPONSE') from None
    if status != 200 or headers.get('X-LifeHub-Release') != release or not isinstance(health, dict) or health.get('status') != 'ok' or health.get('database') != 'reachable' or health.get('schema') != 'ready':
        raise UpdateError('LIVE_API_OR_DATABASE_NOT_READY')
    status, headers, body = http('api/health')
    try:
        api = json.loads(body)
    except ValueError:
        raise UpdateError('LIVE_API_INVALID_RESPONSE') from None
    if status != 200 or headers.get('X-LifeHub-Release') != release or not isinstance(api, dict) or api.get('status') != 'ok':
        raise UpdateError('LIVE_API_BOOTSTRAP_FAILED')
    for private in ('hosting.php', '.lh-private/config.php', '.lh-private/storage/push-vapid.php',
                    '.lh-releases/' + release + '/backend/public/index.php'):
        if http(private)[0] != 403:
            raise UpdateError('LIVE_PRIVATE_PATH_EXPOSED')


def check_library_manifest(raw, package_id):
    try:
        manifest = json.loads(raw)
        records = manifest['files']
        if manifest['format'] != 1 or manifest['id'] != package_id or not isinstance(records, dict) or not records:
            raise ValueError()
        if not re.fullmatch('[a-f0-9]{64}', package_id) or sha(encoded(records)) != package_id:
            raise ValueError()
        for path, record in records.items():
            safe_relative(path)
            if not path.startswith('vendor/') or set(record) != {'bytes', 'sha256'} or type(record['bytes']) is not int or record['bytes'] < 0:
                raise ValueError()
            if not isinstance(record['sha256'], str) or not re.fullmatch('[a-f0-9]{64}', record['sha256']):
                raise ValueError()
        if 'vendor/autoload.php' not in records:
            raise ValueError()
        return manifest
    except (ValueError, KeyError, TypeError, UpdateError):
        raise UpdateError('REMOTE_LIBRARY_MANIFEST_INVALID') from None


def verify_records(remote, prefix, records):
    for completed, (path, record) in enumerate(sorted(records.items()), 1):
        content = remote.read(prefix + '/' + path, record['bytes'] + 1)
        if len(content) != record['bytes'] or sha(content) != record['sha256']:
            raise UpdateError('REMOTE_LIBRARY_CHECKSUM_MISMATCH')
        if completed % 25 == 0 or completed == len(records):
            report('verifying_libraries', completed=completed, total=len(records))


def ensure_libraries(remote, files, manifest):
    package_id = manifest['id']
    base = LIBRARIES + '/' + package_id
    remote.mkdir(LIBRARIES)
    if remote.exists(base):
        if remote.exists(base + '/manifest.json'):
            existing = check_library_manifest(remote.read(base + '/manifest.json', 4 * 1024 * 1024), package_id)
            if existing != manifest:
                raise UpdateError('REMOTE_LIBRARY_MANIFEST_MISMATCH')
            report('libraries', status='REUSED', package=package_id, files=len(files), verified='saved manifest; no full remote file scan')
            return
        # An incomplete upload has no committed manifest and has never been referenced.
        # Resume matching files only; never overwrite a mismatching named file.
        present = remote.files_under(base)
        extra = {path for path in present if path not in files and not PurePosixPath(path).name.startswith('.lh-upload-')}
        if extra:
            raise UpdateError('INCOMPLETE_LIBRARY_PACKAGE_HAS_UNEXPECTED_FILES')
    else:
        remote.ftp.mkd(base)
        present = set()
    uploaded = 0
    for completed, (path, content) in enumerate(sorted(files.items()), 1):
        destination = base + '/' + path
        if path in present:
            if remote.read(destination, len(content) + 1) != content:
                raise UpdateError('INCOMPLETE_LIBRARY_PACKAGE_CHECKSUM_MISMATCH')
        else:
            remote.mkdir(str(PurePosixPath(destination).parent))
            remote.put(destination, content)
            uploaded += 1
        if completed % 25 == 0 or completed == len(files):
            report('uploading_libraries', package=package_id, completed=completed, total=len(files))
    # This is the commit marker. Publish it only after every file was hash-verified.
    remote.put(base + '/manifest.json', encoded(manifest))
    report('libraries', status='VERIFIED', package=package_id, files=len(files), uploaded=uploaded)


def verify_libraries(remote):
    remote.target()
    release = active_release(remote.read('index.php', 65536))
    base = '.lh-releases/' + release
    try:
        deployed = json.loads(remote.read(base + '/manifest.json', 4 * 1024 * 1024))
        if deployed['release'] != release:
            raise ValueError()
        package_id = deployed.get('libraries')
        if package_id is not None:
            if not isinstance(package_id, str) or not re.fullmatch('[a-f0-9]{64}', package_id):
                raise ValueError()
            base = LIBRARIES + '/' + package_id
            manifest = check_library_manifest(remote.read(base + '/manifest.json', 4 * 1024 * 1024), package_id)
        else:
            # Previous deployments bundled vendor inside each release; those remain valid.
            records = {path.removeprefix('backend/'): record for path, record in deployed['files'].items() if path.startswith('backend/vendor/')}
            manifest = check_library_manifest(encoded({'format': 1, 'id': sha(encoded(records)), 'files': records}), sha(encoded(records)))
            base += '/backend'
    except (KeyError, ValueError, TypeError):
        raise UpdateError('REMOTE_RELEASE_MANIFEST_INVALID') from None
    verify_records(remote, base, manifest['files'])
    report('libraries_check', status='PASS', release=release, package=package_id,
           files=len(manifest['files']), verified='complete SHA256 readback', databaseChanged=False)


def publish(remote, release, files, manifest):
    remote.target()
    # MKD is the cross-PC lock. Never take over or delete somebody else's lock.
    try:
        remote.ftp.mkd('.lh-update-lock')
    except ftplib.error_perm:
        raise UpdateError('REMOTE_LOCKED_OR_NOT_WRITABLE') from None
    old_index = None
    installed_rules = False
    activated = False
    previous = ''
    try:
        if not remote.exists('hosting.php'):
            raise UpdateError('HOSTING_CONFIG_POINTER_MISSING')
        if remote.exists('index.php'):
            old_index = remote.read('index.php', 65536)
            previous = active_release(old_index)
        elif remote.exists('index.html'):
            raise UpdateError('UNMANAGED_REMOTE_INDEX')
        rules = (WEB / 'deploy/updater/root.htaccess').read_bytes()
        if remote.exists('.htaccess'):
            if remote.read('.htaccess', 65536) != rules:
                raise UpdateError('UNMANAGED_REMOTE_HTACCESS')
        else:
            remote.put('.htaccess', rules)
            installed_rules = True
        remote.mkdir('.lh-releases')
        probe = '.lh-releases/guard-' + secrets.token_hex(8) + '.txt'
        remote.put(probe, b'Life Hub protection check')
        try:
            if any(http(path)[0] != 403 for path in (probe, 'hosting.php', '.lh-private/config.php', '.lh-private/storage/push-vapid.php')):
                raise UpdateError('PRIVATE_PATH_PROTECTION_FAILED')
        finally:
            try:
                remote.delete(probe)
            except Exception as error:
                report('cleanup', code='PROTECTION_PROBE_REMOVE_FAILED', errorType=type(error).__name__)
        libraries, package = library_package(files)
        if package:
            ensure_libraries(remote, libraries, package)
            files = {path: content for path, content in files.items() if not path.startswith('backend/vendor/')}
            files['backend/vendor/autoload.php'] = library_bridge(package['id'])
            manifest = {'format': 2, 'release': release, 'libraries': package['id'], 'files': file_records(files)}
        remote.ftp.mkd('.lh-releases/' + release)  # Refuse to overwrite any release.
        created = {'.lh-releases/' + release}
        for completed, (path, content) in enumerate(sorted(files.items()), 1):
            destination = '.lh-releases/' + release + '/' + path
            parent = str(PurePosixPath(destination).parent)
            if parent not in created:
                remote.mkdir(parent)
                created.add(parent)
            remote.put(destination, content)
            if completed % 25 == 0 or completed == len(files):
                report('uploading', release=release, completed=completed, total=len(files))
        remote.put('.lh-releases/' + release + '/manifest.json', json.dumps(manifest).encode())
        if old_index:
            remote.put('.lh-releases/' + release + '/previous-entry.php', old_index)
        # Save exact rollback material locally as well. Contains code, no credentials.
        journal = ROOT / '.local/deployments' / release
        journal.mkdir(parents=True, exist_ok=True)
        if old_index:
            (journal / 'previous-entry.php').write_bytes(old_index)
        (journal / 'manifest.json').write_bytes(encoded(manifest))
        report('uploaded', release=release, files=len(files), verified='SHA256 readback')
        # Set BEFORE PUT: a lost RNTO acknowledgement must also trigger recovery.
        activated = True
        remote.put('index.php', frontend(release, previous))
        verify_live(release)
        (journal / 'result.json').write_text(json.dumps({'status': 'PASS', 'release': release, 'previous': previous}), encoding='utf-8')
        report('published', release=release, url=BASE_URL, databaseChanged=False)
    except BaseException:
        if activated:
            try:
                if old_index is not None:
                    remote.put('index.php', old_index)
                    verify_live(previous)
                    report('rollback', status='PASS', release=previous)
                elif remote.exists('index.php'):
                    remote.delete('index.php')
                    report('rollback', status='FIRST_PUBLICATION_REMOVED')
            except Exception:
                report('rollback', status='FAILED', action='CHECK_REMOTE_INDEX_AND_LOCAL_JOURNAL')
        if installed_rules and not old_index and not activated:
            # Keep protection once a release has been uploaded. Never expose staged code.
            report('protection', status='RETAINED')
        raise
    finally:
        try:
            remote.ftp.rmd('.lh-update-lock')
        except Exception:
            report('lock', status='CLEANUP_FAILED', action='CHECK_REMOTE_LOCK_BEFORE_RETRY')


def rollback(remote):
    remote.target()
    try:
        remote.ftp.mkd('.lh-update-lock')
    except ftplib.error_perm:
        raise UpdateError('REMOTE_LOCKED_OR_NOT_WRITABLE') from None
    try:
        current = remote.read('index.php', 65536)
        release = active_release(current)
        old = remote.read('.lh-releases/' + release + '/previous-entry.php', 65536)
        previous = active_release(old)
        try:
            remote.put('index.php', old)
            verify_live(previous)
        except BaseException:
            try:
                remote.put('index.php', current)
                verify_live(release)
                report('rollback_recovery', status='PASS', release=release)
            except Exception:
                report('rollback_recovery', status='FAILED', action='CHECK_REMOTE_INDEX_AND_LOCAL_JOURNAL')
            raise
        report('rollback', status='PASS', release=previous, databaseChanged=False)
    finally:
        try:
            remote.ftp.rmd('.lh-update-lock')
        except Exception:
            report('lock', status='CLEANUP_FAILED', action='CHECK_REMOTE_LOCK_BEFORE_RETRY')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument('--prepare-only', action='store_true')
    mode.add_argument('--check-connection', action='store_true')
    mode.add_argument('--rollback', action='store_true')
    mode.add_argument('--verify-libraries', action='store_true')
    parser.add_argument('--tls-host', default=None)
    args = parser.parse_args()
    remote = None
    try:
        if args.prepare_only:
            prepare()
            return 0
        sites, tls_host = connection_options(args.tls_host)
        remote = Remote(sites, tls_host)
        remote.target()  # Read-only prerequisite before a potentially lengthy build.
        if args.check_connection:
            report('connection', status='PASS', protocol='FTPS', certificateVerified=True, target=TARGET,
                   hostingPointerPresent=remote.exists('hosting.php'), databaseChanged=False)
            return 0
        if args.verify_libraries:
            verify_libraries(remote)
            return 0
        if args.rollback:
            rollback(remote)
            return 0
        if not remote.exists('hosting.php'):
            raise UpdateError('HOSTING_CONFIG_POINTER_MISSING')
        remote.close()
        remote = None
        release, files, manifest = prepare()
        remote = Remote(sites, tls_host)
        publish(remote, release, files, manifest)
        return 0
    except ssl.SSLCertVerificationError as error:
        report('failed', code='FTPS_CERTIFICATE_INVALID', verifyCode=error.verify_code,
               action='SET_PROVIDER_CONFIRMED_TLS_HOST_IN_LOCAL_DEPLOY_JSON')
        return 1
    except UpdateError as error:
        report('failed', code=str(error))
        return 1
    except KeyboardInterrupt:
        report('failed', code='INTERRUPTED')
        return 130
    except Exception as error:
        # Do not log raw FTP replies, XML, credentials, or configuration contents.
        report('failed', code='UPDATE_FAILED', errorType=type(error).__name__,
               operation=getattr(remote, 'operation', None))
        return 1
    finally:
        if remote:
            remote.close()


if __name__ == '__main__':
    raise SystemExit(main())
