<?php

declare(strict_types=1);

namespace LifeHub\Tests\Unit;

use Closure;
use LifeHub\Shared\Config\Settings;
use LifeHub\Shared\Http\ReleaseSessionMiddleware;
use LifeHub\Shared\Http\RequestTimings;
use LifeHub\Shared\Http\SessionMiddleware;
use LifeHub\Tests\Support\TemporaryStorage;
use PHPUnit\Framework\TestCase;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\RequestHandlerInterface;
use Slim\Psr7\Factory\ServerRequestFactory;
use Slim\Psr7\Response;

/**
 * @runTestsInSeparateProcesses
 * @preserveGlobalState disabled
 */
final class SessionLifecycleTest extends TestCase
{
    private TemporaryStorage $storage;
    private Settings $settings;

    protected function setUp(): void
    {
        SessionMiddleware::close();
        $this->storage = new TemporaryStorage();
        session_save_path($this->storage->path());
        session_id(bin2hex(random_bytes(16)));
        $this->settings = Settings::fromArray([
            'environment' => 'test', 'dbName' => 'unused', 'dbUser' => 'unused',
            'storagePath' => $this->storage->path(), 'sessionIdleSeconds' => '60',
        ]);
    }

    protected function tearDown(): void
    {
        SessionMiddleware::close();
        $this->storage->remove();
    }

    public function testAuthChangesRotationAndLogoutPersistAcrossRequests(): void
    {
        $before = session_id();
        $this->handle(static function (): void {
            self::assertSame(PHP_SESSION_ACTIVE, session_status());
            session_regenerate_id(true);
            $_SESSION['user'] = ['id' => 7];
            $_SESSION['csrfToken'] = 'rotated-token';
        });
        self::assertSame(PHP_SESSION_NONE, session_status());
        self::assertNotSame($before, session_id());
        $this->handle(static function (): void {
            self::assertSame(['id' => 7], $_SESSION['user']);
            self::assertSame('rotated-token', $_SESSION['csrfToken']);
            $_SESSION = [];
            session_regenerate_id(true);
        });
        $this->handle(static function (): void {
            self::assertArrayNotHasKey('user', $_SESSION);
            self::assertNotSame('rotated-token', $_SESSION['csrfToken']);
        });
    }

    public function testProtectedWorkRunsAfterSessionIsSavedAndUnlocked(): void
    {
        $this->handle(static function (): void {
            $_SESSION['user'] = ['id' => 7];
        });
        $this->handle(static function (): void {
            self::assertSame(PHP_SESSION_NONE, session_status());
            self::assertSame(['id' => 7], $_SESSION['user']);
            self::assertNotEmpty($_SESSION['csrfToken']);
        }, true);
        self::assertSame(PHP_SESSION_NONE, session_status());
    }

    public function testRevocationIsSavedEvenWhenDownstreamThrows(): void
    {
        $this->handle(static function (): void {
            $_SESSION['user'] = ['id' => 7];
        });
        try {
            $this->handle(static function (): void {
                unset($_SESSION['user']);
                throw new \RuntimeException('rejected');
            });
            self::fail('Expected the handler error');
        } catch (\RuntimeException $error) {
            self::assertSame('rejected', $error->getMessage());
        }
        self::assertSame(PHP_SESSION_NONE, session_status());
        $this->handle(static function (): void {
            self::assertArrayNotHasKey('user', $_SESSION);
        });
    }

    public function testExpiryStillRotatesSessionAndClearsUser(): void
    {
        $this->handle(static function (): void {
            $_SESSION['user'] = ['id' => 7];
            $_SESSION['csrfToken'] = 'old-token';
            $_SESSION['lastActivity'] = time() - 120;
        });
        $expiredId = session_id();
        $this->handle(static function (): void {
            self::assertArrayNotHasKey('user', $_SESSION);
            self::assertNotSame('old-token', $_SESSION['csrfToken']);
        });
        self::assertNotSame($expiredId, session_id());
        self::assertSame(PHP_SESSION_NONE, session_status());
    }

    private function handle(callable $operation, bool $protected = false): void
    {
        $handler = new class (Closure::fromCallable($operation)) implements RequestHandlerInterface {
            public function __construct(private Closure $operation)
            {
            }

            public function handle(ServerRequestInterface $request): ResponseInterface
            {
                ($this->operation)();
                return new Response();
            }
        };
        if ($protected) {
            $handler = new class ($handler) implements RequestHandlerInterface {
                public function __construct(private RequestHandlerInterface $next)
                {
                }

                public function handle(ServerRequestInterface $request): ResponseInterface
                {
                    return (new ReleaseSessionMiddleware())($request, $this->next);
                }
            };
        }
        $timings = new RequestTimings();
        $request = (new ServerRequestFactory())->createServerRequest('GET', 'https://example.test/api/test')
            ->withAttribute(RequestTimings::class, $timings);
        (new SessionMiddleware($this->settings))($request, $handler);
        self::assertGreaterThanOrEqual(0, $timings->snapshot()['session_start']);
    }
}
