<?php
/**
 * Gestione Connessione Database (MySQLi per compatibilità PHP 5.5)
 */

require_once 'config.php';

$conn = new mysqli(DB_HOST, DB_USER, DB_PASS, DB_NAME);

if ($conn->connect_error) {
    die("Connessione fallita: " . $conn->connect_error);
}

// Imposta charset corretto
$conn->set_charset("utf8");
