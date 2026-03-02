<?php
/**
 * API Router for Goals & Habits
 */
session_start();
require_once '../includes/auth.php';
$user = require_roles_api(array('admin', 'adult', 'child'));

header('Content-Type: application/json');

$action = isset($_GET['action']) ? $_GET['action'] : '';

switch ($action) {
    case 'get_goals':
        $sql = "SELECT g.*, u.username as owner_name 
                FROM goals g 
                JOIN users u ON g.owner_id = u.id 
                ORDER BY g.created_at DESC";
        $result = $conn->query($sql);
        $goals = array();
        while ($row = $result->fetch_assoc()) {
            $goal_id = $row['id'];
            // Fetch trackers for this goal
            $tracker_sql = "SELECT * FROM trackers WHERE goal_id = $goal_id";
            $tracker_result = $conn->query($tracker_sql);
            $row['trackers'] = array();
            while ($tracker_row = $tracker_result->fetch_assoc()) {
                $tracker_id = $tracker_row['id'];
                // Fetch latest logs for this tracker
                $log_sql = "SELECT * FROM goal_logs WHERE tracker_id = $tracker_id ORDER BY log_date DESC LIMIT 30";
                $log_result = $conn->query($log_sql);
                $tracker_row['logs'] = array();
                while ($log_row = $log_result->fetch_assoc()) {
                    $tracker_row['logs'][] = $log_row;
                }
                $row['trackers'][] = $tracker_row;
            }
            $goals[] = $row;
        }
        echo json_encode($goals);
        break;

    case 'save_goal':
        $data = json_decode(file_get_contents('php://input'), true);
        $id = isset($data['id']) ? (int)$data['id'] : 0;
        $title = isset($data['title']) ? trim($data['title']) : '';
        $description = isset($data['description']) ? $data['description'] : '';
        $start_date = !empty($data['start_date']) ? $data['start_date'] : null;
        $end_date = !empty($data['end_date']) ? $data['end_date'] : null;
        $owner_id = isset($data['owner_id']) ? (int)$data['owner_id'] : $user['id'];
        $status = isset($data['status']) ? $data['status'] : 'active';

        if (!$title) exit_with_error("Title is required");

        if ($id > 0) {
            $stmt = $conn->prepare("UPDATE goals SET title = ?, description = ?, start_date = ?, end_date = ?, owner_id = ?, status = ? WHERE id = ?");
            $stmt->bind_param("ssssisi", $title, $description, $start_date, $end_date, $owner_id, $status, $id);
        } else {
            $stmt = $conn->prepare("INSERT INTO goals (title, description, start_date, end_date, owner_id, status) VALUES (?, ?, ?, ?, ?, ?)");
            $stmt->bind_param("ssssis", $title, $description, $start_date, $end_date, $owner_id, $status);
        }

        if ($stmt->execute()) {
            $goal_id = ($id > 0 ? $id : $stmt->insert_id);
            
            // Handle trackers if provided
            if (isset($data['trackers']) && is_array($data['trackers'])) {
                foreach ($data['trackers'] as $tracker) {
                    $t_id = isset($tracker['id']) ? (int)$tracker['id'] : 0;
                    $type = $tracker['type'];
                    $frequency = $tracker['frequency'];
                    
                    if ($t_id > 0) {
                        $t_stmt = $conn->prepare("UPDATE trackers SET type = ?, frequency = ? WHERE id = ? AND goal_id = ?");
                        $t_stmt->bind_param("ssii", $type, $frequency, $t_id, $goal_id);
                    } else {
                        $t_stmt = $conn->prepare("INSERT INTO trackers (goal_id, type, frequency) VALUES (?, ?, ?)");
                        $t_stmt->bind_param("iss", $goal_id, $type, $frequency);
                    }
                    $t_stmt->execute();
                }
            }
            
            echo json_encode(array('message' => 'Goal saved', 'id' => $goal_id));
        } else {
            exit_with_error("Error saving goal: " . $conn->error);
        }
        break;

    case 'delete_goal':
        $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
        if (!$id) exit_with_error("Missing ID");
        
        // Delete logs and trackers first (since we are on MyISAM and don't have cascade delete usually)
        $conn->query("DELETE FROM goal_logs WHERE tracker_id IN (SELECT id FROM trackers WHERE goal_id = $id)");
        $conn->query("DELETE FROM trackers WHERE goal_id = $id");
        
        $stmt = $conn->prepare("DELETE FROM goals WHERE id = ?");
        $stmt->bind_param("i", $id);
        if ($stmt->execute()) echo json_encode(array('message' => 'Goal deleted'));
        else exit_with_error("Error deleting goal");
        break;

    case 'add_log':
        $data = json_decode(file_get_contents('php://input'), true);
        $tracker_id = (int)$data['tracker_id'];
        $log_date = !empty($data['log_date']) ? $data['log_date'] : date('Y-m-d');
        $value = (float)$data['value'];
        $notes = isset($data['notes']) ? $data['notes'] : '';

        $stmt = $conn->prepare("INSERT INTO goal_logs (tracker_id, log_date, value, notes) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE value = ?, notes = ?");
        // Note: MyISAM doesn't support ON DUPLICATE KEY UPDATE with PRIMARY KEY AUTO_INCREMENT in some cases, 
        // but here we don't have a unique key on (tracker_id, log_date). Let's check if we should add one.
        // For simplicity, let's just insert for now.
        $stmt = $conn->prepare("INSERT INTO goal_logs (tracker_id, log_date, value, notes) VALUES (?, ?, ?, ?)");
        $stmt->bind_param("isds", $tracker_id, $log_date, $value, $notes);
        
        if ($stmt->execute()) {
            echo json_encode(array('message' => 'Log added', 'id' => $stmt->insert_id));
        } else {
            exit_with_error("Error adding log: " . $conn->error);
        }
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
