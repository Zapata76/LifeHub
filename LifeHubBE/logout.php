<?php
session_start();
session_unset();
session_destroy();

header("Location: /umbertini/login.php");
exit;
