<?php
/**
 * Router API Unificato per l'App Note
 */
session_start();
require_once '../includes/auth.php';
$user = require_roles_api(array('admin', 'adult', 'child'));

header('Content-Type: application/json');

$action = isset($_GET['action']) ? $_GET['action'] : '';
$method = $_SERVER['REQUEST_METHOD'];

switch ($action) {
    
    case 'get_notes':
        $sql = "SELECT n.*, u.username as author FROM notes n 
                JOIN users u ON n.created_by = u.id 
                ORDER BY n.is_pinned DESC, n.updated_at DESC";
        $result = $conn->query($sql);
        
        if (!$result) {
            header('HTTP/1.1 500 Internal Server Error');
            echo json_encode(array('error' => 'Errore query: ' . $conn->error));
            exit;
        }

        $data = array();
        while ($row = $result->fetch_assoc()) $data[] = $row;
        echo json_encode($data);
        break;

    case 'save_note':
        // Supporto per Multipart (Foto) o JSON
        $id = isset($_POST['id']) ? (int)$_POST['id'] : 0;
        $title = isset($_POST['title']) ? trim($_POST['title']) : 'Senza titolo';
        $content = isset($_POST['content']) ? $_POST['content'] : '';
        $color = isset($_POST['color']) ? $_POST['color'] : '#1e1e1e';
        $is_pinned = isset($_POST['is_pinned']) ? (int)$_POST['is_pinned'] : 0;
        $image_url = isset($_POST['existing_image']) ? $_POST['existing_image'] : null;

        // Gestione upload foto
        if (isset($_FILES['photo']) && $_FILES['photo']['error'] === UPLOAD_ERR_OK) {
            $ext = pathinfo($_FILES['photo']['name'], PATHINFO_EXTENSION);
            $filename = uniqid('note_') . '.' . $ext;
            if (!is_dir('../uploads/notes')) mkdir('../uploads/notes', 0777, true);
            $image_url = 'uploads/notes/' . $filename;
            move_uploaded_file($_FILES['photo']['tmp_name'], '../' . $image_url);
        }

        if ($id > 0) {
            // Update
            $stmt = $conn->prepare("UPDATE notes SET title = ?, content = ?, color = ?, is_pinned = ?, image_url = ?, updated_by = ? WHERE id = ?");
            if (!$stmt) exit_with_sql_error($conn);
            $stmt->bind_param("sssisii", $title, $content, $color, $is_pinned, $image_url, $user['id'], $id);
        } else {
            // Insert
            $stmt = $conn->prepare("INSERT INTO notes (title, content, color, is_pinned, image_url, created_by, updated_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())");
            if (!$stmt) exit_with_sql_error($conn);
            $stmt->bind_param("sssisii", $title, $content, $color, $is_pinned, $image_url, $user['id'], $user['id']);
        }

        if ($stmt->execute()) {
            echo json_encode(array('message' => 'Nota salvata', 'id' => ($id > 0 ? $id : $stmt->insert_id)));
        } else {
            header('HTTP/1.1 500 Internal Server Error');
            echo json_encode(array('error' => 'Errore esecuzione: ' . $stmt->error));
        }
        break;

    case 'delete_note':
        $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
        if (!$id) {
            header('HTTP/1.1 400 Bad Request');
            exit;
        }
        $stmt = $conn->prepare("DELETE FROM notes WHERE id = ?");
        if (!$stmt) exit_with_sql_error($conn);
        $stmt->bind_param("i", $id);
        if ($stmt->execute()) echo json_encode(array('message' => 'Nota eliminata'));
        else echo json_encode(array('error' => 'Errore eliminazione: ' . $stmt->error));
        break;

    default:
        header('HTTP/1.1 404 Not Found');
        echo json_encode(array('error' => 'Azione non valida: ' . $action));
}

function exit_with_sql_error($conn) {
    header('HTTP/1.1 500 Internal Server Error');
    echo json_encode(array('error' => 'Errore SQL: ' . $conn->error));
    exit;
}
?>
