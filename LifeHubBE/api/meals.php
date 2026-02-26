<?php
/**
 * Router API per Ricette e Meal Plan
 */
session_start();
require_once '../includes/auth.php';

requireLoginApi();
$user = currentUser();

header('Content-Type: application/json');

$action = isset($_GET['action']) ? $_GET['action'] : '';

switch ($action) {
    
    // --- RICETTE ---
    case 'get_recipes':
        $sql = "SELECT * FROM recipes ORDER BY name ASC";
        $result = $conn->query($sql);
        $data = array();
        while ($row = $result->fetch_assoc()) $data[] = $row;
        echo json_encode($data);
        break;

    case 'get_recipe_details':
        $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
        $stmt = $conn->prepare("SELECT * FROM recipes WHERE id = ?");
        $stmt->bind_param("i", $id);
        $stmt->execute();
        $recipe = $stmt->get_result()->fetch_assoc();
        
        // Carica ingredienti
        $sql = "SELECT ri.*, p.name as product_name 
                FROM recipe_ingredients ri 
                JOIN products p ON ri.product_id = p.id 
                WHERE ri.recipe_id = $id";
        $res = $conn->query($sql);
        $ingredients = array();
        while ($row = $res->fetch_assoc()) $ingredients[] = $row;
        
        $recipe['ingredients'] = $ingredients;
        echo json_encode($recipe);
        break;

    // --- MEAL PLAN ---
    case 'get_meal_plan':
        $start = isset($_GET['start']) ? $_GET['start'] : date('Y-m-d');
        $end = isset($_GET['end']) ? $_GET['end'] : date('Y-m-d', strtotime('+7 days'));
        
        $sql = "SELECT mp.*, r.name as recipe_name 
                FROM meal_plan mp 
                LEFT JOIN recipes r ON mp.recipe_id = r.id 
                WHERE mp.meal_date BETWEEN '$start' AND '$end' 
                ORDER BY mp.meal_date ASC, mp.meal_type DESC";
        $result = $conn->query($sql);
        $data = array();
        while ($row = $result->fetch_assoc()) $data[] = $row;
        echo json_encode($data);
        break;

    case 'save_meal':
        $data = json_decode(file_get_contents('php://input'), true);
        $id = isset($data['id']) ? (int)$data['id'] : 0;
        $meal_date = $data['meal_date'];
        $meal_type = $data['meal_type'];
        $recipe_id = !empty($data['recipe_id']) ? (int)$data['recipe_id'] : null;
        $notes = isset($data['notes']) ? $data['notes'] : '';

        if ($id > 0) {
            $stmt = $conn->prepare("UPDATE meal_plan SET meal_date = ?, meal_type = ?, recipe_id = ?, notes = ? WHERE id = ?");
            $stmt->bind_param("ssisi", $meal_date, $meal_type, $recipe_id, $notes, $id);
        } else {
            $stmt = $conn->prepare("INSERT INTO meal_plan (meal_date, meal_type, recipe_id, notes) VALUES (?, ?, ?, ?)");
            $stmt->bind_param("ssis", $meal_date, $meal_type, $recipe_id, $notes);
        }

        if ($stmt->execute()) echo json_encode(array('message' => 'Piano salvato'));
        else exit_with_error("Errore salvataggio piano");
        break;

    // --- INTEGRAZIONE SPESA ---
    case 'generate_shopping_list':
        $data = json_decode(file_get_contents('php://input'), true);
        $meal_ids = $data['meal_ids']; // Array di ID del meal_plan
        
        if (empty($meal_ids)) exit_with_error("Nessun pasto selezionato");
        
        $ids_string = implode(',', array_map('intval', $meal_ids));
        
        // Recupera tutti gli ingredienti necessari per questi pasti
        $sql = "SELECT ri.product_id, ri.quantity 
                FROM meal_plan mp 
                JOIN recipe_ingredients ri ON mp.recipe_id = ri.recipe_id 
                WHERE mp.id IN ($ids_string)";
        $result = $conn->query($sql);
        
        $count = 0;
        while ($row = $result->fetch_assoc()) {
            // Aggiungi alla shopping_list reale (gestita dal modulo spesa)
            $stmt = $conn->prepare("INSERT INTO shopping_list (product_id, quantity, added_by) VALUES (?, ?, ?)");
            $stmt->bind_param("isi", $row['product_id'], $row['quantity'], $user['id']);
            if ($stmt->execute()) $count++;
        }
        
        echo json_encode(array('message' => "Aggiunti $count articoli alla lista della spesa"));
        break;

    default:
        header('HTTP/1.1 404 Not Found');
        echo json_encode(array('error' => 'Azione non valida'));
}

function exit_with_error($msg) {
    header('HTTP/1.1 500 Internal Server Error');
    echo json_encode(array('error' => $msg));
    exit;
}
?>
