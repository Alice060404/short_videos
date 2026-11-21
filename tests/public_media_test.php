<?php
// Run: php tests/public_media_test.php [path-to-api]
define('PUBLIC_MEDIA_TEST', true);
$api = $argv[1] ?? __DIR__ . '/../api';
require $api . '/bilibili/bilibili.php';
require $api . '/weibo.php';
function check($condition, $message) { if (!$condition) throw new RuntimeException($message); }
foreach (['parseBilibili', 'parseWeibo'] as $fn) {
    foreach (['https://127.0.0.1/video/BV1mGAbzmEPo', 'https://weibo.com.evil.test/tv/show/1034:1', 'https://user:pass@weibo.com/tv/show/1034:1'] as $input) {
        try { $fn($input); throw new LogicException('Unexpected success'); }
        catch (RuntimeException $e) { check($e->getCode() === 400, 'Invalid host must fail before any request'); }
    }
}
$v = weiboComponentMedia([
    'title' => 'Test', 'urls' => ['标清 480P' => '//f.video.weibocdn.com/low.mp4', '高清 720P' => 'https://f.video.weibocdn.com/high.mp4'],
    'avatar' => 'https://wx1.sinaimg.cn/a.jpg', 'cover_image' => '//wx1.sinaimg.cn/b.jpg', 'duration_time' => 14.815,
]);
check($v['url'] === 'https://f.video.weibocdn.com/high.mp4', 'Prefer higher quality without a third-party wrapper');
check($v['author']['avatar'] === 'https://wx1.sinaimg.cn/a.jpg', 'Do not prepend https twice');
check($v['duration'] === 14.815, 'Preserve fractional duration');
check($v['cover'] === 'https://wx1.sinaimg.cn/b.jpg', 'Normalize protocol-relative image');
try { weiboBest([['url'=>'https://example.com/video.mp4']]); throw new LogicException('Unexpected success'); }
catch (RuntimeException $e) { check($e->getCode() === 422, 'Reject non-platform media'); }
$v = weiboStatusMedia(['page_info'=>['media_info'=>['playback_list'=>[
    ['play_info'=>['mime'=>'video/mp4','url'=>'https://f.us.sinaimg.cn/a.mp4','height'=>480,'quality_label'=>'480P']],
]]]]);
check($v['url'] === 'https://f.us.sinaimg.cn/a.mp4', 'Parse status playback list');
echo "PASS: input host validation, quality selection, clean CDN URLs, duration, status playback\n";