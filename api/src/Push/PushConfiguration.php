<?php

/** Optional Web Push configuration, deliberately isolated from application bootstrap. */

declare(strict_types=1);

namespace LifeHub\Push;

use LifeHub\Shared\Config\Settings;
use Minishlink\WebPush\VAPID;
use Throwable;

final class PushConfiguration
{
    public function __construct(private Settings $settings)
    {
    }

    public function keyPath(): string
    {
        return rtrim($this->settings->get('storagePath'), '/\\') . '/push-vapid.php';
    }

    /** @return array{subject:string,publicKey:string,privateKey:string}|null */
    public function credentials(): ?array
    {
        $subject = $this->settings->get('pushVapidSubject') ?: $this->settings->get('publicUrl');
        $validSubject = str_starts_with($subject, 'mailto:')
            ? filter_var(substr($subject, 7), FILTER_VALIDATE_EMAIL) !== false
            : filter_var($subject, FILTER_VALIDATE_URL) !== false && parse_url($subject, PHP_URL_SCHEME) === 'https';
        if (!$validSubject || !is_readable($this->keyPath())) {
            return null;
        }
        try {
            $keys = require $this->keyPath();
            if (!is_array($keys) || !is_string($keys['publicKey'] ?? null) || !is_string($keys['privateKey'] ?? null)) {
                return null;
            }
            VAPID::validate([
                'subject' => $subject, 'publicKey' => $keys['publicKey'], 'privateKey' => $keys['privateKey'],
            ]);
            return ['subject' => $subject, 'publicKey' => $keys['publicKey'], 'privateKey' => $keys['privateKey']];
        } catch (Throwable) {
            return null;
        }
    }
}
