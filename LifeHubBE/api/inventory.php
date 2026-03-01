<?php
/**
 * API Router for the Inventory App
 */
session_start();
require_once '../includes/auth.php';
$user = require_roles_api(array('admin', 'adult', 'child'));

header('Content-Type: application/json');

$action = isset($_GET['action']) ? $_GET['action'] : '';

switch ($action) {
    
    case 'get_items':
        $search = isset($_GET['search']) ? trim($_GET['search']) : '';
        $sql = "SELECT i.*, u.username as owner_name, d.title as document_title 
                FROM inventory i 
                LEFT JOIN users u ON i.owner_id = u.id 
                LEFT JOIN documents d ON i.document_id = d.id";
        
        if ($search !== '') {
            $s = $conn->real_escape_string('%' . $search . '%');
            $sql .= " WHERE i.name LIKE '$s' OR i.location LIKE '$s' OR i.category LIKE '$s' OR i.notes LIKE '$s'";
        }
        
        $sql .= " ORDER BY i.name ASC";
        
        $result = $conn->query($sql);
        if (!$result) exit_with_error("Error querying inventory: " . $conn->error);
        
        $data = array();
        while ($row = $result->fetch_assoc()) $data[] = $row;
        echo json_encode($data);
        break;

    case 'save_item':
        $data = json_decode(file_get_contents('php://input'), true);
        $id = isset($data['id']) ? (int)$data['id'] : 0;
        $name = isset($data['name']) ? trim($data['name']) : '';
        $category = isset($data['category']) ? $data['category'] : '';
        $location = isset($data['location']) ? $data['location'] : '';
        $owner_id = (isset($data['owner_id']) && $data['owner_id'] != 0) ? (int)$data['owner_id'] : null;
        $notes = isset($data['notes']) ? $data['notes'] : '';
        $photo_url = isset($data['photo_url']) ? $data['photo_url'] : null;
        $document_id = (isset($data['document_id']) && $data['document_id'] != 0) ? (int)$data['document_id'] : null;
        $purchase_date = !empty($data['purchase_date']) ? $data['purchase_date'] : null;
        $warranty_expiry = !empty($data['warranty_expiry']) ? $data['warranty_expiry'] : null;

        if (!$name) exit_with_error("Name is required");

        if ($id > 0) {
            $stmt = $conn->prepare("UPDATE inventory SET name = ?, category = ?, location = ?, owner_id = ?, notes = ?, photo_url = ?, document_id = ?, purchase_date = ?, warranty_expiry = ? WHERE id = ?");
            if (!$stmt) exit_with_error("Prepare error: " . $conn->error);
            $stmt->bind_param("sssississi", $name, $category, $location, $owner_id, $notes, $photo_url, $document_id, $purchase_date, $warranty_expiry, $id);
        } else {
            $stmt = $conn->prepare("INSERT INTO inventory (name, category, location, owner_id, notes, photo_url, document_id, purchase_date, warranty_expiry, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())");
            if (!$stmt) exit_with_error("Prepare error: " . $conn->error);
            $stmt->bind_param("sssississi", $name, $category, $location, $owner_id, $notes, $photo_url, $document_id, $purchase_date, $warranty_expiry, $user['id']);
        }

        if ($stmt->execute()) {
            echo json_encode(array('message' => 'Item saved', 'id' => ($id > 0 ? $id : $stmt->insert_id)));
        } else {
            exit_with_error("Error saving item: " . $stmt->error);
        }
        break;

    case 'delete_item':
        $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
        if (!$id) exit_with_error("Missing ID");
        $stmt = $conn->prepare("DELETE FROM inventory WHERE id = ?");
        if (!$stmt) exit_with_error("Prepare error: " . $conn->error);
        $stmt->bind_param("i", $id);
        if ($stmt->execute()) echo json_encode(array('message' => 'Item deleted'));
        else exit_with_error("Error deleting item: " . $stmt->error);
        break;

    default:
        header('HTTP/1.1 404 Not Found');
        echo json_encode(array('error' => 'Invalid action'));
}

function exit_with_error($msg) {
    header('HTTP/1.1 500 Internal Server Error');
    echo json_encode(array('error' => $msg));
    exit;
}
?>
