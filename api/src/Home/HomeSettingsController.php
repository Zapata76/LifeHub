<?php

/** Exposes administrator-only editing of the household home labels. */

declare(strict_types=1);

namespace LifeHub\Home;

use LifeHub\Shared\Audit\AuditLogger;
use LifeHub\Shared\Auth\UserContext;
use LifeHub\Shared\Http\ApiException;
use LifeHub\Shared\Http\JsonResponder;
use LifeHub\Shared\Http\RequestData;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

final class HomeSettingsController
{
    /** @var HomeSettingsRepository */ private $settings;
    /** @var AuditLogger */ private $audit;

    public function __construct(HomeSettingsRepository $settings, AuditLogger $audit)
    {
        $this->settings = $settings;
        $this->audit = $audit;
    }

    public function show(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $user = $this->admin($request);
        return JsonResponder::write($response, $this->settings->read($user->householdId()));
    }

    public function update(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $user = $this->admin($request);
        $data = new RequestData($request);
        $eyebrow = trim($data->requiredString('homeEyebrow', 190));
        $title = trim($data->requiredString('homeTitle', 255));
        if ($eyebrow === '' || $title === '') {
            throw new ApiException(422, 'home_labels.required', 'Both home labels are required.');
        }
        $this->settings->update(
            $user->householdId(),
            $eyebrow,
            $title,
            $data->requiredInt('version')
        );
        $this->audit->record(
            $user,
            'household.home_labels_updated',
            'household',
            $user->householdId(),
            (string) $request->getAttribute('correlationId', 'unavailable')
        );
        return JsonResponder::write($response, ['updated' => true]);
    }

    private function admin(ServerRequestInterface $request): UserContext
    {
        $user = $request->getAttribute(UserContext::class);
        if (!$user instanceof UserContext || $user->role() !== 'admin') {
            throw new ApiException(403, 'authorization.denied', 'Administrator access is required.');
        }
        return $user;
    }
}
