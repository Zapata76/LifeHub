<?php
/**
 * Unified API Router for the Shopping App
 */
session_start();
require_once '../includes/auth.php';

// Verify authentication (REST API style)
requireLoginApi();

header('Content-Type: application/json');

$action = isset($_GET['action']) ? $_GET['action'] : '';
$method = $_SERVER['REQUEST_METHOD'];
$user = currentUser();
$isAdmin = ($user['role'] === 'admin');
ensure_shopping_list_supermarket_column($conn);

switch ($action) {
    
    // --- USER ---
    case 'get_user':
        echo json_encode($user);
        break;

    // --- CATEGORIES ---
    case 'get_categories':
        $result = $conn->query("SELECT * FROM categories ORDER BY name ASC");
        $data = array();
        while ($row = $result->fetch_assoc()) $data[] = $row;
        echo json_encode($data);
        break;

    case 'add_category':
        $data = get_json_input();
        $name = isset($data['name']) ? trim($data['name']) : '';
        if (!$name) exit_with_error("Nome categoria obbligatorio");
        $stmt = $conn->prepare("INSERT IGNORE INTO categories (name) VALUES (?)");
        $stmt->bind_param("s", $name);
        if ($stmt->execute()) echo json_encode(array('id' => $stmt->insert_id, 'message' => 'Categoria aggiunta'));
        else exit_with_error("Errore salvataggio categoria");
        break;

    case 'update_category':
        $data = get_json_input();
        $id = isset($data['id']) ? (int)$data['id'] : 0;
        $name = isset($data['name']) ? trim($data['name']) : '';
        if (!$id || !$name) exit_with_error("Dati incompleti");
        $stmt = $conn->prepare("UPDATE categories SET name = ? WHERE id = ?");
        $stmt->bind_param("si", $name, $id);
        if ($stmt->execute()) echo json_encode(array('message' => 'Categoria aggiornata'));
        else exit_with_error("Errore aggiornamento categoria");
        break;

    case 'delete_category':
        $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
        if (!$id) exit_with_error("ID obbligatorio");
        $check = $conn->prepare("SELECT id FROM products WHERE category_id = ? LIMIT 1");
        $check->bind_param("i", $id);
        $check->execute();
        $check->store_result();
        if ($check->num_rows > 0) exit_with_error("Impossibile eliminare: ci sono prodotti in questa categoria");
        $stmt = $conn->prepare("DELETE FROM categories WHERE id = ?");
        $stmt->bind_param("i", $id);
        if ($stmt->execute()) echo json_encode(array('message' => 'Categoria eliminata'));
        else exit_with_error("Errore eliminazione categoria");
        break;

    // --- PRODUCTS ---
    case 'get_products':
        $sql = "SELECT p.*, c.name as category_name 
                FROM products p 
                LEFT JOIN categories c ON p.category_id = c.id 
                ORDER BY p.name ASC";
        $result = $conn->query($sql);
        $products = array();
        while ($row = $result->fetch_assoc()) $products[] = $row;
        echo json_encode($products);
        break;

    case 'add_product':
        $name = isset($_POST['name']) ? trim($_POST['name']) : '';
        $category_id = isset($_POST['category_id']) ? (int)$_POST['category_id'] : 0;
        if (!$name || !$category_id) exit_with_error("Dati incompleti");
        $image_url = null;
        if (isset($_FILES['photo']) && $_FILES['photo']['error'] === UPLOAD_ERR_OK) {
            $ext = pathinfo($_FILES['photo']['name'], PATHINFO_EXTENSION);
            $filename = uniqid('prod_') . '.' . $ext;
            $image_url = 'uploads/products/' . $filename;
            move_uploaded_file($_FILES['photo']['tmp_name'], '../' . $image_url);
        }
        $stmt = $conn->prepare("INSERT INTO products (name, category_id, image_url) VALUES (?, ?, ?)");
        $stmt->bind_param("sis", $name, $category_id, $image_url);
        if ($stmt->execute()) echo json_encode(array('id' => $stmt->insert_id, 'message' => 'Prodotto aggiunto'));
        else exit_with_error("Errore salvataggio");
        break;

    case 'update_product':
        $id = isset($_POST['id']) ? (int)$_POST['id'] : 0;
        $name = isset($_POST['name']) ? trim($_POST['name']) : '';
        $category_id = isset($_POST['category_id']) ? (int)$_POST['category_id'] : 0;
        if (!$id || !$name || !$category_id) exit_with_error("Dati incompleti");
        $image_url = isset($_POST['existing_image']) ? $_POST['existing_image'] : null;
        if (isset($_FILES['photo']) && $_FILES['photo']['error'] === UPLOAD_ERR_OK) {
            $ext = pathinfo($_FILES['photo']['name'], PATHINFO_EXTENSION);
            $filename = uniqid('prod_') . '.' . $ext;
            $image_url = 'uploads/products/' . $filename;
            move_uploaded_file($_FILES['photo']['tmp_name'], '../' . $image_url);
        }
        $stmt = $conn->prepare("UPDATE products SET name = ?, category_id = ?, image_url = ? WHERE id = ?");
        $stmt->bind_param("sisi", $name, $category_id, $image_url, $id);
        if ($stmt->execute()) echo json_encode(array('message' => 'Prodotto aggiornato'));
        else exit_with_error("Errore aggiornamento prodotto");
        break;

    case 'delete_product':
        $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
        if (!$id) exit_with_error("ID obbligatorio");
        $check1 = $conn->query("SELECT id FROM shopping_list WHERE product_id = $id LIMIT 1");
        $check2 = $conn->query("SELECT id FROM prices WHERE product_id = $id LIMIT 1");
        if ($check1->num_rows > 0 || $check2->num_rows > 0) exit_with_error("Impossibile eliminare: il prodotto è in uso");
        $stmt = $conn->prepare("DELETE FROM products WHERE id = ?");
        $stmt->bind_param("i", $id);
        if ($stmt->execute()) echo json_encode(array('message' => 'Prodotto eliminato'));
        else exit_with_error("Errore eliminazione prodotto");
        break;

    // --- SUPERMARKETS ---
    case 'get_supermarkets':
        $result = $conn->query("SELECT * FROM supermarkets ORDER BY name ASC");
        $data = array();
        while ($row = $result->fetch_assoc()) $data[] = $row;
        echo json_encode($data);
        break;

    // --- PREZZI ---
    case 'add_price':
        $product_id = isset($_POST['product_id']) ? (int)$_POST['product_id'] : 0;
        $supermarket_id = isset($_POST['supermarket_id']) ? (int)$_POST['supermarket_id'] : 0;
        $price = isset($_POST['price']) ? (float)$_POST['price'] : 0;
        $format = isset($_POST['format']) ? $_POST['format'] : '';
        if (!$product_id || !$supermarket_id || !$price) exit_with_error("Dati incompleti");
        $stmt = $conn->prepare("INSERT INTO prices (product_id, supermarket_id, format, price, user_id) VALUES (?, ?, ?, ?, ?)");
        $stmt->bind_param("iisdi", $product_id, $supermarket_id, $format, $price, $user['id']);
        if ($stmt->execute()) echo json_encode(array('message' => 'Prezzo registrato'));
        else exit_with_error("Errore salvataggio prezzo");
        break;

    // --- LISTA SPESA ---
    case 'get_shopping_list':
        $sql = "SELECT sl.*, p.name as product_name, c.name as category_name, p.image_url, s.name as supermarket_name
                FROM shopping_list sl 
                JOIN products p ON sl.product_id = p.id 
                LEFT JOIN categories c ON p.category_id = c.id
                LEFT JOIN supermarkets s ON sl.supermarket_id = s.id
                ORDER BY sl.is_checked ASC, sl.created_at DESC";
        $result = $conn->query($sql);
        $data = array();
        while ($row = $result->fetch_assoc()) $data[] = $row;
        echo json_encode($data);
        break;

    case 'add_to_list':
        $data = get_json_input();
        $product_id = isset($data['product_id']) ? (int)$data['product_id'] : 0;
        $quantity = isset($data['quantity']) ? trim($data['quantity']) : '1';
        $supermarket_id = (isset($data['supermarket_id']) && $data['supermarket_id'] !== null && (int)$data['supermarket_id'] > 0) ? (int)$data['supermarket_id'] : null;
        if (!$product_id) exit_with_error("Prodotto obbligatorio");

        if ($supermarket_id !== null) {
            $stmt = $conn->prepare("INSERT INTO shopping_list (product_id, quantity, supermarket_id, added_by) VALUES (?, ?, ?, ?)");
            $stmt->bind_param("isii", $product_id, $quantity, $supermarket_id, $user['id']);
        } else {
            $stmt = $conn->prepare("INSERT INTO shopping_list (product_id, quantity, supermarket_id, added_by) VALUES (?, ?, NULL, ?)");
            $stmt->bind_param("isi", $product_id, $quantity, $user['id']);
        }

        if ($stmt->execute()) echo json_encode(array('id' => $stmt->insert_id, 'message' => 'Aggiunto alla lista'));
        else exit_with_error("Errore inserimento lista: " . $conn->error);
        break;

    case 'update_list_item':
        $data = get_json_input();
        $id = isset($data['id']) ? (int)$data['id'] : 0;
        $is_checked = isset($data['is_checked']) ? (int)$data['is_checked'] : 0;
        $quantity = isset($data['quantity']) ? trim($data['quantity']) : null;
        if (!$id) exit_with_error("ID obbligatorio");
        if ($quantity !== null) {
            $stmt = $conn->prepare("UPDATE shopping_list SET is_checked = ?, quantity = ? WHERE id = ?");
            $stmt->bind_param("isi", $is_checked, $quantity, $id);
        } else {
            $stmt = $conn->prepare("UPDATE shopping_list SET is_checked = ? WHERE id = ?");
            $stmt->bind_param("ii", $is_checked, $id);
        }
        if ($stmt->execute()) echo json_encode(array('message' => 'Aggiornato'));
        else exit_with_error("Errore aggiornamento");
        break;

    case 'delete_from_list':
        $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
        if (!$id) exit_with_error("ID obbligatorio");
        $stmt = $conn->prepare("DELETE FROM shopping_list WHERE id = ?");
        $stmt->bind_param("i", $id);
        if ($stmt->execute()) echo json_encode(array('message' => 'Eliminato'));
        else exit_with_error("Errore eliminazione");
        break;

    case 'clear_checked':
        if ($conn->query("DELETE FROM shopping_list WHERE is_checked = 1")) {
            echo json_encode(array('message' => 'Articoli spuntati rimossi'));
        } else {
            exit_with_error("Errore pulizia lista");
        }
        break;

    default:
        exit_with_error("Azione non valida: " . $action, 404);
}

function exit_with_error($msg, $code = 400) {
    header("HTTP/1.1 $code");
    echo json_encode(array('error' => $msg));
    exit;
}

function get_json_input() {
    return json_decode(file_get_contents('php://input'), true);
}

function ensure_shopping_list_supermarket_column($conn) {
    static $alreadyChecked = false;
    if ($alreadyChecked) return;

    $columnCheck = $conn->query("SHOW COLUMNS FROM shopping_list LIKE 'supermarket_id'");
    if ($columnCheck && $columnCheck->num_rows > 0) {
        $row = $columnCheck->fetch_assoc();
        if ($row['Null'] === 'NO') {
            $conn->query("ALTER TABLE shopping_list MODIFY supermarket_id INT(11) NULL DEFAULT NULL");
        }
    } else {
        $conn->query("ALTER TABLE shopping_list ADD COLUMN supermarket_id INT(11) NULL DEFAULT NULL AFTER quantity");
        $conn->query("ALTER TABLE shopping_list ADD KEY supermarket_id (supermarket_id)");
    }

    $alreadyChecked = true;
}
