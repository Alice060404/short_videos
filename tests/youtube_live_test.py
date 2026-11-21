"""Explicit network smoke test; start the local PHP and Python services first."""
import argparse
import json
import time
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


def check(url, base):
    start = time.monotonic()
    request = Request(base, data=urlencode({"url": url}).encode())
    try:
        response = urlopen(request, timeout=35)
    except HTTPError as exc:
        response = exc
    with response:
        result = json.load(response)
        report = {"source": url, "http": response.status, "code": result.get("code"),
                  "message": result.get("msg"), "seconds": round(time.monotonic() - start, 2)}
    if result.get("code") == 200:
        data = result["data"]
        report.update(title=data["title"], requires_merge=data["requires_merge"],
                      formats=len(data["formats"]), media=[])
        for field in ("video_url", "audio_url"):
            if not data.get(field):
                continue
            try:
                request = Request(data[field], headers={"Range": "bytes=0-1023", "User-Agent": "Mozilla/5.0"})
                with urlopen(request, timeout=20) as media:
                    sample = media.read(1024)
                    report["media"].append({"stream": field, "http": media.status,
                                            "bytes": len(sample), "content_type": media.headers.get("Content-Type")})
            except Exception as exc:
                report["media"].append({"stream": field, "error": str(exc)})
        report["media_accessible"] = all(m.get("http") in (200, 206) and m.get("bytes", 0) > 0 for m in report["media"])
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("urls", nargs="*", default=["https://youtu.be/jNQXAC9IVRw"])
    parser.add_argument("--base", default="http://127.0.0.1:8088/api/youtube/youtube.php")
    args = parser.parse_args()
    passed = True
    for url in args.urls:
        report = check(url, args.base)
        print(json.dumps(report, ensure_ascii=True), flush=True)
        passed = passed and report["code"] == 200 and report.get("media_accessible", False)
    raise SystemExit(0 if passed else 1)
