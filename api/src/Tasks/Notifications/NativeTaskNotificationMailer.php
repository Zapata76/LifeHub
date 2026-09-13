<?php

declare(strict_types=1);

namespace LifeHub\Tasks\Notifications;

final class NativeTaskNotificationMailer implements TaskNotificationMailer
{
    /** @var string */ private $fromAddress;
    /** @var string */ private $fromName;

    public function __construct(string $fromAddress, string $fromName)
    {
        $this->fromAddress = $fromAddress;
        $this->fromName = $fromName;
    }

    public function send(string $recipient, string $subject, string $html, string $text): bool
    {
        if (
            filter_var($recipient, FILTER_VALIDATE_EMAIL) === false
            || preg_match('/[\r\n]/', $recipient . $subject . $this->fromAddress . $this->fromName) === 1
        ) {
            return false;
        }
        $boundary = 'lifehub_' . bin2hex(random_bytes(16));
        $encodedSubject = mb_encode_mimeheader($subject, 'UTF-8', 'B', "\r\n");
        $encodedName = mb_encode_mimeheader($this->fromName, 'UTF-8', 'B', "\r\n");
        $headers = [
            'MIME-Version: 1.0',
            'From: ' . $encodedName . ' <' . $this->fromAddress . '>',
            'Content-Type: multipart/alternative; boundary="' . $boundary . '"',
        ];
        $body = '--' . $boundary . "\r\n"
            . "Content-Type: text/plain; charset=UTF-8\r\n"
            . "Content-Transfer-Encoding: 8bit\r\n\r\n"
            . $text . "\r\n"
            . '--' . $boundary . "\r\n"
            . "Content-Type: text/html; charset=UTF-8\r\n"
            . "Content-Transfer-Encoding: 8bit\r\n\r\n"
            . $html . "\r\n"
            . '--' . $boundary . "--\r\n";

        return mail($recipient, $encodedSubject, $body, implode("\r\n", $headers));
    }
}
