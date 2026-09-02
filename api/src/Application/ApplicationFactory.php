<?php

/**
 * Composes the Slim API, middleware order, repositories, and versioned routes.
 */

declare(strict_types=1);

namespace LifeHub\Application;

use LifeHub\Attachments\AttachmentController;
use LifeHub\Attachments\AttachmentPolicy;
use LifeHub\Attachments\AttachmentRepository;
use LifeHub\Attachments\StorageGateway;
use LifeHub\Documents\DocumentController;
use LifeHub\Documents\DocumentRepository;
use LifeHub\Identity\AuthController;
use LifeHub\Identity\AuthService;
use LifeHub\Identity\UserController;
use LifeHub\Identity\UserRepository;
use LifeHub\Home\DashboardController;
use LifeHub\Home\HomeSettingsController;
use LifeHub\Home\HomeSettingsRepository;
use LifeHub\Goals\GoalController;
use LifeHub\Goals\GoalRepository;
use LifeHub\Inventory\InventoryController;
use LifeHub\Inventory\InventoryRepository;
use LifeHub\Meals\MealController;
use LifeHub\Meals\MealRepository;
use LifeHub\Notes\NoteController;
use LifeHub\Notes\NoteRepository;
use LifeHub\Shared\Audit\AuditLogger;
use LifeHub\Shared\Auth\AuthenticationMiddleware;
use LifeHub\Shared\Config\Settings;
use LifeHub\Shared\Crud\ResourceController;
use LifeHub\Shared\Crud\ResourceDefinition;
use LifeHub\Shared\Crud\ResourceRepository;
use LifeHub\Shared\Http\ApiExceptionMiddleware;
use LifeHub\Shared\Http\CorrelationIdMiddleware;
use LifeHub\Shared\Http\CsrfMiddleware;
use LifeHub\Shared\Http\JsonResponder;
use LifeHub\Shared\Http\SessionMiddleware;
use LifeHub\Shared\Http\SecurityHeadersMiddleware;
use LifeHub\Shared\Persistence\OperationJournal;
use LifeHub\Shared\Persistence\PdoFactory;
use LifeHub\Recipes\RecipeController;
use LifeHub\Recipes\RecipeRepository;
use LifeHub\Shopping\ShoppingListController;
use LifeHub\Shopping\ShoppingRepository;
use LifeHub\Tasks\TaskController;
use LifeHub\Tasks\TaskRepository;
use PDO;
use Psr\Container\ContainerInterface;
use Slim\Factory\AppFactory;
use Slim\Interfaces\RouteCollectorProxyInterface;
use Slim\Psr7\Factory\ResponseFactory;
use Slim\App;

final class ApplicationFactory
{
    /** @return App<ContainerInterface|null> */
    public static function create(Settings $settings, ?PDO $pdo = null): App
    {
        $pdo = $pdo ?? PdoFactory::create($settings);
        $app = AppFactory::create();
        $app->setBasePath($settings->apiPath());
        $responses = new ResponseFactory();
        $audit = new AuditLogger($pdo);

        self::routes($app, $pdo, $audit, $responses, $settings);

        $app->addRoutingMiddleware();
        $app->addBodyParsingMiddleware();
        $app->add(new CsrfMiddleware($responses));
        $app->add(new SessionMiddleware($settings));
        $app->add(new ApiExceptionMiddleware($responses, $settings->isDebug()));
        $app->add(new SecurityHeadersMiddleware());
        $app->add(new CorrelationIdMiddleware());

        return $app;
    }

    /** @param App<ContainerInterface|null> $app */
    private static function routes(
        App $app,
        PDO $pdo,
        AuditLogger $audit,
        ResponseFactory $responses,
        Settings $settings
    ): void {
        $users = new UserRepository($pdo);
        $auth = new AuthController(new AuthService($pdo, $users), $users);
        $userController = new UserController($users, $audit);
        $tasks = new TaskController(new TaskRepository($pdo), $audit);
        $storage = new StorageGateway($settings->get('storagePath'));
        $shoppingList = new ShoppingListController(new ShoppingRepository($pdo), $audit, $storage);
        $goals = new GoalController(new GoalRepository($pdo), $audit, $storage);
        $documents = new DocumentController(new DocumentRepository($pdo), $audit, $storage);
        $recipes = new RecipeController(new RecipeRepository($pdo), $audit);
        $inventory = new InventoryController(new InventoryRepository($pdo), $audit, $storage);
        $notes = new NoteController(new NoteRepository($pdo), $audit);
        $meals = new MealController(new MealRepository($pdo, new OperationJournal($pdo)), $audit);
        $homeSettingsRepository = new HomeSettingsRepository($pdo);
        $dashboard = new DashboardController($pdo, $homeSettingsRepository);
        $homeSettings = new HomeSettingsController($homeSettingsRepository, $audit);
        $attachments = new AttachmentController(
            new AttachmentRepository($pdo),
            new AttachmentPolicy($pdo),
            $storage,
            $audit
        );

        $app->get('/health', function ($request, $response) {
            return JsonResponder::write($response, ['status' => 'ok', 'runtime' => PHP_VERSION]);
        });
        $app->get('/v1/app-config', function ($request, $response) use ($settings) {
            return JsonResponder::write($response, ['siteName' => $settings->get('siteName')]);
        });
        $app->group('/v1', function (RouteCollectorProxyInterface $group) use (
            $auth,
            $userController,
            $tasks,
            $attachments,
            $shoppingList,
            $goals,
            $documents,
            $recipes,
            $inventory,
            $notes,
            $meals,
            $dashboard,
            $homeSettings,
            $pdo,
            $audit
        ): void {
            $group->get('/auth/session', [$auth, 'session']);
            $group->post('/auth/login', [$auth, 'login']);
            $group->post('/auth/logout', [$auth, 'logout']);

            $group->group('', function (RouteCollectorProxyInterface $protected) use (
                $userController,
                $tasks,
                $attachments,
                $shoppingList,
                $goals,
                $documents,
                $recipes,
                $inventory,
                $notes,
                $meals,
                $dashboard,
                $homeSettings,
                $pdo,
                $audit
            ): void {
                $protected->get('/users', [$userController, 'index']);
                $protected->post('/users', [$userController, 'create']);
                $protected->put('/users/{id:[0-9]+}', [$userController, 'update']);
                $protected->post('/users/{id:[0-9]+}/password', [$userController, 'resetPassword']);
                $protected->post(
                    '/users/{id:[0-9]+}/calendars/{calendarId:[0-9]+}/assign',
                    [$userController, 'assignCalendar']
                );
                $protected->post(
                    '/users/{id:[0-9]+}/calendars/{calendarId:[0-9]+}/unassign',
                    [$userController, 'unassignCalendar']
                );

                $protected->get('/tasks', [$tasks, 'index']);
                $protected->get('/tasks/members', [$tasks, 'members']);
                $protected->post('/tasks', [$tasks, 'create']);
                $protected->put('/tasks/{id:[0-9]+}', [$tasks, 'update']);
                $protected->post('/tasks/{id:[0-9]+}/complete', [$tasks, 'complete']);
                $protected->post('/tasks/{id:[0-9]+}/archive', [$tasks, 'archive']);
                $protected->post('/tasks/{id:[0-9]+}/restore', [$tasks, 'restore']);

                $protected->post('/attachments', [$attachments, 'upload']);
                $protected->get('/attachments/{id:[0-9]+}/download', [$attachments, 'download']);
                $protected->get('/shopping/list-overview', [$shoppingList, 'listOverview']);
                $protected->get('/shopping/catalog-overview', [$shoppingList, 'catalogOverview']);
                $protected->get('/shopping/prices-overview', [$shoppingList, 'pricesOverview']);
                $protected->post('/shopping/items', [$shoppingList, 'create']);
                $protected->post('/shopping/items/clear-checked', [$shoppingList, 'clearChecked']);
                $protected->put('/shopping/items/{id:[0-9]+}', [$shoppingList, 'update']);
                $protected->post('/shopping/items/{id:[0-9]+}/remove', [$shoppingList, 'remove']);
                $protected->delete(
                    '/shopping/catalog/{resource:categories|supermarkets|products|prices}/{id:[0-9]+}',
                    [$shoppingList, 'deleteCatalog']
                );
                $protected->get('/goals/overview', [$goals, 'overview']);
                $protected->post('/goals', [$goals, 'create']);
                $protected->put('/goals/{id:[0-9]+}', [$goals, 'update']);
                $protected->delete('/goals/{id:[0-9]+}', [$goals, 'delete']);
                $protected->get('/goal-trackers/{trackerId:[0-9]+}/logs', [$goals, 'logs']);
                $protected->post('/goal-trackers/{trackerId:[0-9]+}/log', [$goals, 'log']);
                $protected->get('/documents/overview', [$documents, 'overview']);
                $protected->get('/documents/{id:[0-9]+}', [$documents, 'detail']);
                $protected->post('/documents', [$documents, 'create']);
                $protected->post('/documents/{id:[0-9]+}', [$documents, 'update']);
                $protected->delete(
                    '/documents/{id:[0-9]+}/attachments/{attachmentId:[0-9]+}',
                    [$documents, 'deleteAttachment']
                );
                $protected->delete('/documents/{id:[0-9]+}', [$documents, 'delete']);
                $protected->get('/recipes/overview', [$recipes, 'overview']);
                $protected->get('/recipes/{id:[0-9]+}', [$recipes, 'detail']);
                $protected->post('/recipes', [$recipes, 'create']);
                $protected->put('/recipes/{id:[0-9]+}', [$recipes, 'update']);
                $protected->post('/recipes/{id:[0-9]+}/archive', [$recipes, 'archive']);
                $protected->post('/recipes/{id:[0-9]+}/image/remove', [$recipes, 'removeImage']);
                $protected->get('/inventory/overview', [$inventory, 'overview']);
                $protected->post('/inventory/categories', [$inventory, 'createCategory']);
                $protected->put(
                    '/inventory/categories/{categoryId:[0-9]+}',
                    [$inventory, 'updateCategory']
                );
                $protected->delete(
                    '/inventory/categories/{categoryId:[0-9]+}',
                    [$inventory, 'deleteCategory']
                );
                $protected->get('/inventory/{id:[0-9]+}', [$inventory, 'detail']);
                $protected->post('/inventory', [$inventory, 'create']);
                $protected->put('/inventory/{id:[0-9]+}', [$inventory, 'update']);
                $protected->post('/inventory/{id:[0-9]+}/archive', [$inventory, 'archive']);
                $protected->post('/inventory/{id:[0-9]+}/restore', [$inventory, 'restore']);
                $protected->delete('/inventory/{id:[0-9]+}', [$inventory, 'delete']);
                $protected->post('/inventory/{id:[0-9]+}/image/remove', [$inventory, 'removeImage']);
                $protected->delete(
                    '/inventory/{id:[0-9]+}/images/{imageId:[0-9]+}',
                    [$inventory, 'deleteImage']
                );
                $protected->get('/notes/overview', [$notes, 'overview']);
                $protected->get('/notes/{id:[0-9]+}', [$notes, 'detail']);
                $protected->post('/notes', [$notes, 'create']);
                $protected->put('/notes/{id:[0-9]+}', [$notes, 'update']);
                $protected->post('/notes/{id:[0-9]+}/pin', [$notes, 'pin']);
                $protected->post('/notes/{id:[0-9]+}/archive', [$notes, 'archive']);
                $protected->post('/notes/{id:[0-9]+}/restore', [$notes, 'restore']);
                $protected->post('/notes/{id:[0-9]+}/image/remove', [$notes, 'removeImage']);
                $protected->get('/meals/overview', [$meals, 'overview']);
                $protected->post('/meals/shopping-preview', [$meals, 'shoppingPreview']);
                $protected->post('/meals/generate-shopping', [$meals, 'generateShopping']);
                $protected->post('/meals', [$meals, 'create']);
                $protected->put('/meals/{id:[0-9]+}', [$meals, 'update']);
                $protected->delete('/meals/{id:[0-9]+}', [$meals, 'delete']);
                $protected->get('/dashboard', [$dashboard, 'show']);
                $protected->get('/admin/home-settings', [$homeSettings, 'show']);
                $protected->put('/admin/home-settings', [$homeSettings, 'update']);

                foreach (self::resources() as $path => $definition) {
                    $controller = new ResourceController(
                        $definition,
                        new ResourceRepository($pdo, $definition),
                        $audit
                    );
                    $protected->get('/' . $path, [$controller, 'index']);
                    $protected->post('/' . $path, [$controller, 'create']);
                    $protected->put('/' . $path . '/{id:[0-9]+}', [$controller, 'update']);
                    if ($definition->entity() === 'calendar') {
                        $protected->delete('/' . $path . '/{id:[0-9]+}', [$controller, 'delete']);
                    }
                }
            })->add(new AuthenticationMiddleware(new ResponseFactory(), $pdo));
        });
    }

    /** @return array<string, ResourceDefinition> */
    private static function resources(): array
    {
        return [
            'calendars' => new ResourceDefinition(
                'calendar',
                'lh_calendars',
                ['name', 'external_id'],
                ['name', 'external_id'],
                [],
                null,
                null,
                true,
                ['name' => 255, 'external_id' => 512]
            ),
            'categories' => new ResourceDefinition(
                'category',
                'lh_categories',
                ['name'],
                ['name'],
                [],
                'name',
                'name_key',
                false,
                ['name' => 190]
            ),
            'supermarkets' => new ResourceDefinition(
                'supermarket',
                'lh_supermarkets',
                ['name'],
                ['name'],
                [],
                'name',
                'name_key',
                false,
                ['name' => 190]
            ),
            'products' => new ResourceDefinition(
                'product',
                'lh_products',
                ['category_id', 'name'],
                ['name'],
                [],
                'name',
                'name_key',
                true,
                ['name' => 255]
            ),
            'prices' => new ResourceDefinition(
                'price',
                'lh_prices',
                ['product_id', 'supermarket_id', 'amount', 'currency', 'package_text', 'observed_on'],
                ['product_id', 'supermarket_id', 'amount'],
                ['currency' => 'EUR'],
                null,
                null,
                false,
                ['currency' => 3, 'package_text' => 32, 'observed_on' => 10]
            ),
        ];
    }
}
