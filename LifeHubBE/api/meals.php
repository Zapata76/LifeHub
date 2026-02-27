<?php
/**
 * Router API per Meal Plan + integrazione Spesa
 */
session_start();
require_once '../includes/auth.php';
$user = require_roles_api(array('admin', 'adult', 'child'));

header('Content-Type: application/json');

ensure_recipes_schema($conn);
ensure_meal_plan_schema($conn);

$action = isset($_GET['action']) ? $_GET['action'] : '';

switch ($action) {

    // --- RICETTE (solo lettura per il planner) ---
    case 'get_recipes':
        $sql = "SELECT id, name, category, prep_time_minutes, difficulty
                FROM recipes
                ORDER BY name ASC";
        $result = $conn->query($sql);
        if (!$result) exit_with_error("Errore lettura ricette: " . $conn->error);

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
                                   LEFT JOIN products p ON ri.product_id = p.id
                                   WHERE ri.recipe_id = ?
                                   ORDER BY ri.id ASC");
        if (!$ingStmt) exit_with_error("Errore ingredienti: " . $conn->error);
        $ingStmt->bind_param("i", $id);
        $ingStmt->execute();
        $recipe['ingredients'] = stmt_fetch_all_assoc($ingStmt);

        echo json_encode($recipe);
        break;

    // --- MEAL PLAN ---
    case 'get_meal_plan':
        $start = isset($_GET['start']) ? $_GET['start'] : date('Y-m-d');
        $end = isset($_GET['end']) ? $_GET['end'] : date('Y-m-d', strtotime('+7 days'));

        $stmt = $conn->prepare("SELECT mp.*, r.name AS recipe_name
                                FROM meal_plan mp
                                LEFT JOIN recipes r ON mp.recipe_id = r.id
                                WHERE mp.meal_date BETWEEN ? AND ?
                                ORDER BY mp.meal_date ASC,
                                FIELD(mp.meal_type, 'lunch', 'dinner') ASC");
        if (!$stmt) exit_with_error("Errore query meal plan: " . $conn->error);
        $stmt->bind_param("ss", $start, $end);
        $stmt->execute();
        echo json_encode(stmt_fetch_all_assoc($stmt));
        break;

    case 'save_meal':
        $data = get_json_input();
        if (!is_array($data)) exit_with_error("Payload non valido");

        $id = isset($data['id']) ? (int)$data['id'] : 0;
        $meal_date = isset($data['meal_date']) ? $data['meal_date'] : '';
        $meal_type = isset($data['meal_type']) ? $data['meal_type'] : '';
        $recipe_id = (isset($data['recipe_id']) && (int)$data['recipe_id'] > 0) ? (int)$data['recipe_id'] : null;
        $notes = isset($data['notes']) ? $data['notes'] : '';

        if (!$meal_date || !$meal_type) exit_with_error("Data e tipo pasto obbligatori");
        if (!in_array($meal_type, array('lunch', 'dinner'))) exit_with_error("Tipo pasto non valido");

        if ($id > 0) {
            if ($recipe_id === null) {
                $stmt = $conn->prepare("UPDATE meal_plan SET meal_date = ?, meal_type = ?, recipe_id = NULL, notes = ? WHERE id = ?");
                if (!$stmt) exit_with_error("Errore update meal: " . $conn->error);
                $stmt->bind_param("sssi", $meal_date, $meal_type, $notes, $id);
            } else {
                $stmt = $conn->prepare("UPDATE meal_plan SET meal_date = ?, meal_type = ?, recipe_id = ?, notes = ? WHERE id = ?");
                if (!$stmt) exit_with_error("Errore update meal: " . $conn->error);
                $stmt->bind_param("ssisi", $meal_date, $meal_type, $recipe_id, $notes, $id);
            }
        } else {
            if ($recipe_id === null) {
                $stmt = $conn->prepare("INSERT INTO meal_plan (meal_date, meal_type, recipe_id, notes)
                                        VALUES (?, ?, NULL, ?)");
                if (!$stmt) exit_with_error("Errore insert meal: " . $conn->error);
                $stmt->bind_param("sss", $meal_date, $meal_type, $notes);
            } else {
                $stmt = $conn->prepare("INSERT INTO meal_plan (meal_date, meal_type, recipe_id, notes)
                                        VALUES (?, ?, ?, ?)");
                if (!$stmt) exit_with_error("Errore insert meal: " . $conn->error);
                $stmt->bind_param("ssis", $meal_date, $meal_type, $recipe_id, $notes);
            }
        }

        if ($stmt->execute()) {
            echo json_encode(array(
                'message' => 'Pasto salvato',
                'id' => ($id > 0 ? $id : (int)$stmt->insert_id)
            ));
        } else {
            exit_with_error("Errore salvataggio pasto: " . $stmt->error);
        }
        break;

    // --- INTEGRAZIONE SPESA ---
    case 'generate_shopping_list':
        $data = get_json_input();
        $meal_ids = isset($data['meal_ids']) && is_array($data['meal_ids']) ? $data['meal_ids'] : array();
        if (empty($meal_ids)) exit_with_error("Nessun pasto selezionato");

        $id_list = array();
        foreach ($meal_ids as $meal_id) {
            $id_list[] = (int)$meal_id;
        }
        $id_list = array_values(array_unique(array_filter($id_list)));
        if (empty($id_list)) exit_with_error("ID pasti non validi");

        $ids_string = implode(',', $id_list);
        $sql = "SELECT ri.product_id, ri.ingredient_name, ri.quantity
                FROM meal_plan mp
                JOIN recipe_ingredients ri ON mp.recipe_id = ri.recipe_id
                WHERE mp.id IN ($ids_string)";
        $result = $conn->query($sql);
        if (!$result) exit_with_error("Errore recupero ingredienti: " . $conn->error);

        $resolvedByName = array();
        $byProduct = array();
        $skipped = 0;

        while ($row = $result->fetch_assoc()) {
            $product_id = isset($row['product_id']) && (int)$row['product_id'] > 0 ? (int)$row['product_id'] : 0;
            $ingredient_name = isset($row['ingredient_name']) ? trim($row['ingredient_name']) : '';
            $quantity = isset($row['quantity']) ? trim($row['quantity']) : '';

            if ($product_id <= 0 && $ingredient_name !== '') {
                $key = strtolower($ingredient_name);
                if (isset($resolvedByName[$key])) {
                    $product_id = (int)$resolvedByName[$key];
                } else {
                    $pstmt = $conn->prepare("SELECT id FROM products WHERE LOWER(name) = LOWER(?) LIMIT 1");
                    if ($pstmt) {
                        $pstmt->bind_param("s", $ingredient_name);
                        $pstmt->execute();
                        $p = stmt_fetch_one_assoc($pstmt);
                        $product_id = $p ? (int)$p['id'] : 0;
                        $resolvedByName[$key] = $product_id;
                    }
                }
            }

            if ($product_id <= 0) {
                $skipped++;
                continue;
            }

            if (!isset($byProduct[$product_id])) {
                $byProduct[$product_id] = $quantity !== '' ? $quantity : '1';
            } else {
                $byProduct[$product_id] = merge_quantities($byProduct[$product_id], $quantity);
            }
        }

        $inserted = 0;
        $updated = 0;

        foreach ($byProduct as $product_id => $quantity) {
            $check = $conn->prepare("SELECT id, quantity FROM shopping_list WHERE product_id = ? AND is_checked = 0 ORDER BY id DESC LIMIT 1");
            if ($check) {
                $check->bind_param("i", $product_id);
                $check->execute();
                $existing = stmt_fetch_one_assoc($check);
            } else {
                $existing = null;
            }

            if ($existing) {
                $newQuantity = merge_quantities($existing['quantity'], $quantity);
                $up = $conn->prepare("UPDATE shopping_list SET quantity = ? WHERE id = ?");
                if ($up) {
                    $up->bind_param("si", $newQuantity, $existing['id']);
                    if ($up->execute()) $updated++;
                }
            } else {
                $ins = $conn->prepare("INSERT INTO shopping_list (product_id, quantity, added_by) VALUES (?, ?, ?)");
                if ($ins) {
                    $ins->bind_param("isi", $product_id, $quantity, $user['id']);
                    if ($ins->execute()) $inserted++;
                }
            }
        }

        echo json_encode(array(
            'message' => "Lista spesa aggiornata: $inserted nuovi, $updated aggiornati, $skipped ingredienti non associati a prodotto.",
            'inserted' => $inserted,
            'updated' => $updated,
            'skipped' => $skipped
        ));
        break;

    default:
        exit_with_error('Azione non valida: ' . $action, 404);
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

function merge_quantities($q1, $q2) {
    $a = trim((string)$q1);
    $b = trim((string)$q2);

    if ($a === '') return $b === '' ? '1' : $b;
    if ($b === '') return $a;

    if (is_numeric_quantity($a) && is_numeric_quantity($b)) {
        $sum = normalize_numeric_quantity($a) + normalize_numeric_quantity($b);
        return format_numeric_quantity($sum);
    }

    if (strtolower($a) === strtolower($b)) {
        return $a;
    }

    return $a . ' + ' . $b;
}

function is_numeric_quantity($value) {
    $norm = str_replace(',', '.', trim($value));
    return preg_match('/^[0-9]+(\.[0-9]+)?$/', $norm) === 1;
}

function normalize_numeric_quantity($value) {
    return (float)str_replace(',', '.', trim($value));
}

function format_numeric_quantity($value) {
    $formatted = rtrim(rtrim(number_format($value, 2, '.', ''), '0'), '.');
    return $formatted === '' ? '0' : $formatted;
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

    ensure_column($conn, 'recipe_ingredients', 'product_id', "INT(11) NULL DEFAULT NULL AFTER recipe_id");
    ensure_column($conn, 'recipe_ingredients', 'ingredient_name', "VARCHAR(255) NOT NULL AFTER product_id");
    ensure_column($conn, 'recipe_ingredients', 'quantity', "VARCHAR(100) NULL DEFAULT NULL AFTER ingredient_name");
}

function ensure_meal_plan_schema($conn) {
    $conn->query("CREATE TABLE IF NOT EXISTS meal_plan (
        id INT(11) NOT NULL AUTO_INCREMENT,
        meal_date DATE NOT NULL,
        meal_type VARCHAR(20) NOT NULL,
        recipe_id INT(11) NULL DEFAULT NULL,
        notes TEXT NULL,
        created_by INT(11) NULL DEFAULT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_meal_plan_date (meal_date),
        KEY idx_meal_plan_recipe (recipe_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8");

    ensure_column($conn, 'meal_plan', 'recipe_id', "INT(11) NULL DEFAULT NULL AFTER meal_type");
    ensure_column($conn, 'meal_plan', 'notes', "TEXT NULL AFTER recipe_id");
    ensure_column($conn, 'meal_plan', 'created_by', "INT(11) NULL DEFAULT NULL AFTER notes");
    ensure_column($conn, 'meal_plan', 'created_at', "DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP AFTER created_by");
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

function exit_with_error($msg, $code = 500) {
    header("HTTP/1.1 $code");
    echo json_encode(array('error' => $msg));
    exit;
}
?>
