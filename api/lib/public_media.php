<?php
require_once __DIR__ . '/safe_http.php';
/** Small, bounded HTTP client for public platform metadata (never media downloads). */
final class PublicMediaHttp
{
    private $curl;
    private array $hosts;
    private float $deadline;
    public function __construct(array $hosts, string $agent)
    {
        $this->hosts = $hosts;
        $this->deadline = microtime(true) + 25;
        $this->curl = curl_init();
        curl_setopt_array($this->curl, [
            CURLOPT_USERAGENT => $agent, CURLOPT_COOKIEFILE => '',
            CURLOPT_SSL_VERIFYPEER => true, CURLOPT_SSL_VERIFYHOST => 2,
            CURLOPT_ENCODING => '', CURLOPT_IPRESOLVE => CURL_IPRESOLVE_V4,
            CURLOPT_PROTOCOLS => CURLPROTO_HTTP | CURLPROTO_HTTPS,
            CURLOPT_FOLLOWLOCATION => false,
        ]);
    }
    public function request(string $url, ?string $post = null, string $referer = ''): array
    {
        for ($hop = 0; $hop < 6; $hop++) {
            $parts = parse_url($url);
            if (!$parts || !in_array(strtolower($parts['host'] ?? ''), $this->hosts, true)
                || !in_array($parts['scheme'] ?? '', ['http', 'https'], true)
                || isset($parts['user']) || isset($parts['pass'])
                || (isset($parts['port']) && !in_array($parts['port'], [80, 443], true))) {
                throw new RuntimeException('链接或跳转目标不是支持的平台地址', 400);
            }
            [$safeHost, $safePort, $safeIp] = svSafeTarget($url);
            curl_setopt($this->curl, CURLOPT_RESOLVE, ["$safeHost:$safePort:$safeIp"]);
            $remaining = (int)(($this->deadline - microtime(true)) * 1000);
            if ($remaining < 1) throw new RuntimeException('平台响应超时，请稍后重试', 504);
            $body = '';
            curl_setopt_array($this->curl, [
                CURLOPT_URL => $url, CURLOPT_POST => $post !== null,
                CURLOPT_REFERER => $referer,
                CURLOPT_TIMEOUT_MS => min(12000, $remaining),
                CURLOPT_CONNECTTIMEOUT_MS => min(5000, $remaining),
                CURLOPT_HTTPHEADER => $post !== null ? ['Content-Type: application/x-www-form-urlencoded'] : [],
                CURLOPT_WRITEFUNCTION => static function ($ch, $chunk) use (&$body) {
                    if (strlen($body) + strlen($chunk) > 4 * 1024 * 1024) return 0;
                    $body .= $chunk;
                    return strlen($chunk);
                },
            ]);
            if ($post !== null) curl_setopt($this->curl, CURLOPT_POSTFIELDS, $post);
            else curl_setopt($this->curl, CURLOPT_HTTPGET, true);
            $ok = curl_exec($this->curl);
            $status = (int)curl_getinfo($this->curl, CURLINFO_HTTP_CODE);
            $redirect = curl_getinfo($this->curl, CURLINFO_REDIRECT_URL);
            if ($ok === false) throw new RuntimeException('平台连接失败，请稍后重试', 502);
            if ($status >= 300 && $status < 400 && $redirect) {
                $url = $redirect;
                if ($status !== 307 && $status !== 308) $post = null;
                continue;
            }
            if ($status >= 400) throw new RuntimeException('平台返回 HTTP ' . $status . '，请稍后重试', 502);
            return ['body' => $body, 'url' => $url, 'status' => $status];
        }
        throw new RuntimeException('平台跳转次数过多', 502);
    }
    public function json(string $url, ?string $post = null, string $referer = ''): array
    {
        $r = $this->request($url, $post, $referer);
        $data = json_decode($r['body'], true);
        if (!is_array($data)) throw new RuntimeException('平台未返回有效数据，请稍后重试', 502);
        return $data;
    }
    public function __destruct() { curl_close($this->curl); }
}
function publicMediaInput(string $text): string
{
    if (!preg_match('~https?://[^\s<>"\x27]+~u', trim($text), $m)) {
        throw new RuntimeException('请提供有效的分享链接', 400);
    }
    return rtrim($m[0], "，。；！？,.;! \t\r\n");
}
function publicMediaUrl($url): string
{
    if (!is_string($url)) return '';
    if (str_starts_with($url, '//')) $url = 'https:' . $url;
    return preg_match('~^https?://~i', $url) ? preg_replace('~^http://~i', 'https://', $url) : '';
}
function publicMediaRespond(callable $parse): void
{
    header('Content-Type: application/json; charset=utf-8');
    header('Access-Control-Allow-Origin: https://sv.litcheng.com');
    header('Cache-Control: no-store');
    try {
        $params = $_SERVER['REQUEST_METHOD'] === 'POST' ? $_POST : $_GET;
        $result = $parse((string)($params['url'] ?? ''));
        echo json_encode(['code' => 200, 'msg' => '解析成功', 'data' => $result], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    } catch (Throwable $e) {
        $status = in_array($e->getCode(), [400, 404, 422, 429, 502, 504], true) ? $e->getCode() : 502;
        http_response_code($status);
        $msg = $e instanceof RuntimeException ? $e->getMessage() : '解析失败，请稍后重试';
        if (!($e instanceof RuntimeException)) error_log('Media parser: ' . get_class($e) . ': ' . $e->getMessage());
        echo json_encode(['code' => $status, 'msg' => $msg], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }
}
