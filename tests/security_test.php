<?php
define('SV_SECURITY_TEST',true);
require ($argv[1] ?? __DIR__.'/../api').'/lib/entry_guard.php';
function check($ok,$msg){if(!$ok)throw new RuntimeException($msg);}
foreach(['127.0.0.1','10.0.0.1','169.254.169.254','100.64.1.1','198.18.0.1','224.1.2.3','::1'] as $ip)check(!svPublicIp($ip),'Nonpublic IP accepted');
check(svPublicIp('1.1.1.1'),'Public IP rejected');
foreach(['https://evil.test/a','https://douyin.com.evil.test/a','https://a:b@douyin.com/a','https://douyin.com:8080/a','file:///etc/passwd'] as $u){try{svInputUrl($u,['douyin.com']);throw new LogicException('Bad URL accepted');}catch(RuntimeException $e){check($e->getCode()===400,'Wrong error');}}
check(svInputUrl('分享 https://v.douyin.com/abc/',['douyin.com'])==='https://v.douyin.com/abc/','Share text rejected');
$xhsHosts=svEntryPolicies()['/api/xiaohongshu/xhsjx.php'][1];
check(svInputUrl('每晚2小时... https://xhslink.cn/o/2jUmYTjFHP3 存下链接，去【小红书】阅读全文~',$xhsHosts)==='https://xhslink.cn/o/2jUmYTjFHP3','xhslink.cn share text rejected');
foreach(['https://xhslink.com/a/abc123','https://www.xiaohongshu.com/explore/699e8cde000000000d00a3a1','https://www.rednote.com/discovery/item/699e8cde000000000d00a3a1','https://r.rednote.com/o/2jUmYTjFHP3'] as $u)check(svInputUrl($u,$xhsHosts)===$u,'Valid Xiaohongshu/RedNote URL rejected: '.$u);
foreach(['https://xhslink.cn.evil.test/o/2jUmYTjFHP3','https://rednote.com.evil.test/o/2jUmYTjFHP3','https://evil-xhslink.cn/o/2jUmYTjFHP3','https://xhslink.cn:8080/o/2jUmYTjFHP3'] as $u){try{svInputUrl($u,$xhsHosts);throw new LogicException('Bad Xiaohongshu URL accepted');}catch(RuntimeException $e){check($e->getCode()===400,'Wrong error for bad Xiaohongshu URL');}}
foreach(['https://xhslink.cn.evil.test/o/a','https://rednote.com.evil.test/a','https://rednotecdn.com.evil.test/a'] as $u){try{svSafeTarget($u);throw new LogicException('Bad outbound target accepted');}catch(RuntimeException $e){check($e->getCode()===400,'Wrong error for bad outbound target');}}
$key='test-only-signing-secret-not-used-in-production';$exp=1800000000;$target='https://v.douyinvod.com/a?x=1&y=2';
$u=svSignMedia($target,'douyin',$key,$exp);parse_str(parse_url($u,PHP_URL_QUERY),$q);
check(base64_decode($q['proxyurl'])===$target,'Signed target changed');
check(hash_equals(hash_hmac('sha256',"douyin\n$exp\n$target",$key),$q['sig']),'Signature mismatch');
check(svSignMedia('https://example.com/a','douyin',$key,$exp)==='https://example.com/a','Unexpected signing');
echo "PASS: private/reserved IPs, input host validation, signed URL roundtrip\n";