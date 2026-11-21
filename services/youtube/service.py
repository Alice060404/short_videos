"""Loopback-only yt-dlp metadata service (YouTube, X/Twitter). No media downloading or account cookies."""
import argparse
import html
import json
import multiprocessing
import re
import shutil
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlsplit

HOSTS = {"youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be", "www.youtu.be"}
X_HOSTS = {"x.com", "www.x.com", "mobile.x.com", "m.x.com",
           "twitter.com", "www.twitter.com", "mobile.twitter.com", "m.twitter.com"}
X_MEDIA_HOSTS = {"video.twimg.com", "pbs.twimg.com"}
TIMEOUT = 24
SLOTS = threading.BoundedSemaphore(2)


class ParseError(Exception):
    def __init__(self, code, message):
        self.code, self.message = code, message


def canonical_url(text):
    if not isinstance(text, str) or len(text) > 8192:
        raise ParseError(400, "请提供有效的 YouTube 视频链接")
    match = re.search(r'https?://[^\s<>"\x27，。；！？]+', text)
    try:
        p = urlsplit(match.group(0).rstrip(",.;!") if match else "")
        if p.scheme not in ("http", "https") or p.hostname not in HOSTS or p.username or p.password or p.port:
            raise ValueError()
        if p.hostname in {"youtu.be", "www.youtu.be"}:
            video_id = p.path.strip("/")
        elif p.path == "/watch":
            video_id = parse_qs(p.query).get("v", [""])[0]
        else:
            m = re.fullmatch(r"/(?:shorts|embed)/([\w-]{11})/?", p.path, re.ASCII)
            video_id = m[1] if m else ""
        if not re.fullmatch(r"[A-Za-z0-9_-]{11}", video_id):
            raise ValueError()
        return "https://www.youtube.com/watch?v=" + video_id
    except ValueError:
        raise ParseError(400, "仅支持 YouTube 单个视频、短链接或 Shorts 链接") from None


def media_url(value):
    try:
        p = urlsplit(value or "")
        return bool(p.scheme == "https" and p.hostname and p.hostname.endswith(".googlevideo.com")
                    and not p.username and not p.password and not p.port)
    except ValueError:
        return False


def normalize(info):
    if info.get("is_live") or info.get("live_status") in ("is_live", "is_upcoming", "post_live"):
        raise ParseError(422, "暂不支持直播、预告或尚未处理完成的直播回放")
    formats = []
    for f in info.get("formats", []):
        if f.get("has_drm") or f.get("protocol") != "https" or not media_url(f.get("url")):
            continue
        video = f.get("vcodec") not in (None, "none")
        audio = f.get("acodec") not in (None, "none")
        if not video and not audio:
            continue
        formats.append({
            "format_id": f.get("format_id"), "url": f["url"], "ext": f.get("ext"),
            "height": f.get("height"), "fps": f.get("fps"), "size": f.get("filesize"),
            "has_video": video, "has_audio": audio, "vcodec": f.get("vcodec"), "acodec": f.get("acodec"),
            "bitrate": f.get("tbr") or 0,
        })
    if not formats:
        raise ParseError(422, "未取得可用的媒体直链，可能受到 YouTube 风控或格式限制")
    combined = sorted([f for f in formats if f["has_video"] and f["has_audio"]],
                      key=lambda f: (f["ext"] == "mp4", f["height"] or 0, f["bitrate"]), reverse=True)
    videos = sorted([f for f in formats if f["has_video"] and not f["has_audio"]],
                    key=lambda f: (f["height"] or 0, f["bitrate"]), reverse=True)
    audios = sorted([f for f in formats if f["has_audio"] and not f["has_video"]],
                    key=lambda f: f["bitrate"], reverse=True)
    if not combined and not (videos and audios):
        raise ParseError(422, "未取得完整音画，不能提供完整视频")
    selected = combined[0] if combined else videos[0]
    return {
        "type": "video", "platform": "youtube", "id": info.get("id"),
        "title": info.get("title") or "", "desc": info.get("description") or "",
        "cover": info.get("thumbnail") or "", "duration": info.get("duration"),
        "author": {"name": info.get("uploader") or info.get("channel") or "",
                   "id": info.get("channel_id") or "", "avatar": ""},
        "publish_time": str(info.get("timestamp") or ""), "source_url": info.get("webpage_url"),
        "url": selected["url"] if combined else None,
        "quality": str(selected["height"]) + "P" if selected["height"] else "",
        "size": selected["size"], "size_label": "",
        "requires_merge": not bool(combined),
        "video_url": selected["url"], "audio_url": None if combined else audios[0]["url"],
        "video_backup": [{"label": str(f["height"]) + "P", "url": f["url"]} for f in combined[1:]],
        "formats": formats,
        "notice": "媒体链接有时效及网络限制；分离音画需下载后合并，本接口不执行下载或合并。",
    }


# ---------------------------------------------------------------- X / Twitter

def canonical_x_url(text):
    """Return (canonical status URL, tweet id) for a single X/Twitter post link."""
    if not isinstance(text, str) or len(text) > 8192:
        raise ParseError(400, "请提供有效的 X（Twitter）帖子链接")
    match = re.search(r'https?://[^\s<>"\x27，。；！？]+', text)
    try:
        p = urlsplit(match.group(0).rstrip(",.;!") if match else "")
        if p.scheme not in ("http", "https") or p.hostname not in X_HOSTS or p.username or p.password or p.port:
            raise ValueError()
        m = re.fullmatch(r"/(?:i/web|i|[A-Za-z0-9_]{1,15})/status(?:es)?/(\d{1,20})(?:/(?:photo|video)/\d{1,2})?/?",
                         p.path, re.ASCII)
        if not m:
            raise ValueError()
        return "https://x.com/i/status/" + m[1], m[1]
    except ValueError:
        raise ParseError(400, "仅支持 X（Twitter）单条帖子链接，例如 https://x.com/用户名/status/数字ID") from None


def x_media_url(value):
    try:
        p = urlsplit(value or "")
        return bool(p.scheme == "https" and p.hostname in X_MEDIA_HOSTS
                    and not p.username and not p.password and not p.port)
    except ValueError:
        return False


def x_text(status):
    """Full post text with t.co links expanded and trailing media links removed."""
    text = status.get("full_text") or status.get("text") or ""
    entities = status.get("entities") or {}
    for item in entities.get("media") or []:
        if item.get("url"):
            text = text.replace(item["url"], "")
    for item in entities.get("urls") or []:
        if item.get("url") and item.get("expanded_url"):
            text = text.replace(item["url"], item["expanded_url"])
    return html.unescape(text).strip()


def x_photo(media):
    url = media.get("media_url_https") or ""
    if not x_media_url(url):
        return None
    # name=orig requests the original upload instead of the default resized rendition.
    return url.split("?", 1)[0] + "?name=orig"


def x_video(media):
    variants = []
    for v in (media.get("video_info") or {}).get("variants") or []:
        url = v.get("url") or ""
        # Progressive MP4 variants contain both audio and video; HLS playlists are skipped.
        if v.get("content_type") != "video/mp4" or not x_media_url(url):
            continue
        size = re.search(r"/(\d+)x(\d+)/", url)
        variants.append({"url": url, "bitrate": v.get("bitrate") or 0,
                         "width": int(size[1]) if size else None, "height": int(size[2]) if size else None})
    if not variants:
        return None
    variants.sort(key=lambda f: (f["height"] or 0, f["bitrate"]), reverse=True)
    best = variants[0]
    duration = (media.get("video_info") or {}).get("duration_millis")
    cover = media.get("media_url_https") or ""
    # Use the shorter edge so portrait and landscape videos report comparable quality labels.
    edge = min(filter(None, (best["width"], best["height"])), default=None)
    return {
        "url": best["url"], "quality": f"{edge}P" if edge else ("GIF" if media.get("type") == "animated_gif" else ""),
        "duration": round(duration / 1000, 3) if isinstance(duration, (int, float)) and duration > 0 else None,
        "cover": cover if x_media_url(cover) else "",
        "variants": variants,
    }


def x_timestamp(value):
    if not value:
        return ""
    try:
        from yt_dlp.utils import unified_timestamp
        return str(unified_timestamp(value) or "")
    except Exception:
        return ""


def normalize_x(status, twid):
    if not isinstance(status, dict) or not (status.get("id_str") or status.get("full_text") or status.get("text")):
        raise ParseError(422, "帖子不存在、已删除或不可公开访问")
    own = (status.get("extended_entities") or {}).get("media") or []
    quoted = ((status.get("quoted_status") or {}).get("extended_entities") or {}).get("media") or []
    media = own or quoted
    videos, images, had_video = [], [], False
    for item in media:
        if not isinstance(item, dict):
            continue
        if item.get("type") == "photo":
            if photo := x_photo(item):
                images.append(photo)
        elif item.get("type") in ("video", "animated_gif"):
            had_video = True
            if video := x_video(item):
                videos.append(video)
    if had_video and not videos and not images:
        raise ParseError(422, "未取得可用的 X 视频直链")
    text = x_text(status)
    if not videos and not images and not text:
        raise ParseError(422, "该帖子没有可解析的视频、图片或文字")
    user = status.get("user") or {}
    screen_name = user.get("screen_name") or ""
    avatar = (user.get("profile_image_url_https") or "").replace("_normal.", "_400x400.")
    first_line = text.split("\n", 1)[0].strip()
    title = first_line if len(first_line) <= 60 else first_line[:60].rstrip() + "…"
    data = {
        "type": "video" if videos else "image", "platform": "x", "id": twid,
        "title": title, "desc": text,
        "cover": "", "duration": None, "url": None, "quality": "", "size": None, "size_label": "",
        "author": {"name": user.get("name") or screen_name, "id": screen_name,
                   "avatar": avatar if x_media_url(avatar) else ""},
        "publish_time": x_timestamp(status.get("created_at")),
        "source_url": f"https://x.com/{screen_name or 'i'}/status/{twid}",
        "images": images, "live_photo": [], "music": {}, "video_backup": [],
        "requires_merge": False, "video_url": None, "audio_url": None,
        "notice": "媒体链接直接指向 X 的 CDN；本接口不执行下载。",
    }
    if videos:
        first = videos[0]
        data.update({
            "url": first["url"], "video_url": first["url"], "quality": first["quality"],
            "duration": first["duration"], "cover": first["cover"] or (images[0] if images else ""),
            "video_backup": [{"label": " · ".join(filter(None, [f"视频 {i}", v["quality"]])), "url": v["url"]}
                             for i, v in enumerate(videos[1:], 2)],
        })
    elif images:
        data["cover"] = images[0]
    return data


def extract_x_worker(twid, conn):
    try:
        import yt_dlp
        from yt_dlp.globals import plugin_dirs
        plugin_dirs.value = []
        options = {"quiet": True, "no_warnings": True, "skip_download": True, "noplaylist": True,
                   "cachedir": False, "socket_timeout": 8, "retries": 0, "extractor_retries": 0}
        with yt_dlp.YoutubeDL(options) as ydl:
            # Reuse yt-dlp's Twitter extractor (guest token, GraphQL and syndication fallback) to fetch
            # the raw post once; photos are not exposed by extract_info, so media is mapped here.
            ie = ydl.get_info_extractor("Twitter")
            ie.initialize()
            status = ie._extract_status(twid)
        result = {"code": 200, "msg": "解析成功", "data": normalize_x(status, twid)}
    except ParseError as exc:
        result = {"code": exc.code, "msg": exc.message, "data": {}}
    except Exception as exc:
        message = str(exc)
        lower = message.lower()
        print("X extraction failed: " + message, flush=True)
        if "429" in message or "rate-limit" in lower or "rate limit" in lower:
            result = {"code": 429, "msg": "X 接口限流，请稍后重试", "data": {}}
        elif "nsfw" in lower or "protected" in lower or "not authorized" in lower or "login" in lower or "authentication" in lower:
            result = {"code": 422, "msg": "该帖子需要登录才能查看（敏感内容或受保护账号），匿名解析不可用", "data": {}}
        elif "http error" not in lower and ("unavailable" in lower or "twitter api says" in lower
                                            or "suspended" in lower or "deleted" in lower):
            result = {"code": 422, "msg": "帖子不存在、已删除或不可公开访问", "data": {}}
        else:
            result = {"code": 502, "msg": "X 上游解析失败，请查看本地服务日志", "data": {}}
    try:
        conn.send(result)
    finally:
        conn.close()


def extract_worker(url, conn):
    try:
        import yt_dlp
        from yt_dlp.globals import plugin_dirs
        plugin_dirs.value = []
        runtimes = {name: {"path": path} for name in ("deno", "node") if (path := shutil.which(name))}
        options = {"quiet": True, "no_warnings": True, "skip_download": True, "noplaylist": True,
                   "cachedir": False, "socket_timeout": 8, "retries": 0, "extractor_retries": 0,
                   "js_runtimes": runtimes, "remote_components": set()}
        with yt_dlp.YoutubeDL(options) as ydl:
            info = ydl.extract_info(url, download=False)
        result = {"code": 200, "msg": "解析成功", "data": normalize(info)}
    except ParseError as exc:
        result = {"code": exc.code, "msg": exc.message, "data": {}}
    except Exception as exc:
        message = str(exc)
        print("YouTube extraction failed: " + message, flush=True)
        if "Private video" in message or "Video unavailable" in message or "removed" in message:
            result = {"code": 422, "msg": "视频不可公开访问或已被移除", "data": {}}
        elif "Sign in" in message or "bot" in message or "PO Token" in message:
            result = {"code": 422, "msg": "YouTube 要求额外验证，当前匿名解析不可用", "data": {}}
        else:
            result = {"code": 502, "msg": "YouTube 上游解析失败，请查看本地服务日志", "data": {}}
    try:
        conn.send(result)
    finally:
        conn.close()


def parse_video(text, platform="youtube"):
    if platform == "x":
        _, twid = canonical_x_url(text)
        label, target, args = "X", extract_x_worker, (twid,)
    elif platform == "youtube":
        label, target, args = "YouTube", extract_worker, (canonical_url(text),)
    else:
        raise ParseError(400, "不支持的解析平台")
    if not SLOTS.acquire(blocking=False):
        raise ParseError(429, label + " 解析繁忙，请稍后重试")
    context = multiprocessing.get_context("spawn")
    receiver, sender = context.Pipe(duplex=False)
    process = context.Process(target=target, args=(*args, sender), daemon=True)
    try:
        process.start()
        sender.close()
        if not receiver.poll(TIMEOUT):
            raise ParseError(504, label + " 解析超时，请稍后重试")
        try:
            return receiver.recv()
        except EOFError:
            raise ParseError(502, label + " 解析进程异常退出") from None
    finally:
        if process.pid is not None:
            if process.is_alive():
                process.terminate()
            process.join(timeout=2)
            if process.is_alive():
                process.kill()
                process.join()
        receiver.close()
        sender.close()
        SLOTS.release()


class Handler(BaseHTTPRequestHandler):
    def setup(self):
        super().setup()
        self.connection.settimeout(5)

    def respond(self, result):
        body = json.dumps(result, ensure_ascii=False).encode("utf-8")
        self.send_response(result["code"])
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/health":
            import yt_dlp.version
            self.respond({"code": 200, "version": yt_dlp.version.__version__})
        else:
            self.respond({"code": 404, "msg": "Not found"})

    def do_POST(self):
        if self.path != "/parse":
            return self.respond({"code": 404, "msg": "Not found"})
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length <= 0 or length > 16384 or self.headers.get("Transfer-Encoding"):
                raise ParseError(400, "无效请求长度")
            payload = json.loads(self.rfile.read(length))
            if not isinstance(payload, dict):
                raise ValueError()
            platform = payload.get("platform", "youtube")
            if platform not in ("youtube", "x"):
                raise ParseError(400, "不支持的解析平台")
            result = parse_video(payload.get("url"), platform)
        except ParseError as exc:
            result = {"code": exc.code, "msg": exc.message, "data": {}}
        except (ValueError, TimeoutError):
            result = {"code": 400, "msg": "无效 JSON 请求", "data": {}}
        self.respond(result)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()
    server = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    print(f"yt-dlp parser (YouTube, X) listening on http://127.0.0.1:{args.port}", flush=True)
    server.serve_forever()
