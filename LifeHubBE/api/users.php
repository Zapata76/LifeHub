<?php
/**
 * API Gestione Utenti (solo admin)
 */
session_start();
require_once '../includes/auth.php';

$user = require_admin_api();
header('Content-Type: application/json');

ensure_users_schema($conn);

$action = isset($_GET['action']) ? $_GET['action'] : '';

switch ($action) {
    case 'get_users':
        $result = $conn->query("SELECT id, username, role FROM users ORDER BY username ASC");
        if (!$result) exit_with_error("Errore query utenti: " . $conn->error, 500);

        $rows = array();
        while ($row = $result->fetch_assoc()) $rows[] = $row;
        echo json_encode($rows);
        break;

    case 'get_roles':
        echo json_encode(supported_roles());
        break;

    case 'create_user':
        $data = get_json_input();
        $username = isset($data['username']) ? trim($data['username']) : '';
        $password = isset($data['password']) ? (string)$data['password'] : '';
        $role = isset($data['role']) ? normalize_role($data['role']) : 'adult';

        if ($username === '' || $password === '') {
            exit_with_error("Username e password obbligatori");
        }
        if (!preg_match('/^[a-zA-Z0-9._-]{3,50}$/', $username)) {
            exit_with_error("Username non valido (3-50 caratteri: lettere, numeri, . _ -)");
        }
        if (strlen($password) < 4) {
            exit_with_error("Password troppo corta (minimo 4 caratteri)");
        }

        $hash = password_hash_legacy_safe($password);
        $stmt = $conn->prepare("INSERT INTO users (username, password, role) VALUES (?, ?, ?)");
        if (!$stmt) exit_with_error("Errore prepare: " . $conn->error, 500);
        $stmt->bind_param("sss", $username, $hash, $role);
        if (!$stmt->execute()) {
            if ((int)$conn->errno === 1062) {
                exit_with_error("Username già esistente", 409);
            }
            exit_with_error("Errore creazione utente: " . $stmt->error, 500);
        }

        echo json_encode(array(
            'message' => 'Utente creato',
            'id' => (int)$stmt->insert_id
        ));
        break;

    case 'update_user_role':
        $data = get_json_input();
        $id = isset($data['id']) ? (int)$data['id'] : 0;
        $role = isset($data['role']) ? normalize_role($data['role']) : '';
        if ($id <= 0 || $role === '') exit_with_error("Dati non validi");

        $target = find_user_by_id($conn, $id);
        if (!$target) exit_with_error("Utente non trovato", 404);

        if ((int)$target['id'] === (int)$user['id'] && $role !== 'admin') {
            if (count_admins($conn) <= 1) {
                exit_with_error("Non puoi rimuovere l'ultimo admin", 400);
            }
        }

        if ($target['role'] === 'admin' && $role !== 'admin' && count_admins($conn) <= 1) {
            exit_with_error("Non puoi rimuovere l'ultimo admin", 400);
        }

        $stmt = $conn->prepare("UPDATE users SET role = ? WHERE id = ?");
        if (!$stmt) exit_with_error("Errore prepare: " . $conn->error, 500);
        $stmt->bind_param("si", $role, $id);
        if (!$stmt->execute()) exit_with_error("Errore aggiornamento ruolo: " . $stmt->error, 500);

        if ((int)$id === (int)$user['id']) {
            $_SESSION['role'] = $role;
        }

        echo json_encode(array('message' => 'Ruolo aggiornato'));
        break;

    case 'update_user_password':
        $data = get_json_input();
        $id = isset($data['id']) ? (int)$data['id'] : 0;
        $password = isset($data['password']) ? (string)$data['password'] : '';
        if ($id <= 0 || $password === '') exit_with_error("Dati non validi");
        if (strlen($password) < 4) exit_with_error("Password troppo corta (minimo 4 caratteri)");

        $target = find_user_by_id($conn, $id);
        if (!$target) exit_with_error("Utente non trovato", 404);

        $hash = password_hash_legacy_safe($password);
        $stmt = $conn->prepare("UPDATE users SET password = ? WHERE id = ?");
        if (!$stmt) exit_with_error("Errore prepare: " . $conn->error, 500);
        $stmt->bind_param("si", $hash, $id);
        if (!$stmt->execute()) exit_with_error("Errore aggiornamento password: " . $stmt->error, 500);

        echo json_encode(array('message' => 'Password aggiornata'));
        break;

    case 'delete_user':
        $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
        if ($id <= 0) exit_with_error("ID non valido");

        $target = find_user_by_id($conn, $id);
        if (!$target) exit_with_error("Utente non trovato", 404);
        if ((int)$target['id'] === (int)$user['id']) exit_with_error("Non puoi eliminare il tuo utente", 400);
        if ($target['role'] === 'admin' && count_admins($conn) <= 1) {
            exit_with_error("Non puoi eliminare l'ultimo admin", 400);
        }

        $stmt = $conn->prepare("DELETE FROM users WHERE id = ?");
        if (!$stmt) exit_with_error("Errore prepare: " . $conn->error, 500);
        $stmt->bind_param("i", $id);
        if (!$stmt->execute()) exit_with_error("Errore eliminazione utente: " . $stmt->error, 500);

        echo json_encode(array('message' => 'Utente eliminato'));
        break;

    default:
        exit_with_error("Azione non valida: " . $action, 404);
}

function get_json_input() {
    return json_decode(file_get_contents('php://input'), true);
}

function exit_with_error($message, $code = 400) {
    header("HTTP/1.1 $code");
    echo json_encode(array('error' => $message));
    exit;
}

function password_hash_legacy_safe($plainPassword) {
    if (function_exists('password_hash') && defined('PASSWORD_BCRYPT')) {
        $hash = password_hash($plainPassword, PASSWORD_BCRYPT);
        if ($hash !== false) return $hash;
    }
    return md5($plainPassword);
}

function find_user_by_id($conn, $id) {
    $stmt = $conn->prepare("SELECT id, username, role FROM users WHERE id = ? LIMIT 1");
    if (!$stmt) return null;
    $stmt->bind_param("i", $id);
    $stmt->execute();
    $stmt->store_result();
    if ($stmt->num_rows !== 1) return null;
    $stmt->bind_result($uid, $uname, $role);
    $stmt->fetch();
    return array(
        'id' => (int)$uid,
        'username' => $uname,
        'role' => normalize_role($role)
    );
}

function count_admins($conn) {
    $result = $conn->query("SELECT COUNT(*) AS total FROM users WHERE role = 'admin'");
    if (!$result) return 0;
    $row = $result->fetch_assoc();
    return isset($row['total']) ? (int)$row['total'] : 0;
}

function ensure_users_schema($conn) {
    $conn->query("CREATE TABLE IF NOT EXISTS users (
        id INT(11) NOT NULL AUTO_INCREMENT,
        username VARCHAR(50) NOT NULL,
        password VARCHAR(255) NOT NULL,
        role ENUM('admin','adult','child') NOT NULL DEFAULT 'adult',
        PRIMARY KEY (id),
        UNIQUE KEY username (username)
    ) ENGINE=MyISAM DEFAULT CHARSET=latin1");

    ensure_column($conn, 'users', 'role', "ENUM('admin','adult','child') NOT NULL DEFAULT 'adult' AFTER password");
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
?>
