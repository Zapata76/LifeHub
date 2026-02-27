<?php
session_start();
require_once '../includes/auth.php';

$user = require_roles_page(array('admin', 'adult', 'child'), '../');

if (file_exists('index.html')) {
    readfile('index.html');
} else {
    echo "<h1>App in fase di deploy</h1><p>L'applicazione Angular Ricette non e ancora stata caricata.</p>";
}
?>
