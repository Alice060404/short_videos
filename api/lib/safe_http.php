<?php
/** Guard every legacy cURL request, including each redirect and DNS answer. */
function svHostMatches(string $host, array $suffixes): bool {
    foreach ($suffixes as $suffix) if ($host === $suffix || str_ends_with($host, '.' . $suffix)) return true;
    return false;
}
function svPublicIp(string $ip): bool {
    if (!filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4 | FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE)) return false;
    $n = ip2long($ip);
    foreach ([['100.64.0.0',10],['198.18.0.0',15],['192.0.0.0',24],['192.0.2.0',24],['198.51.100.0',24],['203.0.113.0',24],['224.0.0.0',4]] as [$base,$bits]) {
        $mask = (0xffffffff << (32-$bits)) & 0xffffffff;
        if (($n & $mask) === (ip2long($base) & $mask)) return false;
    }
    return true;
}
function svSafeTarget(string $url): array {
    $p = parse_url($url);
    $hosts = ['douyin.com','iesdouyin.com','amemv.com','snssdk.com','douyinvod.com','douyinpic.com','zjcdn.com',
        'kuaishou.com','gifshow.com','yximgs.com','kwimgs.com','kuaishouzt.com',
        'xiaohongshu.com','xhslink.com','xhslink.cn','xhscdn.com','rednote.com','rednotecdn.com','bilibili.com','b23.tv','bilivideo.com','bilivideo.cn','hdslb.com','upos-hz-mirrorakam.akamaized.net',
        'weibo.com','weibo.cn','sina.com.cn','sinaimg.cn','weibocdn.com','t.cn',
        'toutiao.com','toutiaoimg.com','ixigua.com','pipix.com','pipigx.com','ippzone.com','izuiyou.com','xiaochuankeji.cn'];
    if (!$p || !in_array($p['scheme'] ?? '', ['http','https'],true) || isset($p['user']) || isset($p['pass'])
        || (isset($p['port']) && !in_array($p['port'],[80,443],true))
        || !svHostMatches(strtolower($p['host'] ?? ''),$hosts)) throw new RuntimeException('不允许请求此地址',400);
    $host = strtolower($p['host']);
    $ips = gethostbynamel($host);
    if (!$ips) throw new RuntimeException('平台域名解析失败',502);
    foreach ($ips as $ip) if (!svPublicIp($ip)) throw new RuntimeException('禁止访问内网或保留地址',400);
    return [$host, $p['port'] ?? ($p['scheme']==='https'?443:80), $ips[0]];
}
function svCurlInit(?string $url = null) {
    $ch=curl_init($url);
    $GLOBALS['sv_curl_options'] ??= new WeakMap();
    $GLOBALS['sv_curl_options'][$ch]= $url ? [CURLOPT_URL=>$url] : [];
    return $ch;
}
function svCurlSetopt($ch, int $option, $value): bool {
    $options=$GLOBALS['sv_curl_options'][$ch] ?? [];
    $options[$option]=$value; $GLOBALS['sv_curl_options'][$ch]=$options;
    return curl_setopt($ch,$option,$value);
}
function svCurlSetoptArray($ch, array $options): bool {
    foreach ($options as $option=>$value) svCurlSetopt($ch,$option,$value);
    return true;
}
function svCurlExec($ch) {
    $options=$GLOBALS['sv_curl_options'][$ch] ?? [];
    $url=(string)($options[CURLOPT_URL] ?? '');
    $follow=!empty($options[CURLOPT_FOLLOWLOCATION]);
    $GLOBALS['sv_request_deadline'] ??= microtime(true)+25;
    for ($hop=0; $hop<6; $hop++) {
        [$host,$port,$ip]=svSafeTarget($url);
        $left=(int)(1000*($GLOBALS['sv_request_deadline']-microtime(true)));
        if ($left<1) throw new RuntimeException('解析超时，请稍后重试',504);
        $body=''; $tooLarge=false;
        curl_setopt_array($ch,[CURLOPT_URL=>$url,CURLOPT_FOLLOWLOCATION=>false,
            CURLOPT_PROTOCOLS=>CURLPROTO_HTTP|CURLPROTO_HTTPS, CURLOPT_REDIR_PROTOCOLS=>CURLPROTO_HTTP|CURLPROTO_HTTPS,
            CURLOPT_RESOLVE=>["$host:$port:$ip"],CURLOPT_IPRESOLVE=>CURL_IPRESOLVE_V4,
            CURLOPT_SSL_VERIFYPEER=>true,CURLOPT_SSL_VERIFYHOST=>2,
            CURLOPT_CONNECTTIMEOUT_MS=>min(4000,$left),CURLOPT_TIMEOUT_MS=>min(12000,$left),
            CURLOPT_WRITEFUNCTION=>static function($handle,$chunk) use (&$body,&$tooLarge) {
                if (strlen($body)+strlen($chunk)>4194304) { $tooLarge=true;return 0; }
                $body.=$chunk;return strlen($chunk);
            }]);
        $ok=curl_exec($ch);
        if ($tooLarge) throw new RuntimeException('平台响应超过大小限制',502);
        if ($ok===false) return false;
        $code=(int)curl_getinfo($ch,CURLINFO_HTTP_CODE);
        $next=curl_getinfo($ch,CURLINFO_REDIRECT_URL);
        if ($next) svSafeTarget($next); // validate even when the caller follows the redirect itself
        if ($follow && $next && $code>=300 && $code<400) {
            $url=$next;
            if (!in_array($code,[307,308],true) && empty($options[CURLOPT_NOBODY])) curl_setopt($ch,CURLOPT_HTTPGET,true);
            continue;
        }
        if (!empty($options[CURLOPT_RETURNTRANSFER])) return $body;
        if ($body!=='') echo $body;
        return true;
    }
    throw new RuntimeException('平台跳转次数过多',502);
}
function svGetHeaders(string $url, bool $associative=false) {
    $ch=svCurlInit($url);
    $context=stream_context_get_options(stream_context_get_default())['http'] ?? [];
    $headers=$context['header'] ?? [];
    if (is_string($headers)) $headers=preg_split('/\r?\n/',trim($headers));
    svCurlSetoptArray($ch,[CURLOPT_NOBODY=>strtoupper($context['method'] ?? 'GET')==='HEAD',CURLOPT_HTTPHEADER=>$headers,CURLOPT_HEADER=>true,CURLOPT_RETURNTRANSFER=>true,CURLOPT_FOLLOWLOCATION=>false]);
    $body=svCurlExec($ch);
    if ($body!==false) $body=substr($body,0,(int)curl_getinfo($ch,CURLINFO_HEADER_SIZE));
    curl_close($ch);
    if ($body===false) return false;
    $result=[];
    foreach (preg_split('/\r?\n/',trim($body)) as $line) {
        if (!$associative || strpos($line,':')===false) {$result[]=$line;continue;}
        [$key,$value]=explode(':',$line,2);$result[ucwords(strtolower($key),'-')]=trim($value);
    }
    return $result;
}