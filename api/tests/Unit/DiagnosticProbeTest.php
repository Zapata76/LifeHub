<?php

declare(strict_types=1);

namespace LifeHub\Tests\Unit;

use LifeHub\Diagnostics\DiagnosticProbe;
use LifeHub\Diagnostics\ProbeGate;
use LifeHub\Shared\Config\Settings;
use LifeHub\Shared\Logging\StructuredLogger;
use LifeHub\Tests\Support\TemporaryStorage;
use PDO;
use PDOStatement;
use PHPUnit\Framework\TestCase;
use Psr\Http\Message\ServerRequestInterface;
use RuntimeException;
use Slim\Psr7\Factory\ServerRequestFactory;

final class DiagnosticProbeTest extends TestCase
{
    private TemporaryStorage $storage;
    private string $token;

    protected function setUp(): void
    {
        $this->storage = new TemporaryStorage();
        $this->token = str_repeat('c', 64);
    }

    protected function tearDown(): void
    {
        $this->storage->remove();
    }

    /** @param array<string, mixed> $overrides */
    private function settings(array $overrides = []): Settings
    {
        return Settings::fromArray(array_replace([
            'dbName' => 'unused', 'dbUser' => 'unused', 'storagePath' => $this->storage->path(),
            'diagnosticProbeTokenHash' => hash('sha256', $this->token), 'diagnosticProbeHouseholdId' => '7',
        ], $overrides));
    }

    private function request(): ServerRequestInterface
    {
        return (new ServerRequestFactory())->createServerRequest('GET', 'https://example.test/api/v1/diagnostics/probe')
            ->withHeader('X-LifeHub-Probe-Token', $this->token);
    }

    public function testAccessFailuresNeverOpenDatabaseOrCreateGate(): void
    {
        $connect = function (): PDO {
            self::fail('Access must be checked before connecting');
        };
        $logger = new StructuredLogger(static function (string $line): void {
            self::fail('Rejected unauthenticated requests should not flood the diagnostic log');
        });
        $request = $this->request();
        $cases = [
            [$this->settings(['diagnosticProbeTokenHash' => '']), $request, 404],
            [$this->settings(['diagnosticProbeHouseholdId' => 'bad']), $request, 404],
            [$this->settings(), $request->withoutHeader('X-LifeHub-Probe-Token'), 401],
            [$this->settings(), $request->withHeader('X-LifeHub-Probe-Token', str_repeat('d', 64)), 401],
            [$this->settings(), $request->withUri($request->getUri()->withScheme('http')), 403],
            [$this->settings(), $request->withMethod('POST'), 405],
            [$this->settings(), $request->withUri($request->getUri()->withQuery('household=2')), 400],
        ];
        foreach ($cases as [$settings, $input, $status]) {
            $response = (new DiagnosticProbe($settings, $logger, $connect))->handle($input, hrtime(true));
            self::assertSame($status, $response->getStatusCode());
            self::assertFalse($response->hasHeader('Set-Cookie'));
            self::assertSame('no-store', $response->getHeaderLine('Cache-Control'));
        }
        self::assertFileDoesNotExist($this->storage->path() . '/diagnostic-probe.lock');
    }

    public function testFixedReadWorkloadReturnsNoApplicationDataAndIsThrottled(): void
    {
        $pdo = $this->createMock(PDO::class);
        $statement = $this->createMock(PDOStatement::class);
        $pdo->expects(self::exactly(3))->method('prepare')->willReturnCallback(
            function (string $sql) use ($statement): PDOStatement {
                self::assertStringStartsWith('SELECT ', $sql);
                self::assertStringContainsString('household_id = ?', $sql);
                self::assertStringEndsWith('LIMIT 100', $sql);
                return $statement;
            }
        );
        $pdo->expects(self::never())->method('exec');
        $pdo->expects(self::never())->method('query');
        $statement->expects(self::exactly(3))->method('execute')->willReturnCallback(function (array $args): bool {
            self::assertSame(7, $args[0]);
            return true;
        });
        $statement->method('fetchAll')->willReturn([
            ['status' => 'secret-status', 'priority' => 'private-priority', 'due_date' => '2030-01-01'],
        ]);
        $logs = [];
        $logger = new StructuredLogger(static function (string $line) use (&$logs): void {
            $logs[] = $line;
        });
        $probe = new DiagnosticProbe($this->settings(), $logger, fn (): PDO => $pdo);
        $sessionBefore = $_SESSION;
        $sessionStatusBefore = session_status();
        $response = $probe->handle($this->request(), hrtime(true) - 5000000);
        self::assertSame(200, $response->getStatusCode());
        self::assertSame($sessionBefore, $_SESSION);
        self::assertSame($sessionStatusBefore, session_status());
        self::assertFalse($response->hasHeader('Set-Cookie'));
        $payload = json_decode((string) $response->getBody(), true);
        self::assertSame(['ok', 'code', 'correlationId'], array_keys($payload));
        self::assertTrue($payload['ok']);
        foreach (DiagnosticProbe::PHASES as $phase) {
            self::assertStringContainsString($phase . ';dur=', $response->getHeaderLine('Server-Timing'));
        }
        self::assertStringNotContainsString('secret-status', (string) $response->getBody() . implode('', $logs));
        self::assertStringNotContainsString($this->token, implode('', $logs));
        self::assertSame($payload['correlationId'], $response->getHeaderLine('X-Correlation-ID'));
        $again = $probe->handle($this->request(), hrtime(true));
        self::assertSame(429, $again->getStatusCode());
        self::assertSame('60', $again->getHeaderLine('Retry-After'));
    }

    public function testConnectionFailureIsSanitizedMeasuredAndRetainsCooldown(): void
    {
        $probe = new DiagnosticProbe($this->settings(), new StructuredLogger(static function (string $line): void {
            self::assertStringNotContainsString('private-credentials', $line);
        }), static function (): PDO {
            throw new RuntimeException('private-credentials');
        });
        $response = $probe->handle($this->request(), hrtime(true));
        self::assertSame(503, $response->getStatusCode());
        self::assertStringNotContainsString('private-credentials', (string) $response->getBody());
        self::assertStringContainsString('db_connect;dur=', $response->getHeaderLine('Server-Timing'));
        self::assertSame(429, $probe->handle($this->request(), hrtime(true))->getStatusCode());
    }

    public function testGateRejectsConcurrentExecutionAndCorruptState(): void
    {
        $first = new ProbeGate($this->storage->path());
        $second = new ProbeGate($this->storage->path());
        try {
            self::assertTrue($first->acquire());
            self::assertFalse($second->acquire());
        } finally {
            $first->release();
            $second->release();
        }
        file_put_contents($this->storage->path() . '/diagnostic-probe.lock', 'bad-state');
        self::assertFalse($second->acquire());
        file_put_contents($this->storage->path() . '/diagnostic-probe.lock', (string) (time() - 61));
        try {
            self::assertTrue($second->acquire());
        } finally {
            $second->release();
        }
    }
}
