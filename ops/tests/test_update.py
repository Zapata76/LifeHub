"""Publication failure boundaries using an in-memory remote; never contacts hosting."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock, patch

WEB = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('update', WEB / 'ops/update.py')
update = importlib.util.module_from_spec(spec)
spec.loader.exec_module(update)
OLD = '20260920T010000Z-aaaaaaaaaaaa'
NEW = '20260920T020000Z-bbbbbbbbbbbb'


class FakeRemote:
    def __init__(self):
        self.files = {'hosting.php': b'private config pointer',
                      'index.php': update.frontend(OLD),
                      '.htaccess': (WEB / 'deploy/updater/root.htaccess').read_bytes()}
        self.directories = {'.lh-releases'}
        self.ftp = self
        self.writes = []
        self.fail_path = None

    def target(self, create=False): pass
    def mkdir(self, path): self.directories.add(path)
    def mkd(self, path):
        if path in self.directories: raise update.ftplib.error_perm('550 exists')
        self.directories.add(path)
    def rmd(self, path): self.directories.remove(path)
    def exists(self, path): return path in self.files or path in self.directories
    def files_under(self, path): return {name[len(path)+1:] for name in self.files if name.startswith(path+'/')}
    def read(self, path, limit=999999): return self.files[path]
    def put(self, path, content):
        if path == self.fail_path: raise OSError('synthetic transfer failure')
        self.writes.append(path)
        self.files[path] = content
    def delete(self, path): del self.files[path]


class UpdateTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = patch.object(update, 'ROOT', Path(self.temp.name))
        self.root.start()
        self.addCleanup(self.root.stop)
        self.http = patch.object(update, 'http', return_value=(403, {}, b''))
        self.http.start()
        self.addCleanup(self.http.stop)
        self.remote = FakeRemote()
        self.payload = {'backend/bootstrap.php': b'<?php', 'frontend/index.html': b'<lh-root>'}
        self.manifest = {'release': NEW}

    def publish(self): update.publish(self.remote, NEW, self.payload, self.manifest)

    def test_upload_then_activate_preserves_config(self):
        with patch.object(update, 'verify_live') as verify:
            self.publish()
        self.assertEqual(update.active_release(self.remote.files['index.php']), NEW)
        self.assertEqual(self.remote.files['hosting.php'], b'private config pointer')
        self.assertNotIn('hosting.php', self.remote.writes)
        self.assertEqual(self.remote.writes[-1], 'index.php')
        verify.assert_called_once_with(NEW)
        self.assertNotIn('.lh-update-lock', self.remote.directories)

    def test_failed_staging_never_activates(self):
        self.remote.fail_path = '.lh-releases/' + NEW + '/frontend/index.html'
        with self.assertRaises(OSError): self.publish()
        self.assertEqual(update.active_release(self.remote.files['index.php']), OLD)
        self.assertNotIn('index.php', self.remote.writes)
        self.assertNotIn('.lh-update-lock', self.remote.directories)

    def test_failed_health_restores_exact_previous_entry(self):
        old = self.remote.files['index.php']
        with patch.object(update, 'verify_live', side_effect=[update.UpdateError('bad health'), None]) as verify:
            with self.assertRaises(update.UpdateError): self.publish()
        self.assertEqual(self.remote.files['index.php'], old)
        self.assertEqual([c.args[0] for c in verify.call_args_list], [NEW, OLD])

    def test_missing_config_stops_before_upload(self):
        del self.remote.files['hosting.php']
        with self.assertRaisesRegex(update.UpdateError, 'CONFIG_POINTER'): self.publish()
        self.assertEqual(self.remote.writes, [])

    def test_existing_unmanaged_site_not_replaced(self):
        self.remote.files['index.php'] = b'<?php echo "other app";'
        with self.assertRaisesRegex(update.UpdateError, 'UNMANAGED_REMOTE_INDEX'): self.publish()
        self.assertEqual(self.remote.writes, [])

    def test_existing_htaccess_not_replaced(self):
        self.remote.files['.htaccess'] = b'custom server settings'
        with self.assertRaisesRegex(update.UpdateError, 'UNMANAGED_REMOTE_HTACCESS'): self.publish()
        self.assertEqual(self.remote.writes, [])

    def test_private_path_must_be_denied_before_code_upload(self):
        with patch.object(update, 'http', return_value=(200, {}, b'public')):
            with self.assertRaisesRegex(update.UpdateError, 'PROTECTION_FAILED'): self.publish()
        self.assertFalse(any(p.endswith('bootstrap.php') for p in self.remote.writes))
        self.assertEqual(update.active_release(self.remote.files['index.php']), OLD)

    def test_foreign_lock_not_removed(self):
        self.remote.directories.add('.lh-update-lock')
        with self.assertRaisesRegex(update.UpdateError, 'REMOTE_LOCKED'): self.publish()
        self.assertIn('.lh-update-lock', self.remote.directories)

    def test_explicit_rollback_uses_saved_entry(self):
        self.remote.files['index.php'] = update.frontend(NEW, OLD)
        self.remote.files['.lh-releases/' + NEW + '/previous-entry.php'] = update.frontend(OLD)
        with patch.object(update, 'verify_live'):
            update.rollback(self.remote)
        self.assertEqual(update.active_release(self.remote.files['index.php']), OLD)

    def test_failed_first_publication_removes_entry_keeps_protection(self):
        del self.remote.files['index.php']
        del self.remote.files['.htaccess']
        with patch.object(update, 'verify_live', side_effect=update.UpdateError('not ready')):
            with self.assertRaises(update.UpdateError): self.publish()
        self.assertNotIn('index.php', self.remote.files)
        self.assertIn('.htaccess', self.remote.files)

    def test_filezilla_exact_profile_and_password_never_logged(self):
        xml = Path(self.temp.name) / 'sites.xml'
        xml.write_text('<FileZilla3><Servers><Server><Name>other</Name></Server><Server>'
                       '<Name>em</Name><Host>ftp.emilianomaugeri.it</Host><Protocol>0</Protocol>'
                       '<Logontype>1</Logontype><Port>21</Port><User>synthetic</User>'
                       '<Pass encoding="base64">dGVzdC1vbmx5</Pass></Server></Servers></FileZilla3>')
        self.assertEqual(update.profile(xml), ('synthetic', 'test-only', 21))

    def test_traversal_and_release_injection_rejected(self):
        for path in ('../secret', '/etc/config', 'a/../b', 'a\\b', 'a\nDELE index.php', 'C:/x'):
            with self.assertRaises(update.UpdateError): update.safe_relative(path)
        with self.assertRaises(update.UpdateError): update.frontend("x';phpinfo();//")

    def test_tls_failure_never_sends_credentials(self):
        with patch.object(update, 'profile', return_value=('synthetic', 'secret', 21)), \
             patch.object(update.ftplib, 'FTP_TLS') as transport:
            transport.return_value.auth.side_effect = update.ssl.SSLCertVerificationError()
            with self.assertRaises(update.ssl.SSLCertVerificationError):
                update.Remote('unused', update.PROFILE_HOST)
            transport.return_value.login.assert_not_called()
            transport.return_value.close.assert_called_once()

    def test_checksum_failure_never_renames_live_file(self):
        remote = object.__new__(update.Remote)
        with patch.object(update.ftplib, 'FTP_TLS') as transport:
            remote.ftp = transport.return_value
            remote.ftp.retrbinary.side_effect = lambda command, receive: receive(b'corrupt')
            with self.assertRaisesRegex(update.UpdateError, 'CHECKSUM'):
                remote.put('index.php', b'expected')
            remote.ftp.rename.assert_not_called()

    def test_successful_transfer_does_not_delete_renamed_temporary_file(self):
        remote=object.__new__(update.Remote);remote.ftp=Mock()
        remote.ftp.retrbinary.side_effect=lambda command,receive:receive(b'expected')
        remote.put('index.php',b'expected')
        remote.ftp.rename.assert_called_once()
        remote.ftp.delete.assert_not_called()

    def test_interrupted_transfer_and_lost_rename_ack_are_retried_with_verified_content(self):
        for boundary in ('store','read','rename'):
            with self.subTest(boundary=boundary):
                files={'index.php':b'old'};failed=False
                def fault(stage):
                    nonlocal failed
                    if stage==boundary and not failed:failed=True;raise EOFError()
                def store(command,stream):
                    path=command.removeprefix('STOR ');files[path]=stream.read();fault('store')
                def read(command,receive):
                    fault('read');receive(files[command.removeprefix('RETR ')])
                def rename(source,target):files[target]=files.pop(source);fault('rename')
                def delete(path):
                    if path not in files:raise update.ftplib.error_perm('550 missing')
                    del files[path]
                remote=object.__new__(update.Remote);remote.ftp=Mock()
                remote.ftp.storbinary.side_effect=store;remote.ftp.retrbinary.side_effect=read
                remote.ftp.rename.side_effect=rename;remote.ftp.delete.side_effect=delete
                with patch.object(remote,'reconnect') as reconnect,patch.object(update.time,'sleep'),patch.object(update,'report'):
                    remote.put('index.php',b'new')
                reconnect.assert_called_once();self.assertEqual(files,{'index.php':b'new'})

    def test_retry_exhaustion_preserves_original_error_and_never_activates(self):
        remote=object.__new__(update.Remote);remote.ftp=Mock()
        remote.ftp.storbinary.side_effect=EOFError('original')
        remote.ftp.delete.side_effect=ConnectionResetError('cleanup')
        with patch.object(remote,'reconnect') as reconnect,patch.object(update.time,'sleep'),patch.object(update,'report'):
            with self.assertRaisesRegex(EOFError,'original'):remote.put('index.php',b'new')
        self.assertEqual(reconnect.call_count,2);remote.ftp.rename.assert_not_called()

    def test_reconnect_certificate_failure_is_not_retried(self):
        remote=object.__new__(update.Remote);remote.ftp=Mock()
        remote.ftp.storbinary.side_effect=EOFError()
        with patch.object(remote,'reconnect',side_effect=update.ssl.SSLCertVerificationError()) as reconnect,patch.object(update.time,'sleep'),patch.object(update,'report'):
            with self.assertRaises(update.ssl.SSLCertVerificationError):remote.put('index.php',b'new')
        reconnect.assert_called_once()

    def test_read_restarts_buffer_after_connection_loss(self):
        remote=object.__new__(update.Remote);remote.ftp=Mock();attempt=0
        def read(command,receive):
            nonlocal attempt
            attempt+=1
            receive(b'partial' if attempt==1 else b'complete')
            if attempt==1:raise EOFError()
        remote.ftp.retrbinary.side_effect=read
        with patch.object(remote,'reconnect'),patch.object(update.time,'sleep'),patch.object(update,'report'):
            self.assertEqual(remote.read('index.php'),b'complete')

    def test_known_parent_directories_are_not_created_repeatedly(self):
        remote=object.__new__(update.Remote);remote.ftp=Mock();remote.directories=set()
        remote.mkdir('.lh-releases/release/backend/src');remote.mkdir('.lh-releases/release/backend/vendor')
        self.assertEqual(remote.ftp.mkd.call_count,5)

    def test_local_composer_preferred_and_explicit_override_respected(self):
        local=Path(self.temp.name)/'.local/tools/composer.phar';local.parent.mkdir(parents=True);local.write_bytes(b'test')
        with patch.dict(update.os.environ,{},clear=True):self.assertEqual(update.composer_path(),local)
        with patch.dict(update.os.environ,{'LIFEHUB_COMPOSER_PHAR':'explicit.phar'}):self.assertEqual(update.composer_path(),Path('explicit.phar'))

    def library_payload(self):
        return {**self.payload,'backend/vendor/autoload.php':b'<?php return "test";',
                'backend/vendor/example/library.php':b'<?php // immutable library'}

    def test_library_identity_tracks_file_bytes_not_application_or_input_order(self):
        first=self.library_payload();_,a=update.library_package(first)
        _,b=update.library_package(dict(reversed(list(first.items()))))
        _,c=update.library_package({**first,'frontend/index.html':b'changed app'})
        _,d=update.library_package({**first,'backend/vendor/example/library.php':b'changed library'})
        self.assertEqual(a,b);self.assertEqual(a,c);self.assertNotEqual(a['id'],d['id'])

    def test_two_releases_reuse_verified_libraries_without_transferring_or_reading_files(self):
        payload=self.library_payload();libraries,package=update.library_package(payload)
        base=update.LIBRARIES+'/'+package['id']
        with patch.object(update,'verify_live'):
            update.publish(self.remote,NEW,payload,self.manifest)
        manifest=json.loads(self.remote.files['.lh-releases/'+NEW+'/manifest.json'])
        self.assertEqual(manifest['libraries'],package['id'])
        self.assertNotIn('backend/vendor/example/library.php',manifest['files'])
        self.assertEqual(self.remote.files['.lh-releases/'+NEW+'/backend/vendor/autoload.php'],update.library_bridge(package['id']))
        self.assertGreater(self.remote.writes.index(base+'/manifest.json'),self.remote.writes.index(base+'/vendor/example/library.php'))
        second='20260920T040000Z-dddddddddddd';self.remote.writes.clear()
        read=self.remote.read
        def guarded(path,limit=999999):
            self.assertFalse(path.startswith(base+'/vendor/'),'Reuse must not download library files')
            return read(path,limit)
        with patch.object(self.remote,'read',side_effect=guarded),patch.object(update,'verify_live'):
            update.publish(self.remote,second,{**payload,'frontend/index.html':b'new screen'},{'release':second})
        self.assertFalse(any(path.startswith(base+'/') for path in self.remote.writes))
        with patch.object(update,'verify_live'):update.rollback(self.remote)
        self.assertEqual(update.active_release(self.remote.files['index.php']),NEW)
        self.assertEqual(self.remote.files[base+'/vendor/example/library.php'],libraries['vendor/example/library.php'])

    def test_updated_libraries_keep_old_package_and_rollback_binding(self):
        first=self.library_payload();second={**first,'backend/vendor/example/library.php':b'new library'}
        _,a=update.library_package(first);_,b=update.library_package(second)
        newer='20260920T040000Z-dddddddddddd'
        with patch.object(update,'verify_live'):
            update.publish(self.remote,NEW,first,self.manifest)
            update.publish(self.remote,newer,second,{'release':newer})
            update.rollback(self.remote)
        for release,package in ((NEW,a),(newer,b)):
            self.assertEqual(self.remote.files['.lh-releases/'+release+'/backend/vendor/autoload.php'],update.library_bridge(package['id']))
        self.assertEqual(self.remote.files[update.LIBRARIES+'/'+a['id']+'/vendor/example/library.php'],first['backend/vendor/example/library.php'])

    def test_partial_library_upload_resumes_only_after_verifying_existing_files(self):
        payload=self.library_payload();libraries,package=update.library_package(payload);base=update.LIBRARIES+'/'+package['id']
        self.remote.fail_path=base+'/vendor/example/library.php'
        with self.assertRaises(OSError):update.publish(self.remote,NEW,payload,self.manifest)
        self.assertNotIn(base+'/manifest.json',self.remote.files)
        self.assertEqual(update.active_release(self.remote.files['index.php']),OLD)
        self.remote.fail_path=None;self.remote.writes.clear()
        with patch.object(update,'verify_live'):update.publish(self.remote,NEW,payload,self.manifest)
        self.assertNotIn(base+'/vendor/autoload.php',self.remote.writes)
        self.assertIn(base+'/manifest.json',self.remote.writes)

    def test_corrupt_partial_package_is_never_overwritten_or_activated(self):
        payload=self.library_payload();libraries,package=update.library_package(payload);base=update.LIBRARIES+'/'+package['id']
        self.remote.directories.add(base);self.remote.files[base+'/vendor/autoload.php']=b'corrupt'
        with self.assertRaisesRegex(update.UpdateError,'INCOMPLETE_LIBRARY_PACKAGE_CHECKSUM_MISMATCH'):
            update.publish(self.remote,NEW,payload,self.manifest)
        self.assertEqual(self.remote.files[base+'/vendor/autoload.php'],b'corrupt')
        self.assertEqual(update.active_release(self.remote.files['index.php']),OLD)

    def test_bad_committed_manifest_stops_reuse(self):
        libraries,package=update.library_package(self.library_payload());base=update.LIBRARIES+'/'+package['id']
        self.remote.directories.add(base);self.remote.files[base+'/manifest.json']=b'{broken'
        with self.assertRaisesRegex(update.UpdateError,'REMOTE_LIBRARY_MANIFEST_INVALID'):
            update.ensure_libraries(self.remote,libraries,package)
        self.assertEqual(self.remote.writes,[])

    def test_explicit_full_verification_detects_corruption_and_performs_no_writes(self):
        payload=self.library_payload();libraries,package=update.library_package(payload)
        with patch.object(update,'verify_live'):update.publish(self.remote,NEW,payload,self.manifest)
        self.remote.writes.clear();update.verify_libraries(self.remote)
        self.remote.files[update.LIBRARIES+'/'+package['id']+'/vendor/example/library.php']=b'tampered'
        with self.assertRaisesRegex(update.UpdateError,'REMOTE_LIBRARY_CHECKSUM_MISMATCH'):update.verify_libraries(self.remote)
        self.assertEqual(self.remote.writes,[])

    def test_full_verification_supports_legacy_bundled_releases(self):
        payload=self.library_payload();prefix='.lh-releases/'+OLD
        self.remote.files[prefix+'/manifest.json']=update.encoded({'release':OLD,'files':update.file_records(payload)})
        for path,content in payload.items():self.remote.files[prefix+'/'+path]=content
        update.verify_libraries(self.remote)
        self.assertEqual(self.remote.writes,[])

    def test_library_manifest_rejects_paths_outside_package(self):
        records={'vendor/autoload.php':{'bytes':1,'sha256':'a'*64},'vendor/../../private.php':{'bytes':1,'sha256':'a'*64}}
        identity=update.sha(update.encoded(records))
        with self.assertRaisesRegex(update.UpdateError,'REMOTE_LIBRARY_MANIFEST_INVALID'):
            update.check_library_manifest(update.encoded({'format':1,'id':identity,'files':records}),identity)
        with self.assertRaisesRegex(update.UpdateError,'INVALID_LIBRARY_ID'):update.library_bridge('../other')


if __name__ == '__main__': unittest.main(verbosity=2)
