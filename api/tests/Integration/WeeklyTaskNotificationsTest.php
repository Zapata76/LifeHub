<?php

declare(strict_types=1);

namespace LifeHub\Tests\Integration;

use DateTimeImmutable;
use LifeHub\Installation\SchemaInitializer;
use LifeHub\Tasks\Notifications\TaskNotificationMailer;
use LifeHub\Tasks\Notifications\TaskNotificationRepository;
use LifeHub\Tasks\Notifications\TaskNotificationService;
use LifeHub\Tests\Support\RecordingTaskNotificationMailer;
use LifeHub\Tests\Support\TemporaryDatabase;
use PHPUnit\Framework\TestCase;

final class WeeklyTaskNotificationsTest extends TestCase
{
    private ?TemporaryDatabase $database = null;

    protected function setUp(): void
    {
        if (getenv('LIFEHUB_TEST_DB') !== '1') {
            self::markTestSkipped('Set LIFEHUB_TEST_DB=1 for isolated notification tests.');
        }
        $this->database = new TemporaryDatabase();
        $pdo = $this->database->pdo();
        (new SchemaInitializer($pdo, dirname(__DIR__, 3) . '/database/lifehub.sql'))->initialize(false);
        $pdo->exec("INSERT INTO lh_households (id, name, timezone, created_at, updated_at) "
            . "VALUES (1, 'Test', 'Europe/Rome', NOW(), NOW()), (2, 'Other', 'Europe/Rome', NOW(), NOW())");
        $insert = $pdo->prepare('INSERT INTO lh_users '
            . '(id, household_id, username, username_key, password_hash, role, status, email, '
            . 'archived_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())');
        $users = [
            [1, 1, 'Alpha', 'alpha@example.test', 'active', null],
            [2, 1, 'Beta', 'beta@example.test', 'active', null],
            [3, 1, 'No email', null, 'active', null],
            [4, 1, 'Archived', 'archived@example.test', 'active', '2026-01-01 00:00:00'],
            [5, 1, 'Inactive', 'inactive@example.test', 'inactive', null],
            [6, 1, 'Idle', 'idle@example.test', 'active', null],
            [7, 2, 'Other', 'other@example.test', 'active', null],
        ];
        foreach ($users as [$id, $household, $name, $email, $status, $archived]) {
            $insert->execute([
                $id, $household, $name, strtolower($name), 'unused', 'adult', $status, $email, $archived,
            ]);
        }
    }

    protected function tearDown(): void
    {
        $this->database?->drop();
    }

    private function task(
        string $title,
        ?int $assignee,
        string $status = 'open',
        ?string $completed = null,
        ?string $archived = null,
        int $household = 1
    ): void {
        self::assertNotNull($this->database);
        $statement = $this->database->pdo()->prepare('INSERT INTO lh_tasks '
            . '(household_id, title, title_search, assigned_to, status, priority, completed_at, archived_at, '
            . 'created_by, created_at, updated_by, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, NOW(), 1, NOW())');
        $statement->execute([$household, $title, $title, $assignee, $status, 'normal', $completed, $archived]);
    }

    private function service(TaskNotificationMailer $mailer): TaskNotificationService
    {
        self::assertNotNull($this->database);
        return new TaskNotificationService(
            new TaskNotificationRepository($this->database->pdo()),
            $mailer,
            'Test',
            'https://example.test/lifehub'
        );
    }

    public function testPersonalOpenTasksAndFamilyCompletionsIncludingArchivedAndUnassigned(): void
    {
        $this->task('Alpha open', 1);
        $this->task('Beta in progress', 2, 'in_progress');
        $this->task('Unassigned open excluded', null);
        $this->task('Archived open excluded', 1, 'open', null, '2026-11-03 00:00:00');
        // Window in UTC: October 31 05:00 inclusive to November 7 05:00 exclusive.
        $this->task('First included', 3, 'completed', '2026-10-31 05:00:00');
        $this->task('Last & <included>', 2, 'completed', '2026-11-07 04:59:59', '2026-11-07 05:01:00');
        $this->task('Unassigned completed', null, 'completed', '2026-11-01 12:00:00');
        $this->task('Too old excluded', 1, 'completed', '2026-10-31 04:59:59');
        $this->task('Next period excluded', 1, 'completed', '2026-11-07 05:00:00');
        $this->task('Undated completed excluded', 1, 'completed');
        $this->task('Reopened excluded', 1, 'open', null, '2026-11-03 00:00:00');
        $this->task('Other household', 7, 'completed', '2026-11-02 12:00:00', null, 2);
        $mailer = new RecordingTaskNotificationMailer();
        $service = $this->service($mailer);
        $now = new DateTimeImmutable('2026-11-07T06:00:00+01:00');
        $result = $service->run($now);
        self::assertSame(4, $result['sent']);
        $byEmail = array_column($mailer->messages, null, 'recipient');
        self::assertSame(
            ['alpha@example.test', 'beta@example.test', 'idle@example.test', 'other@example.test'],
            array_keys($byEmail)
        );
        foreach (['alpha', 'beta', 'idle'] as $name) {
            $message = $byEmail[$name . '@example.test'];
            self::assertStringContainsString('riepilogo settimanale del 07/11/2026', $message['subject']);
            foreach (['First included', 'Last & <included>', 'Unassigned completed'] as $included) {
                self::assertStringContainsString($included, $message['text']);
                self::assertStringContainsString(htmlspecialchars($included, ENT_QUOTES, 'UTF-8'), $message['html']);
            }
            $excludedTitles = ['Other household', 'Too old excluded', 'Next period excluded',
                'Undated completed excluded', 'Unassigned open excluded', 'Archived open excluded'];
            foreach ($excludedTitles as $excluded) {
                self::assertStringNotContainsString($excluded, $message['text']);
            }
        }
        self::assertStringContainsString('Alpha open', $byEmail['alpha@example.test']['text']);
        self::assertStringNotContainsString('Beta in progress', $byEmail['alpha@example.test']['text']);
        self::assertStringNotContainsString('Alpha open', $byEmail['beta@example.test']['text']);
        self::assertStringContainsString('Hai 0 attività', $byEmail['idle@example.test']['text']);
        self::assertStringNotContainsString('First included', $byEmail['other@example.test']['text']);
        self::assertSame(4, $service->run($now->modify('+8 hours'))['alreadyHandled']);
        self::assertCount(4, $mailer->messages);
        $status = $service->status($now);
        self::assertSame(4, $status['completedTasks']);
        self::assertSame(2, $status['pendingTasks']);
        self::assertSame(4, $status['sentThisWeek']);
    }

    public function testNoWeekdayOrEarlyMailAndOneDeliveryPerSaturday(): void
    {
        $this->task('Recurring pending', 1);
        $mailer = new RecordingTaskNotificationMailer();
        $service = $this->service($mailer);
        $outsideWindow = ['2026-11-06T12:00:00+01:00', '2026-11-07T05:59:59+01:00', '2026-11-08T10:00:00+01:00'];
        foreach ($outsideWindow as $date) {
            self::assertSame(1, $service->run(new DateTimeImmutable($date))['outsideWeeklyWindow']);
        }
        self::assertCount(0, $mailer->messages);
        self::assertSame(1, $service->run(new DateTimeImmutable('2026-11-07T06:00:00+01:00'))['sent']);
        self::assertSame(1, $service->run(new DateTimeImmutable('2026-11-14T06:00:00+01:00'))['sent']);
        self::assertCount(2, $mailer->messages);
    }

    public function testOnlyFailedRecipientsAreRetriedAndEmptyRecapsAreSkipped(): void
    {
        $mailer = new class implements TaskNotificationMailer {
            public bool $failBeta = true;
            /** @var list<string> */ public array $sent = [];
            public function send(string $recipient, string $subject, string $html, string $text): bool
            {
                if ($recipient === 'beta@example.test' && $this->failBeta) {
                    return false;
                }
                $this->sent[] = $recipient;
                return true;
            }
        };
        $service = $this->service($mailer);
        $now = new DateTimeImmutable('2026-11-07T06:00:00+01:00');
        self::assertSame(0, $service->run($now)['eligibleUsers']);
        $this->task('Alpha', 1);
        $this->task('Beta', 2);
        $first = $service->run($now);
        self::assertSame(1, $first['sent']);
        self::assertSame(1, $first['failed']);
        $mailer->failBeta = false;
        $retry = $service->run($now->modify('+1 minute'));
        self::assertSame(1, $retry['sent']);
        self::assertSame(1, $retry['alreadyHandled']);
        self::assertSame(['alpha@example.test', 'beta@example.test'], $mailer->sent);
    }
}
