<?php
/**
 * Database Connection Management (MySQLi for PHP 5.5 compatibility)
 */

require_once 'config.php';

$conn = new mysqli(DB_HOST, DB_USER, DB_PASS, DB_NAME);

if ($conn->connect_error) {
    die("Connection failed: " . $conn->connect_error);
}

// Set correct charset
$conn->set_charset("utf8");
