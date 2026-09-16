<?php

declare(strict_types=1);

namespace LifeHub\Tests\Support;

use LifeHub\Push\PushSubscription;
use LifeHub\Push\PushTransport;
use RuntimeException;

final class RecordingPushTransport implements PushTransport
{
    public int $calls = 0;
    public bool $fail = false;
    public bool $expire = false;
    /** @var list<array{id:int,subscription:PushSubscription,payload:string}> */
    public array $messages = [];

    public function send(array $credentials, array $messages): iterable
    {
        ++$this->calls;
        $this->messages = $messages;
        if ($this->fail) {
            throw new RuntimeException('Simulated network failure with sensitive endpoint');
        }
        return array_map(fn (array $message): array => [
            'id' => $message['id'],
            'status' => $this->expire && str_ends_with($message['subscription']->endpoint, '/expired')
                ? 'expired' : 'sent',
        ], $messages);
    }
}
