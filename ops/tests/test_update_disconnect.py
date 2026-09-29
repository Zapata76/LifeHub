"""Disconnected ftplib transports must not turn recoverable failures into AttributeError."""
import ftplib
import unittest
from unittest.mock import Mock, patch

from test_update import update, UpdateTests


class DisconnectTests(unittest.TestCase):
    def test_temporary_cleanup_on_closed_real_ftp_preserves_original_error(self):
        remote = object.__new__(update.Remote)
        remote.ftp = ftplib.FTP_TLS()
        with patch.object(remote.ftp, 'storbinary', side_effect=ConnectionAbortedError('original')):
            with self.assertRaisesRegex(ConnectionAbortedError, 'original'):
                remote._put('fixture.php', b'test')

    def test_closed_connection_is_reconnected_before_retrying_transfer(self):
        remote = object.__new__(update.Remote)
        remote.ftp = ftplib.FTP_TLS()
        recovered = Mock()
        recovered.retrbinary.side_effect = lambda command, receive: receive(b'new')
        with patch.object(remote, 'reconnect', side_effect=lambda: setattr(remote, 'ftp', recovered)) as reconnect, \
                patch.object(update.time, 'sleep'), patch.object(update, 'report'):
            remote.put('index.php', b'new')
        reconnect.assert_called_once()
        recovered.rename.assert_called_once()

    def test_cleanup_attribute_error_does_not_interrupt_retry_exhaustion(self):
        remote = object.__new__(update.Remote)
        remote.ftp = Mock()
        remote.ftp.storbinary.side_effect = ConnectionAbortedError('original')
        remote.ftp.delete.side_effect = AttributeError('closed transport')
        with patch.object(remote, 'reconnect') as reconnect, patch.object(update.time, 'sleep'), \
                patch.object(update, 'report'):
            with self.assertRaisesRegex(ConnectionAbortedError, 'original'):
                remote.put('index.php', b'new')
        self.assertEqual(reconnect.call_count, 2)
        remote.ftp.rename.assert_not_called()

    def test_close_failure_does_not_mask_certificate_error(self):
        with patch.object(update, 'profile', return_value=('fixture', 'fixture', 21)), \
                patch.object(update.ftplib, 'FTP_TLS') as transport, patch.object(update, 'report'):
            transport.return_value.auth.side_effect = update.ssl.SSLCertVerificationError()
            transport.return_value.close.side_effect = AttributeError('closed')
            with self.assertRaises(update.ssl.SSLCertVerificationError):
                update.Remote('unused', 'example.test')
            transport.return_value.login.assert_not_called()

    def test_unrelated_programming_errors_are_not_retried(self):
        remote = object.__new__(update.Remote)
        remote.ftp = Mock()
        remote.ftp.storbinary.side_effect = AttributeError('unrelated')
        with patch.object(remote, 'reconnect') as reconnect:
            with self.assertRaisesRegex(AttributeError, 'unrelated'):
                remote.put('index.php', b'new')
        reconnect.assert_not_called()


class LockCleanupTests(UpdateTests):
    def test_failed_upload_reports_original_error_when_lock_cleanup_fails(self):
        self.remote.fail_path = '.lh-releases/20260920T020000Z-bbbbbbbbbbbb/frontend/index.html'
        with patch.object(self.remote, 'rmd', side_effect=AttributeError('disconnected')), \
                patch.object(update, 'report') as report:
            with self.assertRaisesRegex(OSError, 'synthetic transfer failure'):
                self.publish()
        report.assert_any_call('lock', status='CLEANUP_FAILED', action='CHECK_REMOTE_LOCK_BEFORE_RETRY')
        self.assertNotIn('index.php', self.remote.writes)

    def test_successful_publication_remains_successful_with_lock_cleanup_warning(self):
        with patch.object(self.remote, 'rmd', side_effect=AttributeError('disconnected')), \
                patch.object(update, 'verify_live'), patch.object(update, 'report') as report:
            self.publish()
        report.assert_any_call('lock', status='CLEANUP_FAILED', action='CHECK_REMOTE_LOCK_BEFORE_RETRY')
        self.assertIn('.lh-update-lock', self.remote.directories)


def load_tests(loader, tests, pattern):
    return unittest.TestSuite([
        loader.loadTestsFromTestCase(DisconnectTests),
        LockCleanupTests('test_failed_upload_reports_original_error_when_lock_cleanup_fails'),
        LockCleanupTests('test_successful_publication_remains_successful_with_lock_cleanup_warning'),
    ])
