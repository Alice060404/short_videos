/**
 * @Author: JH-Ahua
 * @CreateTime: 2025/12/27
 * @UpdateTime: 2026/10/19
 * @email: admin@bugpk.com
 * @blog: www.jiuhunwl.cn
 * @Api: api.bugpk.com
 * @tip: 短视频媒体直链代理（Cloudflare Workers 版），解决抖音、微博解析出来的视频/图片 403 防盗链
 * @doc: 详细用法见同目录 README.md
 */

const DESKTOP_UA =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36";

/** 媒体拉取与 HEAD 探测的超时（毫秒，每跳独立计时） */
const REQUEST_TIMEOUT = 30000;
const PROBE_TIMEOUT = 15000;
/** 302 手动跟随的最大跳数 */
const MAX_REDIRECTS = 10;

/**
 * 可选目标域白名单（后缀匹配）。留空数组 = 不限制（保持开放代理行为）。
 * 建议公开部署时填写，防止 Worker 被当作任意资源代理滥用，例如：
 * ['douyinvod.com', 'douyinpic.com', 'snssdk.com', 'weibo.com', 'sinaimg.cn']
 */
const ALLOWED_HOST_SUFFIXES = ['douyinvod.com', 'douyinpic.com', 'snssdk.com', 'amemv.com', 'zjcdn.com', 'weibocdn.com', 'sinaimg.cn', 'bilivideo.com', 'bilivideo.cn', 'hdslb.com', 'upos-hz-mirrorakam.akamaized.net'];

/** 平台预设：防盗链 Referer 与下载文件名前缀 */
const PLATFORM_PRESETS = {
    douyin: {referer: "https://douyin.com/", label: "douyin"},
    weibo: {referer: "https://weibo.com/", label: "weibo"},
    bilibili: {referer: "https://www.bilibili.com/", label: "bilibili"},
};

/** 媒体预设：Accept、默认 Content-Type、下载附加头、缓存策略 */
const MEDIA_PRESETS = {
    video: {
        accept: "video/mp4,video/x-m4v,video/*;q=0.9,*/*;q=0.8",
        fallbackType: "application/octet-stream",
        cache: null,
        downloadExtra: {
            "Content-Transfer-Encoding": "binary",
            Expires: "0",
            "Cache-Control": "must-revalidate",
            Pragma: "public",
        },
    },
    image: {
        accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        fallbackType: "image/jpeg",
        cache: "public, max-age=86400",
        downloadExtra: {},
    },
};

const CORS_HEADERS = {
    "Access-Control-Allow-Origin": "https://sv.litcheng.com",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Range",
    "Access-Control-Expose-Headers": "Content-Length, Content-Range, Accept-Ranges, Content-Disposition",
};

const JSON_HEADERS = {"Content-Type": "application/json; charset=utf-8"};

/** 统一 JSON 输出 */
function jsonResponse(payload, status = 200) {
    return new Response(JSON.stringify(payload), {status, headers: {...CORS_HEADERS, ...JSON_HEADERS}});
}

/**
 * 解码 proxyurl 参数：
 * 1) 明文 http(s) URL 直接使用；
 * 2) Base64 解码（先把空格还原为 +，兼容 URL 传输中被转成空格）。
 * 解码失败返回 null。
 */
function decodeProxyUrl(raw) {
    if (/^https?:\/\//i.test(raw)) {
        return raw;
    }
    const normalized = raw.replace(/\s/g, "+");
    try {
        const bytes = Uint8Array.from(atob(normalized), (c) => c.charCodeAt(0));
        return new TextDecoder().decode(bytes);
    } catch {
        return null;
    }
}

/** SHA-256 截断摘要（标准 WebCrypto，各运行时通用），用于生成下载文件名 */
async function hashFilename(str) {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
    const hex = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
    return hex.slice(0, 16);
}

/** 白名单校验：空配置放行；否则按后缀匹配目标域名 */
function isHostAllowed(targetUrl) {
    if (!ALLOWED_HOST_SUFFIXES.length) {
        return true;
    }
    try {
        const parsed = new URL(targetUrl);
        if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || (parsed.port && !['80', '443'].includes(parsed.port))) return false;
        const host = parsed.hostname.toLowerCase();
        return ALLOWED_HOST_SUFFIXES.some((suffix) => host === suffix || host.endsWith("." + suffix));
    } catch {
        return false;
    }
}

/** 单次带超时的 fetch */
async function fetchWithTimeout(url, options, timeout) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
        return await fetch(url, {...options, signal: controller.signal});
    } finally {
        clearTimeout(timer);
    }
}

/**
 * 统一媒体代理核心：校验 URL → 手动跟随 302（每跳保持 Referer，最多 MAX_REDIRECTS）→ 流式转发
 * @returns {Promise<{status: number, data: ReadableStream|object, headers?: object}>}
 */
async function proxyMedia(targetUrl, platformKey, mediaKey, download, range) {
    const platform = PLATFORM_PRESETS[platformKey];
    const media = MEDIA_PRESETS[mediaKey];

    try {
        new URL(targetUrl);
    } catch {
        return {status: 400, data: {code: 400, msg: "无效的媒体URL"}};
    }
    if (!isHostAllowed(targetUrl)) {
        return {status: 403, data: {code: 403, msg: "目标域名不在白名单内"}};
    }

    const requestHeaders = {
        "User-Agent": DESKTOP_UA,
        "Accept": media.accept,
        "Accept-Language": "zh-CN,zh;q=0.9",
        "Connection": "keep-alive",
        "Referer": platform.referer,
    };

    try {
        if (range) requestHeaders.Range = range;
        let current = targetUrl;
        let response = await fetchWithTimeout(
            current,
            {method: "GET", headers: requestHeaders, redirect: "manual"},
            REQUEST_TIMEOUT
        );

        // 手动跟随 302：跨跳重写 Referer 与 UA（follow 模式跨域会丢失 Referer，防盗链场景必须手动跟）
        let redirects = 0;
        while (response.status >= 300 && response.status < 400 && redirects < MAX_REDIRECTS) {
            const location = response.headers.get("location");
            if (!location) {
                break;
            }
            await response.body?.cancel().catch(() => {});
            current = new URL(location, current).href;
            if (!isHostAllowed(current)) return {status: 403, data: {code: 403, msg: '重定向目标不在白名单内'}};
            response = await fetchWithTimeout(
                current,
                {method: "GET", headers: requestHeaders, redirect: "manual"},
                REQUEST_TIMEOUT
            );
            redirects++;
        }

        if (response.status !== 200 && response.status !== 206) {
            await response.body?.cancel().catch(() => {});
            let msg = `请求失败，HTTP状态码: ${response.status}`;
            if (response.status === 403) {
                msg += "（可能需要更新Cookie或Referer头信息）";
            }
            return {status: response.status >= 400 ? response.status : 502, data: {code: response.status >= 400 ? response.status : 502, msg}};
        }

        const contentLength = Number(response.headers.get("content-length") || 0);
        if (contentLength > MAX_MEDIA_BYTES) {
            await response.body?.cancel();
            return {status:413,data:{code:413,msg:"单次媒体响应不能超过 512 MB"}};
        }
        const contentType = response.headers.get("content-type") || media.fallbackType;
        const ext =
            mediaKey === "image"
                ? (contentType.split("/")[1] || "jpg").split(";")[0]
                : "mp4";

        const responseHeaders = {
            "Content-Type": contentType,
            "Access-Control-Allow-Origin": "https://sv.litcheng.com",
            "Access-Control-Allow-Methods": "GET, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Range",
    "Access-Control-Expose-Headers": "Content-Length, Content-Range, Accept-Ranges, Content-Disposition",
            "X-Proxy": `${platform.label}-${mediaKey}-proxy`,
            ...(media.cache ? {"Cache-Control": media.cache} : {}),
        };

        for (const header of ['content-length', 'content-range', 'accept-ranges']) {
            const value = response.headers.get(header);
            if (value) responseHeaders[header] = value;
        }
        if (download !== "false") {
            const filename = `${platform.label}_${mediaKey}_${await hashFilename(targetUrl)}.${ext}`;
            responseHeaders["Content-Disposition"] = `attachment; filename="${filename}"`;
            Object.assign(responseHeaders, media.downloadExtra);
        }

        // 流式转发上游 body，不落盘、不受 Worker 内存限制
        return {status: response.status, data: boundedMedia(response.body), headers: responseHeaders};
    } catch (err) {
        const reason = err?.name === "AbortError" ? "请求超时" : (err?.message || "未知错误");
        return {status: 500, data: {code: 500, msg: "请求失败", error: reason}};
    }
}

/**
 * HEAD 探测上游 Content-Type，自动区分视频/图片；探测失败默认按视频处理
 */
async function getMediaType(url, platformKey) {
    const headers = {
        "User-Agent": DESKTOP_UA,
        "Accept": "*/*",
        "Accept-Language": "zh-CN,zh;q=0.9",
        "Connection": "keep-alive",
        "Referer": PLATFORM_PRESETS[platformKey].referer,
    };

    try {
        const response = await fetchWithTimeout(url, {method: "HEAD", headers, redirect: "manual"}, PROBE_TIMEOUT);
        const contentType = (response.headers.get("content-type") || "").toLowerCase();
        if (contentType.startsWith("image/") || contentType.includes("image") || contentType.includes("picture")) {
            return "image";
        }
        return "video";
    } catch (err) {
        console.error("获取媒体类型失败:", err?.message);
        return "video";
    }
}


const MAX_MEDIA_BYTES = 512 * 1024 * 1024;
async function validMediaSignature(url, env) {
    const exp = url.searchParams.get("exp") || "";
    const sig = url.searchParams.get("sig") || "";
    const now = Math.floor(Date.now() / 1000);
    if (!/^\d{10}$/.test(exp) || Number(exp) < now || Number(exp) > now + 1860 || !/^[a-f0-9]{64}$/.test(sig)) return false;
    const target = decodeProxyUrl(url.searchParams.get("proxyurl") || "");
    const platform = url.searchParams.get("type") || "";
    if (!target || !Object.hasOwn(PLATFORM_PRESETS, platform)) return false;
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(env.MEDIA_SIGNING_KEY), {name:"HMAC",hash:"SHA-256"}, false, ["verify"]);
    const bytes = Uint8Array.from(sig.match(/../g), x => parseInt(x,16));
    return crypto.subtle.verify("HMAC",key,bytes,new TextEncoder().encode(platform+"\n"+exp+"\n"+target));
}
function boundedMedia(body) {
    if (!body) return null;
    const reader = body.getReader(); let count = 0; let timer;
    return new ReadableStream({
        start(controller) { timer = setTimeout(() => { reader.cancel().catch(()=>{}); controller.error(new Error("Media transfer timed out")); }, 300000); },
        async pull(controller) {
            try {
                const {done,value} = await reader.read();
                if (done) {clearTimeout(timer); controller.close(); return;}
                count += value.byteLength;
                if (count > MAX_MEDIA_BYTES) {clearTimeout(timer); await reader.cancel(); controller.error(new Error("Media size limit exceeded")); return;}
                controller.enqueue(value);
            } catch (error) {clearTimeout(timer); controller.error(error);}
        },
        cancel(reason) {clearTimeout(timer); return reader.cancel(reason);},
    });
}

export default {
    async fetch(request, env) {
        // CORS 预检
        if (request.method === "OPTIONS") {
            return new Response(null, {status: 204, headers: CORS_HEADERS});
        }
        if (request.method !== "GET") {
            return jsonResponse({code: 405, msg: "仅支持 GET 请求"}, 405);
        }

        if (!env?.MEDIA_SIGNING_KEY || !env?.MEDIA_IP_LIMIT || !env?.MEDIA_TOKEN_LIMIT || !env?.MEDIA_TOTAL_LIMIT) return jsonResponse({code:503,msg:"下载服务配置暂不可用"},503);
        const ip = request.headers.get("CF-Connecting-IP") || "unknown";
        if (!(await env.MEDIA_IP_LIMIT.limit({key:ip})).success) return jsonResponse({code:429,msg:"请求过于频繁，请稍后重试"},429);
        const urlObj = new URL(request.url);
        if (!(await validMediaSignature(urlObj, env))) return jsonResponse({code:403,msg:"下载链接无效或已过期，请回到网站重新解析"},403);
        if (!(await env.MEDIA_TOKEN_LIMIT.limit({key:urlObj.searchParams.get("sig")})).success || !(await env.MEDIA_TOTAL_LIMIT.limit({key:"all"})).success) return jsonResponse({code:429,msg:"下载请求过多，请稍后重试"},429);
        const range = request.headers.get("Range");
        if (range && !/^bytes=\d*-\d*$/.test(range)) return jsonResponse({code:416,msg:"不支持此范围请求"},416);
        const proxyurl = (urlObj.searchParams.get("proxyurl") || "").trim();
        if (!proxyurl) {
            return jsonResponse({code: 400, msg: "proxyurl参数不能为空"}, 400);
        }

        // type=douyin|weibo（默认 douyin），download=true|false（默认 true 触发下载）
        const requestedPlatform = urlObj.searchParams.get("type");
        const platformKey = Object.hasOwn(PLATFORM_PRESETS, requestedPlatform) ? requestedPlatform : "douyin";
        const download = urlObj.searchParams.get("download") || "true";

        const decodedUrl = decodeProxyUrl(proxyurl);
        if (!decodedUrl) {
            return jsonResponse({code: 400, msg: "URL解码失败", original_url: proxyurl}, 400);
        }

        if (!isHostAllowed(decodedUrl)) return jsonResponse({code: 403, msg: '目标地址不在允许范围内'}, 403);

        // mediatype 未指定时自动探测上游媒体类型
        let mediaKey = urlObj.searchParams.get("mediatype");
        if (mediaKey !== "image" && mediaKey !== "video") {
            mediaKey = await getMediaType(decodedUrl, platformKey);
        }

        const result = await proxyMedia(decodedUrl, platformKey, mediaKey, download, request.headers.get("Range"));

        // 代理过程失败：返回 JSON 错误
        if (result.data && typeof result.data === "object" && result.data.code) {
            return jsonResponse(result.data, result.status);
        }

        // 成功：流式转发媒体内容
        return new Response(result.data, {
            status: result.status,
            headers: {...CORS_HEADERS, ...result.headers},
        });
    },
};
