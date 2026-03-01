<?php
/**
 * API Router for the Documents App
 */
session_start();
require_once '../includes/auth.php';
// Restrict to admin and adult as per home-page.component.ts logic
$user = require_roles_api(array('admin', 'adult'));

header('Content-Type: application/json');

$action = isset($_GET['action']) ? $_GET['action'] : '';

switch ($action) {
    
    case 'get_documents':
        $search = isset($_GET['search']) ? trim($_GET['search']) : '';
        $sql = "SELECT * FROM documents";
        
        if ($search !== '') {
            $s = $conn->real_escape_string('%' . $search . '%');
            $sql .= " WHERE title LIKE '$s' OR category LIKE '$s' OR tags LIKE '$s' OR notes LIKE '$s'";
        }
        
        $sql .= " ORDER BY created_at DESC";
        
        $result = $conn->query($sql);
        if (!$result) exit_with_error("Error querying documents: " . $conn->error);
        
        $data = array();
        while ($row = $result->fetch_assoc()) $data[] = $row;
        echo json_encode($data);
        break;

    case 'save_document':
        // Handle file upload if present
        $file_path = isset($_POST['existing_file_path']) ? $_POST['existing_file_path'] : '';
        
        if (isset($_FILES['file']) && $_FILES['file']['error'] == 0) {
            $target_dir = "../uploads/documents/";
            if (!file_exists($target_dir)) {
                mkdir($target_dir, 0777, true);
            }
            $filename = time() . "_" . basename($_FILES["file"]["name"]);
            $target_file = $target_dir . $filename;
            if (move_uploaded_file($_FILES["file"]["tmp_name"], $target_file)) {
                $file_path = "uploads/documents/" . $filename;
            } else {
                exit_with_error("Error uploading file");
            }
        }

        $id = isset($_POST['id']) ? (int)$_POST['id'] : 0;
        $title = isset($_POST['title']) ? trim($_POST['title']) : '';
        $category = isset($_POST['category']) ? $_POST['category'] : '';
        $tags = isset($_POST['tags']) ? $_POST['tags'] : '';
        $notes = isset($_POST['notes']) ? $_POST['notes'] : '';

        if (!$title) exit_with_error("Title is required");
        if (!$file_path) exit_with_error("File is required");

        if ($id > 0) {
            $stmt = $conn->prepare("UPDATE documents SET title = ?, category = ?, file_path = ?, tags = ?, notes = ? WHERE id = ?");
            if (!$stmt) exit_with_error("Prepare error: " . $conn->error);
            $stmt->bind_param("sssssi", $title, $category, $file_path, $tags, $notes, $id);
        } else {
            $stmt = $conn->prepare("INSERT INTO documents (title, category, file_path, tags, notes, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, NOW())");
            if (!$stmt) exit_with_error("Prepare error: " . $conn->error);
            $stmt->bind_param("sssssi", $title, $category, $file_path, $tags, $notes, $user['id']);
        }

        if ($stmt->execute()) {
            echo json_encode(array('message' => 'Document saved', 'id' => ($id > 0 ? $id : $stmt->insert_id)));
        } else {
            exit_with_error("Error saving document: " . $stmt->error);
        }
        break;

    case 'delete_document':
        $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
        if (!$id) exit_with_error("Missing ID");
        
        // Get file path to delete file too
        $stmt = $conn->prepare("SELECT file_path FROM documents WHERE id = ?");
        if (!$stmt) exit_with_error("Prepare error: " . $conn->error);
        $stmt->bind_param("i", $id);
        $stmt->execute();
        $stmt->store_result();
        if ($stmt->num_rows > 0) {
            $f_path = '';
            $stmt->bind_result($f_path);
            $stmt->fetch();
            $full_path = "../" . $f_path;
            if (file_exists($full_path)) {
                unlink($full_path);
            }
        }
        $stmt->close();

        $stmt = $conn->prepare("DELETE FROM documents WHERE id = ?");
        if (!$stmt) exit_with_error("Prepare error: " . $conn->error);
        $stmt->bind_param("i", $id);
        if ($stmt->execute()) echo json_encode(array('message' => 'Document deleted'));
        else exit_with_error("Error deleting document: " . $stmt->error);
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
