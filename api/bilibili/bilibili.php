<?php
require_once __DIR__ . '/../lib/entry_guard.php';
/** Public Bilibili videos; preserve upstream signed URLs and the requested part. */
require_once __DIR__ . '/../lib/public_media.php';
function parseBilibili(string $input): array
{
    $url = publicMediaInput($input);
    $http = new PublicMediaHttp(['b23.tv', 'bilibili.com', 'www.bilibili.com', 'm.bilibili.com', 'api.bilibili.com'], 'ShortVideos/1.0');
    $parts = parse_url($url);
    if (!in_array(strtolower($parts['host'] ?? ''), ['b23.tv', 'bilibili.com', 'www.bilibili.com', 'm.bilibili.com'], true)
        || isset($parts['user']) || isset($parts['pass']) || isset($parts['port'])) {
        throw new RuntimeException('请提供 B 站视频链接', 400);
    }
    if ($parts['host'] === 'b23.tv') {
        $url = $http->request($url, null, 'https://www.bilibili.com/')['url'];
        $parts = parse_url($url);
    }
    if (!preg_match('~^/video/(BV[0-9A-Za-z]{10}|av[0-9]+)(?:/|$)~', $parts['path'] ?? '', $m)) {
        throw new RuntimeException('无法识别 B 站视频编号', 400);
    }
    parse_str($parts['query'] ?? '', $query);
    $partNumber = max(1, (int)($query['p'] ?? 1));
    $id = str_starts_with($m[1], 'BV') ? ['bvid' => $m[1]] : ['aid' => substr($m[1], 2)];
    $meta = $http->json('https://api.bilibili.com/x/web-interface/view?' . http_build_query($id), null, 'https://www.bilibili.com/');
    if (($meta['code'] ?? -1) != 0 || empty($meta['data']['pages'])) {
        throw new RuntimeException('视频不可用：' . ($meta['message'] ?? '上游未返回视频信息'), 404);
    }
    $data = $meta['data'];
    if (!isset($data['pages'][$partNumber - 1])) throw new RuntimeException('指定的分 P 不存在', 404);
    $page = $data['pages'][$partNumber - 1];
    $params = ['bvid' => $data['bvid'], 'cid' => $page['cid'], 'qn' => 64, 'fnval' => 0, 'fnver' => 0, 'platform' => 'html5'];
    $play = $http->json('https://api.bilibili.com/x/player/playurl?' . http_build_query($params), null, 'https://www.bilibili.com/');
    if (($play['code'] ?? -1) != 0 || empty($play['data']['durl'][0]['url'])) {
        throw new RuntimeException('未取得可公开下载的视频地址，可能需要登录或视频受限', 422);
    }
    $stream = $play['data']['durl'][0];
    if (count($play['data']['durl']) !== 1) throw new RuntimeException('此视频包含多个媒体分段，暂不支持单文件下载', 422);
    $media = publicMediaUrl($stream['url']);
    if (!$media) throw new RuntimeException('上游返回了无效的媒体地址', 502);
    $quality = (int)($play['data']['quality'] ?? 0);
    $backups = [];
    foreach ($stream['backup_url'] ?? [] as $backup) {
        if ($u = publicMediaUrl($backup)) $backups[] = ['label' => '备用线路', 'url' => $u];
    }
    return [
        'type' => 'video', 'title' => $data['title'] . (count($data['pages']) > 1 ? ' · P' . $partNumber . ' ' . $page['part'] : ''),
        'desc' => $data['desc'] ?? '', 'cover' => publicMediaUrl($data['pic'] ?? ''),
        'author' => ['name' => $data['owner']['name'] ?? '', 'id' => (string)($data['owner']['mid'] ?? ''), 'avatar' => publicMediaUrl($data['owner']['face'] ?? '')],
        'url' => $media, 'quality' => [16 => '360P', 32 => '480P', 64 => '720P', 80 => '1080P'][$quality] ?? (string)$quality,
        'duration' => ($play['data']['timelength'] ?? 0) / 1000, 'size' => $stream['size'] ?? null,
        'size_label' => isset($stream['size']) ? round($stream['size'] / 1048576, 2) . ' MB' : '',
        'video_backup' => $backups, 'publish_time' => (string)($data['pubdate'] ?? ''),
        'part' => $partNumber, 'totalVideos' => count($data['pages']),
    ];
}
if (!defined('PUBLIC_MEDIA_TEST')) publicMediaRespond('parseBilibili');