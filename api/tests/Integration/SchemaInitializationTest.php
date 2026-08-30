<?php

/**
 * Proves that a clean database can be initialized and bootstrapped without prior state.
 */

declare(strict_types=1);

namespace LifeHub\Tests\Integration;

use LifeHub\Installation\InitialAdminCreator;
use LifeHub\Installation\SchemaInitializer;
use LifeHub\Tests\Support\TemporaryDatabase;
use PHPUnit\Framework\TestCase;
use RuntimeException;

final class SchemaInitializationTest extends TestCase
{
    /** @var TemporaryDatabase|null */ private $database;

    protected function setUp(): void
    {
        if (getenv('LIFEHUB_TEST_DB') !== '1') {
            self::markTestSkipped('Set LIFEHUB_TEST_DB=1 to run isolated database probes.');
        }
        $this->database = new TemporaryDatabase();
    }

    protected function tearDown(): void
    {
        if ($this->database !== null) {
            $this->database->drop();
        }
    }

    public function testSchemaAndInitialAdministratorCanBeCreated(): void
    {
        if ($this->database === null) {
            throw new RuntimeException('Temporary database was not initialized.');
        }
        $initializer = new SchemaInitializer(
            $this->database->pdo(),
            dirname(__DIR__, 3) . '/database/lifehub.sql'
        );
        $dryRun = $initializer->initialize(true);
        self::assertTrue($dryRun['dryRun']);
        self::assertGreaterThan(20, $dryRun['tableCount']);

        $applied = $initializer->initialize(false);
        self::assertFalse($applied['dryRun']);
        self::assertSame($dryRun['checksum'], $applied['checksum']);
        self::assertSame($dryRun['tableCount'], $applied['tableCount']);

        $created = (new InitialAdminCreator($this->database->pdo()))->create(
            'Amministratore',
            'password-iniziale-sicura',
            'Famiglia',
            'Europe/Rome'
        );
        self::assertGreaterThan(0, $created['householdId']);
        self::assertGreaterThan(0, $created['userId']);
        self::assertGreaterThan(0, $created['shoppingListId']);

        $pdo = $this->database->pdo();
        $statement = $pdo->query('SELECT username, password_hash, role FROM lh_users');
        if ($statement === false) {
            throw new RuntimeException('Cannot read the initialized administrator.');
        }
        $user = $statement->fetch();
        self::assertIsArray($user);
        self::assertSame('Amministratore', $user['username']);
        self::assertSame('admin', $user['role']);
        self::assertTrue(password_verify('password-iniziale-sicura', (string) $user['password_hash']));
        $categories = $pdo->query('SELECT COUNT(*) FROM lh_inventory_categories');
        self::assertNotFalse($categories);
        self::assertSame(5, (int) $categories->fetchColumn());
        $fallbacks = $pdo->query(
            'SELECT COUNT(*) FROM lh_inventory_categories WHERE is_fallback = 1 AND name = \'Altro\''
        );
        self::assertNotFalse($fallbacks);
        self::assertSame(1, (int) $fallbacks->fetchColumn());

        $expectedTypes = [
            'lh_attachments.original_name' => 'varchar(255)',
            'lh_calendars.external_id' => 'varchar(512)',
            'lh_inventory.location' => 'varchar(500)',
            'lh_prices.package_text' => 'varchar(32)',
            'lh_recipe_ingredients.ingredient_name' => 'varchar(255)',
            'lh_recipe_ingredients.quantity_raw' => 'varchar(100)',
            'lh_recipes.category_text' => 'varchar(100)',
            'lh_shopping_items.label' => 'varchar(255)',
            'lh_shopping_items.quantity_raw' => 'varchar(80)',
        ];
        foreach ($expectedTypes as $qualifiedColumn => $expectedType) {
            [$table, $column] = explode('.', $qualifiedColumn, 2);
            $columnStatement = $pdo->query("SHOW COLUMNS FROM `{$table}` LIKE " . $pdo->quote($column));
            self::assertNotFalse($columnStatement);
            $definition = $columnStatement->fetch();
            self::assertIsArray($definition);
            self::assertSame($expectedType, strtolower((string) $definition['Type']));
        }
        $productIndex = $pdo->query("SHOW INDEX FROM lh_products WHERE Key_name = 'uq_lh_products_name'");
        self::assertNotFalse($productIndex);
        $productIndexDefinition = $productIndex->fetch();
        self::assertIsArray($productIndexDefinition);
        self::assertSame(0, (int) $productIndexDefinition['Non_unique']);
        $residueTables = $pdo->query(
            "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() "
            . "AND table_name IN ('lh_legacy_payloads', 'lh_legacy_mappings', "
            . "'lh_entity_relations', 'lh_schema_migrations')"
        );
        self::assertNotFalse($residueTables);
        self::assertSame(0, (int) $residueTables->fetchColumn());
    }

    public function testInitializationRefusesAnExistingInstallation(): void
    {
        if ($this->database === null) {
            throw new RuntimeException('Temporary database was not initialized.');
        }
        $initializer = new SchemaInitializer(
            $this->database->pdo(),
            dirname(__DIR__, 3) . '/database/lifehub.sql'
        );
        $initializer->initialize(false);

        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessage('requires an empty target');
        $initializer->initialize(false);
    }
}
