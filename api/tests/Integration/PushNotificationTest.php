<?php

declare(strict_types=1);

namespace LifeHub\Tests\Integration;

use LifeHub\Application\ApplicationFactory;
use LifeHub\Installation\SchemaInitializer;
use LifeHub\Push\PushConfiguration;
use LifeHub\Push\PushSubscription;
use LifeHub\Push\PushSubscriptionRepository;
use LifeHub\Push\VapidKeyGenerator;
use LifeHub\Shared\Auth\UserContext;
use LifeHub\Shared\Config\Settings;
use LifeHub\Tasks\TaskRepository;
use LifeHub\Tests\Support\TemporaryDatabase;
use LifeHub\Tests\Support\TemporaryStorage;
use LifeHub\Tests\Support\RecordingPushTransport;
use Minishlink\WebPush\VAPID;
use PHPUnit\Framework\TestCase;
use Psr\Http\Message\ResponseInterface;
use Slim\Psr7\Factory\ServerRequestFactory;

final class PushNotificationTest extends TestCase
{
    private ?TemporaryDatabase $database = null;
    private ?TemporaryStorage $storage = null;
    private Settings $settings;
    private PushSubscriptionRepository $subscriptions;
    private string $publicKey;
    private RecordingPushTransport $transport;

    protected function setUp(): void
    {
        if (getenv('LIFEHUB_TEST_DB') !== '1') {
            self::markTestSkipped('Set LIFEHUB_TEST_DB=1 to run database tests.');
        }
        $this->database = new TemporaryDatabase();
        $this->storage = new TemporaryStorage();
        $pdo = $this->database->pdo();
        (new SchemaInitializer($pdo, dirname(__DIR__, 3) . '/database/lifehub.sql'))->initialize(false);
        $pdo->exec("INSERT INTO lh_households (id,name,timezone,created_at,updated_at) VALUES "
            . "(1,'Family','UTC',NOW(),NOW()),(2,'Other','UTC',NOW(),NOW())");
        foreach ([1 => 'admin', 2 => 'adult', 3 => 'child', 4 => 'adult', 5 => 'adult', 6 => 'adult'] as $id => $role) {
            $pdo->prepare('INSERT INTO lh_users '
                . '(id,household_id,username,username_key,password_hash,role,status,created_at,updated_at) '
                . "VALUES (?,?,?,?,'not-a-real-password',?,'active',NOW(),NOW())")
                ->execute([$id, $id === 4 ? 2 : 1, 'User ' . $id, 'user ' . $id, $role]);
        }
        $this->settings = Settings::fromArray([
            'environment' => 'test', 'dbName' => $this->database->name(), 'dbUser' => 'unused',
            'storagePath' => $this->storage->path(), 'basePath' => '/umbertini',
            'publicUrl' => 'https://example.test/umbertini',
        ]);
        VapidKeyGenerator::create((new PushConfiguration($this->settings))->keyPath());
        $this->publicKey = VAPID::createVapidKeys()['publicKey'];
        $this->subscriptions = new PushSubscriptionRepository($pdo);
        $this->transport = new RecordingPushTransport();
    }

    protected function tearDown(): void
    {
        $_SESSION = [];
        $this->database?->drop();
        $this->storage?->remove();
    }

    public function testCompletionReachesAllOtherActiveHouseholdDevicesExactlyOnce(): void
    {
        self::assertNotNull($this->database);
        $this->subscribe(1, 'actor-phone');
        $this->subscribe(1, 'actor-tablet');
        $this->subscribe(2, 'adult-phone');
        $this->subscribe(2, 'adult-tablet');
        $this->subscribe(3, 'child');
        $this->subscribe(4, 'other-family');
        $this->subscribe(5, 'disabled');
        $this->subscribe(6, 'revoked');
        $this->pdo()->exec("UPDATE lh_users SET status = 'disabled' WHERE id = 5");
        $this->pdo()->exec('UPDATE lh_users SET session_version = 2 WHERE id = 6');
        $id = $this->newTask();
        $response = $this->request('POST', '/tasks/' . $id . '/complete', ['version' => 1]);
        self::assertSame(200, $response->getStatusCode(), (string) $response->getBody());
        self::assertCount(3, $this->transport->messages);
        foreach ($this->transport->messages as $message) {
            $notification = json_decode($message['payload'], true)['notification'];
            self::assertSame('/umbertini/tasks', $notification['data']['onActionClick']['default']['url']);
            if (str_ends_with($message['subscription']->endpoint, '/child')) {
                self::assertStringNotContainsString('Private title', $notification['body']);
            } else {
                self::assertStringContainsString('Private title', $notification['body']);
            }
        }
        $this->request('POST', '/tasks/' . $id . '/complete', ['version' => 1]);
        $this->request('PUT', '/tasks/' . $id, [
            'version' => 2, 'title' => 'Updated completed task', 'status' => 'completed',
        ]);
        self::assertSame(1, $this->transport->calls);
        $this->request('PUT', '/tasks/' . $id, ['version' => 3, 'status' => 'in_progress']);
        $response = $this->request('PUT', '/tasks/' . $id, [
            'version' => 4, 'status' => 'completed', 'title' => 'New title',
        ]);
        self::assertSame(200, $response->getStatusCode());
        self::assertSame(2, $this->transport->calls);
        self::assertStringContainsString('New title', $this->transport->messages[0]['payload']);
        $stale = $this->request('PUT', '/tasks/' . $id, ['version' => 4, 'status' => 'completed']);
        self::assertSame(409, $stale->getStatusCode());
        self::assertSame(2, $this->transport->calls);
    }

    public function testPushFailuresDoNotTurnSuccessfulTaskSaveIntoAnError(): void
    {
        self::assertNotNull($this->database);
        $this->subscribe(2, 'offline');
        $this->transport->fail = true;
        $id = $this->newTask();
        $response = $this->request('PUT', '/tasks/' . $id, ['version' => 1, 'status' => 'completed']);
        self::assertSame(200, $response->getStatusCode());
        self::assertSame('completed', (new TaskRepository($this->pdo()))->get($this->user(1), $id)['status']);
    }

    public function testExpiredSubscriptionsAreRemovedAndLogoutOnlyRemovesItsOwnDevice(): void
    {
        self::assertNotNull($this->database);
        $this->subscribe(2, 'expired');
        $this->subscribe(2, 'retained');
        $this->transport->expire = true;
        $this->request('POST', '/tasks/' . $this->newTask() . '/complete', ['version' => 1]);
        self::assertCount(1, $this->subscriptions->recipients($this->user(1)));
        $this->request('POST', '/auth/logout', ['pushEndpoint' => $this->endpoint('retained')], 1);
        self::assertCount(1, $this->subscriptions->recipients($this->user(1)));
        $this->request('POST', '/auth/logout', ['pushEndpoint' => $this->endpoint('retained')], 2);
        self::assertCount(0, $this->subscriptions->recipients($this->user(1)));
    }

    public function testSubscriptionEndpointsRequireSessionCsrfAndValidKeysAndAreIdempotent(): void
    {
        self::assertNotNull($this->database);
        $body = [
            'endpoint' => $this->endpoint('phone'), 'publicKey' => $this->publicKey, 'authToken' => str_repeat('a', 22),
        ];
        self::assertSame(401, $this->request('POST', '/push/subscriptions', $body, null)->getStatusCode());
        self::assertSame(403, $this->request('POST', '/push/subscriptions', $body, 1, false)->getStatusCode());
        $config = $this->request('GET', '/push/config');
        $json = json_decode((string) $config->getBody(), true);
        self::assertTrue($json['enabled']);
        self::assertArrayNotHasKey('privateKey', $json);
        self::assertSame(200, $this->request('POST', '/push/subscriptions', $body, 2)->getStatusCode());
        self::assertSame(200, $this->request('POST', '/push/subscriptions', $body, 2)->getStatusCode());
        self::assertCount(1, $this->subscriptions->recipients($this->user(1)));
        $otherUserRemoval = $this->request('POST', '/push/unsubscribe', ['endpoint' => $body['endpoint']], 3);
        self::assertSame(200, $otherUserRemoval->getStatusCode());
        self::assertCount(1, $this->subscriptions->recipients($this->user(1)));
        // Explicit opt-in on a shared browser transfers, rather than duplicates, its ownership.
        $this->request('POST', '/push/subscriptions', $body, 3);
        self::assertCount(1, $this->subscriptions->recipients($this->user(1)));
        self::assertSame(3, (int) $this->subscriptions->recipients($this->user(1))[0]['user_id']);
        foreach (
            ['http://fcm.googleapis.com/x', 'https://127.0.0.1/x', 'https://example.test/x',
            'https://fcm.googleapis.com.evil.test/x', 'https://fcm.googleapis.com:444/x',
            'https://user@fcm.googleapis.com/x', 'https://fcm.googleapis.com/x#y'] as $url
        ) {
            $invalid = $this->request('POST', '/push/subscriptions', array_replace($body, ['endpoint' => $url]));
            self::assertSame(422, $invalid->getStatusCode());
        }
        $invalid = $this->request('POST', '/push/subscriptions', array_replace($body, [
            'publicKey' => str_repeat('a', 87),
        ]));
        self::assertSame(422, $invalid->getStatusCode());
    }

    public function testMissingPushKeysDoNotBreakCoreApplication(): void
    {
        self::assertNotNull($this->storage);
        $this->settings = Settings::fromArray([
            'dbName' => 'unused', 'dbUser' => 'unused', 'basePath' => '/umbertini',
            'storagePath' => $this->storage->path() . '/unconfigured',
        ]);
        self::assertSame(200, $this->request('GET', '/app-config')->getStatusCode());
        self::assertSame(200, $this->request('GET', '/auth/session')->getStatusCode());
        self::assertFalse(json_decode((string) $this->request('GET', '/push/config')->getBody(), true)['enabled']);
        $completed = $this->request('POST', '/tasks/' . $this->newTask() . '/complete', ['version' => 1]);
        self::assertSame(200, $completed->getStatusCode());
        self::assertSame(0, $this->transport->calls);
    }

    private function newTask(): int
    {
        self::assertNotNull($this->database);
        return (new TaskRepository($this->database->pdo()))->create(
            $this->user(1),
            'Private title',
            null,
            null,
            'medium',
            null
        );
    }

    private function pdo(): \PDO
    {
        self::assertNotNull($this->database);
        return $this->database->pdo();
    }

    private function user(int $id): UserContext
    {
        $role = $id === 1 ? 'admin' : ($id === 3 ? 'child' : 'adult');
        return new UserContext($id, $id === 4 ? 2 : 1, $role, 'User ' . $id);
    }

    private function endpoint(string $suffix): string
    {
        return 'https://fcm.googleapis.com/fcm/send/' . $suffix;
    }

    private function subscribe(int $id, string $suffix): void
    {
        $this->subscriptions->save($this->user($id), new PushSubscription(
            $this->endpoint($suffix),
            $this->publicKey,
            str_repeat('a', 22)
        ));
    }

    /** @param array<string,mixed> $body */
    private function request(
        string $method,
        string $path,
        array $body = [],
        ?int $id = 1,
        bool $csrf = true
    ): ResponseInterface {
        self::assertNotNull($this->database);
        if (session_status() !== PHP_SESSION_ACTIVE) {
            session_start();
        }
        $_SESSION = ['csrfToken' => 'test-csrf', 'lastActivity' => time()];
        if ($id !== null) {
            $_SESSION['user'] = array_merge($this->user($id)->toArray(), ['sessionVersion' => 1]);
        }
        $uri = 'https://example.test/umbertini/api/v1' . $path;
        $request = (new ServerRequestFactory())->createServerRequest($method, $uri)
            ->withParsedBody($body)->withHeader('X-Correlation-ID', 'push-test-correlation');
        if ($csrf) {
            $request = $request->withHeader('X-CSRF-Token', 'test-csrf');
        }
        $app = ApplicationFactory::create($this->settings, $this->database->pdo(), null, $this->transport);
        return $app->handle($request);
    }
}
