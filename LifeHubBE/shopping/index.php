<?php
session_start();
require_once '../includes/auth.php';

$user = require_roles_page(array('admin', 'adult', 'child'), '../');

// Se loggato, servi il file index.html reale generato da Angular
// Assumiamo che il file index.html originale sia stato rinominato in index_app.html durante il deploy
// O semplicemente leggiamo e serviamo il file index.html (ma attenzione ai loop)
readfile('index.html');
?>
