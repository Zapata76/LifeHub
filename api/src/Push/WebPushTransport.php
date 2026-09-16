<?php

/** Encrypted VAPID delivery using a maintained implementation, bounded network waits and no redirects. */

declare(strict_types=1);

namespace LifeHub\Push;

use Http\Adapter\Guzzle7\Client;
use Minishlink\WebPush\MessageSentReport;
use Minishlink\WebPush\Subscription;
use Minishlink\WebPush\WebPush;
use Psr\Log\NullLogger;

final class WebPushTransport implements PushTransport
{
    public function __construct(private ?Client $client = null)
    {
    }

    public function send(array $credentials, array $messages): iterable
    {
        $client = $this->client ?? Client::createWithConfig([
            'timeout' => 8, 'connect_timeout' => 3, 'allow_redirects' => false, 'http_errors' => false,
        ]);
        $push = new WebPush(
            ['VAPID' => $credentials],
            ['TTL' => 3600, 'urgency' => 'normal', 'batchSize' => 50, 'requestConcurrency' => 10],
            $client,
            asyncClient: $client,
            logger: new NullLogger()
        );
        $push->setReuseVAPIDHeaders(true);
        $ids = [];
        foreach ($messages as $message) {
            $subscription = $message['subscription'];
            PushSubscription::validateEndpoint($subscription->endpoint);
            $ids[$subscription->endpoint] = $message['id'];
            $push->queueNotification(new Subscription(
                $subscription->endpoint,
                $subscription->publicKey,
                $subscription->authToken,
                'aes128gcm'
            ), $message['payload']);
        }
        $results = [];
        $push->flushPooled(static function (MessageSentReport $report) use (&$results, $ids): void {
            $results[] = [
                'id' => $ids[$report->getEndpoint()],
                'status' => $report->isSuccess() ? 'sent' : ($report->isSubscriptionExpired() ? 'expired' : 'failed'),
            ];
        });
        return $results;
    }
}
