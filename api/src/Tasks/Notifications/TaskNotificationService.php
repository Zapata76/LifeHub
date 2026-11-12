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

    /** @return array{eligibleUsers:int,sent:int,failed:int,alreadyHandled:int,outsideWeeklyWindow:int} */
    public function run(?DateTimeImmutable $now = null): array
    {
        $schedule = new WeeklyNotificationSchedule($now);
        $result = ['eligibleUsers' => 0, 'sent' => 0, 'failed' => 0,
            'alreadyHandled' => 0, 'outsideWeeklyWindow' => 0];
        if (!$schedule->isDue()) {
            $result['outsideWeeklyWindow'] = 1;
            return $result;
        }
        $groups = $this->recaps($schedule);
        $result['eligibleUsers'] = count($groups);
        $utcNow = $schedule->now->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d H:i:s');
        $mealsByHousehold = [];
        $weatherByHousehold = [];
        foreach ($groups as $group) {
            $recipient = $group['recipient'];
            $householdId = (int) $recipient['household_id'];
            $deliveryId = $this->repository->claim(
                $householdId,
                (int) $recipient['user_id'],
                $schedule->deliveryDate(),
                $utcNow
            );
            if ($deliveryId === null) {
                $result['alreadyHandled']++;
                continue;
            }
            try {
                if (!isset($mealsByHousehold[$householdId])) {
                    $mealsByHousehold[$householdId] = $this->repository->plannedMeals(
                        $householdId,
                        $schedule->deliveryDate(),
                        $schedule->end->modify('+6 days')->format('Y-m-d')
                    );
                }
                if (!isset($weatherByHousehold[$householdId])) {
                    $weatherByHousehold[$householdId] = $this->weather?->message(
                        $householdId,
                        $schedule->now
                    ) ?? ['', ''];
                }
                [$html, $text] = $this->message(
                    $recipient,
                    $group['tasks'],
                    $group['completed'],
                    $schedule,
                    $mealsByHousehold[$householdId],
                    $weatherByHousehold[$householdId]
                );
                $sent = $this->mailer->send(
                    (string) $recipient['email'],
                    $this->siteName . ' - riepilogo settimanale del ' . $schedule->end->format('d/m/Y'),
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

    /** @return array<string, int|string|null> Aggregate operational information only. */
    public function status(?DateTimeImmutable $now = null): array
    {
        $schedule = new WeeklyNotificationSchedule($now);
        $groups = $this->recaps($schedule);
        $pending = 0;
        $completed = [];
        foreach ($groups as $group) {
            $pending += count($group['tasks']);
            foreach ($group['completed'] as $task) {
                $completed[(int) $group['recipient']['household_id'] . ':' . (int) $task['task_id']] = true;
            }
        }
        return array_merge([
            'eligibleUsers' => count($groups),
            'pendingTasks' => $pending,
            'completedTasks' => count($completed),
            'deliveryDate' => $schedule->deliveryDate(),
            'periodStart' => $schedule->start->format(DATE_ATOM),
            'periodEnd' => $schedule->end->format(DATE_ATOM),
            'nextRunAt' => $schedule->nextRun(),
            'schedule' => 'Sabato alle 06:00 (Europe/Rome)',
        ], $this->repository->deliverySummary($schedule->deliveryDate()));
    }

    /**
     * @return list<array{recipient:array<string,mixed>,tasks:list<array<string,mixed>>,
     *     completed:list<array<string,mixed>>}>
     */
    private function recaps(WeeklyNotificationSchedule $schedule): array
    {
        $pending = [];
        foreach ($this->repository->pendingAssignments() as $task) {
            $key = (int) $task['household_id'] . ':' . (int) $task['user_id'];
            $pending[$key][] = $task;
        }
        $completed = [];
        $groups = [];
        $utc = new DateTimeZone('UTC');
        foreach ($this->repository->recipients() as $recipient) {
            if (filter_var((string) $recipient['email'], FILTER_VALIDATE_EMAIL) === false) {
                continue;
            }
            $household = (int) $recipient['household_id'];
            if (!isset($completed[$household])) {
                $completed[$household] = $this->repository->completedTasks(
                    $household,
                    $schedule->start->setTimezone($utc)->format('Y-m-d H:i:s'),
                    $schedule->end->setTimezone($utc)->format('Y-m-d H:i:s')
                );
            }
            $tasks = $pending[$household . ':' . (int) $recipient['user_id']] ?? [];
            if ($tasks !== [] || $completed[$household] !== []) {
                $groups[] = ['recipient' => $recipient, 'tasks' => $tasks, 'completed' => $completed[$household]];
            }
        }
        return $groups;
    }

    /**
     * @param array<string, mixed> $recipient
     * @param list<array<string, mixed>> $tasks
     * @param list<array<string, mixed>> $completed
     * @param list<array<string, mixed>> $meals
     * @param array{string,string} $weather
     * @return array{string,string}
     */
    private function message(
        array $recipient,
        array $tasks,
        array $completed,
        WeeklyNotificationSchedule $schedule,
        array $meals,
        array $weather
    ): array {
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
        $period = $schedule->start->format('d/m/Y H:i') . ' – ' . $schedule->end->format('d/m/Y H:i')
            . ' (ora italiana, termine escluso)';
        $heading = 'Attività completate da tutti nella famiglia: ' . count($completed);
        $completedLines = [];
        $completedItems = [];
        foreach ($completed as $task) {
            $date = (new DateTimeImmutable((string) $task['completed_at'], new DateTimeZone('UTC')))
                ->setTimezone(new DateTimeZone('Europe/Rome'))->format('d/m/Y H:i');
            $assignee = (string) ($task['assigned_username'] ?? 'Nessuno');
            $line = (string) $task['title'] . ' — completata il ' . $date . ', assegnata a: ' . $assignee;
            $completedLines[] = '- ' . $line;
            $completedItems[] = '<li>' . htmlspecialchars($line, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') . '</li>';
        }
        $html .= '<h2>' . $heading . '</h2><p>' . $period . '</p>'
            . ($completedItems === [] ? '<p>Nessuna attività completata nel periodo.</p>'
                : '<ul>' . implode('', $completedItems) . '</ul>');
        $text .= "\n\n" . $heading . "\n" . $period . "\n\n"
            . ($completedLines === [] ? 'Nessuna attività completata nel periodo.' : implode("\n", $completedLines));
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
