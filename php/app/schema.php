<?php
/*
 * Server-side validation — PHP port of server/schema.js.
 * The schema itself (fields, limits, patterns) is exported from the Node code into
 * app/shared.json at build time, so both backends enforce exactly the same rules.
 */
defined('TSS_APP') || exit;

class TssValidationError extends Exception
{
    public $path;
    public $detail;

    public function __construct($path, $message)
    {
        parent::__construct(($path !== '' ? $path : 'content') . ': ' . $message);
        $this->path = $path;
        $this->detail = $message;
    }
}

function tss_validate_node(array $node, $value, $path)
{
    $S = tss_shared();
    $has = function ($k) use ($node) { return array_key_exists($k, $node); };

    switch ($node['t']) {
        case 'str':
            if ($value === null) $value = $has('def') ? $node['def'] : '';
            if (!is_string($value)) throw new TssValidationError($path, 'must be text');
            $value = str_replace(["\r\n", "\r"], "\n", $value);
            $value = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', $value);
            if ($value === null) throw new TssValidationError($path, 'must be text');
            if (!empty($node['multiline'])) {
                $value = tss_trim($value);
            } else {
                $value = tss_trim(preg_replace('/[' . TSS_WS . ']*\n[' . TSS_WS . ']*/u', ' ', $value));
            }
            if (!empty($node['required']) && $value === '') throw new TssValidationError($path, 'is required');
            if (tss_strlen16($value) > $node['max']) throw new TssValidationError($path, 'must be at most ' . $node['max'] . ' characters');
            if ($value !== '' && $has('pattern') && !preg_match(tss_regex($node['pattern']), $value)) {
                throw new TssValidationError($path, $has('patternMsg') ? $node['patternMsg'] : 'has an invalid format');
            }
            return $value;

        case 'bool':
            if ($value === null) return $has('def') ? $node['def'] : false;
            if (!is_bool($value)) throw new TssValidationError($path, 'must be true or false');
            return $value;

        case 'num':
            if ($value === null || $value === '') $value = $node['def'];
            if (is_string($value)) {
                $value = is_numeric(trim($value)) ? trim($value) + 0 : NAN;
            }
            if (!(is_int($value) || is_float($value)) || !is_finite($value)) throw new TssValidationError($path, 'must be a number');
            if (!empty($node['integer']) && floor($value) != $value) throw new TssValidationError($path, 'must be a whole number');
            if ($value < $node['min'] || $value > $node['max']) {
                throw new TssValidationError($path, 'must be between ' . tss_jsnum($node['min']) . ' and ' . tss_jsnum($node['max']));
            }
            if (!empty($node['integer'])) $value = (int) $value;
            return $value;

        case 'enum':
            if ($value === null && $has('def')) return $node['def'];
            if (!in_array($value, $node['values'], true)) throw new TssValidationError($path, 'is not an allowed option');
            return $value;

        case 'color':
            if ($value === null || $value === '') return $node['def'];
            if (!is_string($value) || !preg_match(tss_regex($S['patterns']['hex']), $value)) {
                throw new TssValidationError($path, 'must be a hex color like #ffab4c');
            }
            return strtolower($value);

        case 'href':
            if ($value === null) $value = '';
            if (!is_string($value)) throw new TssValidationError($path, 'must be a link');
            $value = tss_trim($value);
            if ($value === '') {
                if (!empty($node['optional'])) return '';
                throw new TssValidationError($path, 'is required');
            }
            if (tss_strlen16($value) > 300 || !preg_match(tss_regex($S['patterns']['href']), $value)) {
                throw new TssValidationError($path, 'must be a section link (#about), a web address (https://…), mailto:, tel: or a site path (/…)');
            }
            return $value;

        case 'image':
            if ($value === null) $value = '';
            if (!is_string($value)) throw new TssValidationError($path, 'must be an image path');
            $value = tss_trim($value);
            if ($value === '') {
                if (!empty($node['optional'])) return '';
                throw new TssValidationError($path, 'please choose an image');
            }
            if (!preg_match(tss_regex($S['patterns']['image']), $value) || strpos($value, '..') !== false) {
                throw new TssValidationError($path, 'must be an image from the media library');
            }
            return $value;

        case 'obj':
            if ($value === null) $value = [];
            // a JSON object decodes to an associative array; a JSON list (or scalar) is not an object
            if (!is_array($value) || ($value !== [] && array_keys($value) === range(0, count($value) - 1))) {
                throw new TssValidationError($path, 'has an invalid structure');
            }
            $out = [];
            foreach ($node['shape'] as $key => $child) {
                $out[$key] = tss_validate_node($child, array_key_exists($key, $value) ? $value[$key] : null, $path !== '' ? "$path.$key" : $key);
            }
            return $out;

        case 'list':
            if ($value === null) $value = [];
            if (!is_array($value) || ($value !== [] && array_keys($value) !== range(0, count($value) - 1))) {
                throw new TssValidationError($path, 'must be a list');
            }
            $n = count($value);
            if ($n < $node['min']) throw new TssValidationError($path, 'needs at least ' . $node['min'] . ' item' . ($node['min'] === 1 ? '' : 's'));
            if ($n > $node['max']) throw new TssValidationError($path, 'can have at most ' . $node['max'] . ' items');
            $out = [];
            foreach ($value as $i => $v) $out[] = tss_validate_node($node['item'], $v, "{$path}[{$i}]");
            return $out;
    }
    throw new RuntimeException('Unknown schema node ' . $node['t']);
}

/* ---------- colour checks so text stays readable ---------- */
function tss_luminance($hex)
{
    $c = [];
    foreach ([1, 3, 5] as $i) {
        $v = hexdec(substr($hex, $i, 2)) / 255;
        $c[] = $v <= 0.03928 ? $v / 12.92 : pow(($v + 0.055) / 1.055, 2.4);
    }
    return 0.2126 * $c[0] + 0.7152 * $c[1] + 0.0722 * $c[2];
}

function tss_contrast($a, $b)
{
    $l = [tss_luminance($a), tss_luminance($b)];
    rsort($l);
    return ($l[0] + 0.05) / ($l[1] + 0.05);
}

function tss_check_theme(array $t)
{
    $problems = [];
    if (tss_contrast($t['ink'], $t['accent']) < 4.5) $problems[] = ['theme.accent', 'dark text on the accent color (buttons) needs a contrast of at least 4.5:1 — choose a lighter accent'];
    if (tss_contrast($t['ink'], $t['accentStrong']) < 3) $problems[] = ['theme.accentStrong', 'button hover color is too dark for the button text — choose a lighter color'];
    if (tss_contrast($t['accentInk'], '#ffffff') < 4.5) $problems[] = ['theme.accentInk', 'accent text on white needs a contrast of at least 4.5:1 — choose a darker color'];
    if (tss_contrast($t['ink'], '#ffffff') < 10) $problems[] = ['theme.ink', 'heading/text color must stay very dark for readability'];
    return $problems;
}

function tss_validate($content)
{
    $S = tss_shared();
    $clean = tss_validate_node($S['schema'], $content, '');

    $keys = array_map(function ($s) { return $s['key']; }, $clean['layout']);
    if (count(array_unique($keys)) !== count($S['sectionKeys'])) throw new TssValidationError('layout', 'each section must appear exactly once');

    $problems = tss_check_theme($clean['theme']);
    if ($problems) throw new TssValidationError($problems[0][0], $problems[0][1]);

    return $clean;
}
