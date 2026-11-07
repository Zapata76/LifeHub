"""Opt-in LifeHub probe client. Never prints tokens, follows redirects or sends cookies."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import secrets
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone

TOKEN_FILE = Path(__file__).resolve().parents[1] / '.local' / 'diagnostic-probe-token'
URL = 'https://www.emilianomaugeri.it/umbertini/api/v1/diagnostics/probe'


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--init', action='store_true', help='Create local token; print only its server-side hash')
    parser.add_argument('--samples', type=int, default=1)
    parser.add_argument('--interval', type=int, default=65, help='Seconds, minimum 60')
    args = parser.parse_args()
    if args.init:
        TOKEN_FILE.parent.mkdir(parents=True, exist_ok=True)
        token = secrets.token_hex(32)
        try:
            descriptor = os.open(TOKEN_FILE, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        except FileExistsError:
            parser.error('Token already exists; no file overwritten. Preserve it or rotate it explicitly.')
        with os.fdopen(descriptor, 'w', encoding='ascii') as stream:
            stream.write(token + '\n')
        print(json.dumps({'diagnosticProbeTokenHash': hashlib.sha256(token.encode('ascii')).hexdigest()}))
        return
    if not 1 <= args.samples <= 30 or args.interval < 60:
        parser.error('Use 1..30 samples and an interval of at least 60 seconds.')
    try:
        token = TOKEN_FILE.read_text(encoding='ascii').strip()
    except OSError:
        parser.error('Local token missing or unreadable. Run --init first.')
    if len(token) != 64 or any(c not in '0123456789abcdef' for c in token):
        parser.error('Invalid local token.')
    opener = urllib.request.build_opener(NoRedirect())
    for sample in range(args.samples):
        if sample:
            time.sleep(args.interval)
        started = time.perf_counter()
        report = {'sample': sample + 1, 'utc': datetime.now(timezone.utc).isoformat()}
        request = urllib.request.Request(URL, headers={'X-LifeHub-Probe-Token': token})
        try:
            try:
                response = opener.open(request, timeout=30)
            except urllib.error.HTTPError as error:
                response = error
            with response:
                report.update(status=response.code,
                              server_timing=response.headers.get('Server-Timing', ''),
                              correlation_id=response.headers.get('X-Correlation-ID', ''),
                              retry_after=response.headers.get('Retry-After', ''))
                response.read(4096)  # Discard even the diagnostic body; never print arbitrary responses.
        except (OSError, urllib.error.URLError):
            report.update(status=0, error='connection_failed')
        report['total_ms'] = round((time.perf_counter() - started) * 1000, 2)
        print(json.dumps(report), flush=True)
        if report['status'] in (401, 403, 404):
            break  # Configuration/access problem, not useful to keep polling.


if __name__ == '__main__':
    main()
