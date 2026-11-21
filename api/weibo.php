<?php
require_once __DIR__ . '/lib/entry_guard.php';
/** Public Weibo videos: initialise an anonymous visitor session, never a user login. */
require_once __DIR__ . '/lib/public_media.php';
function weiboGuest(PublicMediaHttp $http): void
{
    $fp = ['os' => '1', 'browser' => 'Chrome131,0,0,0', 'fonts' => 'undefined', 'screenInfo' => '1920*1080*24', 'plugins' => ''];
    $r = $http->request('https://passport.weibo.com/visitor/genvisitor', http_build_query(['cb' => 'gen_callback', 'fp' => json_encode($fp)]), 'https://weibo.com/');
    $start = strpos($r['body'], '('); $end = strrpos($r['body'], ')');
    $data = ($start !== false && $end !== false) ? json_decode(substr($r['body'], $start + 1, $end - $start - 1), true) : null;
    if (empty($data['data']['tid'])) throw new RuntimeException('微博访客服务暂不可用，请稍后重试', 502);
    $v = $data['data'];
    $http->request('https://passport.weibo.com/visitor/visitor?' . http_build_query([
        'a' => 'incarnate', 't' => $v['tid'], 'w' => !empty($v['new_tid']) ? 3 : 2,
        'c' => sprintf('%03d', $v['confidence'] ?? 100), 'gc' => '', 'cb' => 'cross_domain', 'from' => 'weibo',
    ]), null, 'https://weibo.com/');
}
function weiboBest(array $candidates): array
{
    $valid = [];
    foreach ($candidates as $item) {
        $url = publicMediaUrl($item['url'] ?? '');
        if (!$url) continue;
        $host = strtolower(parse_url($url, PHP_URL_HOST) ?? '');
        if (!preg_match('~(?:^|\.)(?:weibocdn\.com|sinaimg\.cn)$~', $host)) continue;
        $item['url'] = $url;
        $valid[] = $item;
    }
    usort($valid, static fn($a, $b) => ($b['rank'] ?? 0) <=> ($a['rank'] ?? 0));
    if (!$valid) throw new RuntimeException('没有可公开下载的视频地址，作品可能已删除或需要登录', 422);
    return $valid;
}
function weiboComponentMedia(array $v): array
{
    if (!empty($v['is_paid'])) throw new RuntimeException('暂不支持付费视频', 422);
    $items = [];
    foreach ($v['urls'] ?? [] as $label => $url) {
        preg_match('~(\d+)[pPkK]~', (string)$label, $m);
        $rank = isset($m[1]) ? (int)$m[1] : 0;
        if (stripos((string)$label, 'K') !== false) $rank *= 1000;
        $items[] = ['label' => (string)$label, 'quality' => (string)$label, 'rank' => $rank, 'url' => $url];
    }
    if (!$items && !empty($v['stream_url'])) $items[] = ['label' => '默认', 'url' => $v['stream_url']];
    $items = weiboBest($items);
    return [
        'type' => 'video', 'title' => html_entity_decode(strip_tags($v['title'] ?? '')), 'desc' => html_entity_decode(strip_tags($v['text'] ?? $v['title'] ?? '')),
        'author' => ['name' => $v['author'] ?? '', 'id' => (string)($v['author_id'] ?? ''), 'avatar' => publicMediaUrl($v['avatar'] ?? '')],
        'cover' => publicMediaUrl($v['cover_image'] ?? ''), 'url' => $items[0]['url'],
        'quality' => $items[0]['label'] ?? '', 'duration' => is_numeric($v['duration_time'] ?? null) ? (float)$v['duration_time'] : null,
        'video_backup' => $items, 'publish_time' => (string)($v['date'] ?? ''),
    ];
}
function weiboStatusMedia(array $v): array
{
    $media = $v['page_info']['media_info'] ?? [];
    $items = [];
    foreach ($media['playback_list'] ?? [] as $entry) {
        $p = $entry['play_info'] ?? [];
        if (($p['mime'] ?? '') !== 'video/mp4' || !empty($p['is_pay'])) continue;
        $items[] = ['label' => $p['quality_desc'] ?? $p['quality_label'] ?? '', 'rank' => $p['height'] ?? $entry['meta']['quality_index'] ?? 0, 'url' => $p['url'] ?? ''];
    }
    if (!$items) foreach (['mp4_720p_mp4' => 720, 'mp4_hd_url' => 480, 'stream_url_hd' => 480, 'stream_url' => 360] as $key => $rank) {
        if (!empty($media[$key])) $items[] = ['label' => $rank . 'P', 'rank' => $rank, 'url' => $media[$key]];
    }
    $items = weiboBest($items);
    return [
        'type' => 'video', 'title' => html_entity_decode(strip_tags($media['video_title'] ?? $media['name'] ?? $v['text_raw'] ?? $v['text'] ?? '')),
        'desc' => html_entity_decode(strip_tags($v['text_raw'] ?? $v['text'] ?? '')),
        'author' => ['name' => $v['user']['screen_name'] ?? '', 'id' => (string)($v['user']['id'] ?? ''), 'avatar' => publicMediaUrl($v['user']['avatar_large'] ?? $v['user']['profile_image_url'] ?? '')],
        'cover' => publicMediaUrl($v['page_info']['page_pic'] ?? ''), 'url' => $items[0]['url'], 'quality' => $items[0]['label'] ?? '',
        'duration' => isset($media['duration']) ? (float)$media['duration'] : null, 'video_backup' => $items,
    ];
}
function parseWeibo(string $input): array
{
    $url = publicMediaInput($input);
    $parts = parse_url($url);
    $hosts = ['weibo.com', 'www.weibo.com', 'm.weibo.cn', 'video.weibo.com', 'h5.video.weibo.com', 't.cn'];
    if (!in_array(strtolower($parts['host'] ?? ''), $hosts, true) || isset($parts['user']) || isset($parts['pass']) || isset($parts['port'])) {
        throw new RuntimeException('请提供微博视频或微博正文链接', 400);
    }
    $http = new PublicMediaHttp(array_merge($hosts, ['passport.weibo.com', 'passport.weibo.cn', 'login.sina.com.cn']),
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36');
    // Anonymous cookies live only in this request's cURL handle and are never sent to clients.
    weiboGuest($http);
    if ($parts['host'] === 't.cn') {
        $url = $http->request($url, null, 'https://weibo.com/')['url'];
        $parts = parse_url($url);
    }
    $path = $parts['path'] ?? '';
    parse_str($parts['query'] ?? '', $query);
    $oid = '';
    if (preg_match('~/(?:tv/(?:show|v)|show)/(\d+:[0-9a-f]+)(?:/|$)~i', $path, $m)) $oid = $m[1];
    elseif (isset($query['fid']) && preg_match('~^\d+:[0-9a-f]+$~i', $query['fid'])) $oid = $query['fid'];
    if ($oid) {
        $data = $http->json('https://weibo.com/tv/api/component?' . http_build_query(['page' => '/tv/show/' . $oid]),
            http_build_query(['data' => json_encode(['Component_Play_Playinfo' => ['oid' => $oid]])]), 'https://weibo.com/tv/show/' . $oid);
        $v = $data['data']['Component_Play_Playinfo'] ?? null;
        if (($data['code'] ?? '') != '100000' || !is_array($v)) throw new RuntimeException('微博视频不可用，可能已删除或需要登录', 404);
        return weiboComponentMedia($v);
    }
    if (preg_match('~^/(?:\d+|status|detail)/([A-Za-z0-9]+)(?:/|$)~', $path, $m)) {
        $v = $http->json('https://weibo.com/ajax/statuses/show?' . http_build_query(['id' => $m[1]]), null, 'https://weibo.com/');
        return weiboStatusMedia($v);
    }
    throw new RuntimeException('无法识别微博视频链接', 400);
}
if (!defined('PUBLIC_MEDIA_TEST')) publicMediaRespond('parseWeibo');