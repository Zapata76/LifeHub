<?php
session_start();
require_once 'includes/auth.php';
requireLogin();

$user = currentUser();

// Il link di embed di Google Calendar. 
$calendars = array(
    'Giulia' => 'a7a0bf5ad35b34484e2f8932e9854460b7ecba7d66cba0254ecd2b3f439d0874@group.calendar.google.com',
    'Secondo Calendario' => '554bbc0cda06d8f8b233f85101a28f2f85a456ce0296e685d4ab1a3b519f8629@group.calendar.google.com',
);

$base_url = "https://calendar.google.com/calendar/embed?";
$params = array(
    'ctz' => 'Europe/Rome',
    'mode' => 'MONTH',
    'wkst' => '2',
    'bgcolor' => '#ffffff',
);
$query_string = http_build_query($params);
foreach ($calendars as $name => $id) {
    if (strpos($id, 'YOUR_') === false) {
        $query_string .= "&src=" . urlencode($id);
    }
}
$embed_url = $base_url . $query_string;
?>
<!DOCTYPE html>
<html lang="it">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Calendario - Hub Corso Umberto</title>
    <style>
        :root {
            --bg-color: #121212;
            --card-color: #1e1e1e;
            --primary-color: #4f8cff;
            --text-color: #e4e4e4;
        }

        body {
            background-color: var(--bg-color);
            color: var(--text-color);
            font-family: system-ui, sans-serif;
            margin: 0;
            display: flex;
            flex-direction: column;
            height: 100vh;
        }

        header { background-color: #1e1e1e; border-bottom: 1px solid #2a2a2a; padding: 15px 20px; }
        .header-content { display: flex; flex-direction: column; gap: 10px; }
        .header-row { display: flex; justify-content: space-between; align-items: center; }
        .header-controls { display: flex; align-items: center; gap: 10px; }
        
        h1 { color: #4f8cff; font-size: 1.4rem; margin: 0; }
        .user-badge { font-size: 0.8rem; color: #4f8cff; border: 1px solid #4f8cff44; padding: 4px 10px; border-radius: 6px; }
        .home-link { color: #9aa0a6; text-decoration: none; font-size: 0.85rem; border: 1px solid #333; padding: 4px 10px; border-radius: 6px; background: #2a2a2a; }

        .calendar-container {
            flex-grow: 1;
            padding: 15px;
            display: flex;
        }

        iframe {
            width: 100%;
            height: 100%;
            border: none;
            border-radius: 8px;
            background-color: white;
        }
    </style>
</head>
<body>
    <header>
        <div class="header-content">
          <div class="header-row header-top">
            <h1>📅 Calendario</h1>
          </div>
          <div class="header-row header-bottom">
            <div class="header-controls">
                <span class="user-badge"><?php echo htmlspecialchars($user['username']); ?></span>
                <a href="home.php" class="home-link">Home Hub</a>
            </div>
          </div>
        </div>
    </header>

    <div class="calendar-container">
        <iframe src="<?php echo $embed_url; ?>"></iframe>
    </div>
</body>
</html>
