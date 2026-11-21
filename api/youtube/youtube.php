<?php
require_once __DIR__ . '/../lib/entry_guard.php';
require_once __DIR__ . '/../lib/public_media.php';
require_once __DIR__ . '/../lib/ytdlp_service.php';

function parseYoutube(string $input): array
{
    $url = svInputUrl($input, ['youtube.com', 'youtu.be']);
    return svYtdlpParse($url, 'youtube', 'YouTube');
}

if (!defined('PUBLIC_MEDIA_TEST')) publicMediaRespond('parseYoutube');
