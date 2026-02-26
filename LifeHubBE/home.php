<?php
session_start();
require_once 'includes/auth.php';
requireLogin();

$user = currentUser();

// Controllo timeout sessione (3 giorni come da specifica)
if (isset($_SESSION['last_activity']) && (time() - $_SESSION['last_activity'] > 259200)) {
    session_unset();
    session_destroy();
    header("Location: login.php");
    exit;
}
$_SESSION['last_activity'] = time(); // Aggiorna ultima attività
?>
<!DOCTYPE html>
<html lang="it">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Hub Corso Umberto</title>
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

        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }

        body {
            background-color: var(--bg-color);
            color: var(--text-color);
            font-family: system-ui, -apple-system, sans-serif;
            line-height: 1.6;
        }

        /* Header */
        header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 1rem 2rem;
            background-color: var(--card-color);
            border-bottom: 1px solid var(--hover-color);
            position: sticky;
            top: 0;
            z-index: 100;
        }

        .logo {
            font-size: 1.5rem;
            font-weight: bold;
            color: var(--primary-color);
        }

        .user-info {
            display: flex;
            align-items: center; gap: 15px;
        }

        .user-details {
            text-align: right;
        }

        .username {
            font-weight: 500;
            display: block;
        }

        .role {
            font-size: 0.8rem;
            color: var(--muted-color);
            text-transform: uppercase;
        }

        .logout-btn {
            background-color: transparent;
            color: var(--danger-color);
            border: 1px solid var(--danger-color);
            padding: 6px 12px;
            border-radius: 4px;
            text-decoration: none;
            font-size: 0.9rem;
            transition: all 0.2s;
        }

        .logout-btn:hover {
            background-color: var(--danger-color);
            color: white;
        }

        /* Main Content */
        main {
            max-width: 1200px;
            margin: 40px auto;
            padding: 0 20px;
        }

        .grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
            gap: 20px;
        }

        /* Card Style */
        .card {
            background-color: var(--card-color);
            border-radius: 12px;
            padding: 30px;
            text-decoration: none;
            color: inherit;
            display: flex;
            flex-direction: column;
            align-items: center;
            text-align: center;
            transition: transform 0.2s, background-color 0.2s;
            border: 1px solid transparent;
        }

        .card:hover {
            background-color: var(--hover-color);
            transform: translateY(-3px);
            border-color: var(--primary-color);
        }

        .card-emoji {
            font-size: 3rem;
            margin-bottom: 15px;
        }

        .card-title {
            font-size: 1.25rem;
            font-weight: 600;
            margin-bottom: 10px;
            color: var(--primary-color);
        }

        .card-desc {
            font-size: 0.95rem;
            color: var(--muted-color);
        }

        /* Responsive */
        @media (max-width: 600px) {
            .grid {
                grid-template-columns: 1fr;
            }
            header {
                flex-direction: column;
                gap: 15px;
                text-align: center;
            }
            .user-info {
                width: 100%;
                justify-content: center;
            }
        }

        @media (min-width: 601px) and (max-width: 1024px) {
            .grid {
                grid-template-columns: repeat(2, 1fr);
            }
        }
    </style>
</head>
<body>

<header>
    <div class="logo">Hub Corso Umberto</div>
    <div class="user-info">
        <div class="user-details">
            <span class="username"><?php echo htmlspecialchars($user['username']); ?></span>
            <span class="role"><?php echo htmlspecialchars($user['role']); ?></span>
        </div>
        <a href="logout.php" class="logout-btn">Logout</a>
    </div>
</header>

<main>
    <div class="grid">
        <!-- Sempre visibili (Admin, Adult, Child) -->
        <a href="calendar.php" class="card">
            <div class="card-emoji">📅</div>
            <div class="card-title">Calendario</div>
            <div class="card-desc">Google Calendar condiviso per appuntamenti e scadenze.</div>
        </a>

        <a href="shopping/" class="card">
            <div class="card-emoji">🛒</div>
            <div class="card-title">Spesa</div>
            <div class="card-desc">Lista della spesa in tempo reale.</div>
        </a>

        <a href="notes/" class="card">
            <div class="card-emoji">📝</div>
            <div class="card-title">Note</div>
            <div class="card-desc">Appunti e riflessioni condivise.</div>
        </a>

        <a href="tasks/" class="card">
            <div class="card-emoji">✅</div>
            <div class="card-title">Attività</div>
            <div class="card-desc">Gestione dei task e delle cose da fare.</div>
        </a>

        <!-- <a href="#" class="card">
            <div class="card-emoji">📦</div>
            <div class="card-title">Inventario</div>
            <div class="card-desc">Organizzazione e ricerca oggetti in casa.</div>
        </a>

        <a href="#" class="card">
            <div class="card-emoji">🎯</div>
            <div class="card-title">Obiettivi</div>
            <div class="card-desc">Tracker progressi, abitudini e traguardi.</div>
        </a> -->

        <!-- Solo Admin + Adult -->
        <?php if (in_array($user['role'], array('admin', 'adult'))): ?>
            <!-- <a href="#" class="card">
                <div class="card-emoji">📂</div>
                <div class="card-title">Documenti</div>
                <div class="card-desc">Archivio digitale sicuro dei documenti di famiglia.</div>
            </a> -->
        <?php endif; ?>

        <a href="meals/" class="card">
            <div class="card-emoji">🍽️</div>
            <div class="card-title">Menu</div>
            <div class="card-desc">Pianificazione pasti e menu settimanale.</div>
        </a>

        <a href="#" class="card">
            <div class="card-emoji">📖</div>
            <div class="card-title">Ricette</div>
            <div class="card-desc">Archivio digitale delle ricette preferite.</div>
        </a>

        <!-- Solo Admin -->
        <?php if ($user['role'] === 'admin'): ?>
            <a href="#" class="card">
                <div class="card-emoji">⚙️</div>
                <div class="card-title">Gestione Utenti</div>
                <div class="card-desc">Amministrazione ruoli e permessi del sistema.</div>
            </a>
        <?php endif; ?>
    </div>
</main>

</body>
</html>
