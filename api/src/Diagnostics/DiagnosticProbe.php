<?php

declare(strict_types=1);

namespace LifeHub\Diagnostics;

use Closure;
use LifeHub\Shared\Config\Settings;
use LifeHub\Shared\Http\JsonResponder;
use LifeHub\Shared\Logging\StructuredLogger;
use LifeHub\Shared\Persistence\PdoFactory;
use PDO;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Slim\Psr7\Factory\ResponseFactory;
use Throwable;

/** Dispatched before ApplicationFactory: no session, user authentication, audit writes or external services. */
final class DiagnosticProbe
{
    public const PHASES = ['early_php', 'db_connect', 'tasks_read', 'shopping_read', 'meals_read',
        'calculation', 'response_encoding', 'php_total'];
    /** @var Closure(): PDO */
    private Closure $connect;

    /** @param (callable(): PDO)|null $connect */
    public function __construct(
        private Settings $settings,
        private StructuredLogger $logger,
        ?callable $connect = null
    ) {
        $this->connect = $connect === null
            ? fn (): PDO => PdoFactory::create($settings) : Closure::fromCallable($connect);
    }

    public function handle(ServerRequestInterface $request, int $started): ResponseInterface
    {
        $response = (new ResponseFactory())->createResponse()
            ->withHeader('Cache-Control', 'no-store')
            ->withHeader('X-Content-Type-Options', 'nosniff')
            ->withHeader('Referrer-Policy', 'no-referrer');
        $hash = $this->settings->get('diagnosticProbeTokenHash');
        $household = $this->settings->get('diagnosticProbeHouseholdId');
        // Invalid optional configuration disables this endpoint, never the rest of the application.
        if (preg_match('/^[a-f0-9]{64}$/', $hash) !== 1 || !ctype_digit($household) || (int) $household < 1) {
            return JsonResponder::write($response, ['error' => ['code' => 'http.not_found']], 404);
        }
        if ($request->getUri()->getScheme() !== 'https') {
            return JsonResponder::write($response, ['error' => ['code' => 'probe.https_required']], 403);
        }
        $token = $request->getHeaderLine('X-LifeHub-Probe-Token');
        if (strlen($token) < 32 || strlen($token) > 256 || !hash_equals($hash, hash('sha256', $token))) {
            return JsonResponder::write($response, ['error' => ['code' => 'probe.unauthorized']], 401);
        }
        if ($request->getMethod() !== 'GET') {
            return JsonResponder::write($response->withHeader('Allow', 'GET'), ['error' => [
                'code' => 'http.method_not_allowed',
            ]], 405);
        }
        if ($request->getUri()->getQuery() !== '') {
            return JsonResponder::write($response, ['error' => ['code' => 'probe.parameters_not_allowed']], 400);
        }
        $correlation = bin2hex(random_bytes(16));
        $timings = array_fill_keys(self::PHASES, 0.0);
        $timings['early_php'] = (hrtime(true) - $started) / 1000000;
        $gate = new ProbeGate($this->settings->get('storagePath'));
        $status = 200;
        $error = null;
        try {
            if (!$gate->acquire()) {
                $status = 429;
                $error = 'probe.rate_limited';
                $response = $response->withHeader('Retry-After', '60');
            } else {
                $connectionStart = hrtime(true);
                try {
                    $pdo = ($this->connect)();
                } finally {
                    $timings['db_connect'] = (hrtime(true) - $connectionStart) / 1000000;
                }
                (new ProbeWorkload())->run($pdo, (int) $household, $timings);
            }
        } catch (Throwable) {
            $status = 503;
            $error = 'probe.unavailable';
        } finally {
            $gate->release();
        }
        $encodingStart = hrtime(true);
        $response = JsonResponder::write($response, [
            'ok' => $status === 200, 'code' => $error ?? 'probe.ok', 'correlationId' => $correlation,
        ], $status);
        $timings['response_encoding'] = (hrtime(true) - $encodingStart) / 1000000;
        $timings['php_total'] = (hrtime(true) - $started) / 1000000;
        $header = [];
        foreach ($timings as $name => $duration) {
            $header[] = $name . ';dur=' . number_format($duration, 2, '.', '');
        }
        $this->logger->diagnosticProbe($correlation, $status, $error, $timings);
        return $response->withHeader('Server-Timing', implode(', ', $header))
            ->withHeader('X-Correlation-ID', $correlation);
    }
}
