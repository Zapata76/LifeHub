<?php

declare(strict_types=1);

namespace LifeHub\Tasks\Notifications;

use DateTimeImmutable;
use DateTimeZone;
use LifeHub\Weather\WeatherSummary;
use Throwable;

final class TaskNotificationService
{
    /** @var TaskNotificationRepository */ private $repository;
    /** @var TaskNotificationMailer */ private $mailer;
    /** @var string */ private $siteName;
    /** @var string */ private $tasksUrl;
    /** @var string */ private $mealsUrl;
    private ?WeatherSummary $weather;

    public function __construct(
        TaskNotificationRepository $repository,
        TaskNotificationMailer $mailer,
        string $siteName,
        string $publicUrl,
        ?WeatherSummary $weather = null
    ) {
        $this->repository = $repository;
        $this->mailer = $mailer;
        $this->siteName = $siteName;
        $this->tasksUrl = $publicUrl . '/tasks';
        $this->mealsUrl = $publicUrl . '/meals';
        $this->weather = $weather;
    }

    /** @return array{eligibleUsers:int,sent:int,failed:int,alreadyHandled:int,beforeDailyWindow:int} */
    public function run(?DateTimeImmutable $now = null): array
    {
        $now = $now ?? new DateTimeImmutable('now', new DateTimeZone('UTC'));
        $groups = [];
        foreach ($this->repository->pendingAssignments() as $row) {
            $key = (int) $row['household_id'] . ':' . (int) $row['user_id'];
            if (!isset($groups[$key])) {
                $groups[$key] = ['recipient' => $row, 'tasks' => []];
            }
            $groups[$key]['tasks'][] = $row;
        }
        $result = [
            'eligibleUsers' => count($groups),
            'sent' => 0,
            'failed' => 0,
            'alreadyHandled' => 0,
            'beforeDailyWindow' => 0,
        ];
        $mealsByHousehold = [];
        $weatherByHousehold = [];
        foreach ($groups as $group) {
            $recipient = $group['recipient'];
            try {
                $timezone = new DateTimeZone((string) $recipient['timezone']);
            } catch (Throwable $exception) {
                $timezone = new DateTimeZone('Europe/Rome');
            }
            $localNow = $now->setTimezone($timezone);
            if ((int) $localNow->format('G') < 8) {
                $result['beforeDailyWindow']++;
                continue;
            }
            $utcNow = $now->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d H:i:s');
            $householdId = (int) $recipient['household_id'];
            if (!isset($mealsByHousehold[$householdId])) {
                $mealsByHousehold[$householdId] = $this->repository->plannedMeals(
                    $householdId,
                    $localNow->format('Y-m-d'),
                    $localNow->modify('+6 days')->format('Y-m-d')
                );
            }
            $deliveryId = $this->repository->claim(
                (int) $recipient['household_id'],
                (int) $recipient['user_id'],
                $localNow->format('Y-m-d'),
                $utcNow
            );
            if ($deliveryId === null) {
                $result['alreadyHandled']++;
                continue;
            }
            if (!isset($weatherByHousehold[$householdId])) {
                $weatherByHousehold[$householdId] = $this->weather?->message($householdId, $localNow) ?? ['', ''];
            }
            [$html, $text] = $this->message(
                $recipient,
                $group['tasks'],
                $mealsByHousehold[$householdId],
                $weatherByHousehold[$householdId]
            );
            try {
                $sent = $this->mailer->send(
                    (string) $recipient['email'],
                    $this->siteName . ' - attività da completare',
                    $html,
                    $text
                );
            } catch (Throwable $exception) {
                $sent = false;
            }
            if ($sent) {
                $this->repository->markSent($deliveryId, $utcNow);
                $result['sent']++;
            } else {
                $this->repository->markFailed($deliveryId, $utcNow);
                $result['failed']++;
            }
        }
        return $result;
    }

    /**
     * Returns aggregate operational information only: no names, email addresses, or task titles.
     *
     * @return array{eligibleUsers:int,pendingTasks:int,sentToday:int,failedToday:int,lastSentAt:?string}
     */
    public function status(?DateTimeImmutable $now = null): array
    {
        $now = $now ?? new DateTimeImmutable('now', new DateTimeZone('Europe/Rome'));
        $assignments = $this->repository->pendingAssignments();
        $users = [];
        foreach ($assignments as $assignment) {
            $users[(int) $assignment['household_id'] . ':' . (int) $assignment['user_id']] = true;
        }
        return array_merge([
            'eligibleUsers' => count($users),
            'pendingTasks' => count($assignments),
        ], $this->repository->deliverySummary($now->setTimezone(new DateTimeZone('Europe/Rome'))->format('Y-m-d')));
    }

    /**
     * @param array<string, mixed> $recipient
     * @param list<array<string, mixed>> $tasks
     * @param list<array<string, mixed>> $meals
     * @param array{string,string} $weather
     * @return array{string,string}
     */
    private function message(array $recipient, array $tasks, array $meals, array $weather): array
    {
        $name = (string) $recipient['username'];
        $lines = [];
        $items = [];
        foreach ($tasks as $task) {
            $status = (string) $task['status'] === 'in_progress' ? 'In corso' : 'Da fare';
            $priority = [
                'high' => 'Alta',
                'normal' => 'Media',
                'low' => 'Bassa',
            ][(string) $task['priority']] ?? 'Media';
            $due = $task['due_date'] === null
                ? 'nessuna scadenza'
                : 'scadenza ' . (new DateTimeImmutable((string) $task['due_date']))->format('d/m/Y');
            $line = (string) $task['title'] . ' — ' . $status . ', priorità ' . $priority . ', ' . $due;
            $lines[] = '- ' . $line;
            $items[] = '<li>' . htmlspecialchars($line, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') . '</li>';
        }
        $safeName = htmlspecialchars($name, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $safeUrl = htmlspecialchars($this->tasksUrl, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $html = '<!doctype html><html><body><p>Ciao ' . $safeName . ',</p>'
            . '<p>Hai ' . count($tasks) . ' attività pendenti o in corso:</p><ul>'
            . implode('', $items) . '</ul><p><a href="' . $safeUrl . '">Apri le attività in Life Hub</a></p>';
        $text = "Ciao {$name},\n\nHai " . count($tasks) . " attività pendenti o in corso:\n\n"
            . implode("\n", $lines) . "\n\nApri le attività: " . $this->tasksUrl;
        if ($meals !== []) {
            [$mealsHtml, $mealsText] = $this->mealSection($meals);
            $html .= $mealsHtml;
            $text .= "\n\n" . $mealsText;
        }
        $html .= $weather[0];
        if ($weather[1] !== '') {
            $text .= "\n\n" . $weather[1];
        }
        return [$html . '</body></html>', $text];
    }

    /**
     * @param list<array<string, mixed>> $meals
     * @return array{string,string}
     */
    private function mealSection(array $meals): array
    {
        $types = ['breakfast' => 'Colazione', 'lunch' => 'Pranzo', 'dinner' => 'Cena'];
        $lines = [];
        $items = [];
        foreach ($meals as $meal) {
            $description = trim((string) ($meal['description'] ?? ''));
            $details = $description === '' ? [] : [$description];
            $details = array_merge($details, $meal['recipes']);
            $date = (new DateTimeImmutable((string) $meal['meal_date']))->format('d/m/Y');
            $type = $types[(string) $meal['meal_type']] ?? (string) $meal['meal_type'];
            $line = $date . ' — ' . $type;
            if ($details !== []) {
                $line .= ': ' . implode('; ', $details);
            }
            $lines[] = '- ' . $line;
            $items[] = '<li>' . htmlspecialchars($line, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') . '</li>';
        }
        $heading = 'Pasti programmati per i prossimi 7 giorni (oggi incluso)';
        $safeUrl = htmlspecialchars($this->mealsUrl, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        return [
            '<h2>' . $heading . '</h2><ul>' . implode('', $items)
                . '</ul><p><a href="' . $safeUrl . '">Apri il calendario pasti in Life Hub</a></p>',
            $heading . ":\n\n" . implode("\n", $lines) . "\n\nApri il calendario pasti: " . $this->mealsUrl,
        ];
    }
}
