<?php
/*
 * Dev tool for the parity check: renders a content JSON file with the PHP backend.
 *   php scripts/php-render-cli.php <public_html dir> <content.json> <year>
 * Optional 4th argument "validate" runs a JSON file through the PHP validator and prints the result.
 */
define('TSS_APP', true);
define('TSS_PUBLIC_DIR', realpath($argv[1]));
define('TSS_APP_DIR', TSS_PUBLIC_DIR . '/app');
define('TSS_DATA_DIR', sys_get_temp_dir() . '/tss-parity');
define('TSS_CONFIG', ['setup_token' => '', 'data_dir' => '', 'cookie_secure' => 'auto']);
require TSS_APP_DIR . '/lib.php';
require TSS_APP_DIR . '/schema.php';
require TSS_APP_DIR . '/render.php';
require TSS_APP_DIR . '/store.php';

$input = json_decode(file_get_contents($argv[2]), true);
if (isset($argv[4]) && $argv[4] === 'validate') {
    try {
        echo tss_json_encode(['ok' => tss_validate($input)], false);
    } catch (TssValidationError $e) {
        echo tss_json_encode(['error' => $e->getMessage(), 'field' => $e->path], false);
    }
    exit;
}
echo tss_render(tss_validate($input), ['mediaInfo' => 'tss_media_info', 'year' => (int) $argv[3]]);
