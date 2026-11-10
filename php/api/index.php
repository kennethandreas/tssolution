<?php
/*
 * TS Solution admin backend for Apache/cPanel hosting (PHP 7.4+, no database, no Composer).
 * Apache rewrites /api/admin/*, /admin, /admin/login, /admin/setup and /admin/preview/* here
 * (see public_html/.htaccess). Same API as the Node server, so the admin UI is unchanged.
 */
define('TSS_APP', true);
ini_set('display_errors', '0'); // never leak PHP errors to visitors; they go to the error log
header_remove('X-Powered-By');  // don't advertise the PHP version

if (PHP_VERSION_ID < 70400) {
    http_response_code(500);
    header('Content-Type: text/plain; charset=utf-8');
    exit('The TS Solution admin needs PHP 7.4 or newer (this server runs ' . PHP_VERSION . '). Select a newer PHP version in cPanel → MultiPHP Manager.');
}

define('TSS_PUBLIC_DIR', dirname(__DIR__));
define('TSS_APP_DIR', TSS_PUBLIC_DIR . '/app');
$config = is_file(TSS_APP_DIR . '/config.php') ? require TSS_APP_DIR . '/config.php' : [];
define('TSS_CONFIG', $config + ['setup_token' => '', 'data_dir' => '', 'cookie_secure' => 'auto']);
define('TSS_DATA_DIR', rtrim(TSS_CONFIG['data_dir'] !== '' ? TSS_CONFIG['data_dir'] : dirname(TSS_PUBLIC_DIR) . '/tssolution-data', '/\\'));

require TSS_APP_DIR . '/lib.php';
require TSS_APP_DIR . '/schema.php';
require TSS_APP_DIR . '/render.php';
require TSS_APP_DIR . '/store.php';
require TSS_APP_DIR . '/auth.php';

const TSS_ADMIN_CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
    . "font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self'; frame-src 'self'; "
    . "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'";

/* ---------- response helpers ---------- */
function tss_admin_headers()
{
    header('X-Content-Type-Options: nosniff');
    header('Referrer-Policy: strict-origin-when-cross-origin');
    header('X-Frame-Options: DENY');
    header('Content-Security-Policy: ' . TSS_ADMIN_CSP);
    header('Cache-Control: no-store');
    header('X-Robots-Tag: noindex, nofollow');
}

function tss_json($status, $body)
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($body, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

function tss_fail($status, $error, array $extra = []) { tss_json($status, ['error' => $error] + $extra); }

function tss_redirect($location)
{
    http_response_code(303);
    header('Location: ' . $location);
    header('Cache-Control: no-store');
    exit;
}

function tss_not_found()
{
    http_response_code(404);
    header('Content-Type: text/plain; charset=utf-8');
    exit('Not found');
}

function tss_read_json_body($limit = 1048576)
{
    $type = isset($_SERVER['CONTENT_TYPE']) ? $_SERVER['CONTENT_TYPE'] : '';
    if (strpos($type, 'application/json') !== 0) tss_fail(415, 'Expected JSON.');
    $len = isset($_SERVER['CONTENT_LENGTH']) ? (int) $_SERVER['CONTENT_LENGTH'] : 0;
    if ($len > $limit) tss_fail(413, 'Request is too large.');
    $raw = file_get_contents('php://input', false, null, 0, $limit + 1);
    if (strlen($raw) > $limit) tss_fail(413, 'Request is too large.');
    if ($raw === '') return [];
    $data = json_decode($raw, true);
    if ($data === null && json_last_error() !== JSON_ERROR_NONE) tss_fail(400, 'Malformed JSON.');
    return $data;
}

function tss_same_origin()
{
    if (empty($_SERVER['HTTP_ORIGIN'])) return true;
    $host = parse_url($_SERVER['HTTP_ORIGIN'], PHP_URL_HOST);
    $port = parse_url($_SERVER['HTTP_ORIGIN'], PHP_URL_PORT);
    if (!$host) return false;
    return ($host . ($port ? ":$port" : '')) === (isset($_SERVER['HTTP_HOST']) ? $_SERVER['HTTP_HOST'] : '');
}

/* ---------- API ---------- */
function tss_handle_api($method, $path)
{
    $route = "$method $path";

    if ($method !== 'GET' && $method !== 'HEAD' && !tss_same_origin()) tss_fail(403, 'Cross-origin request blocked.');

    if ($route === 'POST /api/admin/login') {
        $ip = tss_client_ip();
        $wait = tss_locked_for($ip);
        if ($wait) tss_fail(429, 'Too many failed attempts. Try again in ' . ceil($wait / 60) . ' minute(s).');
        if (!tss_has_accounts()) tss_fail(503, 'No admin account exists yet. Open /admin/setup to create one.');
        $body = tss_read_json_body(4096);
        $username = tss_check_credentials(isset($body['username']) ? $body['username'] : null, isset($body['password']) ? $body['password'] : null);
        if (!$username) { tss_record_failure($ip); tss_fail(401, 'Incorrect username or password.'); }
        tss_clear_failures($ip);
        list($token, $s) = tss_create_session($username);
        tss_session_cookie($token);
        tss_json(200, ['username' => $username, 'csrf' => $s['csrf']]);
    }

    $session = tss_get_session();
    if ($route === 'GET /api/admin/session') {
        if (!$session) tss_fail(401, 'Not signed in.');
        tss_json(200, ['username' => $session['username'], 'csrf' => $session['csrf']]);
    }

    if (!$session) tss_fail(401, 'Your session has expired. Please sign in again.');
    if ($method !== 'GET' && !tss_check_csrf($session)) tss_fail(403, 'Security token missing or invalid. Reload the page and try again.');

    $S = tss_shared();
    switch ($route) {
        case 'POST /api/admin/logout':
            tss_destroy_session($session['token']);
            tss_session_cookie('', 0);
            tss_json(200, ['ok' => true]);

        case 'GET /api/admin/meta':
            tss_json(200, ['icons' => $S['icons'], 'fonts' => $S['fonts'], 'sectionIds' => $S['sectionIds'], 'sectionKeys' => $S['sectionKeys'],
                'brandTheme' => $S['brandTheme'], 'minPassword' => TSS_MIN_PASSWORD, 'rules' => $S['rules']]);

        case 'GET /api/admin/content':
            tss_json(200, tss_get_state());

        case 'PUT /api/admin/content':
            $body = tss_read_json_body();
            try {
                tss_json(200, tss_save_content(isset($body['content']) ? $body['content'] : null, $session['username'], isset($body['baseVersion']) ? $body['baseVersion'] : null));
            } catch (TssValidationError $e) { tss_fail(422, $e->getMessage(), ['field' => $e->path]); }
            catch (TssConflictError $e) { tss_fail(409, $e->getMessage()); }
            catch (TssMissingImageError $e) { tss_fail(422, $e->getMessage()); }

        case 'POST /api/admin/preview':
            $body = tss_read_json_body();
            try {
                $html = tss_render(tss_validate(isset($body['content']) ? $body['content'] : null), ['mediaInfo' => 'tss_media_info']);
            } catch (TssValidationError $e) { tss_fail(422, $e->getMessage(), ['field' => $e->path]); }
            $html = tss_replace_first($html, '<head>', "<head>\n  <base href=\"/\" />\n  <meta name=\"robots\" content=\"noindex\" />");
            tss_ensure_dir(TSS_DATA_DIR . '/previews');
            foreach (glob(TSS_DATA_DIR . '/previews/*.json') ?: [] as $old) if (filemtime($old) < time() - 600) @unlink($old);
            $id = bin2hex(random_bytes(16));
            tss_write_atomic(TSS_DATA_DIR . "/previews/$id.json", json_encode(['html' => $html, 'username' => $session['username']]), 0600);
            tss_json(200, ['url' => "/admin/preview/$id"]);

        case 'GET /api/admin/media':
            tss_json(200, ['items' => tss_list_media()]);

        case 'POST /api/admin/media':
            $body = tss_read_json_body(8 * 1048576);
            $data = preg_replace('/^data:[^;,]*;base64,/', '', (string) (isset($body['data']) ? $body['data'] : ''));
            if ($data === '' || !preg_match('#^[A-Za-z0-9+/=\s]+$#', $data)) tss_fail(400, 'No image data received.');
            $bytes = base64_decode($data, true);
            if ($bytes === false) tss_fail(400, 'No image data received.');
            try { tss_json(201, ['item' => tss_save_upload((string) (isset($body['name']) ? $body['name'] : ''), $bytes)]); }
            catch (TssUserError $e) { tss_fail(422, $e->getMessage()); }

        case 'DELETE /api/admin/media':
            $body = tss_read_json_body(4096);
            try { tss_delete_upload((string) (isset($body['path']) ? $body['path'] : '')); tss_json(200, ['ok' => true]); }
            catch (TssUserError $e) { tss_fail($e->status, $e->getMessage()); }

        case 'GET /api/admin/history':
            $current = tss_get_state()['version'];
            tss_json(200, ['items' => array_map(function ($h) use ($current) { return $h + ['current' => $h['version'] === $current]; }, tss_history_list())]);

        case 'POST /api/admin/history/restore':
            $body = tss_read_json_body(4096);
            try { tss_json(200, tss_restore_version((string) (isset($body['id']) ? $body['id'] : ''), $session['username'])); }
            catch (TssValidationError $e) { tss_fail(422, 'That version can no longer be restored: ' . $e->getMessage()); }
            catch (TssUserError $e) { tss_fail(422, $e->getMessage()); }

        case 'POST /api/admin/password':
            $body = tss_read_json_body(4096);
            if (!tss_check_credentials($session['username'], (string) (isset($body['current']) ? $body['current'] : ''))) {
                tss_fail(403, 'Your current password is incorrect.', ['field' => 'current']);
            }
            $next = isset($body['next']) ? $body['next'] : null;
            $problem = tss_password_problem($next, $session['username']);
            if ($problem) tss_fail(422, $problem, ['field' => 'next']);
            tss_upsert_account($session['username'], $next); // signs out every session of this user…
            list($token, $fresh) = tss_create_session($session['username']); // …then keep this one signed in
            tss_session_cookie($token);
            tss_json(200, ['ok' => true, 'csrf' => $fresh['csrf']]);
    }
    tss_fail(404, 'Unknown API endpoint.');
}

/* ---------- first-run setup page ---------- */
function tss_setup_checks()
{
    $checks = [];
    $add = function ($ok, $label, $fix = '') use (&$checks) { $checks[] = [$ok, $label, $fix]; };
    $add(PHP_VERSION_ID >= 70400, 'PHP ' . PHP_VERSION, 'Select PHP 7.4 or newer in cPanel → MultiPHP Manager.');
    $add(function_exists('json_encode'), 'JSON extension', 'Enable the json extension in cPanel → Select PHP Version.');
    $add(function_exists('random_bytes'), 'Secure random numbers');
    $add(is_dir(TSS_DATA_DIR) && is_writable(TSS_DATA_DIR), 'Private data folder is writable (' . TSS_DATA_DIR . ')',
        'Create the folder in File Manager (next to public_html) or set data_dir in public_html/app/config.php.');
    $add(is_writable(TSS_PUBLIC_DIR . '/index.html'), 'index.html can be updated', 'Set public_html/index.html to permission 644 (owner writable).');
    $add(is_dir(TSS_PUBLIC_DIR . '/assets/uploads') && is_writable(TSS_PUBLIC_DIR . '/assets/uploads'), 'assets/uploads is writable', 'Set public_html/assets/uploads to permission 755.');
    $add(strpos(realpath(TSS_DATA_DIR) ?: TSS_DATA_DIR, realpath(TSS_PUBLIC_DIR)) !== 0, 'Data folder is outside public_html (not downloadable)',
        'Move it next to public_html, or keep it inside only if it is protected.');
    return $checks;
}

function tss_setup_page($message = '', $error = '', array $old = [])
{
    tss_admin_headers();
    header('Content-Type: text/html; charset=utf-8');
    $e = 'tss_esc';
    $done = tss_has_accounts();
    $checks = tss_setup_checks();
    $rows = '';
    foreach ($checks as $c) {
        $rows .= '<li class="check-row"><span class="mark' . ($c[0] ? '' : ' warn') . '">' . ($c[0] ? '✓' : '!') . '</span><span>' . $e($c[1])
            . (!$c[0] && $c[2] ? '<br /><small>' . $e($c[2]) . '</small>' : '') . '</span></li>';
    }
    echo '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />'
        . '<meta name="robots" content="noindex, nofollow" /><title>Setup · TS Solution admin</title>'
        . '<link rel="icon" href="/assets/img/favicon.svg" type="image/svg+xml" /><link rel="stylesheet" href="/admin/static/admin.css" /></head>'
        . '<body class="login-page"><main class="login-card" style="width:min(100%,520px)">'
        . '<img class="login-logo" src="/assets/img/logo-ts-solution.png" width="180" height="45" alt="TS Solution Facility Service" />';
    if ($done) {
        echo '<h1>Setup complete</h1><p class="login-sub">' . ($message ? $e($message) . ' ' : '') . 'An admin account exists. Sign in to manage the website.</p>'
            . '<a class="btn btn-primary btn-block" href="/admin/login">Go to sign in</a>'
            . '<p class="help" style="margin-top:1rem;font-size:.85rem;color:var(--muted)">Forgot the password? In cPanel File Manager delete <code>tssolution-data/admin.json</code>, then open this page again and create the account anew (needs the setup token).</p>';
    } else {
        echo '<h1>Create the admin account</h1><p class="login-sub">One-time setup. You need the setup token that came with the website files.</p>'
            . ($error ? '<p class="form-error" role="alert">' . $e($error) . '</p>' : '')
            . '<form method="post" action="/admin/setup" novalidate>'
            . '<div class="field"><label for="token">Setup token</label><input id="token" name="token" type="password" autocomplete="off" required /></div>'
            . '<div class="field"><label for="username">Username</label><input id="username" name="username" type="text" autocomplete="username" autocapitalize="none" spellcheck="false" value="' . $e(isset($old['username']) ? $old['username'] : '') . '" required /></div>'
            . '<div class="field"><label for="password">Password (min ' . TSS_MIN_PASSWORD . ' characters)</label><input id="password" name="password" type="password" autocomplete="new-password" required /></div>'
            . '<div class="field"><label for="password2">Repeat password</label><input id="password2" name="password2" type="password" autocomplete="new-password" required /></div>'
            . '<button type="submit" class="btn btn-primary btn-block">Create account</button></form>';
    }
    echo '<h2 style="font-size:1rem;margin:1.75rem 0 .5rem">Server checks</h2><ul style="list-style:none;padding:0;margin:0">' . $rows . '</ul>'
        . '<a class="login-back" href="/">← Back to website</a></main></body></html>';
    exit;
}

function tss_handle_setup($method)
{
    if ($method !== 'POST') tss_setup_page();
    if (!tss_same_origin()) tss_setup_page('', 'Cross-origin request blocked.');
    if (tss_has_accounts()) tss_setup_page();
    $ip = tss_client_ip();
    $wait = tss_locked_for($ip);
    if ($wait) tss_setup_page('', 'Too many failed attempts. Try again in ' . ceil($wait / 60) . ' minute(s).');
    $token = isset($_POST['token']) ? (string) $_POST['token'] : '';
    $expected = (string) TSS_CONFIG['setup_token'];
    $old = ['username' => isset($_POST['username']) ? (string) $_POST['username'] : ''];
    if (strlen($expected) < 20 || !hash_equals($expected, $token)) {
        tss_record_failure($ip);
        tss_setup_page('', strlen($expected) < 20 ? 'No setup token is configured in app/config.php.' : 'The setup token is not correct.', $old);
    }
    $password = isset($_POST['password']) ? (string) $_POST['password'] : '';
    if ($password !== (isset($_POST['password2']) ? (string) $_POST['password2'] : '')) tss_setup_page('', 'The passwords do not match.', $old);
    try {
        tss_upsert_account($old['username'], $password);
    } catch (TssUserError $e) {
        tss_setup_page('', $e->getMessage(), $old);
    }
    tss_clear_failures($ip);
    tss_setup_page('Account created.');
}

/* ---------- routing ---------- */
set_exception_handler(function ($e) {
    error_log('[tssolution] ' . $e);
    if (!headers_sent()) {
        http_response_code(500);
        $isApi = strpos(parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH), '/api/') === 0;
        header('Content-Type: ' . ($isApi ? 'application/json' : 'text/plain') . '; charset=utf-8');
        $msg = 'Something went wrong on the server. Please try again.';
        if ($e instanceof RuntimeException) $msg = $e->getMessage(); // our own, user-safe messages (permissions, missing files)
        echo $isApi ? json_encode(['error' => $msg]) : $msg;
    }
});

$method = isset($_SERVER['REQUEST_METHOD']) ? $_SERVER['REQUEST_METHOD'] : 'GET';
$path = (string) parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);

if ($path === '/admin/setup') {
    // show the diagnostics even if the data folder cannot be created yet
    try { tss_ensure_dir(TSS_DATA_DIR); } catch (RuntimeException $e) { if ($method !== 'POST') tss_setup_page(); throw $e; }
    tss_handle_setup($method);
}

tss_init();

if (strpos($path, '/api/') === 0) {
    tss_admin_headers();
    tss_handle_api($method, $path);
}

if ($method !== 'GET' && $method !== 'HEAD') {
    http_response_code(405);
    header('Allow: GET, HEAD');
    exit;
}

if ($path === '/admin' || $path === '/admin/') {
    if (!tss_get_session()) tss_redirect('/admin/login');
    tss_admin_headers();
    header('Content-Type: text/html; charset=utf-8');
    readfile(TSS_PUBLIC_DIR . '/admin/app.html');
    exit;
}

if ($path === '/admin/login') {
    if (tss_get_session()) tss_redirect('/admin');
    tss_admin_headers();
    header('Content-Type: text/html; charset=utf-8');
    readfile(TSS_PUBLIC_DIR . '/admin/login.html');
    exit;
}

if (preg_match('#^/admin/preview/([a-f0-9]{32})$#', $path, $m)) {
    $s = tss_get_session();
    $p = tss_read_json(TSS_DATA_DIR . "/previews/{$m[1]}.json");
    if (!$s || !$p || $p['username'] !== $s['username']) tss_not_found();
    header('X-Content-Type-Options: nosniff');
    header('X-Frame-Options: SAMEORIGIN');
    header('Cache-Control: no-store');
    header('Content-Type: text/html; charset=utf-8');
    echo $p['html'];
    exit;
}

tss_not_found();
