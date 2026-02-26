<?php
session_start();
require_once '../includes/auth.php';

// Protezione Attività: Solo admin e adult
if (!isset($_SESSION['user_id'])) {
    header("Location: ../login.php");
    exit;
}

$user = currentUser();
if (!in_array($user['role'], array('admin', 'adult'))) {
    echo "<h1>Accesso Negato</h1><p>Non hai i permessi per accedere alla sezione Attività.</p><a href='../home.php'>Torna alla Home</a>";
    exit;
}

// Servi l'app Angular Tasks
if (file_exists('index.html')) {
    readfile('index.html');
} else {
    echo "<h1>App in fase di deploy</h1><p>L'applicazione Angular delle Attività non è ancora stata caricata.</p>";
}
?>
