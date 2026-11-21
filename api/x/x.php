<?php
require_once __DIR__ . '/../lib/entry_guard.php';
require_once __DIR__ . '/../lib/public_media.php';
require_once __DIR__ . '/../lib/ytdlp_service.php';

/** X（Twitter）单条帖子：视频 / GIF / 图片 / 纯文字，由本机 yt-dlp 服务解析。 */
function parseX(string $input): array
{
    $url = svInputUrl($input, ['x.com', 'twitter.com']);
    return svYtdlpParse($url, 'x', 'X');
}

if (!defined('PUBLIC_MEDIA_TEST')) publicMediaRespond('parseX');
