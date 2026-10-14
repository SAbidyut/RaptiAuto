<?php
// Small helpers for the page templates.
if (!defined('RAPTI')) { http_response_code(403); exit; }

/** Escape text for HTML. */
function rapti_e($text)
{
    return htmlspecialchars((string) $text, ENT_QUOTES, 'UTF-8');
}

/** URL of a file of this folder (css/…, js/…) with a version so browsers fetch new files after an update. */
function rapti_asset($path)
{
    global $site;
    return rapti_e($site['base'] . $path . '?v=' . rawurlencode($site['version']));
}
