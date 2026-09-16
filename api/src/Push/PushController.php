<?php

/** Authenticated, CSRF-protected device opt-in and opt-out endpoints. */

declare(strict_types=1);

namespace LifeHub\Push;

use LifeHub\Shared\Auth\UserContext;
use LifeHub\Shared\Http\ApiException;
use LifeHub\Shared\Http\JsonResponder;
use LifeHub\Shared\Http\RequestData;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

final class PushController
{
    public function __construct(
        private PushSubscriptionRepository $subscriptions,
        private PushConfiguration $configuration
    ) {
    }

    public function configuration(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $this->user($request);
        $credentials = $this->configuration->credentials();
        return JsonResponder::write($response, [
            'enabled' => $credentials !== null, 'publicKey' => $credentials['publicKey'] ?? null,
        ]);
    }

    public function subscribe(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $user = $this->user($request);
        if ($this->configuration->credentials() === null) {
            throw new ApiException(
                503,
                'push.not_configured',
                'Le notifiche push non sono ancora configurate sul server.'
            );
        }
        $data = new RequestData($request);
        $subscription = new PushSubscription(
            $data->requiredString('endpoint', 2048),
            $data->requiredString('publicKey', 87),
            $data->requiredString('authToken', 22)
        );
        $this->subscriptions->save($user, $subscription);
        return JsonResponder::write($response, ['subscribed' => true]);
    }

    public function unsubscribe(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $endpoint = (new RequestData($request))->requiredString('endpoint', 2048);
        $this->subscriptions->remove($this->user($request), $endpoint);
        return JsonResponder::write($response, ['subscribed' => false]);
    }

    private function user(ServerRequestInterface $request): UserContext
    {
        $user = $request->getAttribute(UserContext::class);
        if (!$user instanceof UserContext) {
            throw new ApiException(401, 'auth.required', 'Authentication is required.');
        }
        return $user;
    }
}
