<?php
/**
 * Gestione Autenticazione
 */

require_once 'db.php';

function requireLogin() {
    enforce_session_timeout(false, 'login.php');
    if (!isset($_SESSION['user_id'])) {
        header("Location: login.php");
        exit;
    }
}

/**
 * Versione per API: restituisce JSON 401 se non autorizzato
 */
function requireLoginApi() {
    enforce_session_timeout(true, 'login.php');
    if (!isset($_SESSION['user_id'])) {
        header('Content-Type: application/json');
        header('HTTP/1.1 401 Unauthorized');
        echo json_encode(array('error' => 'Non autorizzato'));
        exit;
    }
}

function currentUser() {
    $id = isset($_SESSION['user_id']) ? $_SESSION['user_id'] : null;
    $username = isset($_SESSION['username']) ? $_SESSION['username'] : 'Ospite';
    $role = isset($_SESSION['role']) ? normalize_role($_SESSION['role']) : 'child';
    
    return array(
        'id' => $id,
        'username' => $username,
        'role' => $role
    );
}

function supported_roles() {
    return array('admin', 'adult', 'child');
}

function normalize_role($role) {
    $value = strtolower(trim((string)$role));
    return in_array($value, supported_roles(), true) ? $value : 'child';
}

function user_has_any_role($user, $allowedRoles) {
    if (!is_array($allowedRoles)) $allowedRoles = array($allowedRoles);
    $role = isset($user['role']) ? normalize_role($user['role']) : 'child';
    return in_array($role, $allowedRoles, true);
}

function require_roles_api($allowedRoles) {
    requireLoginApi();
    $user = currentUser();
    if (!user_has_any_role($user, $allowedRoles)) {
        header('Content-Type: application/json');
        header('HTTP/1.1 403 Forbidden');
        echo json_encode(array('error' => 'Permesso negato'));
        exit;
    }
    return $user;
}

function require_roles_page($allowedRoles, $homePath) {
    if (!isset($_SESSION['user_id'])) {
        header("Location: " . $homePath . "login.php");
        exit;
    }

    enforce_session_timeout(false, $homePath . 'login.php');

    $user = currentUser();
    if (!user_has_any_role($user, $allowedRoles)) {
        echo "<h1>Accesso Negato</h1><p>Non hai i permessi per accedere a questa sezione.</p><a href='" . htmlspecialchars($homePath . "home.php") . "'>Torna alla Home</a>";
        exit;
    }
    return $user;
}

function require_admin_api() {
    return require_roles_api(array('admin'));
}

function require_admin_page($homePath) {
    return require_roles_page(array('admin'), $homePath);
}

function enforce_session_timeout($apiMode, $loginPath) {
    $timeoutSeconds = 259200; // 3 giorni
    if (!isset($_SESSION['user_id'])) return;

    if (isset($_SESSION['last_activity']) && (time() - (int)$_SESSION['last_activity'] > $timeoutSeconds)) {
        session_unset();
        session_destroy();
        if ($apiMode) {
            header('Content-Type: application/json');
            header('HTTP/1.1 401 Unauthorized');
            echo json_encode(array('error' => 'Sessione scaduta'));
            exit;
        }
        header("Location: " . $loginPath);
        exit;
    }

    $_SESSION['last_activity'] = time();
}

/**
 * Tenta il login
 * @param string $username
 * @param string $password
 * @return bool|string True se successo, altrimenti messaggio di errore
 */
function login($username, $password) {
    global $conn;
    
    // In PHP vecchio, usiamo prepared statements con mysqli
    $stmt = $conn->prepare("SELECT id, username, password, role FROM users WHERE username = ?");
    if (!$stmt) {
        return "Errore di sistema: " . $conn->error;
    }
    
    $stmt->bind_param("s", $username);
    $stmt->execute();
    
    // Fallback per get_result() che potrebbe non essere disponibile in alcune installazioni mysqlnd
    $stmt->store_result();
    if ($stmt->num_rows === 1) {
        $stmt->bind_result($id, $uname, $db_password, $role);
        $stmt->fetch();
        
        $authenticated = false;
        
        // Verifica password: prova password_verify (PHP 5.5+) altrimenti md5 (legacy)
        if (function_exists('password_verify')) {
            if (password_verify($password, $db_password)) {
                $authenticated = true;
            }
        } 
        
        // Se non autenticato con password_verify (o non esiste), prova MD5
        if (!$authenticated && $db_password === md5($password)) {
            $authenticated = true;
        }

        if ($authenticated) {
            // Rigenera ID sessione per sicurezza
            session_regenerate_id(true);
            
            $_SESSION['user_id'] = $id;
            $_SESSION['username'] = $uname;
            $_SESSION['role'] = normalize_role($role);
            $_SESSION['last_activity'] = time();
            
            return true;
        }
    }
    
    return "Username o password errati";
}
