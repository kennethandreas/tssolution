<?php
/*
 * File-based persistence (no database needed) — PHP port of server/store.js.
 *
 *   <data dir>/content.json   current content
 *   <data dir>/history/       previous versions (newest 30) for one-click restore
 *   <data dir>/admin.json     admin accounts (password hashes)
 *   public_html/index.html    public page, regenerated on every save
 *   public_html/assets/uploads/  images uploaded in the admin
 *
 * The data dir lives OUTSIDE public_html by default, so it can never be downloaded.
 */
defined('TSS_APP') || exit;

const TSS_HISTORY_KEEP = 30;
const TSS_MAX_UPLOAD = 5242880; // 5 MB

class TssConflictError extends Exception {}
class TssMissingImageError extends Exception {}
class TssUserError extends Exception
{
    public $status;
    public function __construct($message, $status = 422) { parent::__construct($message); $this->status = $status; }
}

function tss_content_file() { return TSS_DATA_DIR . '/content.json'; }
function tss_history_dir() { return TSS_DATA_DIR . '/history'; }
function tss_upload_dir() { return TSS_PUBLIC_DIR . '/assets/uploads'; }

/** Serialise writers with an exclusive lock (two saves can never interleave). */
function tss_locked(callable $fn)
{
    $fp = fopen(TSS_DATA_DIR . '/.lock', 'c');
    if (!$fp) throw new RuntimeException('Could not open lock file in the data folder.');
    flock($fp, LOCK_EX);
    try {
        return $fn();
    } finally {
        flock($fp, LOCK_UN);
        fclose($fp);
    }
}

function tss_hash($s) { return substr(hash('sha256', $s), 0, 16); }

/* ---------- image dimensions (PNG / JPEG / WebP), same parser as the Node version ---------- */
function tss_image_info($buf)
{
    $len = strlen($buf);
    if ($len < 30) return null;
    $u32be = function ($o) use ($buf) { return unpack('N', substr($buf, $o, 4))[1]; };
    $u16be = function ($o) use ($buf) { return unpack('n', substr($buf, $o, 2))[1]; };
    $u16le = function ($o) use ($buf) { return unpack('v', substr($buf, $o, 2))[1]; };
    $u24le = function ($o) use ($buf) { $b = unpack('C3', substr($buf, $o, 3)); return $b[1] | ($b[2] << 8) | ($b[3] << 16); };

    if (substr($buf, 0, 4) === "\x89PNG") {
        return ['type' => 'png', 'ext' => '.png', 'width' => $u32be(16), 'height' => $u32be(20)];
    }
    if ($buf[0] === "\xFF" && $buf[1] === "\xD8") {
        $i = 2;
        while ($i + 9 < $len) {
            if ($buf[$i] !== "\xFF") { $i++; continue; }
            $marker = ord($buf[$i + 1]);
            if ($marker === 0xD8 || $marker === 0x01 || ($marker >= 0xD0 && $marker <= 0xD7)) { $i += 2; continue; }
            $segLen = $u16be($i + 2);
            if ($marker >= 0xC0 && $marker <= 0xCF && !in_array($marker, [0xC4, 0xC8, 0xCC], true)) {
                return ['type' => 'jpeg', 'ext' => '.jpg', 'height' => $u16be($i + 5), 'width' => $u16be($i + 7)];
            }
            $i += 2 + $segLen;
        }
        return null;
    }
    if (substr($buf, 0, 4) === 'RIFF' && substr($buf, 8, 4) === 'WEBP') {
        $chunk = substr($buf, 12, 4);
        if ($chunk === 'VP8 ') return ['type' => 'webp', 'ext' => '.webp', 'width' => $u16le(26) & 0x3fff, 'height' => $u16le(28) & 0x3fff];
        if ($chunk === 'VP8L') {
            $b = array_values(unpack('C4', substr($buf, 21, 4)));
            return ['type' => 'webp', 'ext' => '.webp',
                'width' => 1 + ((($b[1] & 0x3f) << 8) | $b[0]),
                'height' => 1 + ((($b[3] & 0xf) << 10) | ($b[2] << 2) | (($b[1] & 0xc0) >> 6))];
        }
        if ($chunk === 'VP8X') return ['type' => 'webp', 'ext' => '.webp', 'width' => 1 + $u24le(24), 'height' => 1 + $u24le(27)];
    }
    return null;
}

/* ---------- media library ---------- */
function tss_scan_media()
{
    $out = [];
    foreach ([[TSS_PUBLIC_DIR . '/assets/img', 'assets/img', false], [tss_upload_dir(), 'assets/uploads', true]] as $src) {
        list($dir, $rel, $deletable) = $src;
        if (!is_dir($dir)) continue;
        foreach (scandir($dir) as $name) {
            if (!preg_match('/\.(png|jpe?g|webp)$/i', $name)) continue;
            $file = "$dir/$name";
            if (!is_file($file)) continue;
            $size = filesize($file);
            $fh = fopen($file, 'rb');
            $head = fread($fh, min($size, 65536));
            fclose($fh);
            $info = tss_image_info($head);
            $out["$rel/$name"] = [
                'path' => "$rel/$name", 'name' => $name, 'size' => $size, 'modified' => filemtime($file) * 1000, 'deletable' => $deletable,
                'width' => $info ? $info['width'] : null, 'height' => $info ? $info['height'] : null,
            ];
        }
    }
    return $out;
}

function tss_media()
{
    static $cache = null;
    if (func_num_args() && func_get_arg(0) === 'refresh') $cache = null;
    if ($cache === null) $cache = tss_scan_media();
    return $cache;
}

function tss_media_info($p)
{
    $m = tss_media();
    return isset($m[$p]) && $m[$p]['width'] ? ['width' => $m[$p]['width'], 'height' => $m[$p]['height']] : null;
}

function tss_image_paths($content)
{
    $found = [];
    $walk = function ($v) use (&$walk, &$found) {
        if (is_string($v)) { if (preg_match('#^assets/(img|uploads)/#', $v)) $found[$v] = true; }
        elseif (is_array($v)) foreach ($v as $x) $walk($x);
    };
    $walk($content);
    return $found;
}

/* ---------- content ---------- */
function tss_read_content_file()
{
    $raw = @file_get_contents(tss_content_file());
    if ($raw === false) throw new RuntimeException('content.json is missing from the data folder.');
    $content = json_decode($raw, true);
    if (!is_array($content)) throw new RuntimeException('content.json is not valid JSON.');
    return [$raw, $content];
}

function tss_history_list()
{
    $dir = tss_history_dir();
    $files = is_dir($dir) ? array_values(array_filter(scandir($dir), function ($f) { return substr($f, -5) === '.json'; })) : [];
    rsort($files);
    $out = [];
    foreach ($files as $f) {
        $h = tss_read_json("$dir/$f");
        if (!is_array($h)) continue;
        $out[] = ['id' => substr($f, 0, -5), 'savedAt' => $h['savedAt'], 'savedBy' => $h['savedBy'],
            'note' => isset($h['note']) ? $h['note'] : '', 'version' => $h['version']];
    }
    return $out;
}

function tss_get_state()
{
    list($raw, $content) = tss_read_content_file();
    $version = tss_hash($raw);
    $latest = null;
    foreach (tss_history_list() as $h) { if ($h['version'] === $version) { $latest = $h; break; } }
    return ['content' => $content, 'version' => $version,
        'updatedAt' => $latest ? $latest['savedAt'] : null, 'updatedBy' => $latest ? $latest['savedBy'] : null];
}

function tss_iso_now()
{
    $t = microtime(true);
    return gmdate('Y-m-d\TH:i:s', (int) $t) . sprintf('.%03dZ', (int) (($t - floor($t)) * 1000));
}

function tss_publish(array $content)
{
    tss_write_atomic(TSS_PUBLIC_DIR . '/index.html', tss_render($content, ['mediaInfo' => 'tss_media_info']));
}

function tss_add_history(array $content, $raw, $savedBy, $note)
{
    $dir = tss_history_dir();
    tss_ensure_dir($dir);
    $savedAt = tss_iso_now();
    $id = str_replace([':', '.'], '-', $savedAt) . '_' . bin2hex(random_bytes(3));
    tss_write_atomic("$dir/$id.json", tss_json_encode(['savedAt' => $savedAt, 'savedBy' => $savedBy, 'note' => $note,
        'version' => tss_hash($raw), 'content' => $content]), 0600);
    $files = array_values(array_filter(scandir($dir), function ($f) { return substr($f, -5) === '.json'; }));
    sort($files);
    foreach (array_slice($files, 0, max(0, count($files) - TSS_HISTORY_KEEP)) as $f) @unlink("$dir/$f");
}

/** Validate, store, regenerate index.html, record history. */
function tss_save_content($input, $savedBy, $baseVersion = null, $note = '')
{
    return tss_locked(function () use ($input, $savedBy, $baseVersion, $note) {
        $current = tss_get_state();
        if ($baseVersion && $baseVersion !== $current['version']) {
            throw new TssConflictError('The content was changed somewhere else since you opened it. Reload to get the latest version, then re-apply your edits.');
        }
        $content = tss_validate($input);
        $media = tss_media('refresh');
        $missing = array_keys(array_diff_key(tss_image_paths($content), $media));
        if ($missing) throw new TssMissingImageError('Image not found in the media library: ' . implode(', ', $missing));

        $raw = tss_json_encode($content) . "\n";
        tss_write_atomic(tss_content_file(), $raw, 0600);
        tss_publish($content);
        tss_add_history($content, $raw, $savedBy, $note);
        return tss_get_state();
    });
}

function tss_restore_version($id, $savedBy)
{
    if (!preg_match('/^[A-Za-z0-9_-]+$/', $id)) throw new TssUserError('Invalid version id');
    $file = tss_history_dir() . "/$id.json";
    if (!is_file($file)) throw new TssUserError('That version no longer exists');
    $h = tss_read_json($file);
    $when = gmdate('j M Y, H:i', strtotime($h['savedAt'])) . ' UTC';
    return tss_save_content($h['content'], $savedBy, null, "Restored version from $when");
}

/**
 * First run on the server: create the private data folder from the bundled seed content,
 * make sure index.html is current and record the initial history version.
 */
function tss_init()
{
    tss_ensure_dir(TSS_DATA_DIR);
    tss_ensure_dir(tss_history_dir());
    tss_ensure_dir(tss_upload_dir(), 0755);
    if (!is_file(tss_content_file())) {
        tss_locked(function () {
            if (is_file(tss_content_file())) return;
            $seed = @file_get_contents(TSS_APP_DIR . '/seed-content.json');
            if ($seed === false) throw new RuntimeException('app/seed-content.json is missing — re-upload the app folder.');
            $content = tss_validate(json_decode($seed, true));
            $raw = tss_json_encode($content) . "\n";
            tss_write_atomic(tss_content_file(), $raw, 0600);
            tss_publish($content);
            tss_add_history($content, $raw, 'system', 'Initial content');
        });
    }
}

/* ---------- uploads ---------- */
function tss_save_upload($originalName, $bytes)
{
    if (strlen($bytes) > TSS_MAX_UPLOAD) throw new TssUserError('Image is larger than 5 MB. Please resize or compress it first.');
    $info = tss_image_info($bytes);
    if (!$info || !$info['width'] || !$info['height']) throw new TssUserError('Only PNG, JPEG and WebP images are supported.');
    if ($info['width'] > 6000 || $info['height'] > 6000) throw new TssUserError('Image dimensions are too large (max 6000 × 6000 px).');
    $base = strtolower(preg_replace('/\.[^.]*$/', '', (string) $originalName));
    $base = trim(preg_replace('/[^a-z0-9]+/', '-', $base), '-');
    $base = substr($base, 0, 40);
    if ($base === '') $base = 'image';
    $name = $base . '-' . bin2hex(random_bytes(3)) . $info['ext'];
    tss_ensure_dir(tss_upload_dir(), 0755);
    $fh = @fopen(tss_upload_dir() . "/$name", 'xb');
    if (!$fh) throw new RuntimeException('Could not save the image — check that assets/uploads is writable.');
    fwrite($fh, $bytes);
    fclose($fh);
    @chmod(tss_upload_dir() . "/$name", 0644);
    $media = tss_media('refresh');
    return $media["assets/uploads/$name"];
}

function tss_delete_upload($p)
{
    return tss_locked(function () use ($p) {
        $media = tss_media('refresh');
        if (!isset($media[$p]) || !$media[$p]['deletable']) throw new TssUserError('Only images uploaded through the admin panel can be deleted.');
        $state = tss_get_state();
        if (isset(tss_image_paths($state['content'])[$p])) {
            throw new TssUserError('This image is still used on the website. Replace it everywhere first, then delete it.', 409);
        }
        @unlink(tss_upload_dir() . '/' . basename($p));
        tss_media('refresh');
    });
}

function tss_list_media()
{
    $state = tss_get_state();
    $used = tss_image_paths($state['content']);
    $items = array_values(tss_media('refresh'));
    foreach ($items as &$m) $m['inUse'] = isset($used[$m['path']]);
    unset($m);
    usort($items, function ($a, $b) {
        if ($a['deletable'] !== $b['deletable']) return $a['deletable'] ? -1 : 1;
        return $b['modified'] <=> $a['modified'];
    });
    return $items;
}
