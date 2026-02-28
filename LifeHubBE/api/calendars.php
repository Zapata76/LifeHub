<?php
/**
 * API Router for Calendar Management
 */
session_start();
require_once '../includes/auth.php';

// Auth check - standard users can only read, admins can manage
requireLoginApi();
$user = currentUser();
$isAdmin = ($user['role'] === 'admin');

header('Content-Type: application/json');

ensure_calendar_schema($conn);

$action = isset($_GET['action']) ? $_GET['action'] : 'get_my_calendars';

switch ($action) {

    case 'get_my_calendars':
        // Returns calendars associated with the logged-in user
        $stmt = $conn->prepare("SELECT c.* FROM calendars c
                                JOIN user_calendars uc ON c.id = uc.calendar_id
                                WHERE uc.user_id = ?
                                ORDER BY c.name ASC");
        $stmt->bind_param("i", $user['id']);
        $stmt->execute();
        echo json_encode(stmt_fetch_all_assoc($stmt));
        break;

    case 'get_all_calendars':
        // Admin only: list all defined calendars
        if (!$isAdmin) exit_with_error("Forbidden", 403);
        $result = $conn->query("SELECT * FROM calendars ORDER BY name ASC");
        $data = array();
        while ($row = $result->fetch_assoc()) $data[] = $row;
        echo json_encode($data);
        break;

    case 'get_user_associations':
        // Admin only: get which calendars are associated with which user
        if (!$isAdmin) exit_with_error("Forbidden", 403);
        $userId = isset($_GET['user_id']) ? (int)$_GET['user_id'] : 0;
        if (!$userId) exit_with_error("User ID required");
        
        $stmt = $conn->prepare("SELECT calendar_id FROM user_calendars WHERE user_id = ?");
        $stmt->bind_param("i", $userId);
        $stmt->execute();
        $rows = stmt_fetch_all_assoc($stmt);
        $ids = array();
        foreach($rows as $r) $ids[] = (int)$r['calendar_id'];
        echo json_encode($ids);
        break;

    case 'save_calendar':
        if (!$isAdmin) exit_with_error("Forbidden", 403);
        $data = get_json_input();
        $id = isset($data['id']) ? (int)$data['id'] : 0;
        $google_id = isset($data['google_id']) ? trim($data['google_id']) : '';
        $name = isset($data['name']) ? trim($data['name']) : '';

        if (!$google_id || !$name) exit_with_error("Google ID and Name are required");

        if ($id > 0) {
            $stmt = $conn->prepare("UPDATE calendars SET google_id = ?, name = ? WHERE id = ?");
            $stmt->bind_param("ssi", $google_id, $name, $id);
        } else {
            $stmt = $conn->prepare("INSERT INTO calendars (google_id, name) VALUES (?, ?)");
            $stmt->bind_param("ss", $google_id, $name);
        }

        if ($stmt->execute()) {
            echo json_encode(array('message' => 'Calendar saved', 'id' => ($id > 0 ? $id : $stmt->insert_id)));
        } else {
            exit_with_error("SQL Error: " . $conn->error);
        }
        break;

    case 'delete_calendar':
        if (!$isAdmin) exit_with_error("Forbidden", 403);
        $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
        if (!$id) exit_with_error("ID required");

        $conn->query("DELETE FROM user_calendars WHERE calendar_id = $id");
        $stmt = $conn->prepare("DELETE FROM calendars WHERE id = ?");
        $stmt->bind_param("i", $id);
        if ($stmt->execute()) echo json_encode(array('message' => 'Calendar deleted'));
        else exit_with_error("Deletion error");
        break;

    case 'update_user_associations':
        if (!$isAdmin) exit_with_error("Forbidden", 403);
        $data = get_json_input();
        $userId = isset($data['user_id']) ? (int)$data['user_id'] : 0;
        $calendarIds = isset($data['calendar_ids']) && is_array($data['calendar_ids']) ? $data['calendar_ids'] : array();
        
        if (!$userId) exit_with_error("User ID required");

        $conn->query("DELETE FROM user_calendars WHERE user_id = $userId");
        if (!empty($calendarIds)) {
            $stmt = $conn->prepare("INSERT INTO user_calendars (user_id, calendar_id) VALUES (?, ?)");
            foreach ($calendarIds as $calId) {
                $cid = (int)$calId;
                $stmt->bind_param("ii", $userId, $cid);
                $stmt->execute();
            }
        }
        echo json_encode(array('message' => 'Associations updated'));
        break;

    default:
        exit_with_error('Invalid action: ' . $action, 404);
}

function get_json_input() {
    return json_decode(file_get_contents('php://input'), true);
}

function exit_with_error($msg, $code = 400) {
    header("HTTP/1.1 $code");
    echo json_encode(array('error' => $msg));
    exit;
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
    // Fallback if mysqlnd is not installed
    $stmt->store_result();
    $meta = $stmt->result_metadata();
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
        foreach ($row as $key => $value) $copy[$key] = $value;
        $rows[] = $copy;
    }
    return $rows;
}

function ensure_calendar_schema($conn) {
    $conn->query("CREATE TABLE IF NOT EXISTS calendars (
        id INT(11) NOT NULL AUTO_INCREMENT,
        google_id VARCHAR(255) NOT NULL,
        name VARCHAR(100) NOT NULL,
        PRIMARY KEY (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8");

    $conn->query("CREATE TABLE IF NOT EXISTS user_calendars (
        user_id INT(11) NOT NULL,
        calendar_id INT(11) NOT NULL,
        PRIMARY KEY (user_id, calendar_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8");
}
?>
