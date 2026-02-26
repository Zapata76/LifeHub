<?php
/**
 * Gestione Autenticazione
 */

require_once 'db.php';

function requireLogin() {
    if (!isset($_SESSION['user_id'])) {
        header("Location: login.php");
        exit;
    }
}

/**
 * Versione per API: restituisce JSON 401 se non autorizzato
 */
function requireLoginApi() {
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
    $role = isset($_SESSION['role']) ? $_SESSION['role'] : 'user';
    
    return array(
        'id' => $id,
        'username' => $username,
        'role' => $role
    );
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
            $_SESSION['role'] = $role;
            $_SESSION['last_activity'] = time();
            
            return true;
        }
    }
    
    return "Username o password errati";
}
