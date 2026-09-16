<?php

declare(strict_types=1);

namespace LifeHub\Tests\Unit;

use GuzzleHttp\Client as GuzzleClient;
use GuzzleHttp\Handler\MockHandler;
use GuzzleHttp\HandlerStack;
use GuzzleHttp\Middleware;
use GuzzleHttp\Psr7\Response;
use Http\Adapter\Guzzle7\Client;
use LifeHub\Push\PushSubscription;
use LifeHub\Push\WebPushTransport;
use Minishlink\WebPush\VAPID;
use PHPUnit\Framework\TestCase;

final class WebPushTransportTest extends TestCase
{
    public function testEncryptsPayloadAndClassifiesSuccessExpiryAndFailureWithoutRealNetwork(): void
    {
        $history = [];
        $stack = HandlerStack::create(new MockHandler([new Response(201), new Response(410), new Response(503)]));
        $stack->push(Middleware::history($history));
        $transport = new WebPushTransport(new Client(new GuzzleClient(['handler' => $stack, 'http_errors' => false])));
        $keys = VAPID::createVapidKeys();
        $credentials = [
            'publicKey' => $keys['publicKey'], 'privateKey' => $keys['privateKey'], 'subject' => 'https://example.test',
        ];
        $key = VAPID::createVapidKeys()['publicKey'];
        $messages = [];
        foreach ([1, 2, 3] as $id) {
            $messages[] = [
                'id' => $id,
                'subscription' => new PushSubscription(
                    'https://fcm.googleapis.com/fcm/send/test-' . $id,
                    $key,
                    str_repeat('a', 22)
                ),
                'payload' => '{"notification":{"title":"Private task title"}}',
            ];
        }
        $results = $transport->send($credentials, $messages);
        self::assertSame([
            ['id' => 1, 'status' => 'sent'], ['id' => 2, 'status' => 'expired'], ['id' => 3, 'status' => 'failed'],
        ], $results);
        self::assertCount(3, $history);
        foreach ($history as $entry) {
            $request = $entry['request'];
            self::assertSame('aes128gcm', $request->getHeaderLine('Content-Encoding'));
            self::assertStringStartsWith('vapid ', $request->getHeaderLine('Authorization'));
            self::assertStringNotContainsString('Private task title', (string) $request->getBody());
            self::assertSame('3600', $request->getHeaderLine('TTL'));
        }
    }
}
