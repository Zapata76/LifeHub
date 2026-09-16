<?php

/** Generates private runtime material once, without printing secrets or overwriting an existing identity. */

declare(strict_types=1);

namespace LifeHub\Push;

use Minishlink\WebPush\VAPID;
use RuntimeException;

final class VapidKeyGenerator
{
    public static function create(string $path): void
    {
        if (file_exists($path)) {
            throw new RuntimeException('VAPID keys already exist. Keep them across releases; do not regenerate them.');
        }
        $keys = VAPID::createVapidKeys();
        $content = "<?php\n\n// Private VAPID identity: do not publish or commit.\nreturn "
            . var_export($keys, true) . ";\n";
        if (!is_dir(dirname($path)) && !mkdir(dirname($path), 0700, true) && !is_dir(dirname($path))) {
            throw new RuntimeException('Cannot create private push configuration directory.');
        }
        $file = @fopen($path, 'x');
        if ($file === false) {
            throw new RuntimeException('Cannot create VAPID key file (possibly already present).');
        }
        try {
            @chmod($path, 0600);
            if (fwrite($file, $content) !== strlen($content)) {
                throw new RuntimeException('Could not write complete VAPID key file. Check private storage.');
            }
        } finally {
            fclose($file);
        }
    }
}
