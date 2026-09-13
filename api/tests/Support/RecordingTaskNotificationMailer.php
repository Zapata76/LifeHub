<?php

declare(strict_types=1);

namespace LifeHub\Tests\Support;

use LifeHub\Tasks\Notifications\TaskNotificationMailer;

final class RecordingTaskNotificationMailer implements TaskNotificationMailer
{
    /** @var list<array{recipient:string,subject:string,html:string,text:string}> */
    public $messages = [];

    public function send(string $recipient, string $subject, string $html, string $text): bool
    {
        $this->messages[] = compact('recipient', 'subject', 'html', 'text');
        return true;
    }
}
