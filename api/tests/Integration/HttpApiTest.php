<?php

/**
 * Exercises CSRF, login, protected task creation, and logout through the real Slim stack.
 */

declare(strict_types=1);

namespace LifeHub\Tests\Integration;

use LifeHub\Application\ApplicationFactory;
use LifeHub\Installation\SchemaInitializer;
use LifeHub\Inventory\InventoryCategoryDefaults;
use LifeHub\Shared\Config\Settings;
use LifeHub\Tests\Support\TemporaryDatabase;
use LifeHub\Tests\Support\TemporaryStorage;
use PHPUnit\Framework\TestCase;
use Psr\Container\ContainerInterface;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Slim\Psr7\Factory\ServerRequestFactory;
use Slim\Psr7\Factory\StreamFactory;
use Slim\Psr7\UploadedFile;
use RuntimeException;

final class HttpApiTest extends TestCase
{
    /** @var TemporaryDatabase|null */ private $database;
    /** @var TemporaryStorage|null */ private $storage;

    protected function setUp(): void
    {
        if (getenv('LIFEHUB_TEST_DB') !== '1') {
            self::markTestSkipped('Set LIFEHUB_TEST_DB=1 to run the HTTP integration test.');
        }
        $this->database = new TemporaryDatabase();
        $this->storage = new TemporaryStorage();
        $pdo = $this->database()->pdo();
        (new SchemaInitializer($pdo, dirname(__DIR__, 3) . '/database/lifehub.sql'))->initialize(false);
        $now = gmdate('Y-m-d H:i:s');
        $pdo->prepare(
            'INSERT INTO lh_households (id, name, timezone, created_at, updated_at) VALUES (1, ?, ?, ?, ?)'
        )->execute(['Test household', 'Europe/Rome', $now, $now]);
        $pdo->prepare(
            'INSERT INTO lh_users '
            . '(id, household_id, username, username_key, password_hash, role, status, created_at, updated_at) '
            . "VALUES (1, 1, 'admin', 'admin', ?, 'admin', 'active', ?, ?)"
        )->execute([password_hash('integration-password', PASSWORD_BCRYPT), $now, $now]);
        InventoryCategoryDefaults::seed($pdo, 1, 1, $now);
        $pdo->prepare(
            'INSERT INTO lh_shopping_lists '
            . '(id, household_id, name, name_key, is_primary, created_by, created_at) '
            . "VALUES (1, 1, 'Lista della spesa', 'lista della spesa', 1, 1, ?)"
        )->execute([$now]);
        $_SESSION = [];
    }

    protected function tearDown(): void
    {
        $_SESSION = [];
        if ($this->database !== null) {
            $this->database->drop();
        }
        if ($this->storage !== null) {
            $this->storage->remove();
        }
    }

    public function testUnknownApiResourceReturnsNotFound(): void
    {
        $response = $this->app()->handle($this->request('GET', '/v1/removed-resource'));

        self::assertSame(404, $response->getStatusCode(), (string) $response->getBody());
        self::assertSame('http.not_found', $this->json($response)['error']['code']);
    }

    public function testAuthenticatedTaskJourneyAndCsrfRejection(): void
    {
        $app = $this->app();
        $configuration = $this->json($app->handle($this->request('GET', '/v1/app-config')));
        self::assertSame('Configured test hub', $configuration['siteName']);
        $sessionResponse = $app->handle($this->request('GET', '/v1/auth/session'));
        self::assertSame(200, $sessionResponse->getStatusCode(), (string) $sessionResponse->getBody());
        $session = $this->json($sessionResponse);
        $csrf = (string) $session['csrfToken'];
        self::assertNotSame('', $csrf);

        $rejected = $app->handle($this->request('POST', '/v1/auth/login', [
            'username' => 'admin', 'password' => 'integration-password',
        ]));
        self::assertSame(403, $rejected->getStatusCode());

        $login = $app->handle($this->request('POST', '/v1/auth/login', [
            'username' => 'admin', 'password' => 'integration-password',
        ], $csrf));
        self::assertSame(200, $login->getStatusCode(), (string) $login->getBody());
        $loginBody = $this->json($login);
        $csrf = (string) $loginBody['csrfToken'];

        $homeSettings = $this->json($app->handle($this->request('GET', '/v1/admin/home-settings')));
        self::assertSame('Oggi in famiglia', $homeSettings['homeEyebrow']);
        self::assertSame('Simona puzzona', $homeSettings['homeTitle']);
        $updatedHome = $app->handle($this->request('PUT', '/v1/admin/home-settings', [
            'homeEyebrow' => 'Notizie di casa', 'homeTitle' => 'Benvenuti in famiglia',
            'version' => $homeSettings['version'],
        ], $csrf));
        self::assertSame(200, $updatedHome->getStatusCode(), (string) $updatedHome->getBody());

        $created = $app->handle($this->request('POST', '/v1/tasks', [
            'title' => 'Task via API', 'priority' => 'high',
        ], $csrf));
        self::assertSame(201, $created->getStatusCode());
        $item = $this->json($created)['item'];
        self::assertIsArray($item);
        self::assertSame('Task via API', $item['title']);

        $members = $this->json($app->handle($this->request('GET', '/v1/tasks/members')));
        self::assertCount(1, $members['items']);
        self::assertSame('admin', $members['items'][0]['username']);

        $updated = $app->handle($this->request('PUT', '/v1/tasks/' . $item['id'], [
            'title' => 'Task via API', 'description' => '', 'assignedTo' => null,
            'dueDate' => null, 'priority' => 'high', 'status' => 'in_progress', 'version' => 1,
        ], $csrf));
        self::assertSame(200, $updated->getStatusCode(), (string) $updated->getBody());

        $list = $this->json($app->handle($this->request('GET', '/v1/tasks')));
        self::assertCount(1, $list['items']);
        self::assertSame('in_progress', $list['items'][0]['status']);
        self::assertNull($list['items'][0]['assigned_to']);
        $dashboard = $this->json($app->handle($this->request('GET', '/v1/dashboard')));
        self::assertSame(1, $dashboard['openTasks']);
        self::assertSame('Notizie di casa', $dashboard['homeEyebrow']);
        self::assertSame('Benvenuti in famiglia', $dashboard['homeTitle']);
        self::assertArrayNotHasKey('password_hash', $loginBody['user']);
        self::assertArrayNotHasKey('sessionVersion', $loginBody['user']);
    }

    public function testLogoutSucceedsWithAnExpiredCsrfToken(): void
    {
        $app = $this->app();
        $session = $this->json($app->handle($this->request('GET', '/v1/auth/session')));
        $login = $this->json($app->handle($this->request('POST', '/v1/auth/login', [
            'username' => 'admin', 'password' => 'integration-password',
        ], (string) $session['csrfToken'])));
        self::assertTrue($login['authenticated']);

        $logout = $app->handle($this->request('POST', '/v1/auth/logout', [], 'expired-csrf-token'));
        self::assertSame(200, $logout->getStatusCode(), (string) $logout->getBody());
        self::assertFalse($this->json($logout)['authenticated']);

        $protected = $app->handle($this->request('GET', '/v1/tasks'));
        self::assertSame(401, $protected->getStatusCode(), (string) $protected->getBody());
        self::assertSame('auth.required', $this->json($protected)['error']['code']);
    }

    public function testAdministratorCanManageUsersPasswordsAndCalendars(): void
    {
        $app = $this->app();
        $session = $this->json($app->handle($this->request('GET', '/v1/auth/session')));
        $login = $this->json($app->handle($this->request('POST', '/v1/auth/login', [
            'username' => 'admin', 'password' => 'integration-password',
        ], (string) $session['csrfToken'])));
        $csrf = (string) $login['csrfToken'];

        $invalid = $app->handle($this->request('POST', '/v1/users', [
            'username' => 'x', 'password' => 'member-password-123', 'role' => 'adult',
        ], $csrf));
        self::assertSame(422, $invalid->getStatusCode());

        $created = $app->handle($this->request('POST', '/v1/users', [
            'username' => 'member.one', 'password' => 'member-password-123', 'role' => 'adult',
        ], $csrf));
        self::assertSame(201, $created->getStatusCode(), (string) $created->getBody());
        $userId = (int) $this->json($created)['id'];

        $duplicate = $app->handle($this->request('POST', '/v1/users', [
            'username' => 'member.one', 'password' => 'member-password-123', 'role' => 'adult',
        ], $csrf));
        self::assertSame(409, $duplicate->getStatusCode());

        $users = $this->json($app->handle($this->request('GET', '/v1/users')))['items'];
        self::assertCount(2, $users);
        self::assertArrayNotHasKey('password_hash', $users[1]);

        $updated = $app->handle($this->request('PUT', '/v1/users/' . $userId, [
            'role' => 'child', 'status' => 'active', 'version' => 1,
        ], $csrf));
        self::assertSame(200, $updated->getStatusCode());

        $reset = $app->handle($this->request('POST', '/v1/users/' . $userId . '/password', [
            'password' => 'new-member-password', 'version' => 2,
        ], $csrf));
        self::assertSame(200, $reset->getStatusCode(), (string) $reset->getBody());

        $calendar = $app->handle($this->request('POST', '/v1/calendars', [
            'name' => 'Family', 'external_id' => 'family@example.test',
        ], $csrf));
        self::assertSame(201, $calendar->getStatusCode());
        $calendarId = (int) $this->json($calendar)['item']['id'];
        $assignPath = '/v1/users/' . $userId . '/calendars/' . $calendarId;
        $assigned = $this->json($app->handle($this->request('POST', $assignPath . '/assign', [], $csrf)));
        self::assertTrue($assigned['changed']);
        $assignedAgain = $this->json($app->handle($this->request('POST', $assignPath . '/assign', [], $csrf)));
        self::assertFalse($assignedAgain['changed']);
        $unassigned = $this->json($app->handle($this->request('POST', $assignPath . '/unassign', [], $csrf)));
        self::assertTrue($unassigned['changed']);
        $reassigned = $this->json($app->handle($this->request('POST', $assignPath . '/assign', [], $csrf)));
        self::assertTrue($reassigned['changed']);
        $deletedCalendar = $app->handle($this->request('DELETE', '/v1/calendars/' . $calendarId, [
            'version' => 1,
        ], $csrf));
        self::assertSame(200, $deletedCalendar->getStatusCode(), (string) $deletedCalendar->getBody());
        self::assertTrue($this->json($deletedCalendar)['deleted']);
        if ($this->database === null) {
            throw new RuntimeException('Temporary database was not initialized.');
        }
        $calendarRows = $this->database->pdo()->query(
            'SELECT COUNT(*) FROM lh_calendars WHERE id = ' . $calendarId
        );
        $calendarLinks = $this->database->pdo()->query(
            'SELECT COUNT(*) FROM lh_user_calendars WHERE calendar_id = ' . $calendarId
        );
        if ($calendarRows === false || $calendarLinks === false) {
            throw new RuntimeException('Cannot inspect calendar physical deletion.');
        }
        self::assertSame(0, (int) $calendarRows->fetchColumn());
        self::assertSame(0, (int) $calendarLinks->fetchColumn());

        $disabled = $app->handle($this->request('PUT', '/v1/users/' . $userId, [
            'role' => 'child', 'status' => 'disabled', 'version' => 3,
        ], $csrf));
        self::assertSame(200, $disabled->getStatusCode());
        $selfLockout = $app->handle($this->request('PUT', '/v1/users/1', [
            'role' => 'admin', 'status' => 'disabled', 'version' => 1,
        ], $csrf));
        self::assertSame(409, $selfLockout->getStatusCode());
        $resetCurrentAdmin = $app->handle($this->request('POST', '/v1/users/1/password', [
            'password' => 'new-admin-password', 'version' => 1,
        ], $csrf));
        self::assertSame(200, $resetCurrentAdmin->getStatusCode());
        $revokedSession = $app->handle($this->request('GET', '/v1/users'));
        self::assertSame(401, $revokedSession->getStatusCode());

        if ($this->database === null) {
            throw new RuntimeException('Temporary database was not initialized.');
        }
        $pdo = $this->database->pdo();
        $passwordStatement = $pdo->query('SELECT password_hash FROM lh_users WHERE id = ' . $userId);
        if ($passwordStatement === false) {
            throw new RuntimeException('Cannot inspect the reset password.');
        }
        $password = $passwordStatement->fetchColumn();
        self::assertTrue(password_verify('new-member-password', (string) $password));
        $auditStatement = $pdo->query("SELECT COUNT(*) FROM lh_audit_log WHERE event_code LIKE 'user.%'");
        if ($auditStatement === false) {
            throw new RuntimeException('Cannot inspect user audit events.');
        }
        $auditEvents = $auditStatement->fetchColumn();
        self::assertSame(8, (int) $auditEvents);
        $sessionVersionStatement = $pdo->query('SELECT session_version FROM lh_users WHERE id = ' . $userId);
        if ($sessionVersionStatement === false) {
            throw new RuntimeException('Cannot inspect session revocation state.');
        }
        self::assertSame(4, (int) $sessionVersionStatement->fetchColumn());
    }

    public function testHouseholdShoppingJourneyUsesCheckboxAndReversibleRemoval(): void
    {
        $app = $this->app();
        $session = $this->json($app->handle($this->request('GET', '/v1/auth/session')));
        $login = $this->json($app->handle($this->request('POST', '/v1/auth/login', [
            'username' => 'admin', 'password' => 'integration-password',
        ], (string) $session['csrfToken'])));
        $csrf = (string) $login['csrfToken'];

        $category = $this->json($app->handle($this->request('POST', '/v1/categories', [
            'name' => 'Bevande',
        ], $csrf)))['item'];
        $market = $this->json($app->handle($this->request('POST', '/v1/supermarkets', [
            'name' => 'Mercato test',
        ], $csrf)))['item'];
        $product = $this->json($app->handle($this->request('POST', '/v1/products', [
            'name' => 'Tè nero', 'category_id' => $category['id'],
        ], $csrf)))['item'];
        $list = ['id' => 1];

        $created = $app->handle($this->request('POST', '/v1/shopping/items', [
            'listId' => $list['id'], 'productId' => $product['id'],
            'supermarketId' => $market['id'], 'quantity' => '2 confezioni',
        ], $csrf));
        self::assertSame(201, $created->getStatusCode(), (string) $created->getBody());
        $itemId = (int) $this->json($created)['id'];

        $duplicate = $app->handle($this->request('POST', '/v1/shopping/items', [
            'listId' => $list['id'], 'productId' => $product['id'],
            'supermarketId' => $market['id'], 'quantity' => '1',
        ], $csrf));
        self::assertSame(409, $duplicate->getStatusCode());

        $overview = $this->json($app->handle($this->request('GET', '/v1/shopping/overview')));
        self::assertCount(1, $overview['items']);
        self::assertSame('Tè nero', $overview['items'][0]['product_name']);
        self::assertSame('Mercato test', $overview['items'][0]['supermarket_name']);

        $checked = $app->handle($this->request('PUT', '/v1/shopping/items/' . $itemId, [
            'checked' => true, 'quantity' => '2 confezioni',
            'supermarketId' => $market['id'], 'version' => 1,
        ], $csrf));
        self::assertSame(200, $checked->getStatusCode(), (string) $checked->getBody());
        $afterCheck = $this->json($app->handle($this->request('GET', '/v1/shopping/overview')));
        self::assertSame(1, (int) $afterCheck['items'][0]['checked']);

        $removed = $app->handle($this->request('POST', '/v1/shopping/items/' . $itemId . '/remove', [
            'version' => 2,
        ], $csrf));
        self::assertSame(200, $removed->getStatusCode(), (string) $removed->getBody());
        $afterRemove = $this->json($app->handle($this->request('GET', '/v1/shopping/overview')));
        self::assertCount(0, $afterRemove['items']);
    }

    public function testShoppingCleanupAndCatalogueDeletionArePhysicalAndRepairReferences(): void
    {
        $app = $this->app();
        $session = $this->json($app->handle($this->request('GET', '/v1/auth/session')));
        $login = $this->json($app->handle($this->request('POST', '/v1/auth/login', [
            'username' => 'admin', 'password' => 'integration-password',
        ], (string) $session['csrfToken'])));
        $csrf = (string) $login['csrfToken'];

        $category = $this->json($app->handle($this->request('POST', '/v1/categories', [
            'name' => 'Ortofrutta',
        ], $csrf)))['item'];
        $replacementCategory = $this->json($app->handle($this->request('POST', '/v1/categories', [
            'name' => 'Freschi',
        ], $csrf)))['item'];
        $market = $this->json($app->handle($this->request('POST', '/v1/supermarkets', [
            'name' => 'Mercato fisico',
        ], $csrf)))['item'];
        $renamedCategory = $app->handle($this->request(
            'PUT',
            '/v1/categories/' . $category['id'],
            ['name' => 'Orto e frutta', 'version' => $category['version']],
            $csrf
        ));
        self::assertSame(200, $renamedCategory->getStatusCode(), (string) $renamedCategory->getBody());
        $category['version'] = 2;
        $renamedMarket = $app->handle($this->request(
            'PUT',
            '/v1/supermarkets/' . $market['id'],
            ['name' => 'Mercato Centrale', 'version' => $market['version']],
            $csrf
        ));
        self::assertSame(200, $renamedMarket->getStatusCode(), (string) $renamedMarket->getBody());
        $market['version'] = 2;
        $product = $this->json($app->handle($this->request('POST', '/v1/products', [
            'name' => 'Mele', 'category_id' => $category['id'],
        ], $csrf)))['item'];
        $duplicateProduct = $app->handle($this->request('POST', '/v1/products', [
            'name' => '  mele  ', 'category_id' => $replacementCategory['id'],
        ], $csrf));
        self::assertSame(409, $duplicateProduct->getStatusCode(), (string) $duplicateProduct->getBody());
        self::assertSame('product.duplicate', $this->json($duplicateProduct)['error']['code']);
        $longProduct = $app->handle($this->request('POST', '/v1/products', [
            'name' => str_repeat('x', 256), 'category_id' => $category['id'],
        ], $csrf));
        self::assertSame(422, $longProduct->getStatusCode(), (string) $longProduct->getBody());
        self::assertSame('validation.length', $this->json($longProduct)['error']['code']);
        $recipeResponse = $app->handle($this->request('POST', '/v1/recipes', [
            'title' => 'Crostata di mele', 'category' => 'Dolce', 'description' => '',
            'instructions' => 'Cuocere.', 'prepTimeMinutes' => 40, 'difficulty' => 'media',
            'ingredients' => [
                ['productId' => $product['id'], 'name' => 'Mele', 'quantity' => '3'],
            ],
        ], $csrf));
        self::assertSame(201, $recipeResponse->getStatusCode(), (string) $recipeResponse->getBody());
        $recipeId = (int) $this->json($recipeResponse)['id'];
        $catalogueOverview = $this->json($app->handle($this->request('GET', '/v1/shopping/overview')));
        self::assertCount(1, $catalogueOverview['product_recipe_usages']);
        self::assertSame(
            (int) $product['id'],
            (int) $catalogueOverview['product_recipe_usages'][0]['product_id']
        );
        self::assertSame(
            $recipeId,
            (int) $catalogueOverview['product_recipe_usages'][0]['recipe_id']
        );
        self::assertSame(
            'Crostata di mele',
            $catalogueOverview['product_recipe_usages'][0]['recipe_title']
        );
        $list = ['id' => 1];
        $longPackage = $app->handle($this->request('POST', '/v1/prices', [
            'product_id' => $product['id'], 'supermarket_id' => $market['id'], 'amount' => 2.49,
            'package_text' => str_repeat('x', 33),
        ], $csrf));
        self::assertSame(422, $longPackage->getStatusCode(), (string) $longPackage->getBody());
        self::assertSame('validation.length', $this->json($longPackage)['error']['code']);
        $price = $this->json($app->handle($this->request('POST', '/v1/prices', [
            'product_id' => $product['id'], 'supermarket_id' => $market['id'], 'amount' => 2.49,
        ], $csrf)))['item'];

        $deletedPrice = $app->handle($this->request(
            'DELETE',
            '/v1/shopping/catalog/prices/' . $price['id'],
            ['version' => $price['version']],
            $csrf
        ));
        self::assertSame(200, $deletedPrice->getStatusCode(), (string) $deletedPrice->getBody());

        $secondPrice = $this->json($app->handle($this->request('POST', '/v1/prices', [
            'product_id' => $product['id'], 'supermarket_id' => $market['id'], 'amount' => 2.29,
        ], $csrf)))['item'];
        self::assertGreaterThan(0, (int) $secondPrice['id']);
        $created = $this->json($app->handle($this->request('POST', '/v1/shopping/items', [
            'listId' => $list['id'], 'productId' => $product['id'],
            'supermarketId' => $market['id'], 'quantity' => '1 kg',
        ], $csrf)));
        $itemId = (int) $created['id'];
        $checked = $app->handle($this->request('PUT', '/v1/shopping/items/' . $itemId, [
            'checked' => true, 'quantity' => '1 kg', 'supermarketId' => $market['id'], 'version' => 1,
        ], $csrf));
        self::assertSame(200, $checked->getStatusCode(), (string) $checked->getBody());

        $cleared = $this->json($app->handle($this->request('POST', '/v1/shopping/items/clear-checked', [
            'listId' => $list['id'],
        ], $csrf)));
        self::assertSame(1, (int) $cleared['removed']);
        $pdo = $this->database()->pdo();
        self::assertSame(
            0,
            (int) $this->scalar('SELECT COUNT(*) FROM lh_shopping_items WHERE id = ' . $itemId)
        );

        $storageKey = str_repeat('a', 48) . '.blob';
        $storageFile = $this->storage()->path()
            . DIRECTORY_SEPARATOR . 'files' . DIRECTORY_SEPARATOR . $storageKey;
        file_put_contents($storageFile, 'temporary product image');
        $pdo->prepare(
            'INSERT INTO lh_attachments (household_id, owner_type, owner_id, original_name, storage_key, '
            . 'detected_mime, size_bytes, sha256, created_by, created_at) VALUES (1, ?, ?, ?, ?, ?, ?, ?, 1, ?)'
        )->execute([
            'product', $product['id'], 'product.png', $storageKey, 'image/png', 23,
            hash('sha256', 'temporary product image'), gmdate('Y-m-d H:i:s'),
        ]);

        $preserved = $this->json($app->handle($this->request('POST', '/v1/shopping/items', [
            'listId' => $list['id'], 'productId' => $product['id'],
            'supermarketId' => $market['id'], 'quantity' => '2 kg',
        ], $csrf)));
        $deletedProduct = $app->handle($this->request(
            'DELETE',
            '/v1/shopping/catalog/products/' . $product['id'],
            ['version' => $product['version']],
            $csrf
        ));
        self::assertSame(200, $deletedProduct->getStatusCode(), (string) $deletedProduct->getBody());
        self::assertSame(
            0,
            (int) $this->scalar('SELECT COUNT(*) FROM lh_products WHERE id = ' . (int) $product['id'])
        );
        self::assertSame(
            0,
            (int) $this->scalar('SELECT COUNT(*) FROM lh_prices WHERE product_id = ' . (int) $product['id'])
        );
        self::assertSame(
            0,
            (int) $this->scalar(
                "SELECT COUNT(*) FROM lh_attachments WHERE owner_type = 'product' AND owner_id = "
                . (int) $product['id']
            )
        );
        self::assertFileDoesNotExist($storageFile);
        self::assertNull(
            $this->scalar('SELECT product_id FROM lh_shopping_items WHERE id = ' . (int) $preserved['id'])
        );
        self::assertNull(
            $this->scalar('SELECT product_id FROM lh_recipe_ingredients WHERE recipe_id = ' . $recipeId)
        );
        self::assertSame(
            'Mele',
            $this->scalar('SELECT ingredient_name FROM lh_recipe_ingredients WHERE recipe_id = ' . $recipeId)
        );

        $movedProduct = $this->json($app->handle($this->request('POST', '/v1/products', [
            'name' => 'Pere', 'category_id' => $category['id'],
        ], $csrf)))['item'];
        $invalidReplacement = $app->handle($this->request(
            'DELETE',
            '/v1/shopping/catalog/categories/' . $category['id'],
            ['version' => $category['version'], 'replacementCategoryId' => $category['id']],
            $csrf
        ));
        self::assertSame(422, $invalidReplacement->getStatusCode(), (string) $invalidReplacement->getBody());

        $deletedCategory = $app->handle($this->request(
            'DELETE',
            '/v1/shopping/catalog/categories/' . $category['id'],
            [
                'version' => $category['version'],
                'replacementCategoryId' => $replacementCategory['id'],
            ],
            $csrf
        ));
        self::assertSame(200, $deletedCategory->getStatusCode(), (string) $deletedCategory->getBody());
        self::assertSame(
            (int) $replacementCategory['id'],
            (int) $this->scalar('SELECT category_id FROM lh_products WHERE id = ' . (int) $movedProduct['id'])
        );

        $deletedReplacement = $app->handle($this->request(
            'DELETE',
            '/v1/shopping/catalog/categories/' . $replacementCategory['id'],
            ['version' => $replacementCategory['version'], 'replacementCategoryId' => null],
            $csrf
        ));
        self::assertSame(200, $deletedReplacement->getStatusCode(), (string) $deletedReplacement->getBody());
        self::assertNull(
            $this->scalar('SELECT category_id FROM lh_products WHERE id = ' . (int) $movedProduct['id'])
        );

        $deletedMarket = $app->handle($this->request(
            'DELETE',
            '/v1/shopping/catalog/supermarkets/' . $market['id'],
            ['version' => $market['version']],
            $csrf
        ));
        self::assertSame(200, $deletedMarket->getStatusCode(), (string) $deletedMarket->getBody());
        self::assertSame(0, (int) $this->scalar('SELECT COUNT(*) FROM lh_categories'));
        self::assertSame(0, (int) $this->scalar('SELECT COUNT(*) FROM lh_supermarkets'));
    }

    public function testGoalAggregateReturnsPlanningTrackersAndDailyLogs(): void
    {
        $app = $this->app();
        $session = $this->json($app->handle($this->request('GET', '/v1/auth/session')));
        $login = $this->json($app->handle($this->request('POST', '/v1/auth/login', [
            'username' => 'admin', 'password' => 'integration-password',
        ], (string) $session['csrfToken'])));
        $csrf = (string) $login['csrfToken'];

        $childResponse = $app->handle($this->request('POST', '/v1/users', [
            'username' => 'goal.child', 'password' => 'goal-child-password', 'role' => 'child',
        ], $csrf));
        self::assertSame(201, $childResponse->getStatusCode(), (string) $childResponse->getBody());
        $childId = (int) $this->json($childResponse)['id'];
        $payload = [
            'title' => 'Allenarsi con costanza', 'description' => 'Tre volte a settimana',
            'startDate' => '2026-07-01', 'endDate' => '2026-08-31', 'ownerId' => $childId,
            'status' => 'active', 'trackers' => [
                ['id' => null, 'type' => 'percentage', 'frequency' => 'daily'],
                ['id' => null, 'type' => 'boolean', 'frequency' => 'daily'],
            ],
        ];
        $created = $app->handle($this->request('POST', '/v1/goals', $payload, $csrf));
        self::assertSame(201, $created->getStatusCode(), (string) $created->getBody());
        $goalId = (int) $this->json($created)['id'];

        $overview = $this->json($app->handle($this->request('GET', '/v1/goals/overview')));
        self::assertCount(1, $overview['goals']);
        self::assertSame('goal.child', $overview['goals'][0]['owner_name']);
        self::assertSame('2026-07-01', $overview['goals'][0]['start_date']);
        self::assertCount(2, $overview['goals'][0]['trackers']);
        $percentage = $overview['goals'][0]['trackers'][0];
        $boolean = $overview['goals'][0]['trackers'][1];

        $updatedPayload = $payload;
        $updatedPayload['description'] = 'Obiettivo aggiornato';
        $updatedPayload['version'] = 1;
        $updatedPayload['trackers'] = [
            ['id' => $percentage['id'], 'type' => 'percentage', 'frequency' => 'daily'],
            ['id' => $boolean['id'], 'type' => 'boolean', 'frequency' => 'daily'],
            ['id' => null, 'type' => 'quantity', 'frequency' => 'weekly'],
        ];
        $updated = $app->handle($this->request('PUT', '/v1/goals/' . $goalId, $updatedPayload, $csrf));
        self::assertSame(200, $updated->getStatusCode(), (string) $updated->getBody());

        foreach ([80, 85] as $value) {
            $logged = $app->handle($this->request(
                'POST',
                '/v1/goal-trackers/' . $percentage['id'] . '/log',
                ['date' => '2026-07-19', 'value' => $value, 'note' => 'Avanzamento'],
                $csrf
            ));
            self::assertSame(200, $logged->getStatusCode(), (string) $logged->getBody());
        }

        $childLogin = $this->json($app->handle($this->request('POST', '/v1/auth/login', [
            'username' => 'goal.child', 'password' => 'goal-child-password',
        ], $csrf)));
        $childCsrf = (string) $childLogin['csrfToken'];
        $childCreate = $app->handle($this->request('POST', '/v1/goals', $payload, $childCsrf));
        self::assertSame(403, $childCreate->getStatusCode());
        $childLog = $app->handle($this->request(
            'POST',
            '/v1/goal-trackers/' . $boolean['id'] . '/log',
            ['date' => '2026-07-19', 'value' => true, 'note' => 'Fatto'],
            $childCsrf
        ));
        self::assertSame(200, $childLog->getStatusCode(), (string) $childLog->getBody());

        $adminLogin = $this->json($app->handle($this->request('POST', '/v1/auth/login', [
            'username' => 'admin', 'password' => 'integration-password',
        ], $childCsrf)));
        $csrf = (string) $adminLogin['csrfToken'];
        $afterLogs = $this->json($app->handle($this->request('GET', '/v1/goals/overview')));
        self::assertCount(3, $afterLogs['goals'][0]['trackers']);
        self::assertCount(1, $afterLogs['goals'][0]['trackers'][0]['logs']);
        self::assertSame(85.0, (float) $afterLogs['goals'][0]['trackers'][0]['logs'][0]['value_number']);
        self::assertSame(1, (int) $afterLogs['goals'][0]['trackers'][1]['logs'][0]['value_boolean']);

        $deleted = $app->handle($this->request(
            'DELETE',
            '/v1/goals/' . $goalId,
            ['version' => 2],
            $csrf
        ));
        self::assertSame(200, $deleted->getStatusCode(), (string) $deleted->getBody());
        if ($this->database === null) {
            throw new RuntimeException('Temporary database was not initialized.');
        }
        $pdo = $this->database->pdo();
        self::assertSame(0, (int) $this->scalar('SELECT COUNT(*) FROM lh_goals'));
        self::assertSame(0, (int) $this->scalar('SELECT COUNT(*) FROM lh_trackers'));
        self::assertSame(0, (int) $this->scalar('SELECT COUNT(*) FROM lh_goal_logs'));
    }

    public function testRecipeAggregateJourneyPreservesMetadataAndIngredients(): void
    {
        $app = $this->app();
        $session = $this->json($app->handle($this->request('GET', '/v1/auth/session')));
        $login = $this->json($app->handle($this->request('POST', '/v1/auth/login', [
            'username' => 'admin', 'password' => 'integration-password',
        ], (string) $session['csrfToken'])));
        $csrf = (string) $login['csrfToken'];

        $category = $this->json($app->handle($this->request('POST', '/v1/categories', [
            'name' => 'Pasta',
        ], $csrf)))['item'];
        $product = $this->json($app->handle($this->request('POST', '/v1/products', [
            'name' => 'Spaghetti', 'category_id' => $category['id'],
        ], $csrf)))['item'];
        $payload = [
            'title' => 'Spaghetti di casa', 'category' => 'Primo', 'description' => 'Ricetta test',
            'instructions' => 'Cuocere e condire.', 'prepTimeMinutes' => 20, 'servings' => 4,
            'difficulty' => 'bassa',
            'ingredients' => [
                ['productId' => $product['id'], 'name' => '', 'quantity' => '200 g'],
                ['productId' => null, 'name' => 'Sale', 'quantity' => 'q.b.'],
            ],
        ];
        $invalidPayload = $payload;
        $invalidPayload['servings'] = 101;
        $invalid = $app->handle($this->request('POST', '/v1/recipes', $invalidPayload, $csrf));
        self::assertSame(422, $invalid->getStatusCode(), (string) $invalid->getBody());
        self::assertSame('recipe.servings_invalid', $this->json($invalid)['error']['code']);

        $created = $app->handle($this->request('POST', '/v1/recipes', $payload, $csrf));
        self::assertSame(201, $created->getStatusCode(), (string) $created->getBody());
        $id = (int) $this->json($created)['id'];

        $overview = $this->json($app->handle($this->request('GET', '/v1/recipes/overview')));
        self::assertCount(1, $overview['recipes']);
        self::assertSame((int) $category['id'], (int) $overview['products'][0]['category_id']);
        self::assertSame('Pasta', $overview['productCategories'][0]['name']);
        self::assertSame(20, (int) $overview['recipes'][0]['prep_time_minutes']);
        self::assertSame(4, $overview['recipes'][0]['servings']);
        self::assertSame('bassa', $overview['recipes'][0]['difficulty']);
        self::assertSame(2, (int) $overview['recipes'][0]['ingredient_count']);

        $detail = $this->json($app->handle($this->request('GET', '/v1/recipes/' . $id)))['item'];
        self::assertCount(2, $detail['ingredients']);
        self::assertSame(4, $detail['servings']);
        self::assertSame('Spaghetti', $detail['ingredients'][0]['ingredient_name']);
        self::assertTrue($detail['can_edit']);

        $duplicateIngredients = $payload;
        $duplicateIngredients['ingredients'] = [
            ['productId' => $product['id'], 'name' => '', 'quantity' => '200 g'],
            ['productId' => $product['id'], 'name' => '', 'quantity' => '100 g'],
        ];
        $duplicateResponse = $app->handle($this->request('POST', '/v1/recipes', $duplicateIngredients, $csrf));
        self::assertSame(422, $duplicateResponse->getStatusCode(), (string) $duplicateResponse->getBody());
        self::assertSame('recipe.ingredient_duplicate', $this->json($duplicateResponse)['error']['code']);

        $payload['title'] = 'Spaghetti aggiornati';
        $payload['servings'] = 6;
        $payload['version'] = 1;
        $payload['ingredients'] = [['productId' => null, 'name' => 'Pasta', 'quantity' => '250 g']];
        $updated = $app->handle($this->request('PUT', '/v1/recipes/' . $id, $payload, $csrf));
        self::assertSame(200, $updated->getStatusCode(), (string) $updated->getBody());
        $afterUpdate = $this->json($app->handle($this->request('GET', '/v1/recipes/' . $id)))['item'];
        self::assertSame('Spaghetti aggiornati', $afterUpdate['title']);
        self::assertSame(6, $afterUpdate['servings']);
        self::assertCount(1, $afterUpdate['ingredients']);

        $archived = $app->handle($this->request('POST', '/v1/recipes/' . $id . '/archive', [
            'version' => 2,
        ], $csrf));
        self::assertSame(200, $archived->getStatusCode(), (string) $archived->getBody());
        $afterArchive = $this->json($app->handle($this->request('GET', '/v1/recipes/overview')));
        self::assertCount(0, $afterArchive['recipes']);
    }

    public function testInventoryJourneyUsesNamedRelationsDatesAndNonNegativeQuantity(): void
    {
        $app = $this->app();
        $session = $this->json($app->handle($this->request('GET', '/v1/auth/session')));
        $login = $this->json($app->handle($this->request('POST', '/v1/auth/login', [
            'username' => 'admin', 'password' => 'integration-password',
        ], (string) $session['csrfToken'])));
        $csrf = (string) $login['csrfToken'];
        $documentResponse = $app->handle($this->multipartRequest('POST', '/v1/documents', [
            'title' => 'Ricevuta trapano', 'category' => 'Garanzie', 'notes' => '',
        ], $csrf));
        self::assertSame(201, $documentResponse->getStatusCode(), (string) $documentResponse->getBody());
        $document = ['id' => (int) $this->json($documentResponse)['id']];

        $initialInventory = $this->json($app->handle($this->request('GET', '/v1/inventory/overview')));
        self::assertCount(5, $initialInventory['categories']);
        $categoriesByName = [];
        foreach ($initialInventory['categories'] as $category) {
            $categoriesByName[(string) $category['name']] = $category;
        }
        $toolsCategoryId = (int) $categoriesByName['Attrezzi']['id'];
        $fallbackCategoryId = (int) $categoriesByName['Altro']['id'];

        $customCategory = $app->handle($this->request('POST', '/v1/inventory/categories', [
            'name' => 'Cantina',
        ], $csrf));
        self::assertSame(201, $customCategory->getStatusCode(), (string) $customCategory->getBody());
        $customCategoryId = (int) $this->json($customCategory)['id'];
        $renamedCategory = $app->handle($this->request(
            'PUT',
            '/v1/inventory/categories/' . $customCategoryId,
            ['name' => 'Casa e cantina', 'version' => 1],
            $csrf
        ));
        self::assertSame(200, $renamedCategory->getStatusCode(), (string) $renamedCategory->getBody());

        $invalid = $app->handle($this->request('POST', '/v1/inventory', [
            'name' => 'Trapano', 'categoryId' => $toolsCategoryId, 'quantity' => -1,
        ], $csrf));
        self::assertSame(422, $invalid->getStatusCode());

        $payload = [
            'name' => 'Trapano', 'categoryId' => $toolsCategoryId, 'location' => 'Garage',
            'ownerId' => 1, 'documentId' => $document['id'], 'quantity' => 1, 'unit' => 'pz',
            'purchaseDate' => '2026-01-10', 'warrantyExpiry' => '2028-01-10', 'notes' => 'Con valigetta',
        ];
        $created = $app->handle($this->request('POST', '/v1/inventory', $payload, $csrf));
        self::assertSame(201, $created->getStatusCode(), (string) $created->getBody());
        $id = (int) $this->json($created)['id'];

        $frontUpload = $app->handle($this->multipartRequest('POST', '/v1/attachments', [
            'ownerType' => 'inventory', 'ownerId' => $id,
        ], $csrf, 'trapano-fronte.png'));
        self::assertSame(201, $frontUpload->getStatusCode(), (string) $frontUpload->getBody());
        $frontImageId = (int) $this->json($frontUpload)['item']['id'];
        $frontStorageKey = (string) $this->scalar(
            'SELECT storage_key FROM lh_attachments WHERE id = ' . $frontImageId
        );
        $frontStoragePath = $this->storage()->path()
            . DIRECTORY_SEPARATOR . 'files' . DIRECTORY_SEPARATOR . $frontStorageKey;
        self::assertFileExists($frontStoragePath);
        $backUpload = $app->handle($this->multipartRequest('POST', '/v1/attachments', [
            'ownerType' => 'inventory', 'ownerId' => $id,
        ], $csrf, 'trapano-retro.png'));
        self::assertSame(201, $backUpload->getStatusCode(), (string) $backUpload->getBody());

        $overview = $this->json($app->handle($this->request('GET', '/v1/inventory/overview')));
        self::assertCount(1, $overview['items']);
        self::assertSame('admin', $overview['items'][0]['owner_name']);
        self::assertSame('Ricevuta trapano', $overview['items'][0]['document_title']);
        self::assertSame('Attrezzi', $overview['items'][0]['category_name']);
        self::assertSame($toolsCategoryId, (int) $overview['items'][0]['category_id']);
        $backImageId = (int) $this->json($backUpload)['item']['id'];
        $backStorageKey = (string) $this->scalar(
            'SELECT storage_key FROM lh_attachments WHERE id = ' . $backImageId
        );
        $backStoragePath = $this->storage()->path()
            . DIRECTORY_SEPARATOR . 'files' . DIRECTORY_SEPARATOR . $backStorageKey;
        self::assertFileExists($backStoragePath);

        self::assertTrue($overview['can_manage']);
        self::assertSame(
            ['trapano-fronte.png', 'trapano-retro.png'],
            array_column($overview['items'][0]['images'], 'name')
        );

        self::assertSame(1, (int) $overview['active_count']);
        self::assertSame(0, (int) $overview['archived_count']);
        $payload['ownerId'] = null;
        $payload['documentId'] = null;
        $payload['quantity'] = 2.5;
        $payload['version'] = 1;
        $updated = $app->handle($this->request('PUT', '/v1/inventory/' . $id, $payload, $csrf));
        self::assertSame(200, $updated->getStatusCode(), (string) $updated->getBody());
        $detail = $this->json($app->handle($this->request('GET', '/v1/inventory/' . $id)))['item'];
        self::assertNull($detail['owner_id']);
        self::assertSame(2.5, (float) $detail['quantity']);
        self::assertSame('2028-01-10', $detail['warranty_expiry']);
        self::assertCount(2, $detail['images']);
        self::assertSame((int) $detail['images'][1]['id'], (int) $detail['image_attachment_id']);

        $deletedImage = $app->handle($this->request(
            'DELETE',
            '/v1/inventory/' . $id . '/images/' . $frontImageId,
            ['version' => 2],
            $csrf
        ));
        self::assertSame(200, $deletedImage->getStatusCode(), (string) $deletedImage->getBody());
        self::assertFileDoesNotExist($frontStoragePath);
        $afterImageDelete = $this->json(
            $app->handle($this->request('GET', '/v1/inventory/' . $id))
        )['item'];
        self::assertSame(['trapano-retro.png'], array_column($afterImageDelete['images'], 'name'));
        self::assertSame(3, (int) $afterImageDelete['version']);

        $archived = $app->handle($this->request('POST', '/v1/inventory/' . $id . '/archive', [
            'version' => 3,
        ], $csrf));
        self::assertSame(200, $archived->getStatusCode(), (string) $archived->getBody());
        $afterArchive = $this->json($app->handle($this->request('GET', '/v1/inventory/overview')));
        self::assertCount(0, $afterArchive['items']);
        self::assertSame(0, (int) $afterArchive['active_count']);
        self::assertSame(1, (int) $afterArchive['archived_count']);

        $archiveOverview = $this->json(
            $app->handle($this->request('GET', '/v1/inventory/overview?archived=1'))
        );
        self::assertCount(1, $archiveOverview['items']);
        self::assertNotNull($archiveOverview['items'][0]['archived_at']);
        self::assertSame(1, (int) $archiveOverview['items'][0]['image_count']);
        self::assertSame(['trapano-retro.png'], array_column($archiveOverview['items'][0]['images'], 'name'));

        $restored = $app->handle($this->request('POST', '/v1/inventory/' . $id . '/restore', [
            'version' => 4,
        ], $csrf));
        self::assertSame(200, $restored->getStatusCode(), (string) $restored->getBody());
        $afterRestore = $this->json($app->handle($this->request('GET', '/v1/inventory/overview')));
        self::assertCount(1, $afterRestore['items']);
        self::assertSame(1, (int) $afterRestore['active_count']);
        self::assertSame(0, (int) $afterRestore['archived_count']);
        self::assertSame(5, (int) $afterRestore['items'][0]['version']);

        $archivedAgain = $app->handle($this->request('POST', '/v1/inventory/' . $id . '/archive', [
            'version' => 5,
        ], $csrf));
        self::assertSame(200, $archivedAgain->getStatusCode(), (string) $archivedAgain->getBody());

        $staleDelete = $app->handle($this->request(
            'DELETE',
            '/v1/inventory/' . $id,
            ['version' => 5],
            $csrf
        ));
        self::assertSame(409, $staleDelete->getStatusCode(), (string) $staleDelete->getBody());
        self::assertFileExists($backStoragePath);

        $deleted = $app->handle($this->request(
            'DELETE',
            '/v1/inventory/' . $id,
            ['version' => 6],
            $csrf
        ));
        self::assertSame(200, $deleted->getStatusCode(), (string) $deleted->getBody());
        self::assertFileDoesNotExist($backStoragePath);
        self::assertSame(
            0,
            (int) $this->scalar('SELECT COUNT(*) FROM lh_inventory WHERE id = ' . $id)
        );
        self::assertSame(
            0,
            (int) $this->scalar(
                "SELECT COUNT(*) FROM lh_attachments WHERE owner_type = 'inventory' AND owner_id = " . $id
            )
        );
        self::assertSame(1, (int) $this->scalar('SELECT COUNT(*) FROM lh_documents'));

        $activeCreated = $app->handle($this->request('POST', '/v1/inventory', [
            'name' => 'Seghetto',
            'categoryId' => $customCategoryId,
        ], $csrf));
        self::assertSame(201, $activeCreated->getStatusCode(), (string) $activeCreated->getBody());
        $activeId = (int) $this->json($activeCreated)['id'];
        $deletedCategory = $app->handle($this->request(
            'DELETE',
            '/v1/inventory/categories/' . $customCategoryId,
            ['version' => 2],
            $csrf
        ));
        self::assertSame(200, $deletedCategory->getStatusCode(), (string) $deletedCategory->getBody());
        self::assertSame(1, (int) $this->json($deletedCategory)['movedItems']);
        $reassigned = $this->json($app->handle($this->request('GET', '/v1/inventory/' . $activeId)))['item'];
        self::assertSame($fallbackCategoryId, (int) $reassigned['category_id']);
        self::assertSame('Altro', $reassigned['category_name']);
        self::assertSame(2, (int) $reassigned['version']);
        $fallbackDelete = $app->handle($this->request(
            'DELETE',
            '/v1/inventory/categories/' . $fallbackCategoryId,
            ['version' => 1],
            $csrf
        ));
        self::assertSame(422, $fallbackDelete->getStatusCode(), (string) $fallbackDelete->getBody());
        $activeDeleted = $app->handle($this->request(
            'DELETE',
            '/v1/inventory/' . $activeId,
            ['version' => 2],
            $csrf
        ));
        self::assertSame(200, $activeDeleted->getStatusCode(), (string) $activeDeleted->getBody());
        self::assertSame(
            0,
            (int) $this->scalar('SELECT COUNT(*) FROM lh_inventory WHERE id = ' . $activeId)
        );
    }

    public function testDocumentArchivePreservesMetadataMultiplePrivateFilesAndPhysicalDeletion(): void
    {
        if ($this->database === null) {
            throw new RuntimeException('Temporary database was not initialized.');
        }

        $app = $this->app();
        $session = $this->json($app->handle($this->request('GET', '/v1/auth/session')));
        $login = $this->json($app->handle($this->request('POST', '/v1/auth/login', [
            'username' => 'admin', 'password' => 'integration-password',
        ], (string) $session['csrfToken'])));
        $csrf = (string) $login['csrfToken'];

        $missingFile = $app->handle($this->request('POST', '/v1/documents', [
            'title' => 'Senza file', 'category' => 'Altro', 'notes' => '',
        ], $csrf));
        self::assertSame(422, $missingFile->getStatusCode());

        $created = $app->handle($this->multipartRequest('POST', '/v1/documents', [
            'title' => 'Contratto affitto', 'category' => 'Contratti',
            'notes' => "Rinnovo annuale\nFirmato",
        ], $csrf, 'contratto.png'));
        self::assertSame(201, $created->getStatusCode(), (string) $created->getBody());
        $id = (int) $this->json($created)['id'];

        $overview = $this->json($app->handle($this->request('GET', '/v1/documents/overview')));
        self::assertCount(1, $overview['documents']);
        self::assertSame(['Contratti'], $overview['categories']);
        self::assertSame('Contratto affitto', $overview['documents'][0]['title']);
        self::assertSame("Rinnovo annuale\nFirmato", $overview['documents'][0]['description']);
        self::assertSame('contratto.png', $overview['documents'][0]['attachment_name']);
        self::assertSame('image/png', $overview['documents'][0]['attachment_mime']);
        self::assertCount(1, $overview['documents'][0]['attachments']);
        self::assertSame('contratto.png', $overview['documents'][0]['attachments'][0]['name']);
        self::assertSame('admin', $overview['documents'][0]['owner_name']);
        self::assertTrue($overview['documents'][0]['can_edit']);
        $attachmentId = (int) $overview['documents'][0]['attachment_id'];

        $download = $app->handle($this->request(
            'GET',
            '/v1/attachments/' . $attachmentId . '/download?inline=1'
        ));
        self::assertSame(200, $download->getStatusCode(), (string) $download->getBody());
        self::assertSame('image/png', $download->getHeaderLine('Content-Type'));
        self::assertStringStartsWith('inline;', $download->getHeaderLine('Content-Disposition'));

        $updated = $app->handle($this->multipartRequest('POST', '/v1/documents/' . $id, [
            'title' => 'Contratto aggiornato', 'category' => 'Contratti',
            'notes' => 'Nuove condizioni', 'version' => 1,
        ], $csrf, null));
        self::assertSame(200, $updated->getStatusCode(), (string) $updated->getBody());
        $extended = $app->handle($this->multipartRequest('POST', '/v1/documents/' . $id, [
            'title' => 'Contratto aggiornato', 'category' => 'Certificati',
            'notes' => 'Nuove condizioni', 'version' => 2,
        ], $csrf, ['contratto-fronte.png', 'contratto-retro.png']));
        self::assertSame(200, $extended->getStatusCode(), (string) $extended->getBody());
        $detail = $this->json($app->handle($this->request('GET', '/v1/documents/' . $id)))['item'];
        self::assertSame('Contratto aggiornato', $detail['title']);
        self::assertSame('Certificati', $detail['category_text']);
        self::assertSame('contratto-retro.png', $detail['attachment_name']);
        self::assertSame(
            ['contratto.png', 'contratto-fronte.png', 'contratto-retro.png'],
            array_column($detail['attachments'], 'name')
        );
        self::assertSame(3, (int) $detail['version']);
        self::assertSame(
            3,
            (int) $this->scalar(
                "SELECT COUNT(*) FROM lh_attachments WHERE owner_type = 'document' AND owner_id = " . $id
            )
        );

        $attachmentToDelete = $detail['attachments'][1];
        $deletedAttachmentId = (int) $attachmentToDelete['id'];
        $deletedStorageKey = (string) $this->scalar(
            'SELECT storage_key FROM lh_attachments WHERE id = ' . $deletedAttachmentId
        );
        $deletedStoragePath = $this->storage()->path()
            . DIRECTORY_SEPARATOR . 'files' . DIRECTORY_SEPARATOR . $deletedStorageKey;
        self::assertFileExists($deletedStoragePath);

        $staleFileDelete = $app->handle($this->request(
            'DELETE',
            '/v1/documents/' . $id . '/attachments/' . $deletedAttachmentId,
            ['version' => 2],
            $csrf
        ));
        self::assertSame(409, $staleFileDelete->getStatusCode(), (string) $staleFileDelete->getBody());
        self::assertFileExists($deletedStoragePath);

        $deletedFile = $app->handle($this->request(
            'DELETE',
            '/v1/documents/' . $id . '/attachments/' . $deletedAttachmentId,
            ['version' => 3],
            $csrf
        ));
        self::assertSame(200, $deletedFile->getStatusCode(), (string) $deletedFile->getBody());
        self::assertFileDoesNotExist($deletedStoragePath);
        $afterFileDelete = $this->json(
            $app->handle($this->request('GET', '/v1/documents/' . $id))
        )['item'];
        self::assertSame(
            ['contratto.png', 'contratto-retro.png'],
            array_column($afterFileDelete['attachments'], 'name')
        );
        self::assertSame(4, (int) $afterFileDelete['version']);

        $now = gmdate('Y-m-d H:i:s');
        $fallbackCategoryId = (int) $this->scalar(
            'SELECT id FROM lh_inventory_categories WHERE household_id = 1 AND is_fallback = 1'
        );
        $this->database()->pdo()->prepare(
            'INSERT INTO lh_inventory (household_id, document_id, category_id, name, name_search, status, '
            . 'created_by, created_at, updated_at) VALUES (1, ?, ?, ?, ?, ?, 1, ?, ?)'
        )->execute([$id, $fallbackCategoryId, 'Scatola contratto', 'scatola contratto', 'active', $now, $now]);

        $deleted = $app->handle($this->request('DELETE', '/v1/documents/' . $id, ['version' => 4], $csrf));
        self::assertSame(200, $deleted->getStatusCode(), (string) $deleted->getBody());
        self::assertSame(0, (int) $this->scalar('SELECT COUNT(*) FROM lh_documents'));
        self::assertSame(
            0,
            (int) $this->scalar("SELECT COUNT(*) FROM lh_attachments WHERE owner_type = 'document'")
        );
        $inventory = $this->row('SELECT document_id FROM lh_inventory');
        self::assertNull($inventory['document_id']);
    }

    public function testNoteJourneyPreservesColorPinAuthorAndArchive(): void
    {
        $app = $this->app();
        $session = $this->json($app->handle($this->request('GET', '/v1/auth/session')));
        $login = $this->json($app->handle($this->request('POST', '/v1/auth/login', [
            'username' => 'admin', 'password' => 'integration-password',
        ], (string) $session['csrfToken'])));
        $csrf = (string) $login['csrfToken'];

        $empty = $app->handle($this->request('POST', '/v1/notes', [
            'title' => '', 'body' => '', 'color' => '#27ae60', 'pinned' => false,
        ], $csrf));
        self::assertSame(422, $empty->getStatusCode());

        $created = $app->handle($this->request('POST', '/v1/notes', [
            'title' => 'WiFi piano', 'body' => 'password protetta',
            'color' => '#27ae60', 'pinned' => false,
        ], $csrf));
        self::assertSame(201, $created->getStatusCode(), (string) $created->getBody());
        $id = (int) $this->json($created)['id'];

        $overview = $this->json($app->handle($this->request('GET', '/v1/notes/overview')));
        self::assertCount(1, $overview['items']);
        self::assertSame('admin', $overview['items'][0]['author_name']);
        self::assertSame('#27ae60', $overview['items'][0]['color_hex']);
        self::assertSame(0, (int) $overview['items'][0]['is_pinned']);
        self::assertTrue($overview['items'][0]['can_edit']);

        $pinned = $app->handle($this->request('POST', '/v1/notes/' . $id . '/pin', [
            'version' => 1, 'pinned' => true,
        ], $csrf));
        self::assertSame(200, $pinned->getStatusCode(), (string) $pinned->getBody());

        $updated = $app->handle($this->request('PUT', '/v1/notes/' . $id, [
            'title' => 'WiFi aggiornato', 'body' => 'contenuto aggiornato',
            'color' => '#2980b9', 'pinned' => true, 'version' => 2,
        ], $csrf));
        self::assertSame(200, $updated->getStatusCode(), (string) $updated->getBody());
        $detail = $this->json($app->handle($this->request('GET', '/v1/notes/' . $id)))['item'];
        self::assertSame('WiFi aggiornato', $detail['title']);
        self::assertSame('#2980b9', $detail['color_hex']);
        self::assertSame(1, (int) $detail['is_pinned']);

        $archived = $app->handle($this->request('POST', '/v1/notes/' . $id . '/archive', [
            'version' => 3,
        ], $csrf));
        self::assertSame(200, $archived->getStatusCode(), (string) $archived->getBody());
        $active = $this->json($app->handle($this->request('GET', '/v1/notes/overview')));
        self::assertCount(0, $active['items']);
        $archive = $this->json($app->handle($this->request('GET', '/v1/notes/overview?archived=1')));
        self::assertCount(1, $archive['items']);

        $restored = $app->handle($this->request('POST', '/v1/notes/' . $id . '/restore', [
            'version' => 4,
        ], $csrf));
        self::assertSame(200, $restored->getStatusCode(), (string) $restored->getBody());
        $afterRestore = $this->json($app->handle($this->request('GET', '/v1/notes/overview')));
        self::assertCount(1, $afterRestore['items']);
    }

    public function testChildOnlyReadsAndChangesOwnNotes(): void
    {
        if ($this->database === null) {
            throw new RuntimeException('Temporary database was not initialized.');
        }
        $pdo = $this->database->pdo();
        $now = gmdate('Y-m-d H:i:s');
        $pdo->prepare(
            'INSERT INTO lh_users '
            . '(id, household_id, username, username_key, password_hash, role, status, created_at, updated_at) '
            . "VALUES (2, 1, 'child', 'child', ?, 'child', 'active', ?, ?)"
        )->execute([password_hash('child-password-123', PASSWORD_BCRYPT), $now, $now]);
        $pdo->prepare(
            'INSERT INTO lh_notes '
            . '(id, household_id, title, title_search, body, visibility, color_hex, is_pinned, '
            . 'created_by, created_at, updated_by, updated_at) '
            . "VALUES (10, 1, 'Nota admin', 'nota admin', 'privata', 'household', '#1e1e1e', 0, 1, ?, 1, ?)"
        )->execute([$now, $now]);

        $app = $this->app();
        $session = $this->json($app->handle($this->request('GET', '/v1/auth/session')));
        $login = $this->json($app->handle($this->request('POST', '/v1/auth/login', [
            'username' => 'child', 'password' => 'child-password-123',
        ], (string) $session['csrfToken'])));
        $csrf = (string) $login['csrfToken'];

        $initial = $this->json($app->handle($this->request('GET', '/v1/notes/overview')));
        self::assertCount(0, $initial['items']);
        self::assertCount(1, $initial['members']);
        $hidden = $app->handle($this->request('GET', '/v1/notes/10'));
        self::assertSame(404, $hidden->getStatusCode());

        $created = $app->handle($this->request('POST', '/v1/notes', [
            'title' => 'Nota child', 'body' => '', 'color' => '#8e44ad', 'pinned' => true,
        ], $csrf));
        self::assertSame(201, $created->getStatusCode(), (string) $created->getBody());
        $own = $this->json($app->handle($this->request('GET', '/v1/notes/overview')));
        self::assertCount(1, $own['items']);
        self::assertSame('child', $own['items'][0]['author_name']);
        self::assertTrue($own['items'][0]['can_edit']);
    }

    public function testMealPlannerBuildsWeeksAndExportsIngredientsOnce(): void
    {
        $app = $this->app();
        $session = $this->json($app->handle($this->request('GET', '/v1/auth/session')));
        $login = $this->json($app->handle($this->request('POST', '/v1/auth/login', [
            'username' => 'admin', 'password' => 'integration-password',
        ], (string) $session['csrfToken'])));
        $csrf = (string) $login['csrfToken'];

        $category = $this->json($app->handle($this->request('POST', '/v1/categories', [
            'name' => 'Pasta',
        ], $csrf)))['item'];
        $product = $this->json($app->handle($this->request('POST', '/v1/products', [
            'name' => 'Spaghetti', 'category_id' => $category['id'],
        ], $csrf)))['item'];
        $list = ['id' => 1];
        $recipeResponse = $app->handle($this->request('POST', '/v1/recipes', [
            'title' => 'Spaghetti al pomodoro', 'category' => 'Primo', 'description' => '',
            'instructions' => 'Cuocere.', 'prepTimeMinutes' => 20, 'difficulty' => 'bassa',
            'ingredients' => [
                ['productId' => $product['id'], 'name' => 'Spaghetti', 'quantity' => '400 g'],
                ['productId' => null, 'name' => 'Sale', 'quantity' => 'q.b.'],
            ],
        ], $csrf));
        self::assertSame(201, $recipeResponse->getStatusCode(), (string) $recipeResponse->getBody());
        $recipeId = (int) $this->json($recipeResponse)['id'];

        $created = $app->handle($this->request('POST', '/v1/meals', [
            'date' => '2026-07-21', 'type' => 'dinner', 'description' => 'Cena italiana',
            'notes' => 'Con ospiti', 'servings' => 4, 'recipeIds' => [$recipeId],
        ], $csrf));
        self::assertSame(201, $created->getStatusCode(), (string) $created->getBody());
        $mealId = (int) $this->json($created)['id'];

        $duplicate = $app->handle($this->request('POST', '/v1/meals', [
            'date' => '2026-07-21', 'type' => 'dinner', 'description' => 'Altro',
            'notes' => '', 'servings' => null, 'recipeIds' => [],
        ], $csrf));
        self::assertSame(409, $duplicate->getStatusCode());

        $overview = $this->json($app->handle($this->request(
            'GET',
            '/v1/meals/overview?start=2026-07-20&end=2026-07-26'
        )));
        self::assertCount(1, $overview['meals']);
        self::assertSame('Con ospiti', $overview['meals'][0]['notes']);
        self::assertSame(4, (int) $overview['meals'][0]['servings']);
        self::assertSame('Spaghetti al pomodoro', $overview['meals'][0]['recipes'][0]['title']);
        self::assertSame((int) $list['id'], (int) $overview['primaryListId']);

        $preview = $this->json($app->handle($this->request('POST', '/v1/meals/shopping-preview', [
            'mealIds' => [$mealId],
        ], $csrf)));
        self::assertCount(1, $preview['items']);
        self::assertSame('Spaghetti', $preview['items'][0]['name']);
        self::assertSame('400 g', $preview['items'][0]['quantity']);
        self::assertCount(1, $preview['unresolved']);

        $generateRequest = $this->request('POST', '/v1/meals/generate-shopping', [
            'listId' => $list['id'], 'mealIds' => [$mealId],
        ], $csrf)->withHeader('Idempotency-Key', 'meal-planner-test-0001');
        $generated = $app->handle($generateRequest);
        self::assertSame(201, $generated->getStatusCode(), (string) $generated->getBody());
        self::assertSame(1, (int) $this->json($generated)['createdItems']);

        $afterExport = $this->json($app->handle($this->request('POST', '/v1/meals/shopping-preview', [
            'mealIds' => [$mealId],
        ], $csrf)));
        self::assertCount(0, $afterExport['items']);
        self::assertCount(1, $afterExport['unresolved']);

        $delete = $app->handle($this->request('DELETE', '/v1/meals/' . $mealId, ['version' => 1], $csrf));
        self::assertSame(200, $delete->getStatusCode(), (string) $delete->getBody());
        self::assertSame(
            1,
            (int) $this->scalar(
                'SELECT COUNT(*) FROM lh_shopping_items WHERE product_id = ' . (int) $product['id']
            )
        );
    }

    private function database(): TemporaryDatabase
    {
        if ($this->database === null) {
            throw new RuntimeException('Temporary database was not initialized.');
        }
        return $this->database;
    }

    private function storage(): TemporaryStorage
    {
        if ($this->storage === null) {
            throw new RuntimeException('Temporary storage was not initialized.');
        }
        return $this->storage;
    }

    /** @return mixed */
    private function scalar(string $sql)
    {
        $statement = $this->database()->pdo()->query($sql);
        if ($statement === false) {
            throw new RuntimeException('Cannot execute an integration-test scalar query.');
        }
        return $statement->fetchColumn();
    }

    /** @return array<string, mixed> */
    private function row(string $sql): array
    {
        $statement = $this->database()->pdo()->query($sql);
        if ($statement === false) {
            throw new RuntimeException('Cannot execute an integration-test row query.');
        }
        $row = $statement->fetch();
        if (!is_array($row)) {
            throw new RuntimeException('Expected an integration-test database row.');
        }
        return $row;
    }

    /** @return \Slim\App<ContainerInterface|null> */
    private function app(): \Slim\App
    {
        if ($this->database === null || $this->storage === null) {
            throw new RuntimeException('Test environment was not initialized.');
        }
        $settings = Settings::fromArray([
            'environment' => 'test',
            'basePath' => '',
            'siteName' => 'Configured test hub',
            'dbName' => $this->database->name(),
            'dbUser' => 'test-runner',
            'storagePath' => $this->storage->path(),
        ]);
        return ApplicationFactory::create($settings, $this->database->pdo());
    }

    /** @param array<string, mixed>|null $body */
    private function request(
        string $method,
        string $path,
        ?array $body = null,
        string $csrf = ''
    ): ServerRequestInterface {
        $request = (new ServerRequestFactory())->createServerRequest($method, '/api' . $path);
        if ($body !== null) {
            $json = json_encode($body, JSON_THROW_ON_ERROR);
            $request = $request->withHeader('Content-Type', 'application/json')
                ->withBody((new StreamFactory())->createStream($json));
        }
        return $csrf === '' ? $request : $request->withHeader('X-CSRF-Token', $csrf);
    }

    /**
     * @param array<string, mixed> $body
     * @param string|list<string>|null $fileNames
     */
    private function multipartRequest(
        string $method,
        string $path,
        array $body,
        string $csrf,
        $fileNames = 'document.png'
    ): ServerRequestInterface {
        $request = (new ServerRequestFactory())->createServerRequest($method, '/api' . $path)
            ->withParsedBody($body);
        if ($fileNames !== null) {
            $content = base64_decode(
                'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
                true
            );
            if (!is_string($content)) {
                throw new RuntimeException('Cannot prepare the document fixture.');
            }
            $names = is_array($fileNames) ? $fileNames : [$fileNames];
            $uploads = [];
            foreach ($names as $fileName) {
                $temporary = tempnam(sys_get_temp_dir(), 'lifehub-document-');
                if ($temporary === false || file_put_contents($temporary, $content) === false) {
                    throw new RuntimeException('Cannot write the document fixture.');
                }
                $uploads[] = new UploadedFile(
                    $temporary,
                    $fileName,
                    'image/png',
                    strlen($content),
                    UPLOAD_ERR_OK
                );
            }
            $request = $request->withUploadedFiles(is_array($fileNames)
                ? ['files' => $uploads]
                : ['file' => $uploads[0]]);
        }
        return $request->withHeader('X-CSRF-Token', $csrf);
    }

    /** @return array<string, mixed> */
    private function json(ResponseInterface $response): array
    {
        $decoded = json_decode((string) $response->getBody(), true, 512, JSON_THROW_ON_ERROR);
        if (!is_array($decoded)) {
            throw new RuntimeException('Expected a JSON object.');
        }
        return $decoded;
    }
}
