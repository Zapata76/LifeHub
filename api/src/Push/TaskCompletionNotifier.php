<?php

/** Best-effort completion fan-out; delivery failures must never roll back a persisted task. */

declare(strict_types=1);

namespace LifeHub\Push;

use LifeHub\Shared\Auth\Authorization;
use LifeHub\Shared\Auth\UserContext;
use LifeHub\Shared\Config\Settings;
use LifeHub\Shared\Logging\StructuredLogger;
use Throwable;

final class TaskCompletionNotifier
{
    public function __construct(
        private PushSubscriptionRepository $subscriptions,
        private PushConfiguration $configuration,
        private PushTransport $transport,
        private Settings $settings,
        private StructuredLogger $logger
    ) {
    }

    /** @param array<string,mixed> $task */
    public function completed(UserContext $actor, array $task, string $correlationId): void
    {
        $started = hrtime(true);
        $sent = $failed = $expired = 0;
        try {
            $credentials = $this->configuration->credentials();
            if ($credentials === null) {
                return;
            }
            $messages = [];
            $recipients = [];
            foreach ($this->subscriptions->recipients($actor) as $row) {
                $id = (int) $row['id'];
                try {
                    $subscription = new PushSubscription(
                        (string) $row['endpoint'],
                        (string) $row['public_key'],
                        (string) $row['auth_token']
                    );
                    $recipient = new UserContext(
                        (int) $row['user_id'],
                        $actor->householdId(),
                        (string) $row['role'],
                        ''
                    );
                    $canRead = Authorization::canReadTask($recipient, $task);
                    $body = $canRead
                        ? mb_substr($actor->username(), 0, 50) . ' ha completato: '
                            . mb_substr((string) $task['title'], 0, 160)
                        : 'Un’attività della famiglia è stata completata.';
                    $payload = json_encode(['notification' => [
                        'title' => 'Attività completata', 'body' => $body,
                        'icon' => $this->settings->webPath() . 'icons/icon-192x192.png',
                        'tag' => 'task-' . (int) $task['id'] . '-' . (int) $task['version'],
                        'data' => ['onActionClick' => ['default' => [
                            'operation' => 'navigateLastFocusedOrOpen',
                            'url' => $this->settings->webPath() . 'tasks',
                        ]]],
                    ]], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
                    $messages[] = ['id' => $id, 'subscription' => $subscription, 'payload' => $payload];
                    $recipients[$id] = $subscription;
                } catch (Throwable) {
                    ++$failed;
                }
            }
            if ($messages !== []) {
                // No session writes after this point; don't hold the session lock during external I/O.
                if (PHP_SAPI !== 'cli' && session_status() === PHP_SESSION_ACTIVE) {
                    session_write_close();
                }
                foreach ($this->transport->send($credentials, $messages) as $result) {
                    if ($result['status'] === 'sent') {
                        ++$sent;
                    } elseif ($result['status'] === 'expired') {
                        ++$expired;
                        $subscription = $recipients[$result['id']];
                        $this->subscriptions->removeExpired(
                            $result['id'],
                            $subscription->endpoint,
                            $subscription->authToken
                        );
                    } else {
                        ++$failed;
                    }
                }
            }
            $this->logger->pushDelivery($correlationId, (hrtime(true) - $started) / 1e6, $sent, $failed, $expired);
        } catch (Throwable) {
            $this->logger->pushDelivery(
                $correlationId,
                (hrtime(true) - $started) / 1e6,
                $sent,
                $failed,
                $expired,
                'push.delivery_failed'
            );
        }
    }
}
