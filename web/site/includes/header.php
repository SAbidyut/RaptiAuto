<?php
// <head> of the page and the splash screen shown while the simulator starts.
if (!defined('RAPTI')) { http_response_code(403); exit; }
?><!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
  <meta name="theme-color" content="#070b16">
  <title><?= rapti_e($site['title']) ?></title>
  <meta name="description" content="<?= rapti_e($site['description']) ?>">
  <link rel="icon" type="image/svg+xml" href="<?= rapti_asset('favicon.svg') ?>">
<?php foreach ($site['css'] as $css): ?>
  <link rel="stylesheet" href="<?= rapti_asset($css) ?>">
<?php endforeach; ?>
</head>
<body>
  <div id="splash">
    <div class="sp-in">
      <svg width="86" height="86" viewBox="0 0 64 64" aria-hidden="true">
        <defs>
          <linearGradient id="spa" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#22d3ee"/><stop offset="0.55" stop-color="#3b82f6"/><stop offset="1" stop-color="#8b5cf6"/></linearGradient>
          <linearGradient id="spb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fde68a"/><stop offset="1" stop-color="#f59e0b"/></linearGradient>
        </defs>
        <rect x="2" y="2" width="60" height="60" rx="17" fill="#0b1226"/>
        <rect x="2.75" y="2.75" width="58.5" height="58.5" rx="16.3" fill="none" stroke="url(#spa)" stroke-width="1.5"/>
        <g stroke="url(#spa)" stroke-width="3" stroke-linecap="round"><path d="M22 13v6M32 13v6M42 13v6M22 45v6M32 45v6M42 45v6M13 22h6M13 32h6M13 42h6M45 22h6M45 32h6M45 42h6"/></g>
        <rect x="19" y="19" width="26" height="26" rx="6" fill="#111c3a" stroke="url(#spa)" stroke-width="2.6"/>
        <path d="M34.5 22.5 26 33.5h6l-2.5 8 8.5-11h-6z" fill="url(#spb)"/>
      </svg>
      <div class="sp-name">Rapti<i>Auto</i></div>
      <div class="sp-bar"></div>
    </div>
  </div>
