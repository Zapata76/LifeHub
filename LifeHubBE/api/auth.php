<?php
/**
 * API Autenticazione per LifeHubFE
 */
session_start();
require_once '../includes/auth.php';

header('Content-Type: application/json');

$action = isset($_GET['action']) ? $_GET['action'] : 'me';

switch ($action) {
    case 'me':
        if (!isset($_SESSION['user_id'])) {
            exit_with_error('Non autorizzato', 401);
        }
        enforce_session_timeout(true, '../login.php');
        echo json_encode(currentUser());
        break;

    case 'login':
        $data = get_json_input();
        $username = isset($data['username']) ? trim($data['username']) : '';
        $password = isset($data['password']) ? (string)$data['password'] : '';

        if ($username === '' || $password === '') {
            exit_with_error('Username e password obbligatori');
        }

        $result = login($username, $password);
        if ($result === true) {
            echo json_encode(array(
                'message' => 'Login effettuato',
                'user' => currentUser()
            ));
        } else {
            exit_with_error($result, 401);
        }
        break;

    case 'logout':
        session_unset();
        session_destroy();
        echo json_encode(array('message' => 'Logout effettuato'));
        break;

    default:
        exit_with_error('Azione non valida: ' . $action, 404);
}

function get_json_input() {
    return json_decode(file_get_contents('php://input'), true);
}

function exit_with_error($msg, $code = 400) {
    header("HTTP/1.1 $code");
    echo json_encode(array('error' => $msg));
    exit;
}
?>
