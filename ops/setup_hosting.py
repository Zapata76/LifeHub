"""Create protected directories and a config pointer. Never reads/uploads DB credentials."""
import secrets
import sys

import update


def setup():
    remote = update.Remote(*update.connection_options())
    locked = False
    try:
        remote.target()
        remote.ftp.mkd('.lh-update-lock')
        locked = True
        if remote.exists('index.php') or remote.exists('index.html'):
            raise update.UpdateError('INITIAL_SETUP_ONLY')
        root_rules = (update.WEB / 'deploy/updater/root.htaccess').read_bytes()
        pointer = (update.WEB / 'deploy/updater/hosting.php.example').read_bytes()
        for path, content in (('.htaccess',root_rules),('hosting.php',pointer)):
            if remote.exists(path) and remote.read(path) != content:
                raise update.UpdateError('EXISTING_SETUP_FILE_NOT_OVERWRITTEN')
        remote.mkdir('.lh-private')
        private_rules = (update.WEB / 'deploy/updater/private.htaccess').read_bytes()
        if remote.exists('.lh-private/.htaccess'):
            if remote.read('.lh-private/.htaccess') != private_rules:
                raise update.UpdateError('EXISTING_PRIVATE_RULES_NOT_OVERWRITTEN')
        else:
            remote.put('.lh-private/.htaccess', private_rules)
        # Check an existing non-sensitive file before telling the operator to upload.
        canary = '.lh-private/check-' + secrets.token_hex(8) + '.txt'
        remote.put(canary, b'Private directory protection test; no credentials')
        try:
            if update.http(canary)[0] != 403:
                raise update.UpdateError('PRIVATE_DIRECTORY_NOT_PROTECTED')
        finally:
            try:
                remote.delete(canary)
            except Exception as error:
                update.report('cleanup', code='PROTECTION_PROBE_REMOVE_FAILED', errorType=type(error).__name__)
        remote.mkdir('.lh-private/sessions')
        remote.mkdir('.lh-private/storage/files')
        for path, content in (('.htaccess',root_rules),('hosting.php',pointer)):
            if not remote.exists(path): remote.put(path,content)
        statuses = {path:update.http(path)[0] for path in (
            'hosting.php','.lh-private/config.php','.lh-private/sessions/','.lh-private/storage/push-vapid.php')}
        if any(status != 403 for status in statuses.values()):
            raise update.UpdateError('FINAL_HTTP_PROTECTION_FAILED')
        update.report('private_directory_prepared', status='PASS',
                      configDestination=update.TARGET+'/.lh-private/config.php',
                      hostingPointerPresent=True, httpProtection=statuses,
                      configUploaded=False, databaseAccessed=False)
    finally:
        if locked:
            try: remote.ftp.rmd('.lh-update-lock')
            except Exception: update.report('cleanup', code='SETUP_LOCK_REMOVE_REQUIRED')
        remote.close()


if __name__ == '__main__':
    try: setup()
    except Exception as error:
        update.report('setup_failed', code=str(error) if isinstance(error,update.UpdateError) else type(error).__name__)
        sys.exit(1)
