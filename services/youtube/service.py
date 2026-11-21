"""Loopback-only YouTube metadata service. No media downloading or account cookies."""
import argparse
import json
import multiprocessing
import re
import shutil
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlsplit

HOSTS = {"youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be", "www.youtu.be"}
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


def parse_video(text):
    url = canonical_url(text)
    if not SLOTS.acquire(blocking=False):
        raise ParseError(429, "YouTube 解析繁忙，请稍后重试")
    context = multiprocessing.get_context("spawn")
    receiver, sender = context.Pipe(duplex=False)
    process = context.Process(target=extract_worker, args=(url, sender), daemon=True)
    try:
        process.start()
        sender.close()
        if not receiver.poll(TIMEOUT):
            raise ParseError(504, "YouTube 解析超时，请稍后重试")
        try:
            return receiver.recv()
        except EOFError:
            raise ParseError(502, "YouTube 解析进程异常退出") from None
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
            result = parse_video(payload.get("url"))
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
    print(f"YouTube parser listening on http://127.0.0.1:{args.port}", flush=True)
    server.serve_forever()
