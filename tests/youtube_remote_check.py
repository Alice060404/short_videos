"""Explicit SSH staging check. Does not install production services or change firewall rules."""
import argparse
import base64
import json
from pathlib import Path
import subprocess
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", required=True)
    args = parser.parse_args()
    files = {"service.py": ROOT / "services/youtube/service.py",
             "requirements.txt": ROOT / "services/youtube/requirements.txt"}
    for f in (ROOT / "deploy/youtube").iterdir():
        if f.suffix in (".sh", ".service"):
            files[f.name] = f
    files["parser-egress.sh"] = ROOT / "deploy/security/parser-egress.sh"
    payload = {name: base64.b64encode(p.read_bytes()).decode() for name, p in files.items()}
    remote = r'''
import base64,json,pathlib,tempfile,subprocess,shutil,re
root=pathlib.Path(tempfile.mkdtemp(prefix="sv-youtube-check-",dir="/tmp"))
def run(cmd, **kw):
    p=subprocess.run(cmd,capture_output=True,text=True,**kw)
    if p.returncode:
        raise RuntimeError(re.sub(r"https?://[^\s]+", "[url]", (p.stdout+p.stderr)[-2500:]))
    return p
try:
    root.chmod(0o755)
    for name,content in FILES.items():
        p=root/name;p.write_bytes(base64.b64decode(content));p.chmod(0o644)
    for p in root.glob("*.sh"):
        run(["sh","-n",str(p)])
    # Validate systemd syntax using staged units and existing executable placeholders.
    for p in root.glob("*.service"):
        p.write_text(re.sub(r"^ExecStart=.*$", "ExecStart=/bin/true", p.read_text(), flags=re.M))
    run(["systemd-analyze","verify",*map(str,root.glob("*.service"))],timeout=15)
    print(json.dumps({"check":"shell_and_systemd_syntax","ok":True}),flush=True)
    run(["python3","-m","venv",str(root/"venv")],timeout=30)
    python=str(root/"venv/bin/python")
    run([python,"-m","pip","install","-r",str(root/"requirements.txt")],timeout=150)
    for label,url in [("long","https://www.youtube.com/watch?v=rfscVS0vtbw"),("shorts","https://www.youtube.com/shorts/1iOz67cPc54")]:
        code="import json; from service import parse_video; print(json.dumps(parse_video("+repr(url)+")))"
        p=run(["runuser","-u","nobody","--",python,"-c",code],cwd=root,timeout=40)
        result=json.loads(p.stdout.strip().splitlines()[-1])
        print(json.dumps({"sample":label,"result":result}),flush=True)
finally:
    if root.parent==pathlib.Path("/tmp") and root.name.startswith("sv-youtube-check-"):
        shutil.rmtree(root)
'''.replace("FILES", repr(payload))
    result = subprocess.run(["ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=10", args.host, "python3", "-"],
                            input=remote, text=True, capture_output=True, timeout=270)
    output = ROOT / ".youtube-test"
    output.mkdir(exist_ok=True)
    (output / "cross-network-server.jsonl").write_text(result.stdout, encoding="utf-8")
    if result.returncode:
        print(result.stderr[-3000:])
        return 1
    ok = True
    for line in result.stdout.splitlines():
        entry = json.loads(line)
        if "check" in entry:
            print(json.dumps(entry), flush=True)
            continue
        response = entry["result"]
        data = response.get("data", {})
        report = {"sample": entry["sample"], "code": response["code"], "msg": response.get("msg"),
                  "duration": data.get("duration"), "media": []}
        ok = ok and response["code"] == 200
        for key in ("video_url", "audio_url"):
            if not data.get(key):
                continue
            try:
                request = Request(data[key], headers={"Range": "bytes=0-1023", "User-Agent": "Mozilla/5.0"})
                with urlopen(request, timeout=20) as media:
                    size = len(media.read(1024))
                    report["media"].append({"stream": key, "http": media.status, "bytes": size})
                    ok = ok and media.status in (200, 206) and size > 0
            except Exception as exc:
                report["media"].append({"stream": key, "error": str(exc)})
                ok = False
        print(json.dumps(report, ensure_ascii=True), flush=True)
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
