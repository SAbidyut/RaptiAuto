<?php
// RaptiAuto — one section of the simulator as a web page.
// Settings (page title, description, base URL) are in config.php.
define('RAPTI', true);
$site = require __DIR__ . '/config.php';
require __DIR__ . '/includes/functions.php';
require __DIR__ . '/includes/header.php';
?>
  <div id="app"></div>
<?php require __DIR__ . '/includes/footer.php';
