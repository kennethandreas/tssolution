<?php
/*
 * Shared helpers for the PHP backend (cPanel / Apache hosting).
 * Compatible with PHP 7.4 – 8.x and needs only core extensions (json, pcre, hash).
 */
defined('TSS_APP') || exit;

/** HTML-escape exactly like the Node renderer (render.js esc). */
function tss_esc($s)
{
    return strtr((string) $s, ['&' => '&amp;', '<' => '&lt;', '>' => '&gt;', '"' => '&quot;', "'" => '&#39;']);
}

/** JavaScript-style truthiness for strings: "0" counts as present (PHP would treat it as false). */
function tss_has($s)
{
    return $s !== null && $s !== '' && $s !== false;
}

/** String length in UTF-16 code units, matching JavaScript's .length. */
function tss_strlen16($s)
{
    $points = preg_match_all('/./us', $s);
    $astral = preg_match_all('/[\x{10000}-\x{10FFFF}]/u', $s);
    return (int) $points + (int) $astral;
}

/** Unicode whitespace as matched by JavaScript's \s. */
const TSS_WS = '\s\x{00A0}\x{1680}\x{2000}-\x{200A}\x{2028}\x{2029}\x{202F}\x{205F}\x{3000}\x{FEFF}';

function tss_trim($s)
{
    return preg_replace('/^[' . TSS_WS . ']+|[' . TSS_WS . ']+$/u', '', $s);
}

/** Number to string the way JavaScript prints it (shortest round-trip form). */
function tss_jsnum($n)
{
    if (is_int($n)) return (string) $n;
    // shortest representation that round-trips, independent of the host's precision ini settings
    for ($p = 1; $p <= 17; $p++) {
        $s = sprintf('%.' . $p . 'G', $n);
        if ((float) $s === (float) $n) break;
    }
    if (stripos($s, 'E') !== false) return (string) $n;
    return $s;
}

/** encodeURIComponent() equivalent. */
function tss_encode_uri_component($s)
{
    return strtr(rawurlencode($s), ['%21' => '!', '%2A' => '*', '%27' => "'", '%28' => '(', '%29' => ')']);
}

/** Turn an exported JavaScript RegExp ({source, flags}) into a PCRE pattern. */
function tss_regex($re)
{
    $flags = 'u' . (strpos($re['flags'], 'i') !== false ? 'i' : '');
    return '~' . str_replace('~', '\~', $re['source']) . '~' . $flags;
}

/** Replace only the first occurrence (JavaScript String.prototype.replace with a string). */
function tss_replace_first($haystack, $needle, $replacement)
{
    $pos = strpos($haystack, $needle);
    return $pos === false ? $haystack : substr_replace($haystack, $replacement, $pos, strlen($needle));
}

function tss_json_encode($value, $pretty = true)
{
    $flags = JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | ($pretty ? JSON_PRETTY_PRINT : 0);
    if (defined('JSON_PRESERVE_ZERO_FRACTION')) $flags |= JSON_PRESERVE_ZERO_FRACTION;
    return json_encode($value, $flags);
}

function tss_read_json($file, $default = null)
{
    if (!is_file($file)) return $default;
    $data = json_decode((string) file_get_contents($file), true);
    return $data === null ? $default : $data;
}

/** Write via a temporary file + rename so readers never see a half-written file. */
function tss_write_atomic($file, $data, $mode = 0644)
{
    $tmp = $file . '.' . bin2hex(random_bytes(4)) . '.tmp';
    if (file_put_contents($tmp, $data, LOCK_EX) === false) {
        throw new RuntimeException('Could not write ' . basename($file) . ' — check folder permissions.');
    }
    @chmod($tmp, $mode);
    if (!@rename($tmp, $file)) {
        @unlink($tmp);
        throw new RuntimeException('Could not replace ' . basename($file) . ' — check folder permissions.');
    }
}

function tss_ensure_dir($dir, $mode = 0700)
{
    if (!is_dir($dir) && !@mkdir($dir, $mode, true) && !is_dir($dir)) {
        throw new RuntimeException('Could not create folder ' . $dir);
    }
}

/** Shared definitions exported from the Node code at build time (schema, icons, fonts, rules). */
function tss_shared()
{
    static $shared = null;
    if ($shared === null) {
        $shared = tss_read_json(TSS_APP_DIR . '/shared.json');
        if (!is_array($shared)) throw new RuntimeException('app/shared.json is missing or invalid — re-upload the app folder.');
    }
    return $shared;
}
