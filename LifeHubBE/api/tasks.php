<?php
/**
 * Router API per l'App Attività (Tasks)
 */
session_start();
require_once '../includes/auth.php';

requireLoginApi();
$user = currentUser();

// Attività accessibili a admin e adult (child può vedere ma non editare, o come preferisci)
// Per ora seguiamo la specifica: admin e adult hanno accesso pieno.
if (!in_array($user['role'], array('admin', 'adult'))) {
    header('HTTP/1.1 403 Forbidden');
    echo json_encode(array('error' => 'Permesso negato'));
    exit;
}

header('Content-Type: application/json');

$action = isset($_GET['action']) ? $_GET['action'] : '';

switch ($action) {
    
    case 'get_tasks':
        $sql = "SELECT t.*, u.username as assigned_user 
                FROM tasks t 
                LEFT JOIN users u ON t.assigned_to = u.id 
                ORDER BY FIELD(priority, 'high', 'medium', 'low'), due_date ASC";
        $result = $conn->query($sql);
        $data = array();
        while ($row = $result->fetch_assoc()) $data[] = $row;
        echo json_encode($data);
        break;

    case 'save_task':
        $data = json_decode(file_get_contents('php://input'), true);
        $id = isset($data['id']) ? (int)$data['id'] : 0;
        $title = isset($data['title']) ? trim($data['title']) : '';
        $description = isset($data['description']) ? $data['description'] : '';
        $assigned_to = (isset($data['assigned_to']) && $data['assigned_to'] != 0) ? (int)$data['assigned_to'] : null;
        $status = isset($data['status']) ? $data['status'] : 'todo';
        $priority = isset($data['priority']) ? $data['priority'] : 'medium';
        $due_date = !empty($data['due_date']) ? $data['due_date'] : null;

        if (!$title) exit_with_error("Titolo obbligatorio");

        if ($id > 0) {
            $stmt = $conn->prepare("UPDATE tasks SET title = ?, description = ?, assigned_to = ?, status = ?, priority = ?, due_date = ? WHERE id = ?");
            $stmt->bind_param("ssisssi", $title, $description, $assigned_to, $status, $priority, $due_date, $id);
        } else {
            $stmt = $conn->prepare("INSERT INTO tasks (title, description, assigned_to, status, priority, due_date, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())");
            $stmt->bind_param("ssisssi", $title, $description, $assigned_to, $status, $priority, $due_date, $user['id']);
        }

        if ($stmt->execute()) {
            echo json_encode(array('message' => 'Task salvato', 'id' => ($id > 0 ? $id : $stmt->insert_id)));
        } else {
            exit_with_error("Errore salvataggio task: " . $conn->error);
        }
        break;

    case 'delete_task':
        $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
        if (!$id) exit_with_error("ID mancante");
        $stmt = $conn->prepare("DELETE FROM tasks WHERE id = ?");
        $stmt->bind_param("i", $id);
        if ($stmt->execute()) echo json_encode(array('message' => 'Task eliminato'));
        else exit_with_error("Errore eliminazione");
        break;

    case 'get_family_members':
        // Per assegnare task ai membri della famiglia
        $result = $conn->query("SELECT id, username, role FROM users ORDER BY username ASC");
        $data = array();
        if ($result) {
            while ($row = $result->fetch_assoc()) $data[] = $row;
        }
        echo json_encode($data);
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
