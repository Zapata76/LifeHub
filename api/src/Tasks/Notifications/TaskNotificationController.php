<?php

declare(strict_types=1);

namespace LifeHub\Tasks\Notifications;

use LifeHub\Shared\Config\Settings;
use LifeHub\Shared\Http\ApiException;
use LifeHub\Shared\Http\JsonResponder;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

final class TaskNotificationController
{
    /** @var TaskNotificationService */ private $service;
    /** @var Settings */ private $settings;

    public function __construct(TaskNotificationService $service, Settings $settings)
    {
        $this->service = $service;
        $this->settings = $settings;
    }

    public function run(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $this->authorize($request);
        $result = $this->service->run();
        $retryRequired = $result['failed'] > 0 || $result['beforeDailyWindow'] > 0;
        return JsonResponder::write($response, ['result' => $result], $retryRequired ? 503 : 200);
    }

    public function status(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $this->authorize($request);
        return JsonResponder::write($response, ['status' => $this->service->status()]);
    }

    private function authorize(ServerRequestInterface $request): void
    {
        $token = $this->settings->get('jobToken');
        if (!$this->configured($token)) {
            throw new ApiException(503, 'job.not_configured', 'The notification job is not configured.');
        }
        $provided = $request->getHeaderLine('X-LifeHub-Job-Token');
        if ($provided === '' || !hash_equals($token, $provided)) {
            throw new ApiException(401, 'job.unauthorized', 'Invalid job credentials.');
        }
    }

    private function configured(string $token): bool
    {
        $sender = $this->settings->get('mailFromAddress');
        $publicUrl = $this->settings->get('publicUrl');
        $url = parse_url($publicUrl);
        return strlen($token) >= 32
            && filter_var($sender, FILTER_VALIDATE_EMAIL) !== false
            && is_array($url)
            && in_array($url['scheme'] ?? '', ['http', 'https'], true)
            && isset($url['host'])
            && substr($publicUrl, -1) !== '/';
    }
}
