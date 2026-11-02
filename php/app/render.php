<?php
/*
 * Renders the public landing page (index.html) from validated content.
 * Line-for-line PHP port of server/render.js — the output must stay byte-identical
 * (checked by the parity test in scripts/check-php-parity.js).
 */
defined('TSS_APP') || exit;

const TSS_PHONE_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1z"/></svg>';
const TSS_PIN_SVG = '<svg viewBox="0 0 24 24"><path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>';
const TSS_CHECK_SVG = '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
const TSS_TILE_MARK = '<span class="tile-mark" aria-hidden="true"><i></i><i></i></span>';

/* (021) 2962 0480 -> +622129620480 ; numbers starting with 0 are treated as Indonesian */
function tss_tel_href($display)
{
    $d = preg_replace('/[^\d+]/', '', (string) $display);
    if (strpos($d, '+') === 0) return "tel:$d";
    if (strpos($d, '62') === 0) return "tel:+$d";
    if (strpos($d, '0') === 0) return 'tel:+62' . substr($d, 1);
    return "tel:$d";
}

function tss_mix($hex, $withHex, $amount)
{
    $out = '#';
    foreach ([1, 3, 5] as $i) {
        $a = hexdec(substr($hex, $i, 2));
        $b = hexdec(substr($withHex, $i, 2));
        $out .= str_pad(dechex((int) round($a * $amount + $b * (1 - $amount))), 2, '0', STR_PAD_LEFT);
    }
    return $out;
}

function tss_icon_svg($key)
{
    $icons = tss_shared()['icons'];
    $icon = isset($icons[$key]) ? $icons[$key] : $icons['check'];
    return '<svg viewBox="0 0 24 24">' . $icon['svg'] . '</svg>';
}

/** Case/accent-insensitive comparison like localeCompare('en', { sensitivity: 'base' }). */
function tss_compare_names($a, $b)
{
    static $collator = false;
    if ($collator === false) {
        $collator = class_exists('Collator') ? new Collator('en') : null;
        if ($collator) $collator->setStrength(Collator::PRIMARY);
    }
    if ($collator) return $collator->compare($a, $b);
    return strcmp(tss_sort_key($a), tss_sort_key($b));
}

/**
 * Fallback sort key when the intl extension is missing: accents and case are ignored and
 * punctuation sorts before digits before letters, like the browser's localeCompare.
 */
function tss_sort_key($s)
{
    static $accents = null;
    if ($accents === null) {
        $accents = [];
        $groups = [
            'a' => 'àáâãäåāăąǎ', 'c' => 'çćĉċč', 'd' => 'ďđ', 'e' => 'èéêëēĕėęě', 'g' => 'ĝğġģ', 'h' => 'ĥħ',
            'i' => 'ìíîïĩīĭįı', 'j' => 'ĵ', 'k' => 'ķ', 'l' => 'ĺļľŀł', 'n' => 'ñńņňŉ', 'o' => 'òóôõöøōŏőǒ',
            'r' => 'ŕŗř', 's' => 'śŝşšș', 't' => 'ţťŧț', 'u' => 'ùúûüũūŭůűųǔ', 'w' => 'ŵ', 'y' => 'ýÿŷ', 'z' => 'źżž',
            'ae' => 'æ', 'oe' => 'œ', 'ss' => 'ß',
        ];
        foreach ($groups as $base => $chars) {
            preg_match_all('/./u', $chars, $m);
            foreach ($m[0] as $ch) $accents[$ch] = $base;
        }
        // uppercase variants
        foreach ($accents as $ch => $base) {
            $upper = function_exists('mb_strtoupper') ? mb_strtoupper($ch, 'UTF-8') : null;
            if ($upper && $upper !== $ch) $accents[$upper] = $base;
        }
        $accents += ['À' => 'a', 'Á' => 'a', 'Â' => 'a', 'Ã' => 'a', 'Ä' => 'a', 'Å' => 'a', 'Ç' => 'c', 'È' => 'e', 'É' => 'e', 'Ê' => 'e', 'Ë' => 'e',
            'Ì' => 'i', 'Í' => 'i', 'Î' => 'i', 'Ï' => 'i', 'Ñ' => 'n', 'Ò' => 'o', 'Ó' => 'o', 'Ô' => 'o', 'Õ' => 'o', 'Ö' => 'o', 'Ø' => 'o',
            'Ù' => 'u', 'Ú' => 'u', 'Û' => 'u', 'Ü' => 'u', 'Ý' => 'y', 'Æ' => 'ae', 'Œ' => 'oe', 'Š' => 's', 'Ž' => 'z', 'Č' => 'c', 'Ł' => 'l'];
    }
    $s = strtolower(strtr($s, $accents));
    // punctuation/space < digits < letters (ASCII would put some symbols between them)
    return preg_replace_callback('/[^a-z0-9\x80-\xff]/', function ($m) { return "\x01" . $m[0]; }, $s);
}

function tss_render(array $c, array $opts = [])
{
    $S = tss_shared();
    $ids = $S['sectionIds'];
    $mediaInfo = isset($opts['mediaInfo']) ? $opts['mediaInfo'] : function () { return null; };
    $year = isset($opts['year']) ? $opts['year'] : (int) date('Y');
    $font = isset($S['fonts'][$c['theme']['fontPair']]) ? $S['fonts'][$c['theme']['fontPair']] : $S['fonts']['roboto-opensans'];

    // width/height attributes prevent layout shift when the size is known
    $img = function ($src, array $o = []) use ($mediaInfo) {
        $alt = isset($o['alt']) ? $o['alt'] : '';
        $lazy = isset($o['lazy']) ? $o['lazy'] : true;
        $extra = isset($o['extra']) ? $o['extra'] : '';
        $info = $mediaInfo($src);
        $dims = $info ? ' width="' . $info['width'] . '" height="' . $info['height'] . '"' : '';
        $loading = $lazy ? ' loading="lazy" decoding="async"' : '';
        return '<img src="' . tss_esc($src) . '"' . $dims . $loading . ' alt="' . tss_esc($alt) . '"' . $extra . ' />';
    };

    /* ---- layout: visible sections, alternating backgrounds, nav ---- */
    $visible = array_values(array_filter($c['layout'], function ($s) { return $s['visible']; }));
    $navItems = array_values(array_filter($visible, function ($s) { return $s['inNav']; }));
    $lastNav = 'home';
    $sectionMeta = [];
    foreach ($visible as $i => $s) {
        $id = $ids[$s['key']];
        $sectionMeta[$s['key']] = ['id' => $id, 'alt' => $i % 2 === 1, 'navGroup' => $s['inNav'] ? null : $lastNav];
        if ($s['inNav']) $lastNav = $id;
    }
    $sectionAttrs = function ($key, $labelledby) use ($sectionMeta) {
        $m = $sectionMeta[$key];
        return 'class="section' . ($m['alt'] ? ' section-alt' : '') . '" id="' . $m['id'] . '" aria-labelledby="' . $labelledby . '"'
            . ($m['navGroup'] ? ' data-nav-group="' . $m['navGroup'] . '"' : '');
    };
    $head = function ($eyebrow, $id, $title, $sub, $center) {
        return "\n        <div class=\"section-head" . ($center ? ' center' : '') . "\" data-reveal>\n          "
            . (tss_has($eyebrow) ? '<p class="eyebrow">' . tss_esc($eyebrow) . '</p>' : '')
            . "\n          <h2 id=\"$id\">" . tss_esc($title) . '</h2>'
            . (tss_has($sub) ? "\n          <p class=\"section-sub\">" . tss_esc($sub) . '</p>' : '')
            . "\n        </div>";
    };

    $primaryPhone = $c['contact']['phones'][0];

    /* ---- motion + theme ---- */
    $m = $c['motion'];
    $htmlClasses = implode(' ', array_filter([
        $m['heroIntro'] ? 'm-hero' : '', $m['heroSheen'] ? 'm-sheen' : '', $m['scrollReveal'] ? 'm-reveal' : '',
        $m['counters'] ? 'm-counters' : '', $m['hoverEffects'] ? 'm-hover' : '',
    ]));
    $revealDur = ['relaxed' => '1s', 'standard' => '.7s', 'quick' => '.45s'][$m['speed']];

    $rows = $c['clients']['collapsedRows'];
    $visDesktop = $rows * 3;
    $visTablet = min($visDesktop, ($rows + 1) * 2);
    $visMobile = $rows * 2;
    $hideFrom = function ($n) { return '.js .client-grid.is-collapsed .client:nth-child(n + ' . ($n + 1) . ') { display: none; }'; };

    $t = $c['theme'];
    $themeCss = "\n    :root {\n      --orange: {$t['accent']};\n      --orange-strong: {$t['accentStrong']};\n      --orange-ink: {$t['accentInk']};\n"
        . '      --orange-soft: ' . tss_mix($t['accent'], '#ffffff', 0.13) . ";\n      --ink: {$t['ink']};\n"
        . "      --font-head: {$font['head']};\n      --font-body: {$font['body']};\n      --reveal-dur: $revealDur;\n    }\n"
        . '    ' . $hideFrom($visDesktop) . "\n"
        . '    @media (max-width: 1024px) { ' . $hideFrom($visTablet) . " }\n"
        . '    @media (max-width: 560px) { ' . $hideFrom($visMobile) . ' }';

    $map = function ($list, $fn) { return implode('', array_map($fn, $list, array_keys($list))); };

    /* ---- sections ---- */
    $sections = [];

    $sections['about'] = function () use ($c, $sectionAttrs, $head, $map) {
        $a = $c['about'];
        return "\n    <!-- About -->\n    <section " . $sectionAttrs('about', 'about-title') . ">\n      <div class=\"container\">"
            . $head($a['eyebrow'], 'about-title', $a['title'], '', false)
            . "\n\n        <div class=\"about-grid\">\n          <div class=\"about-text\" data-reveal>"
            . (tss_has($a['lead']) ? "\n            <p class=\"lead\">" . tss_esc($a['lead']) . '</p>' : '')
            . $map($a['paragraphs'], function ($p) { return "\n            <p>" . tss_esc($p) . '</p>'; })
            . "\n          </div>\n"
            . (count($a['sectors']) ? "\n          <ol class=\"sector-list\" data-reveal style=\"--d: 1\">"
                . $map($a['sectors'], function ($s) {
                    return "\n            <li>\n              <span class=\"sector-icon\" aria-hidden=\"true\">" . tss_icon_svg($s['icon'])
                        . "</span>\n              " . tss_esc($s['label']) . "\n            </li>";
                })
                . "\n          </ol>" : '')
            . "\n        </div>\n"
            . ($a['project']['visible'] ? "\n        <div class=\"p-project\" data-reveal>\n          "
                . (tss_has($a['project']['badge']) ? '<div class="p-project-badge" aria-hidden="true">' . tss_esc($a['project']['badge']) . '</div>' : '')
                . "\n          <div>\n            <h3>" . tss_esc($a['project']['title']) . "</h3>\n            <p>" . tss_esc($a['project']['text'])
                . "</p>\n          </div>\n        </div>" : '')
            . "\n"
            . (count($a['values']) ? "\n        <div class=\"values\">"
                . $map($a['values'], function ($v, $i) {
                    return "\n          <article class=\"value-card\" data-reveal style=\"--d: " . ($i % 2) . "\">\n            <span class=\"value-icon\" aria-hidden=\"true\">"
                        . tss_icon_svg($v['icon']) . "</span>\n            <div>\n              <h3>" . tss_esc($v['title']) . "</h3>\n              "
                        . (tss_has($v['text']) ? '<p>' . tss_esc($v['text']) . '</p>' : '') . "\n            </div>\n          </article>";
                })
                . "\n        </div>" : '')
            . "\n      </div>\n    </section>";
    };

    $sections['services'] = function () use ($c, $sectionAttrs, $head, $map, $img) {
        $s = $c['services'];
        return "\n    <!-- Services -->\n    <section " . $sectionAttrs('services', 'services-title') . ">\n      <div class=\"container\">"
            . $head($s['eyebrow'], 'services-title', $s['title'], $s['subtitle'], true)
            . "\n\n        <div class=\"service-grid\">"
            . $map($s['items'], function ($it, $i) use ($img, $map) {
                return "\n          <article class=\"service-card\" data-reveal style=\"--d: " . ($i % 3) . "\">\n            <div class=\"service-media\">\n              "
                    . $img($it['image'], ['alt' => $it['imageAlt']]) . "\n            </div>\n            <div class=\"service-body\">\n              <h3>"
                    . tss_esc($it['title']) . "</h3>\n              <ul class=\"check-list\">"
                    . $map($it['bullets'], function ($b) {
                        return "\n                <li>" . tss_esc($b['text']) . (tss_has($b['note']) ? ' <small>' . tss_esc($b['note']) . '</small>' : '') . '</li>';
                    })
                    . "\n              </ul>\n            </div>\n          </article>";
            })
            . "\n        </div>\n      </div>\n    </section>";
    };

    $sections['whyUs'] = function () use ($c, $sectionAttrs, $head, $map, $img) {
        $w = $c['whyUs'];
        return "\n    <!-- Added value -->\n    <section " . $sectionAttrs('whyUs', 'why-title') . ">\n      <div class=\"container\">"
            . $head($w['eyebrow'], 'why-title', $w['title'], $w['subtitle'], false)
            . "\n\n        <div class=\"why-grid\">\n          <figure class=\"why-feature\" data-reveal>\n            "
            . $img($w['featureImage'], ['alt' => $w['featureAlt']])
            . (tss_has($w['featureCaption']) ? "\n            <figcaption>\n              " . TSS_TILE_MARK . "\n              " . tss_esc($w['featureCaption']) . "\n            </figcaption>" : '')
            . "\n          </figure>\n"
            . $map($w['items'], function ($it, $i) {
                return "\n          <article class=\"why-item\" data-reveal style=\"--d: " . (($i + 1) % 3) . "\">\n            <span class=\"why-icon\" aria-hidden=\"true\">"
                    . tss_icon_svg($it['icon']) . "</span>\n            <span class=\"why-num\">" . str_pad((string) ($i + 1), 2, '0', STR_PAD_LEFT)
                    . "</span>\n            <h3>" . tss_esc($it['title']) . "</h3>\n            "
                    . (tss_has($it['text']) ? '<p>' . tss_esc($it['text']) . '</p>' : '') . "\n          </article>";
            })
            . "\n        </div>\n      </div>\n    </section>";
    };

    // Former "How we work" section, now only its field photo strip
    $sections['standards'] = function () use ($c, $sectionAttrs, $map, $img) {
        $st = $c['standards'];
        if (!count($st['photos'])) return '';
        $attrs = tss_replace_first(tss_replace_first($sectionAttrs('standards', ''), ' aria-labelledby=""', ' aria-label="Our teams at work"'),
            'class="section', 'class="section section-photos');
        return "\n    <!-- Field photos -->\n    <section " . $attrs . ">\n      <div class=\"container\">\n        <ul class=\"field-strip\" style=\"--photos: "
            . count($st['photos']) . "\">"
            . $map($st['photos'], function ($p, $i) use ($img) {
                return "\n          <li data-reveal style=\"--d: $i\">\n            " . $img($p['image'], ['alt' => $p['alt']]) . "\n          </li>";
            })
            . "\n        </ul>\n      </div>\n    </section>";
    };

    $sections['clients'] = function () use ($c, $sectionAttrs, $head, $map, $img) {
        $cl = $c['clients'];
        $items = $cl['items'];
        if ($cl['sortAlpha']) {
            // stable sort, like Array.prototype.sort in modern engines
            $indexed = [];
            foreach ($items as $i => $it) $indexed[] = [$i, $it];
            usort($indexed, function ($x, $y) {
                $r = tss_compare_names($x[1]['name'], $y[1]['name']);
                return $r !== 0 ? $r : $x[0] - $y[0];
            });
            $items = array_map(function ($p) { return $p[1]; }, $indexed);
        }
        return "\n    <!-- Clients -->\n    <section " . $sectionAttrs('clients', 'clients-title') . ">\n      <div class=\"container\">"
            . $head($cl['eyebrow'], 'clients-title', $cl['title'], '', true)
            . "\n\n        <ul class=\"client-grid\" id=\"client-list\">"
            . $map($items, function ($it, $i) use ($img) {
                return "\n          <li class=\"client" . (tss_has($it['logo']) ? ' has-logo' : '') . "\" data-reveal style=\"--d: " . ($i % 3) . "\">"
                    . (tss_has($it['logo'])
                        ? '<span class="client-logo">' . $img($it['logo'], ['alt' => '']) . '</span>'
                        : '<span class="client-check" aria-hidden="true">' . TSS_CHECK_SVG . '</span>')
                    . tss_esc($it['name']) . '</li>';
            })
            . "\n        </ul>\n\n        <div class=\"client-more\">\n          <button type=\"button\" class=\"btn btn-ghost client-toggle\" aria-controls=\"client-list\" aria-expanded=\"false\" data-more-label=\""
            . tss_esc($cl['showMoreLabel']) . '" data-less-label="' . tss_esc($cl['showLessLabel']) . "\" hidden>\n            <span class=\"client-toggle-label\">"
            . tss_esc($cl['showMoreLabel']) . "</span>\n            <svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M6 9l6 6 6-6\"/></svg>\n          </button>\n        </div>\n      </div>\n    </section>";
    };

    $sections['contact'] = function () use ($c, $sectionAttrs, $map, $primaryPhone) {
        $ct = $c['contact'];
        $lat = tss_jsnum($ct['map']['lat']);
        $lng = tss_jsnum($ct['map']['lng']);
        $mapSrc = "https://maps.google.com/maps?q=$lat,$lng&z=" . tss_jsnum($ct['map']['zoom']) . '&output=embed';
        $mapLink = 'https://www.google.com/maps/search/?api=1&query=' . tss_encode_uri_component(tss_has($ct['map']['query']) ? $ct['map']['query'] : "$lat,$lng");
        return "\n    <!-- Contact -->\n    <section " . $sectionAttrs('contact', 'contact-title') . ">\n      <div class=\"container contact-grid\">\n        <div class=\"contact-info\" data-reveal>\n          "
            . (tss_has($ct['eyebrow']) ? '<p class="eyebrow">' . tss_esc($ct['eyebrow']) . '</p>' : '')
            . "\n          <h2 id=\"contact-title\">" . tss_esc($ct['title']) . "</h2>\n          "
            . (tss_has($ct['intro']) ? '<p class="contact-intro">' . tss_esc($ct['intro']) . '</p>' : '')
            . "\n\n          <ul class=\"contact-list\">\n            <li>\n              <span class=\"contact-icon\" aria-hidden=\"true\">" . TSS_PIN_SVG
            . "</span>\n              <div>\n                <span class=\"contact-label\">" . tss_esc($ct['officeLabel']) . "</span>\n                <address>"
            . $map($ct['offices'], function ($o) {
                return "\n                  <span class=\"office\">" . tss_esc($o['line1']) . (tss_has($o['line2']) ? '<br />' . tss_esc($o['line2']) : '') . '</span>';
            })
            . "\n                </address>\n              </div>\n            </li>\n            <li>\n              <span class=\"contact-icon\" aria-hidden=\"true\">"
            . tss_replace_first(TSS_PHONE_SVG, ' aria-hidden="true"', '')
            . "</span>\n              <div>\n                <span class=\"contact-label\">" . tss_esc($ct['phoneLabel']) . "</span>\n                <span class=\"contact-phones\">"
            . $map($ct['phones'], function ($p) { return "\n                  <a href=\"" . tss_esc(tss_tel_href($p)) . '">' . tss_esc($p) . '</a>'; })
            . "\n                </span>"
            . (tss_has($ct['fax']) ? "\n                <span class=\"contact-note\">Fax " . tss_esc($ct['fax']) . '</span>' : '')
            . "\n              </div>\n            </li>\n          </ul>\n"
            . (tss_has($ct['secondaryLabel']) ? "\n          <div class=\"contact-actions\">\n            <a href=\"" . tss_esc(tss_tel_href($primaryPhone))
                . "\" class=\"btn btn-primary\">\n              " . TSS_PHONE_SVG . "\n              " . tss_esc($ct['secondaryLabel']) . "\n            </a>\n          </div>" : '')
            . (tss_has($ct['mapLabel']) ? "\n          <a class=\"map-link\" href=\"" . tss_esc($mapLink) . '" target="_blank" rel="noopener">' . tss_esc($ct['mapLabel'])
                . "\n            <svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M7 17L17 7M9 7h8v8\"/></svg>\n          </a>" : '')
            . "\n        </div>\n\n        <div class=\"contact-map\" data-reveal style=\"--d: 1\">\n          <iframe\n            title=\"Map showing "
            . tss_esc(tss_has($ct['map']['query']) ? $ct['map']['query'] : 'our office') . "\"\n            src=\"" . tss_esc($mapSrc)
            . "\"\n            loading=\"lazy\"\n            referrerpolicy=\"no-referrer-when-downgrade\"></iframe>\n        </div>\n      </div>\n    </section>";
    };

    /* ---- page ---- */
    $navLinks = $map($navItems, function ($s) use ($ids) { return "\n          <li><a href=\"#" . $ids[$s['key']] . '" class="nav-link">' . tss_esc($s['navLabel']) . '</a></li>'; });
    $footerLinks = $map($navItems, function ($s) use ($ids) { return "\n          <li><a href=\"#" . $ids[$s['key']] . '">' . tss_esc($s['navLabel']) . '</a></li>'; });
    $firstSection = isset($visible[0]) ? $visible[0] : null;
    $h = $c['hero'];
    $f = $c['facts'];
    $site = $c['site'];
    $siteUrl = tss_has($site['url']) ? $site['url'] : '';
    $copyright = tss_replace_first(tss_esc($c['footer']['copyright']), '{year}', '<span data-year>' . $year . '</span>');
    $lat = tss_jsnum($c['contact']['map']['lat']);
    $lng = tss_jsnum($c['contact']['map']['lng']);

    $factsHtml = '';
    if ($f['visible']) {
        $factsHtml = "\n    <!-- Key facts -->\n    <section class=\"facts\" aria-label=\"Key facts\">\n      <div class=\"container\">\n        <ul class=\"facts-grid\" style=\"--fact-cols: "
            . count($f['items']) . "\">"
            . $map($f['items'], function ($it, $i) {
                $numeric = (bool) preg_match('/^\d+$/', $it['value']);
                $shown = $numeric ? number_format((float) $it['value'], 0, '.', ',') : $it['value'];
                $value = $numeric && $it['countUp'] ? '<span data-count="' . $it['value'] . '">' . $shown . '</span>' : tss_esc($shown);
                return "\n          <li class=\"fact\" data-reveal style=\"--d: $i\">\n            <strong>" . $value . tss_esc($it['suffix'])
                    . "</strong>\n            <span>" . tss_esc($it['label']) . "</span>\n          </li>";
            })
            . "\n        </ul>\n      </div>\n    </section>";
    }

    $body = implode("\n", array_map(function ($s) use ($sections) { return $sections[$s['key']](); }, $visible));

    return "<!DOCTYPE html>\n"
        . "<!-- Generated by the TS Solution admin panel from data/content.json. Edit content in /admin, not here. -->\n"
        . '<html lang="en" class="' . $htmlClasses . "\">\n<head>\n  <meta charset=\"utf-8\" />\n  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />\n"
        . '  <title>' . tss_esc($site['title']) . "</title>\n"
        . '  <meta name="description" content="' . tss_esc($site['description']) . "\" />\n"
        . '  <meta name="keywords" content="' . tss_esc($site['keywords']) . "\" />\n"
        . '  <meta name="theme-color" content="' . tss_esc($t['accent']) . "\" />\n"
        . "  <meta name=\"icbm\" content=\"$lat,$lng\" />\n"
        . "  <meta name=\"geo.position\" content=\"$lat;$lng\" />\n"
        . "  <meta name=\"geo.placename\" content=\"Kota Bekasi\" />\n"
        . '  <meta property="og:title" content="' . tss_esc(tss_has($site['ogTitle']) ? $site['ogTitle'] : $site['title']) . "\" />\n"
        . '  <meta property="og:description" content="' . tss_esc(tss_has($site['ogDescription']) ? $site['ogDescription'] : $site['description']) . "\" />\n"
        . "  <meta property=\"og:type\" content=\"website\" />\n"
        . '  <meta property="og:locale" content="en" />'
        . ($siteUrl !== '' ? "\n  <meta property=\"og:url\" content=\"" . tss_esc($siteUrl) . '" />' : '')
        . ($siteUrl !== '' && tss_has($site['ogImage']) ? "\n  <meta property=\"og:image\" content=\"" . tss_esc($siteUrl . '/' . $site['ogImage']) . '" />' : '')
        . ($siteUrl !== '' ? "\n  <link rel=\"canonical\" href=\"" . tss_esc($siteUrl) . '" />' : '')
        . "\n  <link rel=\"icon\" href=\"assets/img/favicon.svg\" type=\"image/svg+xml\" />\n\n"
        . "  <link rel=\"preconnect\" href=\"https://fonts.googleapis.com\" />\n"
        . "  <link rel=\"preconnect\" href=\"https://fonts.gstatic.com\" crossorigin />\n"
        . '  <link rel="stylesheet" href="' . tss_esc($font['url']) . "\" />\n"
        . '  <link rel="preload" as="image" href="' . tss_esc($h['image']) . "\" />\n"
        . "  <link rel=\"stylesheet\" href=\"assets/css/styles.css\" />\n"
        . '  <style id="site-theme">' . $themeCss . "\n  </style>\n"
        . "  <script>document.documentElement.classList.add('js');</script>\n"
        . "  <script src=\"assets/js/main.js\" defer></script>\n</head>\n<body>\n"
        . "  <a class=\"skip-link\" href=\"#main-content\">Skip to main content</a>\n\n"
        . "  <!-- Header -->\n  <header class=\"site-header\" id=\"top\">\n    <div class=\"container header-inner\">\n"
        . '      <a class="brand" href="#home" aria-label="' . tss_esc($c['footer']['brand']) . ", back to top\">\n        "
        . $img($c['header']['logo'], ['alt' => $c['header']['logoAlt'], 'lazy' => false])
        . "\n      </a>\n\n      <nav class=\"main-nav\" id=\"main-nav\" aria-label=\"Main\">\n        <ul>\n"
        . '          <li><a href="#home" class="nav-link">' . tss_esc($c['header']['homeLabel']) . '</a></li>' . $navLinks
        . (tss_has($c['header']['ctaLabel']) && tss_has($c['header']['ctaHref'])
            ? "\n          <li class=\"nav-cta\"><a href=\"" . tss_esc($c['header']['ctaHref']) . '" class="btn btn-primary btn-sm">' . tss_esc($c['header']['ctaLabel']) . '</a></li>' : '')
        . "\n        </ul>\n      </nav>\n\n      <div class=\"header-actions\">"
        . ($c['header']['showPhone'] ? "\n        <a class=\"icon-btn\" href=\"" . tss_esc(tss_tel_href($primaryPhone)) . '" aria-label="Call ' . tss_esc($primaryPhone) . "\">\n          "
            . TSS_PHONE_SVG . "\n        </a>" : '')
        . "\n        <button class=\"menu-toggle\" type=\"button\" aria-expanded=\"false\" aria-controls=\"main-nav\">\n"
        . "          <span class=\"menu-toggle-bars\" aria-hidden=\"true\"><span></span><span></span><span></span></span>\n"
        . "          <span class=\"menu-toggle-label\">Menu</span>\n        </button>\n      </div>\n    </div>\n  </header>\n\n"
        . "  <main id=\"main-content\">\n\n    <!-- Hero -->\n    <section class=\"hero\" id=\"home\" aria-label=\"Introduction\">\n      <div class=\"hero-media\" aria-hidden=\"true\">\n        "
        . $img($h['image'], ['alt' => '', 'lazy' => false, 'extra' => ' fetchpriority="high"'])
        . "\n        <span class=\"hero-sheen\"></span>\n      </div>\n\n      <div class=\"container hero-inner\">\n        <div class=\"hero-content\">"
        . (tss_has($h['eyebrow']) ? "\n          <p class=\"eyebrow hero-anim\" style=\"--d: 0\">\n            " . TSS_TILE_MARK . "\n            " . tss_esc($h['eyebrow']) . "\n          </p>" : '')
        . "\n          <h1 class=\"hero-anim\" style=\"--d: 1\">" . tss_esc($h['title']) . '</h1>'
        . (tss_has($h['lead']) ? "\n          <p class=\"hero-lead hero-anim\" style=\"--d: 2\">" . tss_esc($h['lead']) . '</p>' : '')
        . "\n          <div class=\"hero-actions hero-anim\" style=\"--d: 3\">"
        . (tss_has($h['primaryLabel']) && tss_has($h['primaryHref'])
            ? "\n            <a href=\"" . tss_esc($h['primaryHref']) . "\" class=\"btn btn-primary\">\n              " . tss_esc($h['primaryLabel'])
                . "\n              <svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M5 12h14M13 6l6 6-6 6\"/></svg>\n            </a>" : '')
        . (tss_has($h['secondaryLabel']) && tss_has($h['secondaryHref'])
            ? "\n            <a href=\"" . tss_esc($h['secondaryHref']) . '" class="btn btn-ghost">' . tss_esc($h['secondaryLabel']) . '</a>' : '')
        . "\n          </div>\n        </div>\n      </div>\n"
        . ($h['showScrollCue'] && $firstSection
            ? "\n      <a class=\"scroll-cue\" href=\"#" . $ids[$firstSection['key']] . '" aria-label="Scroll to ' . tss_esc($firstSection['navLabel'])
                . "\">\n        <svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M6 9l6 6 6-6\"/></svg>\n      </a>" : '')
        . "\n    </section>\n"
        . $factsHtml
        . "\n" . $body
        . "\n  </main>\n\n  <!-- Footer -->\n  <footer class=\"site-footer\">\n    <div class=\"container footer-inner\">\n      <div class=\"footer-brand\">\n"
        . "        <span class=\"tile-mark tile-mark-lg\" aria-hidden=\"true\"><i></i><i></i></span>\n        <div>\n"
        . '          <strong>' . tss_esc($c['footer']['brand']) . "</strong>\n          "
        . (tss_has($c['footer']['tagline']) ? '<span>' . tss_esc($c['footer']['tagline']) . '</span>' : '')
        . "\n        </div>\n      </div>\n      <nav aria-label=\"Footer\">\n        <h3 class=\"visually-hidden\">Navigation</h3>\n        <ul class=\"footer-nav\">\n"
        . '          <li><a href="#home">' . tss_esc($c['header']['homeLabel']) . '</a></li>' . $footerLinks
        . "\n        </ul>\n      </nav>\n    </div>"
        . ($c['footer']['showContact'] ? "\n    <div class=\"container footer-contact\">\n      <a href=\"" . tss_esc(tss_tel_href($primaryPhone)) . '">' . tss_esc($primaryPhone) . "</a>\n    </div>" : '')
        . "\n    <div class=\"container footer-bottom\">\n      <p>" . $copyright . '</p>'
        . (tss_has($c['footer']['backToTopLabel'])
            ? "\n      <a href=\"#home\" class=\"back-to-top\">" . tss_esc($c['footer']['backToTopLabel'])
                . "\n        <svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M6 15l6-6 6 6\"/></svg>\n      </a>" : '')
        . "\n    </div>\n  </footer>\n</body>\n</html>\n";
}
