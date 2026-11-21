<?php
/** Client for the loopback yt-dlp service (services/youtube/service.py). */
function svYtdlpParse(string $url, string $platform, string $label): array
{
    // Fixed loopback destination: callers cannot select a service address or port.
    $curl = curl_init('http://127.0.0.1:8765/parse');
    $body = '';
    curl_setopt_array($curl, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => json_encode(['url' => $url, 'platform' => $platform], JSON_UNESCAPED_SLASHES),
        CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
        CURLOPT_PROXY => '',
        CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_CONNECTTIMEOUT => 2,
        CURLOPT_TIMEOUT => 28,
        CURLOPT_WRITEFUNCTION => static function ($ch, $chunk) use (&$body) {
            if (strlen($body) + strlen($chunk) > 4 * 1024 * 1024) return 0;
            $body .= $chunk;
            return strlen($chunk);
        },
    ]);
    $ok = curl_exec($curl);
    $status = (int)curl_getinfo($curl, CURLINFO_HTTP_CODE);
    $errno = curl_errno($curl);
    curl_close($curl);
    if ($ok === false) {
        throw new RuntimeException($errno === CURLE_OPERATION_TIMEDOUT ? $label . ' 解析超时' : $label . ' 本地解析服务不可用，请先启动服务', $errno === CURLE_OPERATION_TIMEDOUT ? 504 : 502);
    }
    $result = json_decode($body, true);
    if (!is_array($result) || !isset($result['code'])) throw new RuntimeException($label . ' 服务返回格式错误', 502);
    if ($status !== 200 || $result['code'] !== 200) {
        $code = in_array($result['code'], [400, 422, 429, 502, 504], true) ? $result['code'] : 502;
        throw new RuntimeException($result['msg'] ?? $label . ' 解析失败', $code);
    }
    if (!is_array($result['data'] ?? null)) throw new RuntimeException($label . ' 服务缺少媒体数据', 502);
    return $result['data'];
}
