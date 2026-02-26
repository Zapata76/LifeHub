<?php
session_start();
require_once 'includes/auth.php';

// Se già loggato, vai alla home
if (isset($_SESSION['user_id'])) {
    header("Location: home.php");
    exit;
}

$error = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $username = isset($_POST['username']) ? trim($_POST['username']) : '';
    $password = isset($_POST['password']) ? $_POST['password'] : '';
    
    if ($username && $password) {
        $result = login($username, $password);
        if ($result === true) {
            header("Location: home.php");
            exit;
        } else {
            $error = $result;
        }
    } else {
        $error = "Inserire username e password";
    }
}
?>
<!DOCTYPE html>
<html lang="it">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Login - Hub Corso Umberto</title>
    <style>
        :root {
            --bg-color: #121212;
            --card-color: #1e1e1e;
            --hover-color: #2a2a2a;
            --primary-color: #4f8cff;
            --text-color: #e4e4e4;
            --muted-color: #9aa0a6;
            --danger-color: #ff5c5c;
        }

        body {
            background-color: var(--bg-color);
            color: var(--text-color);
            font-family: system-ui, -apple-system, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
        }

        .login-card {
            background-color: var(--card-color);
            padding: 40px;
            border-radius: 12px;
            width: 100%;
            max-width: 400px;
            box-shadow: 0 4px 15px rgba(0,0,0,0.5);
        }

        .login-card h1 {
            text-align: center;
            color: var(--primary-color);
            margin-bottom: 30px;
        }

        .form-group {
            margin-bottom: 20px;
        }

        .form-group label {
            display: block;
            margin-bottom: 8px;
            color: var(--muted-color);
        }

        .form-group input {
            width: 100%;
            padding: 12px;
            border-radius: 6px;
            border: 1px solid var(--hover-color);
            background-color: var(--bg-color);
            color: var(--text-color);
            box-sizing: border-box;
        }

        .form-group input:focus {
            outline: none;
            border-color: var(--primary-color);
        }

        .login-btn {
            width: 100%;
            padding: 12px;
            background-color: var(--primary-color);
            color: white;
            border: none;
            border-radius: 6px;
            font-size: 1rem;
            font-weight: bold;
            cursor: pointer;
            transition: opacity 0.2s;
        }

        .login-btn:hover {
            opacity: 0.9;
        }

        .error-msg {
            background-color: rgba(255, 92, 92, 0.1);
            color: var(--danger-color);
            padding: 10px;
            border-radius: 4px;
            margin-bottom: 20px;
            text-align: center;
            border: 1px solid var(--danger-color);
        }
    </style>
</head>
<body>
    <div class="login-card">
        <h1>Hub Corso Umberto</h1>
        
        <?php if ($error): ?>
            <div class="error-msg"><?php echo htmlspecialchars($error); ?></div>
        <?php endif; ?>

        <form method="POST" action="login.php">
            <div class="form-group">
                <label for="username">Username</label>
                <input type="text" id="username" name="username" required autofocus>
            </div>
            <div class="form-group">
                <label for="password">Password</label>
                <input type="password" id="password" name="password" required>
            </div>
            <button type="submit" class="login-btn">Accedi</button>
        </form>
    </div>
</body>
</html>
