<?php
require_once __DIR__ . '/safe_http.php';
function svEntryPolicies(): array {
    return [
        '/api/youtube/youtube.php'=>['youtube',['youtube.com','youtu.be']],
        '/api/x/x.php'=>['x',['x.com','twitter.com']],
        '/api/douyin/douyin.php'=>['douyin',['douyin.com','iesdouyin.com']],
        '/api/kuaishou/ksjx.php'=>['kuaishou',['kuaishou.com','gifshow.com']],
        '/api/xiaohongshu/xhsjx.php'=>['xiaohongshu',['xiaohongshu.com','xhslink.com','xhslink.cn','rednote.com']],
        '/api/bilibili/bilibili.php'=>['bilibili',['bilibili.com','b23.tv']],
        '/api/weibo.php'=>['weibo',['weibo.com','weibo.cn','t.cn']],
        '/api/toutiao.php'=>['toutiao',['toutiao.com','ixigua.com']],
        '/api/ppxia.php'=>['pipixia',['pipix.com']],
        '/api/pipigx.php'=>['pipigx',['pipigx.com','ippzone.com']],
        '/api/zuiyou.php'=>['zuiyou',['izuiyou.com','xiaochuankeji.cn']],
    ];
}
function svInputUrl($input,array $hosts): string {
    if (!is_string($input) || strlen($input)>8192 || !preg_match('~https?://[^\s<>"\x27，。；！？]+~u',$input,$m)) throw new RuntimeException('请提供有效的平台分享链接',400);
    $url=rtrim($m[0],',.;!');$p=parse_url($url);
    if (!$p || !in_array($p['scheme']??'',['http','https'],true) || isset($p['user']) || isset($p['pass']) || isset($p['port'])
        || !svHostMatches(strtolower($p['host']??''),$hosts)) throw new RuntimeException('链接域名与所选平台不匹配',400);
    return $url;
}
function svSignMedia($value,string $platform,string $key,int $expires) {
    if (is_array($value)) {foreach ($value as $k=>$v) $value[$k]=svSignMedia($v,$platform,$key,$expires);return $value;}
    if (!is_string($value) || strlen($value)>16384) return $value;
    $url=str_starts_with($value,'//')?'https:'.$value:$value;
    $p=parse_url($url);
    $hosts=['douyinvod.com','douyinpic.com','snssdk.com','amemv.com','zjcdn.com','weibocdn.com','sinaimg.cn','bilivideo.com','bilivideo.cn','hdslb.com','upos-hz-mirrorakam.akamaized.net'];
    if (!$p || !in_array($p['scheme']??'',['http','https'],true) || isset($p['user']) || isset($p['pass'])
        || !svHostMatches(strtolower($p['host']??''),$hosts)) return $value;
    $url=preg_replace('~^http://~','https://',$url);
    $sig=hash_hmac('sha256',$platform."\n".$expires."\n".$url,$key);
    return 'https://media.litcheng.com/?'.http_build_query(['proxyurl'=>base64_encode($url),'type'=>$platform,'exp'=>$expires,'sig'=>$sig,'download'=>'false'],'','&',PHP_QUERY_RFC3986);
}
function svError(Throwable $e): void {
    http_response_code(in_array($e->getCode(),[400,403,404,405,413,422,429,502,503,504],true)?$e->getCode():502);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['code'=>http_response_code(),'msg'=>$e instanceof RuntimeException?$e->getMessage():'解析服务暂不可用'],JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);
}
function svGuardEntry(): void {
    $GLOBALS['sv_request_deadline']=microtime(true)+25;
    set_exception_handler('svError');
    $path=$_SERVER['SCRIPT_NAME']??'';$policy=svEntryPolicies()[$path]??null;
    if (!$policy) {http_response_code(404);exit;}
    if (!in_array($_SERVER['REQUEST_METHOD']??'',['GET','POST'],true)) {http_response_code(405);exit;}
    $input=($_SERVER['REQUEST_METHOD']==='POST'?$_POST:$_GET)['url']??'';
    $url=svInputUrl($input,$policy[1]);
    $_GET=['url'=>$url];$_POST=['url'=>$url];
    $_SERVER['QUERY_STRING']=http_build_query(['url'=>$url]);
    $_SERVER['REQUEST_URI']=$path.'?'.$_SERVER['QUERY_STRING'];
    header('Cache-Control: no-store');
    $platform=$policy[0];$key='';
    if (in_array($platform,['douyin','weibo','bilibili'],true)) {
        $key=trim((string)@file_get_contents('/etc/short-videos/media-signing.key'));
        if (strlen($key)<32) throw new RuntimeException('下载授权服务暂不可用',503);
    }
    ob_start(static function($body) use ($platform,$key) {
        header('Access-Control-Allow-Origin: https://sv.litcheng.com');
        header('Cache-Control: no-store');
        $data=json_decode($body,true);
        if (is_array($data) && ($data['code']??0)==200 && isset($data['data']) && $key!=='') {
            $data['data']=svSignMedia($data['data'],$platform,$key,time()+1800);
            return json_encode($data,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);
        }
        return $body;
    });
}
if (!defined('PUBLIC_MEDIA_TEST') && !defined('SV_SECURITY_TEST')) svGuardEntry();
