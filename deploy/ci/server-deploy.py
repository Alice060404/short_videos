#!/usr/bin/env python3
"""Atomic, locked, auto-rolling-back production deployer for short_videos on us.

Invoked via forced-command SSH (stdin .tar.gz) by dedicated least-privilege user:
    command="sudo -n /usr/local/sbin/short-videos-deploy",no-port-forwarding,...
"""
import argparse
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tarfile
import tempfile
import time

os.environ["PATH"] = "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"

LOCK_PATH = Path("/run/short-videos-deploy.lock")
SITE_ROOT = Path("/var/www/short-videos")
SITE_RELEASES = SITE_ROOT / "releases"
SITE_CURRENT = SITE_ROOT / "current"
YT_ROOT = Path("/opt/short-videos-youtube")
YT_RELEASES = YT_ROOT / "releases"
YT_CURRENT = YT_ROOT / "current"

MAX_ARCHIVE_BYTES = 50 * 1024 * 1024
MAX_EXTRACTED_BYTES = 128 * 1024 * 1024
MAX_TAR_MEMBERS = 5000
KEEP_SITE_RELEASES = 5
KEEP_YT_RELEASES = 3

RELEASE_ID_RE = re.compile(r"^[0-9]{8}-[0-9]{6}-[0-9a-f]{7,40}$")
COMMIT_SHA_RE = re.compile(r"^[0-9a-f]{7,40}$")

SVPROXY_STUB = (
    "<?php\n"
    "header('Cache-Control: no-store');\n"
    "header('Location: https://media.litcheng.com/' . "
    "(empty($_SERVER['QUERY_STRING']) ? '' : '?' . $_SERVER['QUERY_STRING']), true, 307);\n"
    "exit;\n"
)


def log(msg: str) -> None:
    print(f"[deploy] {msg}", flush=True)


def run(args: list[str], *, timeout: int = 120, check: bool = True) -> subprocess.CompletedProcess:
    proc = subprocess.run(args, text=True, capture_output=True, timeout=timeout)
    if check and proc.returncode != 0:
        detail = ((proc.stdout or "") + "\n" + (proc.stderr or "")).strip()[-2000:]
        raise RuntimeError(f"Command failed ({proc.returncode}): {' '.join(args)}\n{detail}")
    return proc


def read_bounded_stdin(dest: Path, max_bytes: int = MAX_ARCHIVE_BYTES) -> int:
    total = 0
    with dest.open("wb") as out:
        while True:
            chunk = sys.stdin.buffer.read(65536)
            if not chunk:
                break
            total += len(chunk)
            if total > max_bytes:
                raise ValueError(f"Archive exceeds maximum allowed size ({max_bytes} bytes)")
            out.write(chunk)
    if total == 0:
        raise ValueError("Empty archive received on stdin")
    return total


def safe_member_relpath(name: str) -> Path:
    if "\x00" in name or "\\" in name:
        raise ValueError(f"Illegal character in archive member path: {name!r}")
    normalized = name.lstrip("./") if name.startswith("./") else name
    if normalized in ("", "."):
        return Path(".")
    if name.startswith("/") or normalized.startswith("/"):
        raise ValueError(f"Absolute path not allowed in archive: {name!r}")
    parts = [p for p in normalized.split("/") if p not in ("", ".")]
    if any(p == ".." for p in parts):
        raise ValueError(f"Path traversal not allowed in archive: {name!r}")
    return Path(*parts) if parts else Path(".")


def safe_extract_tar(
    archive_path: Path,
    dest_dir: Path,
    *,
    max_bytes: int = MAX_EXTRACTED_BYTES,
    max_members: int = MAX_TAR_MEMBERS,
) -> int:
    dest_resolved = dest_dir.resolve()
    dest_resolved.mkdir(parents=True, exist_ok=True)
    total_bytes = 0
    member_count = 0

    with tarfile.open(archive_path, "r:gz") as tf:
        for member in tf:
            member_count += 1
            if member_count > max_members:
                raise ValueError(f"Archive exceeds maximum member count ({max_members})")
            rel = safe_member_relpath(member.name)
            if rel == Path("."):
                continue
            target = (dest_resolved / rel).resolve()
            if target != dest_resolved and dest_resolved not in target.parents:
                raise ValueError(f"Archive member escapes destination: {member.name!r}")

            if member.isdir():
                target.mkdir(parents=True, exist_ok=True)
            elif member.isreg():
                if member.size < 0 or total_bytes + member.size > max_bytes:
                    raise ValueError(f"Archive uncompressed size exceeds limit ({max_bytes} bytes)")
                target.parent.mkdir(parents=True, exist_ok=True)
                src = tf.extractfile(member)
                if src is None:
                    raise ValueError(f"Unable to read regular file from archive: {member.name!r}")
                with src, target.open("wb") as out:
                    while True:
                        buf = src.read(65536)
                        if not buf:
                            break
                        total_bytes += len(buf)
                        if total_bytes > max_bytes:
                            raise ValueError(f"Archive uncompressed size exceeds limit ({max_bytes} bytes)")
                        out.write(buf)
            else:
                raise ValueError(f"Unsupported archive entry type (links/devices forbidden): {member.name!r}")

    return total_bytes


def validate_manifest(data: object) -> dict:
    if not isinstance(data, dict):
        raise ValueError("release-manifest.json must be a JSON object")
    release_id = data.get("release_id")
    if not isinstance(release_id, str) or not RELEASE_ID_RE.fullmatch(release_id):
        raise ValueError(f"Invalid release_id: {release_id!r}")
    deploy_site = data.get("deploy_site")
    deploy_youtube = data.get("deploy_youtube")
    if not isinstance(deploy_site, bool) or not isinstance(deploy_youtube, bool):
        raise ValueError("deploy_site and deploy_youtube must be booleans")
    if not deploy_site and not deploy_youtube:
        raise ValueError("Nothing requested to deploy (both deploy_site and deploy_youtube are false)")
    commit_sha = data.get("commit_sha", "")
    if commit_sha and (not isinstance(commit_sha, str) or not COMMIT_SHA_RE.fullmatch(commit_sha)):
        raise ValueError(f"Invalid commit_sha: {commit_sha!r}")
    return {
        "release_id": release_id,
        "deploy_site": deploy_site,
        "deploy_youtube": deploy_youtube,
        "commit_sha": commit_sha,
    }


def write_svproxy_stub(api_dir: Path) -> None:
    stub_path = api_dir / "svproxyurl.php"
    stub_path.write_text(SVPROXY_STUB, encoding="utf-8")


def enforce_site_permissions(root: Path) -> None:
    for item in [root, *root.rglob("*")]:
        if item.is_symlink():
            raise RuntimeError(f"Unexpected symlink inside staged release: {item}")
        item.chmod(0o755 if item.is_dir() else 0o644)
        if hasattr(os, "chown") and os.geteuid() == 0:
            os.chown(item, 0, 0)


def atomic_switch(link: Path, target: Path) -> None:
    temp = link.with_name(f"{link.name}.next.{os.getpid()}")
    if temp.is_symlink() or temp.exists():
        temp.unlink()
    temp.symlink_to(target)
    os.replace(temp, link)


def prune_releases(releases_dir: Path, active_target: Path | None, keep: int) -> list[str]:
    if not releases_dir.is_dir() or keep < 1:
        return []
    active_resolved = active_target.resolve() if active_target and active_target.exists() else None
    entries = [p for p in releases_dir.iterdir() if p.is_dir() and not p.is_symlink()]
    entries.sort(key=lambda p: (p.stat().st_mtime, p.name), reverse=True)
    kept: list[Path] = []
    removed: list[str] = []
    if active_resolved is not None:
        kept.append(active_resolved)
    for entry in entries:
        resolved = entry.resolve()
        if resolved in kept:
            continue
        if len(kept) < keep:
            kept.append(resolved)
        else:
            shutil.rmtree(entry)
            removed.append(entry.name)
    return removed


def stage_site(bundle: Path, release_id: str) -> Path:
    frontend = bundle / "frontend"
    api = bundle / "api"
    sec_test = bundle / "tests" / "security_test.php"
    pub_test = bundle / "tests" / "public_media_test.php"
    for required in (
        frontend / "index.html",
        frontend / "404.html",
        api / "lib" / "entry_guard.php",
        api / "lib" / "safe_http.php",
        sec_test,
        pub_test,
    ):
        if not required.is_file():
            raise RuntimeError(f"Missing required site artifact: {required.relative_to(bundle)}")

    release = SITE_RELEASES / release_id
    if release.exists():
        raise RuntimeError(f"Site release directory already exists: {release}")

    try:
        release.mkdir(parents=True, mode=0o755)
        shutil.copytree(frontend, release, dirs_exist_ok=True)
        shutil.copytree(api, release / "api", dirs_exist_ok=True)
        write_svproxy_stub(release / "api")
        enforce_site_permissions(release)

        php_files = sorted((release / "api").rglob("*.php"))
        if not php_files:
            raise RuntimeError("No PHP files found in staged api/")
        for php_file in php_files:
            run(["php", "-l", str(php_file)], timeout=15)
        run(["php", str(sec_test), str(release / "api")], timeout=30)
        run(["php", str(pub_test), str(release / "api")], timeout=30)
        log(f"Staged site release {release} ({len(php_files)} PHP files checked, unit tests passed)")
        return release
    except BaseException:
        if release.exists():
            shutil.rmtree(release, ignore_errors=True)
        raise


def stage_youtube(bundle: Path, release_id: str) -> Path:
    service_py = bundle / "services" / "youtube" / "service.py"
    req_txt = bundle / "services" / "youtube" / "requirements.txt"
    yt_test = bundle / "tests" / "youtube_test.py"
    for required in (service_py, req_txt, yt_test):
        if not required.is_file():
            raise RuntimeError(f"Missing required YouTube artifact: {required.relative_to(bundle)}")

    run(["python3", "-c", "import sys; assert sys.version_info >= (3, 10)"], timeout=10)
    run(["node", "-e", "if (Number(process.versions.node.split('.')[0]) < 22) process.exit(1)"], timeout=10)

    release = YT_RELEASES / release_id
    if release.exists():
        raise RuntimeError(f"YouTube release directory already exists: {release}")

    try:
        release.mkdir(parents=True, mode=0o755)
        shutil.copy2(service_py, release / "service.py")
        shutil.copy2(req_txt, release / "requirements.txt")
        (release / "service.py").chmod(0o644)
        (release / "requirements.txt").chmod(0o644)

        run(["python3", "-m", "venv", str(release / "venv")], timeout=60)
        venv_py = str(release / "venv" / "bin" / "python")
        run([venv_py, "-m", "pip", "install", "--no-cache-dir", "-r", str(release / "requirements.txt")], timeout=240)
        run([venv_py, "-c", "import yt_dlp, yt_dlp_ejs"], timeout=20)
        run([venv_py, str(yt_test)], timeout=30)
        run(["chmod", "-R", "go-w", str(release)], timeout=30)
        log(f"Staged YouTube service release {release} (venv & unit tests passed)")
        return release
    except BaseException:
        if release.exists():
            shutil.rmtree(release, ignore_errors=True)
        raise


def origin_request(path: str) -> tuple[int, str, str]:
    proc = run(
        [
            "curl",
            "--noproxy",
            "*",
            "--resolve",
            "sv.litcheng.com:8443:127.0.0.1",
            "--silent",
            "--show-error",
            "--max-time",
            "10",
            "--write-out",
            "\n%{http_code}\n%{redirect_url}",
            f"https://sv.litcheng.com:8443{path}",
        ],
        timeout=15,
    )
    lines = proc.stdout.rsplit("\n", 2)
    if len(lines) != 3:
        raise RuntimeError(f"Unexpected curl output for {path}")
    body, code_str, redirect_url = lines
    return int(code_str), body, redirect_url


def verify_youtube_live() -> None:
    last_err = ""
    for _ in range(15):
        proc = run(
            [
                "runuser",
                "-u",
                "svparser",
                "--",
                "curl",
                "--fail",
                "--silent",
                "--show-error",
                "--max-time",
                "3",
                "http://127.0.0.1:8765/health",
            ],
            timeout=10,
            check=False,
        )
        if proc.returncode == 0:
            data = json.loads(proc.stdout)
            if data.get("code") == 200:
                log(f"YouTube service healthy (yt-dlp {data.get('version', 'unknown')})")
                break
        last_err = (proc.stderr or proc.stdout or "").strip()
        time.sleep(1)
    else:
        raise RuntimeError(f"YouTube service health check failed: {last_err}")

    bad = run(
        [
            "runuser",
            "-u",
            "svparser",
            "--",
            "curl",
            "--silent",
            "--show-error",
            "--max-time",
            "5",
            "-H",
            "Content-Type: application/json",
            "--data",
            '{"url":"https://evil.test/watch?v=BaW_jenozKc"}',
            "-w",
            "\n%{http_code}",
            "http://127.0.0.1:8765/parse",
        ],
        timeout=10,
    )
    body, status_str = bad.stdout.rsplit("\n", 1)
    if int(status_str) != 400 or json.loads(body).get("code") != 400:
        raise RuntimeError(f"Unexpected YouTube /parse validation response: {status_str} {body}")


def verify_site_live() -> None:
    code, body, _ = origin_request("/")
    if code != 200 or ("Unmarked" not in body and "无痕" not in body):
        raise RuntimeError(f"Homepage smoke check failed: HTTP {code}")

    for endpoint in ("/api/xiaohongshu/xhsjx.php", "/api/youtube/youtube.php", "/api/x/x.php"):
        code, body, _ = origin_request(endpoint)
        payload = json.loads(body)
        if code != 400 or payload.get("code") != 400:
            raise RuntimeError(f"API guard smoke check failed for {endpoint}: HTTP {code} {body[:200]}")

    code, _, _ = origin_request("/api/sv.php")
    if code != 404:
        raise RuntimeError(f"Disabled endpoint /api/sv.php returned HTTP {code} (expected 404)")

    code, _, redirect_url = origin_request("/api/svproxyurl.php?test=1")
    if code != 307 or not redirect_url.startswith("https://media.litcheng.com/"):
        raise RuntimeError(f"Proxy redirect check failed: HTTP {code} -> {redirect_url}")

    log("Site origin smoke checks passed (/, xhsjx guard, youtube guard, sv.php=404, svproxyurl=307)")


def acquire_lock():
    import fcntl

    LOCK_PATH.parent.mkdir(parents=True, exist_ok=True)
    fh = LOCK_PATH.open("w")
    fcntl.flock(fh.fileno(), fcntl.LOCK_EX)
    return fh


def deploy_archive(archive_path: Path) -> None:
    if os.geteuid() != 0:
        raise RuntimeError("short-videos-deploy must run as root")

    lock_fh = acquire_lock()
    try:
        with tempfile.TemporaryDirectory(prefix="short-videos-deploy-") as tmp:
            bundle = Path(tmp) / "bundle"
            extracted_bytes = safe_extract_tar(archive_path, bundle)
            log(f"Extracted verified bundle ({extracted_bytes} bytes)")

            manifest_file = bundle / "release-manifest.json"
            if not manifest_file.is_file():
                raise ValueError("Missing release-manifest.json in bundle")
            manifest = validate_manifest(json.loads(manifest_file.read_text(encoding="utf-8")))
            release_id = manifest["release_id"]
            log(
                f"Starting release {release_id} "
                f"(commit={manifest['commit_sha'] or 'n/a'}, "
                f"site={manifest['deploy_site']}, youtube={manifest['deploy_youtube']})"
            )

            prev_site = SITE_CURRENT.resolve() if SITE_CURRENT.exists() else None
            prev_yt = YT_CURRENT.resolve() if YT_CURRENT.exists() else None
            new_site: Path | None = None
            new_yt: Path | None = None
            site_switched = False
            yt_switched = False

            try:
                if manifest["deploy_site"]:
                    new_site = stage_site(bundle, release_id)
                if manifest["deploy_youtube"]:
                    new_yt = stage_youtube(bundle, release_id)

                if new_yt is not None:
                    atomic_switch(YT_CURRENT, new_yt)
                    yt_switched = True
                    run(["systemctl", "restart", "short-videos-youtube.service"], timeout=30)
                    verify_youtube_live()

                if new_site is not None:
                    atomic_switch(SITE_CURRENT, new_site)
                    site_switched = True
                    run(["systemctl", "reload", "php8.1-fpm"], timeout=30)
                    verify_site_live()
            except BaseException as exc:
                log(f"ERROR during deployment: {exc}")
                log("Rolling back to previous active release(s)...")
                if site_switched and prev_site is not None:
                    atomic_switch(SITE_CURRENT, prev_site)
                    run(["systemctl", "reload", "php8.1-fpm"], timeout=30, check=False)
                    log(f"Restored site -> {prev_site}")
                if yt_switched and prev_yt is not None:
                    atomic_switch(YT_CURRENT, prev_yt)
                    run(["systemctl", "restart", "short-videos-youtube.service"], timeout=30, check=False)
                    log(f"Restored YouTube service -> {prev_yt}")
                if new_site is not None and new_site.exists():
                    shutil.rmtree(new_site, ignore_errors=True)
                if new_yt is not None and new_yt.exists():
                    shutil.rmtree(new_yt, ignore_errors=True)
                raise

            if new_site is not None:
                pruned = prune_releases(SITE_RELEASES, SITE_CURRENT, KEEP_SITE_RELEASES)
                if pruned:
                    log(f"Pruned old site releases: {', '.join(pruned)}")
            if new_yt is not None:
                pruned = prune_releases(YT_RELEASES, YT_CURRENT, KEEP_YT_RELEASES)
                if pruned:
                    log(f"Pruned old YouTube releases: {', '.join(pruned)}")

            log(f"SUCCESS: release {release_id} is now live")
    finally:
        lock_fh.close()


def list_releases() -> None:
    print("Active site:   ", SITE_CURRENT.resolve() if SITE_CURRENT.exists() else "(none)")
    if SITE_RELEASES.is_dir():
        for p in sorted(SITE_RELEASES.iterdir()):
            if p.is_dir():
                print("  site:   ", p.name)
    print("Active youtube:", YT_CURRENT.resolve() if YT_CURRENT.exists() else "(none)")
    if YT_RELEASES.is_dir():
        for p in sorted(YT_RELEASES.iterdir()):
            if p.is_dir():
                print("  youtube:", p.name)


def manual_rollback(kind: str, name: str) -> None:
    if os.geteuid() != 0:
        raise RuntimeError("Rollback must run as root")
    if "/" in name or "\\" in name or name in ("", ".", ".."):
        raise ValueError(f"Invalid release name: {name!r}")
    lock_fh = acquire_lock()
    try:
        if kind == "site":
            target = (SITE_RELEASES / name).resolve()
            if target.parent != SITE_RELEASES.resolve() or not target.is_dir():
                raise RuntimeError(f"Site release not found: {name}")
            atomic_switch(SITE_CURRENT, target)
            run(["systemctl", "reload", "php8.1-fpm"], timeout=30)
            verify_site_live()
            log(f"Rolled back site -> {target}")
        else:
            target = (YT_RELEASES / name).resolve()
            if target.parent != YT_RELEASES.resolve() or not target.is_dir():
                raise RuntimeError(f"YouTube release not found: {name}")
            atomic_switch(YT_CURRENT, target)
            run(["systemctl", "restart", "short-videos-youtube.service"], timeout=30)
            verify_youtube_live()
            log(f"Rolled back YouTube service -> {target}")
    finally:
        lock_fh.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="short_videos atomic deployer")
    parser.add_argument("--archive", type=Path, help="Deploy from a local .tar.gz file instead of stdin")
    parser.add_argument("--list", action="store_true", help="List available site & YouTube releases")
    parser.add_argument("--rollback-site", metavar="RELEASE", help="Switch active site to an existing release")
    parser.add_argument("--rollback-youtube", metavar="RELEASE", help="Switch active YouTube service to an existing release")
    args = parser.parse_args()

    if args.list:
        list_releases()
        return
    if args.rollback_site:
        manual_rollback("site", args.rollback_site)
        return
    if args.rollback_youtube:
        manual_rollback("youtube", args.rollback_youtube)
        return

    if args.archive:
        deploy_archive(args.archive)
        return

    with tempfile.TemporaryDirectory(prefix="short-videos-stdin-") as tmp:
        archive = Path(tmp) / "release.tar.gz"
        size = read_bounded_stdin(archive)
        log(f"Received release archive ({size} bytes)")
        deploy_archive(archive)


if __name__ == "__main__":
    main()
