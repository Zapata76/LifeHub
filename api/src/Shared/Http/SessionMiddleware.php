<?php

/**
 * Starts a hardened same-origin PHP session before authentication middleware.
 */

declare(strict_types=1);

namespace LifeHub\Shared\Http;

use LifeHub\Shared\Config\Settings;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\RequestHandlerInterface;

final class SessionMiddleware
{
    /** @var Settings */
    private $settings;

    public function __construct(Settings $settings)
    {
        $this->settings = $settings;
    }

    public function __invoke(
        ServerRequestInterface $request,
        RequestHandlerInterface $handler
    ): ResponseInterface {
        if (session_status() !== PHP_SESSION_ACTIVE) {
            $isHttps = strtolower($request->getUri()->getScheme()) === 'https'
                || $request->getHeaderLine('X-Forwarded-Proto') === 'https';
            session_name($this->settings->get('sessionName'));
            session_set_cookie_params([
                'lifetime' => 0,
                'path' => $this->settings->webPath(),
                'secure' => $isHttps,
                'httponly' => true,
                'samesite' => 'Lax',
            ]);
            session_start();
        }

        $now = time();
        $lastActivity = isset($_SESSION['lastActivity']) ? (int) $_SESSION['lastActivity'] : $now;
        if (($now - $lastActivity) > (int) $this->settings->get('sessionIdleSeconds')) {
            $_SESSION = [];
            if (!headers_sent()) {
                session_regenerate_id(true);
            }
        }
        $_SESSION['lastActivity'] = $now;

        return $handler->handle($request);
    }
}
