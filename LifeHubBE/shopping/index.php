<?php
session_start();
require_once '../includes/auth.php';

// Protezione immediata lato server: se non loggato, reindirizza al login
if (!isset($_SESSION['user_id'])) {
    header("Location: ../login.php");
    exit;
}

// Se loggato, servi il file index.html reale generato da Angular
// Assumiamo che il file index.html originale sia stato rinominato in index_app.html durante il deploy
// O semplicemente leggiamo e serviamo il file index.html (ma attenzione ai loop)
readfile('index.html');
?>
