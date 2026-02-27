<?php
/**
 * API Archivio Ricette
 */
session_start();
require_once '../includes/auth.php';
$user = require_roles_api(array('admin', 'adult', 'child'));

header('Content-Type: application/json');
ensure_recipes_schema($conn);

$action = isset($_GET['action']) ? $_GET['action'] : '';

switch ($action) {

    case 'get_recipes':
        $sql = "SELECT r.*, COUNT(ri.id) AS ingredients_count
                FROM recipes r
                LEFT JOIN recipe_ingredients ri ON ri.recipe_id = r.id";
        $where = array();

        if (!empty($_GET['search'])) {
            $search = $conn->real_escape_string(trim($_GET['search']));
            $where[] = "(r.name LIKE '%$search%' OR r.instructions LIKE '%$search%' OR r.author_name LIKE '%$search%')";
        }
        if (!empty($_GET['category'])) {
            $category = $conn->real_escape_string(trim($_GET['category']));
            $where[] = "r.category = '$category'";
        }

        if (!empty($where)) {
            $sql .= " WHERE " . implode(" AND ", $where);
        }

        $sql .= " GROUP BY r.id ORDER BY r.name ASC";

        $result = $conn->query($sql);
        if (!$result) exit_with_error("Errore query ricette: " . $conn->error);

        $data = array();
        while ($row = $result->fetch_assoc()) $data[] = $row;
        echo json_encode($data);
        break;

    case 'get_recipe_details':
        $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
        if (!$id) exit_with_error("ID ricetta obbligatorio");

        $stmt = $conn->prepare("SELECT * FROM recipes WHERE id = ?");
        if (!$stmt) exit_with_error("Errore prepare: " . $conn->error);
        $stmt->bind_param("i", $id);
        $stmt->execute();
        $recipe = stmt_fetch_one_assoc($stmt);
        if (!$recipe) exit_with_error("Ricetta non trovata", 404);

        $ingStmt = $conn->prepare("SELECT ri.*, p.name AS product_name
                                   FROM recipe_ingredients ri
                                   LEFT JOIN products p ON p.id = ri.product_id
                                   WHERE ri.recipe_id = ?
                                   ORDER BY ri.id ASC");
        if (!$ingStmt) exit_with_error("Errore prepare ingredienti: " . $conn->error);
        $ingStmt->bind_param("i", $id);
        $ingStmt->execute();
        $recipe['ingredients'] = stmt_fetch_all_assoc($ingStmt);

        echo json_encode($recipe);
        break;

    case 'get_recipe_categories':
        $result = $conn->query("SELECT DISTINCT category FROM recipes WHERE category IS NOT NULL AND category <> '' ORDER BY category ASC");
        if (!$result) exit_with_error("Errore query categorie: " . $conn->error);
        $data = array();
        while ($row = $result->fetch_assoc()) $data[] = $row['category'];
        echo json_encode($data);
        break;

    case 'get_products_catalog':
        $sql = "SELECT p.id, p.name, c.name AS category_name
                FROM products p
                LEFT JOIN categories c ON c.id = p.category_id
                ORDER BY c.name ASC, p.name ASC";
        $result = $conn->query($sql);
        if (!$result) exit_with_error("Errore query prodotti: " . $conn->error);

        $products = array();
        while ($row = $result->fetch_assoc()) $products[] = $row;
        echo json_encode($products);
        break;

    case 'save_recipe':
        $data = get_json_input();
        if (!is_array($data)) exit_with_error("Payload non valido");
        
        // Ensure table exists before saving
        ensure_recipes_schema($conn);

        $id = isset($data['id']) ? (int)$data['id'] : 0;
        $name = isset($data['name']) ? trim($data['name']) : '';
        $category = isset($data['category']) ? trim($data['category']) : '';
        $instructions = isset($data['instructions']) ? trim($data['instructions']) : '';
        $description = isset($data['description']) ? trim($data['description']) : '';
        $prep_time = isset($data['prep_time_minutes']) && $data['prep_time_minutes'] !== '' ? (int)$data['prep_time_minutes'] : null;
        $difficulty = isset($data['difficulty']) ? trim($data['difficulty']) : '';
        $author_name = isset($data['author_name']) ? trim($data['author_name']) : '';
        $image_url = isset($data['image_url']) ? trim($data['image_url']) : null;
        $ingredients = isset($data['ingredients']) && is_array($data['ingredients']) ? $data['ingredients'] : array();

        if ($name === '') exit_with_error("Titolo ricetta obbligatorio");

        if ($id > 0) {
            $stmt = $conn->prepare("UPDATE recipes
                                    SET name = ?, category = ?, description = ?, instructions = ?, prep_time_minutes = ?, difficulty = ?, author_name = ?, image_url = ?, updated_at = NOW()
                                    WHERE id = ?");
            if (!$stmt) exit_with_error("Errore prepare update: " . $conn->error);
            $stmt->bind_param("ssssisssi", $name, $category, $description, $instructions, $prep_time, $difficulty, $author_name, $image_url, $id);
        } else {
            $stmt = $conn->prepare("INSERT INTO recipes (name, category, description, instructions, prep_time_minutes, difficulty, author_name, image_url, created_by, created_at, updated_at)
                                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())");
            if (!$stmt) exit_with_error("Errore prepare insert: " . $conn->error);
            $stmt->bind_param("ssssisssi", $name, $category, $description, $instructions, $prep_time, $difficulty, $author_name, $image_url, $user['id']);
        }

        if (!$stmt->execute()) exit_with_error("Errore salvataggio ricetta: " . $stmt->error);
        if ($id <= 0) $id = (int)$stmt->insert_id;

        $delStmt = $conn->prepare("DELETE FROM recipe_ingredients WHERE recipe_id = ?");
        if (!$delStmt) exit_with_error("Errore reset ingredienti: " . $conn->error);
        $delStmt->bind_param("i", $id);
        $delStmt->execute();

        $ingStmt = $conn->prepare("INSERT INTO recipe_ingredients (recipe_id, product_id, ingredient_name, quantity) VALUES (?, ?, ?, ?)");
        if (!$ingStmt) exit_with_error("Errore insert ingredienti: " . $conn->error);

        foreach ($ingredients as $ingredient) {
            if (!is_array($ingredient)) continue;

            $product_id = isset($ingredient['product_id']) && (int)$ingredient['product_id'] > 0 ? (int)$ingredient['product_id'] : null;
            $ingredient_name = isset($ingredient['ingredient_name']) ? trim($ingredient['ingredient_name']) : '';
            $quantity = isset($ingredient['quantity']) ? trim($ingredient['quantity']) : '';

            if ($ingredient_name === '' && $product_id) {
                $nameStmt = $conn->prepare("SELECT name FROM products WHERE id = ? LIMIT 1");
                if ($nameStmt) {
                    $nameStmt->bind_param("i", $product_id);
                    $nameStmt->execute();
                    $res = stmt_fetch_one_assoc($nameStmt);
                    if ($res && !empty($res['name'])) $ingredient_name = $res['name'];
                }
            }

            if ($ingredient_name === '') continue;

            $ingStmt->bind_param("iiss", $id, $product_id, $ingredient_name, $quantity);
            $ingStmt->execute();
        }

        echo json_encode(array('message' => 'Ricetta salvata', 'id' => $id));
        break;

    case 'delete_recipe':
        $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
        if (!$id) exit_with_error("ID ricetta obbligatorio");

        $nullMeal = $conn->prepare("UPDATE meal_plan SET recipe_id = NULL WHERE recipe_id = ?");
        if ($nullMeal) {
            $nullMeal->bind_param("i", $id);
            $nullMeal->execute();
        }

        $delIng = $conn->prepare("DELETE FROM recipe_ingredients WHERE recipe_id = ?");
        if (!$delIng) exit_with_error("Errore delete ingredienti: " . $conn->error);
        $delIng->bind_param("i", $id);
        $delIng->execute();

        $delRecipe = $conn->prepare("DELETE FROM recipes WHERE id = ?");
        if (!$delRecipe) exit_with_error("Errore delete ricetta: " . $conn->error);
        $delRecipe->bind_param("i", $id);
        if ($delRecipe->execute()) {
            echo json_encode(array('message' => 'Ricetta eliminata'));
        } else {
            exit_with_error("Errore eliminazione ricetta: " . $delRecipe->error);
        }
        break;

    default:
        exit_with_error("Azione non valida: " . $action, 404);
}

function get_json_input() {
    return json_decode(file_get_contents('php://input'), true);
}

function stmt_fetch_all_assoc($stmt) {
    if (method_exists($stmt, 'get_result')) {
        $result = $stmt->get_result();
        $rows = array();
        if ($result) {
            while ($row = $result->fetch_assoc()) $rows[] = $row;
        }
        return $rows;
    }

    $meta = $stmt->result_metadata();
    if (!$meta) return array();

    $row = array();
    $bind = array();
    while ($field = $meta->fetch_field()) {
        $row[$field->name] = null;
        $bind[] = &$row[$field->name];
    }

    call_user_func_array(array($stmt, 'bind_result'), $bind);

    $rows = array();
    while ($stmt->fetch()) {
        $copy = array();
        foreach ($row as $key => $value) {
            $copy[$key] = $value;
        }
        $rows[] = $copy;
    }

    return $rows;
}

function stmt_fetch_one_assoc($stmt) {
    $rows = stmt_fetch_all_assoc($stmt);
    return isset($rows[0]) ? $rows[0] : null;
}

function ensure_recipes_schema($conn) {
    $conn->query("CREATE TABLE IF NOT EXISTS recipes (
        id INT(11) NOT NULL AUTO_INCREMENT,
        name VARCHAR(255) NOT NULL,
        category VARCHAR(100) NULL DEFAULT NULL,
        description TEXT NULL,
        instructions TEXT NULL,
        prep_time_minutes INT(11) NULL DEFAULT NULL,
        difficulty VARCHAR(30) NULL DEFAULT NULL,
        author_name VARCHAR(100) NULL DEFAULT NULL,
        image_url VARCHAR(255) NULL DEFAULT NULL,
        created_by INT(11) NULL DEFAULT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NULL DEFAULT NULL,
        PRIMARY KEY (id),
        KEY idx_recipe_name (name)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8");

    $conn->query("CREATE TABLE IF NOT EXISTS recipe_ingredients (
        id INT(11) NOT NULL AUTO_INCREMENT,
        recipe_id INT(11) NOT NULL,
        product_id INT(11) NULL DEFAULT NULL,
        ingredient_name VARCHAR(255) NOT NULL,
        quantity VARCHAR(100) NULL DEFAULT NULL,
        PRIMARY KEY (id),
        KEY idx_recipe_ingredients_recipe (recipe_id),
        KEY idx_recipe_ingredients_product (product_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8");

    ensure_column($conn, 'recipes', 'category', "VARCHAR(100) NULL DEFAULT NULL AFTER name");
    ensure_column($conn, 'recipes', 'description', "TEXT NULL AFTER category");
    ensure_column($conn, 'recipes', 'instructions', "TEXT NULL AFTER description");
    ensure_column($conn, 'recipes', 'prep_time_minutes', "INT(11) NULL DEFAULT NULL AFTER instructions");
    ensure_column($conn, 'recipes', 'difficulty', "VARCHAR(30) NULL DEFAULT NULL AFTER prep_time_minutes");
    ensure_column($conn, 'recipes', 'author_name', "VARCHAR(100) NULL DEFAULT NULL AFTER difficulty");
    ensure_column($conn, 'recipes', 'image_url', "VARCHAR(255) NULL DEFAULT NULL AFTER author_name");
    ensure_column($conn, 'recipes', 'created_by', "INT(11) NULL DEFAULT NULL AFTER image_url");
    ensure_column($conn, 'recipes', 'created_at', "DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP AFTER created_by");
    ensure_column($conn, 'recipes', 'updated_at', "DATETIME NULL DEFAULT NULL AFTER created_at");

    ensure_column($conn, 'recipe_ingredients', 'product_id', "INT(11) NULL DEFAULT NULL AFTER recipe_id");
    ensure_column($conn, 'recipe_ingredients', 'ingredient_name', "VARCHAR(255) NOT NULL AFTER product_id");
    ensure_column($conn, 'recipe_ingredients', 'quantity', "VARCHAR(100) NULL DEFAULT NULL AFTER ingredient_name");
}

function ensure_column($conn, $table, $column, $definition) {
    $safeTable = preg_replace('/[^a-zA-Z0-9_]/', '', $table);
    $safeColumn = preg_replace('/[^a-zA-Z0-9_]/', '', $column);
    if ($safeTable === '' || $safeColumn === '') return;

    $check = $conn->query("SHOW COLUMNS FROM `$safeTable` LIKE '$safeColumn'");
    if ($check && $check->num_rows === 0) {
        $conn->query("ALTER TABLE `$safeTable` ADD COLUMN `$safeColumn` $definition");
    }
}

function exit_with_error($msg, $code = 400) {
    header("HTTP/1.1 $code");
    echo json_encode(array('error' => $msg));
    exit;
}
?>
