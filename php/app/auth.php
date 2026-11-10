<?php
/*
 * Admin authentication — PHP port of server/auth.js.
 *  - Accounts in <data dir>/admin.json, passwords hashed with password_hash() (bcrypt).
 *  - Sessions: random 256-bit token in an HttpOnly + SameSite=Strict cookie; only a SHA-256
 *    of the token is stored on disk. 2 h idle / 12 h absolute lifetime.
 *  - Each session has a CSRF token required on every state-changing request.
 *  - 5 failed logins from one IP → 15 minute lockout.
 */
defined('TSS_APP') || exit;

const TSS_COOKIE = 'tss_admin';
const TSS_IDLE = 7200;       // 2 h
const TSS_ABSOLUTE = 43200;  // 12 h
const TSS_MAX_FAILS = 5;
const TSS_LOCK = 900;        // 15 min
const TSS_MIN_PASSWORD = 10;

function tss_admin_file() { return TSS_DATA_DIR . '/admin.json'; }

/* ---------- accounts ---------- */
function tss_read_accounts()
{
    $d = tss_read_json(tss_admin_file(), []);
    $users = isset($d['users']) && is_array($d['users']) ? $d['users'] : [];
    // only accounts created by this PHP backend (Node uses a different hash format)
    return array_values(array_filter($users, function ($u) { return isset($u['algo']) && $u['algo'] === 'php' && isset($u['hash']); }));
}

function tss_has_accounts() { return count(tss_read_accounts()) > 0; }

function tss_password_problem($password, $username = null)
{
    if (!is_string($password) || strlen($password) < TSS_MIN_PASSWORD) return 'Password must be at least ' . TSS_MIN_PASSWORD . ' characters.';
    if (strlen($password) > 200) return 'Password is too long.';
    if ($username && stripos($password, $username) !== false) return 'Password must not contain the username.';
    return null;
}

function tss_upsert_account($username, $password)
{
    if (!is_string($username) || !preg_match('/^[A-Za-z0-9._-]{3,40}$/', $username)) {
        throw new TssUserError('Username must be 3–40 characters: letters, numbers, . _ -');
    }
    $problem = tss_password_problem($password, $username);
    if ($problem) throw new TssUserError($problem);
    $users = tss_read_accounts();
    $now = tss_iso_now();
    $record = ['username' => $username, 'algo' => 'php', 'hash' => password_hash($password, PASSWORD_BCRYPT, ['cost' => 12]), 'passwordChangedAt' => $now];
    $found = false;
    foreach ($users as &$u) {
        if (strtolower($u['username']) === strtolower($username)) { $u = array_merge($u, $record); $found = true; }
    }
    unset($u);
    if (!$found) $users[] = $record + ['createdAt' => $now];
    tss_write_atomic(tss_admin_file(), tss_json_encode(['users' => $users]), 0600);
    tss_revoke_sessions($username);
    return $found;
}

function tss_check_credentials($username, $password)
{
    if (!is_string($username) || !is_string($password) || strlen($password) > 200) return null;
    $match = null;
    foreach (tss_read_accounts() as $u) {
        if (strtolower($u['username']) === strtolower(trim($username))) { $match = $u; break; }
    }
    // always run a hash check so unknown usernames take as long as wrong passwords
    $hash = $match ? $match['hash'] : '$2y$12$v3.iCT5pyz8wYp/1zOm3v./u3lqJbHYiBie0gm045WcddvzsUQTFK';
    $ok = password_verify($password, $hash);
    return $ok && $match ? $match['username'] : null;
}

/* ---------- login throttling (per IP, stored as small files) ---------- */
function tss_client_ip() { return isset($_SERVER['REMOTE_ADDR']) ? $_SERVER['REMOTE_ADDR'] : 'unknown'; }
function tss_attempt_file($ip) { return TSS_DATA_DIR . '/ratelimit/' . hash('sha256', $ip) . '.json'; }

function tss_locked_for($ip)
{
    $a = tss_read_json(tss_attempt_file($ip));
    if (!$a) return 0;
    if (!empty($a['lockedUntil']) && $a['lockedUntil'] > time()) return $a['lockedUntil'] - time();
    if (time() - $a['first'] > TSS_LOCK) @unlink(tss_attempt_file($ip));
    return 0;
}

function tss_record_failure($ip)
{
    tss_ensure_dir(TSS_DATA_DIR . '/ratelimit');
    $now = time();
    $a = tss_read_json(tss_attempt_file($ip), ['fails' => 0, 'first' => $now]);
    $a['fails'] += 1;
    if ($a['fails'] >= TSS_MAX_FAILS) { $a['lockedUntil'] = $now + TSS_LOCK; $a['fails'] = 0; $a['first'] = $now; }
    tss_write_atomic(tss_attempt_file($ip), json_encode($a), 0600);
}

function tss_clear_failures($ip) { @unlink(tss_attempt_file($ip)); }

/* ---------- sessions ---------- */
function tss_session_dir() { return TSS_DATA_DIR . '/sessions'; }
function tss_session_file($token) { return tss_session_dir() . '/' . hash('sha256', $token) . '.json'; }

function tss_create_session($username)
{
    tss_ensure_dir(tss_session_dir());
    $token = bin2hex(random_bytes(32));
    $now = time();
    $s = ['username' => $username, 'csrf' => bin2hex(random_bytes(24)), 'created' => $now, 'lastSeen' => $now];
    tss_write_atomic(tss_session_file($token), json_encode($s), 0600);
    if (mt_rand(1, 20) === 1) tss_gc_sessions();
    return [$token, $s];
}

function tss_get_session()
{
    $token = isset($_COOKIE[TSS_COOKIE]) ? $_COOKIE[TSS_COOKIE] : '';
    if (!is_string($token) || !preg_match('/^[a-f0-9]{64}$/', $token)) return null;
    $file = tss_session_file($token);
    $s = tss_read_json($file);
    if (!$s) return null;
    $now = time();
    if ($now - $s['lastSeen'] > TSS_IDLE || $now - $s['created'] > TSS_ABSOLUTE) { @unlink($file); return null; }
    // the account may have been removed or reset
    $exists = false;
    foreach (tss_read_accounts() as $u) { if ($u['username'] === $s['username']) { $exists = true; break; } }
    if (!$exists) { @unlink($file); return null; }
    if ($now - $s['lastSeen'] > 60) { $s['lastSeen'] = $now; tss_write_atomic($file, json_encode($s), 0600); }
    $s['token'] = $token;
    return $s;
}

function tss_destroy_session($token) { @unlink(tss_session_file($token)); }

function tss_revoke_sessions($username, $exceptToken = null)
{
    $dir = tss_session_dir();
    if (!is_dir($dir)) return;
    $keep = $exceptToken ? basename(tss_session_file($exceptToken)) : null;
    foreach (scandir($dir) as $f) {
        if (substr($f, -5) !== '.json' || $f === $keep) continue;
        $s = tss_read_json("$dir/$f");
        if (!$s || strtolower($s['username']) === strtolower($username)) @unlink("$dir/$f");
    }
}

function tss_gc_sessions()
{
    $dir = tss_session_dir();
    if (!is_dir($dir)) return;
    $now = time();
    foreach (scandir($dir) as $f) {
        if (substr($f, -5) !== '.json') continue;
        $s = tss_read_json("$dir/$f");
        if (!$s || $now - $s['lastSeen'] > TSS_IDLE || $now - $s['created'] > TSS_ABSOLUTE) @unlink("$dir/$f");
    }
}

function tss_check_csrf(array $session)
{
    $sent = isset($_SERVER['HTTP_X_CSRF_TOKEN']) ? $_SERVER['HTTP_X_CSRF_TOKEN'] : '';
    return is_string($sent) && strlen($sent) === strlen($session['csrf']) && hash_equals($session['csrf'], $sent);
}

function tss_is_https()
{
    if (TSS_CONFIG['cookie_secure'] === true) return true;
    if (TSS_CONFIG['cookie_secure'] === false) return false;
    return (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (isset($_SERVER['SERVER_PORT']) && (int) $_SERVER['SERVER_PORT'] === 443)
        || (isset($_SERVER['HTTP_X_FORWARDED_PROTO']) && $_SERVER['HTTP_X_FORWARDED_PROTO'] === 'https');
}

function tss_session_cookie($token, $maxAge = TSS_ABSOLUTE)
{
    header('Set-Cookie: ' . TSS_COOKIE . '=' . $token . '; Path=/; HttpOnly; SameSite=Strict; Max-Age=' . $maxAge
        . (tss_is_https() ? '; Secure' : ''), false);
}
