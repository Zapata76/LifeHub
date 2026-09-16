<?php

/** Validates browser subscriptions before accepting any outbound destination. */

declare(strict_types=1);

namespace LifeHub\Push;

use LifeHub\Shared\Http\ApiException;

final class PushSubscription
{
    public function __construct(public string $endpoint, public string $publicKey, public string $authToken)
    {
        self::validateEndpoint($endpoint);
        $key = self::decode($publicKey);
        $auth = self::decode($authToken);
        // Require a valid uncompressed P-256 point, not just a string of the right length.
        $der = hex2bin('3059301306072a8648ce3d020106082a8648ce3d030107034200') . $key;
        $pem = "-----BEGIN PUBLIC KEY-----\n" . chunk_split(base64_encode($der), 64, "\n")
            . "-----END PUBLIC KEY-----\n";
        if (
            strlen($key) !== 65 || $key[0] !== "\x04" || strlen($auth) !== 16
            || @openssl_pkey_get_public($pem) === false
        ) {
            throw new ApiException(422, 'push.invalid_keys', 'Chiavi della sottoscrizione non valide.');
        }
    }

    public static function validateEndpoint(string $endpoint): void
    {
        $parts = parse_url($endpoint);
        $host = is_array($parts) ? strtolower($parts['host'] ?? '') : '';
        // Never let a client turn this endpoint into an arbitrary HTTP/SSRF proxy.
        $allowed = in_array($host, ['fcm.googleapis.com', 'updates.push.services.mozilla.com'], true)
            || str_ends_with($host, '.push.services.mozilla.com')
            || $host === 'web.push.apple.com' || str_ends_with($host, '.push.apple.com')
            || $host === 'notify.windows.com' || str_ends_with($host, '.notify.windows.com');
        if (
            !$allowed || !is_array($parts) || ($parts['scheme'] ?? '') !== 'https'
            || isset($parts['user']) || isset($parts['pass']) || isset($parts['fragment'])
            || (isset($parts['port']) && $parts['port'] !== 443)
            || strlen($endpoint) > 2048 || preg_match('/^[\x21-\x7e]+$/D', $endpoint) !== 1
            || filter_var($endpoint, FILTER_VALIDATE_URL) === false
        ) {
            throw new ApiException(
                422,
                'push.invalid_endpoint',
                'Servizio push non supportato o indirizzo non valido.'
            );
        }
    }

    private static function decode(string $value): string
    {
        if (preg_match('/^[A-Za-z0-9_-]+$/D', $value) !== 1) {
            return '';
        }
        $decoded = base64_decode(strtr($value, '-_', '+/'), true);
        return $decoded === false ? '' : $decoded;
    }
}
