<?php

declare(strict_types=1);

namespace LifeHub\Tasks\Notifications;

interface TaskNotificationMailer
{
    public function send(string $recipient, string $subject, string $html, string $text): bool;
}
