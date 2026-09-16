<?php

/** Delivery seam: tests never contact real devices or browser push services. */

declare(strict_types=1);

namespace LifeHub\Push;

interface PushTransport
{
    /**
     * @param array{subject:string,publicKey:string,privateKey:string} $credentials
     * @param list<array{id:int,subscription:PushSubscription,payload:string}> $messages
     * @return iterable<array{id:int,status:string}>
     */
    public function send(array $credentials, array $messages): iterable;
}
