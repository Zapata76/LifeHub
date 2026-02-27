<?php
session_start();
require_once '../includes/auth.php';

$user = require_admin_page('../');
?>
<!DOCTYPE html>
<html lang="it">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Gestione Utenti - Life Hub</title>
    <style>
        :root {
            --bg: #121212;
            --panel: #1e1e1e;
            --line: #2a2a2a;
            --text: #e4e4e4;
            --muted: #9aa0a6;
            --primary: #4f8cff;
            --danger: #ff5c5c;
            --ok: #30c48d;
        }

        * { box-sizing: border-box; }
        body {
            margin: 0;
            font-family: system-ui, -apple-system, sans-serif;
            background: var(--bg);
            color: var(--text);
        }
        .wrap {
            max-width: 980px;
            margin: 24px auto;
            padding: 0 16px;
        }
        .topbar {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            margin-bottom: 16px;
        }
        .title {
            color: var(--primary);
            margin: 0;
            font-size: 1.5rem;
        }
        .links {
            display: flex;
            gap: 10px;
        }
        .link {
            text-decoration: none;
            color: var(--muted);
            border: 1px solid #333;
            border-radius: 8px;
            padding: 8px 12px;
            background: #222;
            font-size: 0.9rem;
        }
        .card {
            background: var(--panel);
            border: 1px solid var(--line);
            border-radius: 14px;
            padding: 16px;
            margin-bottom: 16px;
        }
        .card h2 {
            margin: 0 0 12px 0;
            font-size: 1.1rem;
        }
        .grid {
            display: grid;
            grid-template-columns: 1.3fr 1fr 1fr auto;
            gap: 10px;
        }
        .grid input, .grid select, .grid button {
            width: 100%;
            min-height: 40px;
            border-radius: 8px;
            border: 1px solid #333;
            background: #141414;
            color: var(--text);
            padding: 8px 10px;
        }
        .grid button {
            background: var(--primary);
            border-color: transparent;
            font-weight: 600;
            cursor: pointer;
        }
        .status {
            min-height: 22px;
            margin-bottom: 8px;
            color: var(--muted);
            font-size: 0.92rem;
        }
        .status.ok { color: var(--ok); }
        .status.err { color: var(--danger); }
        table {
            width: 100%;
            border-collapse: collapse;
        }
        th, td {
            text-align: left;
            padding: 10px 8px;
            border-bottom: 1px solid var(--line);
            font-size: 0.95rem;
            vertical-align: middle;
        }
        th { color: var(--muted); font-weight: 600; }
        .inline {
            display: flex;
            gap: 8px;
            align-items: center;
            flex-wrap: wrap;
        }
        .btn {
            border: 1px solid #3a3a3a;
            background: #202020;
            color: var(--text);
            padding: 6px 10px;
            border-radius: 8px;
            cursor: pointer;
            font-size: 0.85rem;
        }
        .btn.primary { background: var(--primary); border-color: transparent; }
        .btn.danger { background: #2a1616; border-color: #5b2c2c; color: #ff9797; }
        select.role {
            border: 1px solid #333;
            background: #141414;
            color: var(--text);
            border-radius: 8px;
            min-height: 34px;
            padding: 4px 8px;
        }
        .badge {
            font-size: 0.78rem;
            color: var(--muted);
            border: 1px solid #384760;
            padding: 3px 8px;
            border-radius: 999px;
        }
        @media (max-width: 860px) {
            .grid { grid-template-columns: 1fr; }
            th:nth-child(3), td:nth-child(3) { display: none; }
        }
    </style>
</head>
<body>
    <div class="wrap">
        <div class="topbar">
            <h1 class="title">Gestione Utenti</h1>
            <div class="links">
                <span class="badge"><?php echo htmlspecialchars($user['username']); ?> (admin)</span>
                <a class="link" href="../home.php">Home Hub</a>
            </div>
        </div>

        <div class="card">
            <h2>Nuovo Utente</h2>
            <div id="status" class="status"></div>
            <form id="createForm" class="grid" autocomplete="off">
                <input type="text" id="newUsername" name="new_username" placeholder="Username" maxlength="50" autocomplete="new-username" autocapitalize="off" spellcheck="false" required>
                <input type="password" id="newPassword" name="new_password" placeholder="Password (min 4)" autocomplete="new-password" required>
                <select id="newRole"></select>
                <button type="submit">Crea</button>
            </form>
        </div>

        <div class="card">
            <h2>Utenti</h2>
            <div class="status">Ruoli previsti: admin, adult, child</div>
            <table>
                <thead>
                    <tr>
                        <th>Username</th>
                        <th>Ruolo</th>
                        <th>Azioni</th>
                    </tr>
                </thead>
                <tbody id="usersBody">
                    <tr><td colspan="3">Caricamento...</td></tr>
                </tbody>
            </table>
        </div>
    </div>

    <script>
        (function () {
            var apiBase = '../api/users.php';
            var users = [];
            var roles = [];

            var statusEl = document.getElementById('status');
            var bodyEl = document.getElementById('usersBody');
            var roleSelectEl = document.getElementById('newRole');
            var createForm = document.getElementById('createForm');
            var usernameEl = document.getElementById('newUsername');
            var passwordEl = document.getElementById('newPassword');

            function setStatus(message, mode) {
                statusEl.textContent = message || '';
                statusEl.className = 'status' + (mode ? ' ' + mode : '');
            }

            function apiGet(url) {
                return fetch(url, { credentials: 'include' })
                    .then(handleResponse);
            }

            function apiSend(url, method, body) {
                return fetch(url, {
                    method: method,
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                    body: body ? JSON.stringify(body) : null
                }).then(handleResponse);
            }

            function handleResponse(res) {
                return res.json().catch(function () {
                    return { error: 'Risposta non valida dal server' };
                }).then(function (json) {
                    if (!res.ok || (json && json.error)) {
                        var message = (json && json.error) ? json.error : ('Errore HTTP ' + res.status);
                        throw new Error(message);
                    }
                    return json;
                });
            }

            function loadRoles() {
                return apiGet(apiBase + '?action=get_roles').then(function (data) {
                    roles = Array.isArray(data) ? data : ['admin', 'adult', 'child'];
                    roleSelectEl.innerHTML = roles.map(function (role) {
                        var selected = role === 'adult' ? ' selected' : '';
                        return '<option value="' + role + '"' + selected + '>' + role + '</option>';
                    }).join('');

                    // If users were fetched first, rerender table so role selects get options.
                    if (users.length) renderUsers();
                });
            }

            function loadUsers() {
                return apiGet(apiBase + '?action=get_users').then(function (data) {
                    users = Array.isArray(data) ? data : [];
                    renderUsers();
                });
            }

            function renderUsers() {
                if (!users.length) {
                    bodyEl.innerHTML = '<tr><td colspan="3">Nessun utente presente.</td></tr>';
                    return;
                }
                bodyEl.innerHTML = users.map(function (u) {
                    var roleOptions = roles.map(function (r) {
                        var selected = (r === u.role) ? ' selected' : '';
                        return '<option value="' + r + '"' + selected + '>' + r + '</option>';
                    }).join('');

                    return '' +
                        '<tr data-id="' + u.id + '">' +
                            '<td>' + escapeHtml(u.username) + '</td>' +
                            '<td><select class="role" data-role-id="' + u.id + '">' + roleOptions + '</select></td>' +
                            '<td>' +
                                '<div class="inline">' +
                                    '<button class="btn primary" data-action="save-role" data-id="' + u.id + '">Salva ruolo</button>' +
                                    '<button class="btn" data-action="reset-pass" data-id="' + u.id + '">Reset password</button>' +
                                    '<button class="btn danger" data-action="delete-user" data-id="' + u.id + '">Elimina</button>' +
                                '</div>' +
                            '</td>' +
                        '</tr>';
                }).join('');
            }

            function escapeHtml(value) {
                return String(value)
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    .replace(/"/g, '&quot;')
                    .replace(/'/g, '&#039;');
            }

            createForm.addEventListener('submit', function (e) {
                e.preventDefault();
                var username = usernameEl.value.trim();
                var password = passwordEl.value;
                var role = roleSelectEl.value;
                if (!username || !password) {
                    setStatus('Username e password obbligatori', 'err');
                    return;
                }

                apiSend(apiBase + '?action=create_user', 'POST', {
                    username: username,
                    password: password,
                    role: role
                }).then(function () {
                    usernameEl.value = '';
                    passwordEl.value = '';
                    setStatus('Utente creato', 'ok');
                    return loadUsers();
                }).catch(function (err) {
                    setStatus(err.message, 'err');
                });
            });

            bodyEl.addEventListener('click', function (e) {
                var target = e.target;
                if (!target || !target.getAttribute) return;
                var action = target.getAttribute('data-action');
                var id = parseInt(target.getAttribute('data-id'), 10);
                if (!action || !id) return;

                if (action === 'save-role') {
                    var roleSelect = bodyEl.querySelector('select[data-role-id="' + id + '"]');
                    var role = roleSelect ? roleSelect.value : '';
                    apiSend(apiBase + '?action=update_user_role', 'POST', { id: id, role: role })
                        .then(function () {
                            setStatus('Ruolo aggiornato', 'ok');
                            return loadUsers();
                        })
                        .catch(function (err) { setStatus(err.message, 'err'); });
                }

                if (action === 'reset-pass') {
                    var newPass = prompt('Nuova password (min 4 caratteri):');
                    if (newPass === null) return;
                    apiSend(apiBase + '?action=update_user_password', 'POST', { id: id, password: newPass })
                        .then(function () { setStatus('Password aggiornata', 'ok'); })
                        .catch(function (err) { setStatus(err.message, 'err'); });
                }

                if (action === 'delete-user') {
                    if (!confirm('Eliminare questo utente?')) return;
                    apiGet(apiBase + '?action=delete_user&id=' + encodeURIComponent(id))
                        .then(function () {
                            setStatus('Utente eliminato', 'ok');
                            return loadUsers();
                        })
                        .catch(function (err) { setStatus(err.message, 'err'); });
                }
            });

            loadRoles().then(function () {
                return loadUsers();
            }).catch(function (err) {
                setStatus(err.message, 'err');
                bodyEl.innerHTML = '<tr><td colspan="3">Errore caricamento dati.</td></tr>';
            });
        })();
    </script>
</body>
</html>
