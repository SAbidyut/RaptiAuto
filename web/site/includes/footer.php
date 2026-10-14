<?php
// The simulator's scripts. RAPTI_SITE tells the app which section to show and where js/ is.
if (!defined('RAPTI')) { http_response_code(403); exit; }
$rapti_site = array('section' => $site['section'], 'assets' => $site['base'] . 'js/', 'v' => $site['version']);
?>
  <noscript><p style="color:#fff;padding:24px;font-family:sans-serif">Please turn on JavaScript to use the simulator.</p></noscript>
  <script>window.RAPTI_SITE = <?= json_encode($rapti_site, JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP) ?>;</script>
  <script src="<?= rapti_asset('js/app.js') ?>"></script>
</body>
</html>
