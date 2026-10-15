<?php
// XAMPP entry point. The multiplayer application is served by Node.js.
$host = $_SERVER['SERVER_NAME'] ?? 'localhost';
if (!preg_match('/^[a-zA-Z0-9.\-]+$/', $host)) { $host = 'localhost'; }
header('Location: http://' . $host . ':3001/', true, 302);
exit;
